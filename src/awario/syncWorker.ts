import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { clearRuntimeSecretsCache, loadRuntimeSecrets } from "../config/secrets";
import { AwarioClient } from "../connectors/awario/client";
import { syncAwarioBindingComments } from "../connectors/awario/sync";
import { createConfigStore, type AwarioSyncMode } from "../data/configStore";
import { createSocialStore } from "../data/socialStore";

const sqs = new AWS.SQS({ region: env.awsRegion });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AwarioSyncMessage = {
  run_id?: string;
  mode?: AwarioSyncMode;
  binding_id?: string;
  request_id?: string;
  cursor?: string | null;
  window_start?: string | null;
  window_end?: string | null;
};

const parseMessage = (value: string): AwarioSyncMessage => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as AwarioSyncMessage;
  } catch {
    return {};
  }
};

const parseIsoDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveAwarioToken = async (): Promise<string> => {
  const token = env.awarioAccessToken ?? process.env.AWARIO_ACCESS_TOKEN ?? process.env.AWARIO_API_KEY;
  const normalized = token?.trim();
  if (normalized) {
    return normalized;
  }

  const readFromSecrets = async (): Promise<string> => {
    const secrets = await loadRuntimeSecrets();
    const fromSecrets =
      secrets.providerKeys.AWARIO_ACCESS_TOKEN ??
      secrets.providerKeys.AWARIO_API_KEY ??
      secrets.appConfig.AWARIO_ACCESS_TOKEN ??
      secrets.appConfig.AWARIO_API_KEY ??
      "";
    return fromSecrets.trim();
  };

  try {
    const cachedToken = await readFromSecrets();
    if (cachedToken) return cachedToken;

    // Reintento sin cache para capturar rotaciones recientes de secret.
    clearRuntimeSecretsCache();
    const refreshedToken = await readFromSecrets();
    if (refreshedToken) return refreshedToken;
  } catch (error) {
    console.error("awario_token_secret_resolve_failed", {
      error: (error as Error).message,
      provider_secret_name: env.providerKeysSecretName ? "set" : "missing",
      app_config_secret_name: env.appConfigSecretName ? "set" : "missing",
      aws_credentials_secret_name: env.awsCredentialsSecretName ? "set" : "missing"
    });
  }

  throw new Error("AWARIO_ACCESS_TOKEN no configurado");
};

const getBackfillPagesProcessedTotal = (metadata: Record<string, unknown>): number => {
  const direct = metadata.awario_backfill_pages_processed_total;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return Math.max(0, Math.floor(direct));
  }

  const metrics = metadata.awario_sync_metrics;
  const nested = metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? (metrics as Record<string, unknown>).awario_backfill_pages_processed_total
    : null;
  const value = typeof nested === "number" && Number.isFinite(nested) ? nested : 0;
  return Math.max(0, Math.floor(value));
};

const enqueueAwarioSyncJob = async (payload: {
  run_id: string;
  mode: AwarioSyncMode;
  binding_id: string;
  request_id?: string;
  cursor?: string | null;
  window_start?: string | null;
  window_end?: string | null;
}): Promise<void> => {
  if (!env.awarioSyncQueueUrl) {
    throw new Error("AWARIO_SYNC_QUEUE_URL no configurado");
  }

  await sqs
    .sendMessage({
      QueueUrl: env.awarioSyncQueueUrl,
      MessageBody: JSON.stringify({
        ...payload,
        requested_at: new Date().toISOString()
      })
    })
    .promise();
};

const processSyncMessage = async (
  raw: AwarioSyncMessage,
  client: AwarioClient,
  requestFallbackId: string
): Promise<void> => {
  const store = createConfigStore();
  const socialStore = createSocialStore();
  if (!store || !socialStore) {
    throw new Error("Database runtime is not configured");
  }

  const mode = raw.mode;
  const bindingId = raw.binding_id;
  const runId = raw.run_id ?? requestFallbackId;
  const requestId = raw.request_id ?? `awario-sync-${requestFallbackId}`;

  if (!mode || (mode !== "historical" && mode !== "incremental")) {
    console.error("awario_sync_invalid_mode", {
      request_id: requestId,
      run_id: runId,
      mode
    });
    return;
  }

  if (!bindingId || !UUID_REGEX.test(bindingId)) {
    console.error("awario_sync_invalid_binding_id", {
      request_id: requestId,
      run_id: runId,
      binding_id: bindingId ?? null
    });
    return;
  }

  const binding = await store.getAwarioAlertBinding(bindingId);
  if (!binding) {
    console.info("awario_sync_binding_not_found", {
      request_id: requestId,
      run_id: runId,
      binding_id: bindingId
    });
    return;
  }

  const linkedQuery = env.unifiedQueryAwarioFeedV1Enabled
    ? await store.getAwarioBindingLinkedQuery(bindingId)
    : null;

  if (binding.status !== "active" || binding.syncState === "paused" || binding.syncState === "archived") {
    console.info("awario_sync_binding_skipped", {
      request_id: requestId,
      run_id: runId,
      binding_id: bindingId,
      status: binding.status,
      sync_state: binding.syncState
    });
    return;
  }

  try {
    await store.markAwarioSyncStarted(bindingId, mode, requestId);

    const syncBinding = {
      id: binding.id,
      awarioAlertId: binding.awarioAlertId,
      profileId: binding.profileId,
      status: binding.status
    };

    if (mode === "historical") {
      const cursor = (raw.cursor ?? binding.backfillCursor ?? null) || null;
      const previousPages = getBackfillPagesProcessedTotal(binding.metadata);
      const maxTotalPages = Math.max(1, env.awarioBackfillMaxPagesTotal);

      if (previousPages >= maxTotalPages) {
        await store.markAwarioSyncFailed(bindingId, mode, `backfill_max_pages_total_exceeded:${maxTotalPages}`, requestId);
        return;
      }

      const result = await syncAwarioBindingComments({
        client,
        socialStore,
        binding: syncBinding,
        feedTarget: linkedQuery?.isActive ? { termId: linkedQuery.termId } : undefined,
        startCursor: cursor,
        maxPages: env.awarioBackfillPagesPerInvocation,
        pageLimit: env.awarioSyncPageLimit,
        reviewThreshold: env.awarioCommentsReviewThreshold,
        throwOnError: true
      });

      const pagesProcessedTotal = previousPages + result.pagesProcessed;
      const metrics = {
        ...result.metrics,
        mode,
        run_id: runId,
        request_id: requestId,
        pages_processed: result.pagesProcessed,
        awario_backfill_pages_processed_total: pagesProcessedTotal,
        completed: result.completed,
        next_cursor: result.nextCursor
      };

      if (!result.completed) {
        if (pagesProcessedTotal >= maxTotalPages) {
          await store.markAwarioSyncFailed(bindingId, mode, `backfill_max_pages_total_exceeded:${maxTotalPages}`, requestId);
          return;
        }

        await store.markAwarioHistoricalProgress(bindingId, result.nextCursor, metrics, requestId);
        await enqueueAwarioSyncJob({
          run_id: runId,
          mode,
          binding_id: bindingId,
          request_id: requestId,
          cursor: result.nextCursor
        });
        return;
      }

      await store.markAwarioHistoricalCompleted(bindingId, metrics, requestId);
      return;
    }

    const now = new Date();
    const windowEnd = parseIsoDate(raw.window_end) ?? now;
    const overlapMs = Math.max(1, env.awarioIncrementalOverlapMinutes) * 60 * 1000;
    const fallbackStart = binding.lastSyncAt
      ? new Date(binding.lastSyncAt.getTime() - overlapMs)
      : new Date(windowEnd.getTime() - Math.max(overlapMs, 60 * 60 * 1000));
    const windowStart = parseIsoDate(raw.window_start) ?? fallbackStart;

    const result = await syncAwarioBindingComments({
      client,
      socialStore,
      binding: syncBinding,
      feedTarget: linkedQuery?.isActive ? { termId: linkedQuery.termId } : undefined,
      windowStart,
      windowEnd,
      startCursor: raw.cursor ?? null,
      maxPages: env.awarioIncrementalPagesPerInvocation,
      pageLimit: env.awarioSyncPageLimit,
      reviewThreshold: env.awarioCommentsReviewThreshold,
      throwOnError: true
    });

    const metrics = {
      ...result.metrics,
      mode,
      run_id: runId,
      request_id: requestId,
      pages_processed: result.pagesProcessed,
      completed: result.completed,
      next_cursor: result.nextCursor,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString()
    };

    if (!result.completed) {
      await enqueueAwarioSyncJob({
        run_id: runId,
        mode,
        binding_id: bindingId,
        request_id: requestId,
        cursor: result.nextCursor,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString()
      });
      return;
    }

    await store.markAwarioIncrementalCompleted(bindingId, metrics, requestId);
  } catch (error) {
    await store.markAwarioSyncFailed(bindingId, mode, (error as Error).message, requestId);
    throw error;
  }
};

export const main = async (event: SQSEvent): Promise<void> => {
  if (!env.awarioLinkingV2Enabled) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "awario_sync_worker_disabled",
        records: event.Records.length
      })
    );
    return;
  }

  const token = await resolveAwarioToken();
  const client = new AwarioClient(token, {
    baseUrl: process.env.AWARIO_API_BASE_URL,
    throttleMs: env.awarioSyncThrottleMs,
    maxRetries: 4
  });

  const failures: string[] = [];

  for (const record of event.Records) {
    const message = parseMessage(record.body);
    try {
      await processSyncMessage(message, client, record.messageId);
    } catch (error) {
      failures.push(record.messageId);
      console.error("awario_sync_worker_failed", {
        message_id: record.messageId,
        request_id: message.request_id ?? null,
        run_id: message.run_id ?? null,
        binding_id: message.binding_id ?? null,
        mode: message.mode ?? null,
        error: (error as Error).message
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(`awario_sync_worker_failed:${failures.join(",")}`);
  }
};
