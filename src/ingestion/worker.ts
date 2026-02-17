import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { loadRuntimeSecrets } from "../config/secrets";
import { dedupeByCanonicalUrl, fetchFromProviders } from "./providers";
import { createIngestionSqlStore, type PersistableContentItem, type PersistableRunItem } from "./sqlStore";
import { toSlug } from "./url";

type IngestionDispatchMessage = {
  triggerType?: "scheduled" | "manual";
  runId?: string;
  requestId?: string;
  requestedAt?: string;
  termIds?: string[];
  terms?: string[];
  language?: string;
  maxArticlesPerTerm?: number;
};

const s3 = new AWS.S3({ region: env.awsRegion });
const RUN_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

const mergeUnique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
};

const parseTerms = (terms: unknown): string[] => {
  if (!Array.isArray(terms)) return [];
  return mergeUnique(
    terms
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0)
      .slice(0, 50)
  );
};

const parseTermIds = (termIds: unknown): string[] => {
  if (!Array.isArray(termIds)) return [];

  return mergeUnique(
    termIds
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((value) => value.length > 0 && isUuid(value))
      .slice(0, 50)
  );
};

const parseDefaultTerms = (raw?: string): string[] => {
  if (!raw) return [];
  return mergeUnique(raw.split(",").map((item) => item.trim()));
};

const parseLanguage = (value: unknown): string => {
  if (typeof value !== "string") return "es";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "es";
  return normalized.slice(0, 8);
};

const parseLimit = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
};

const parseMessage = (body: string): IngestionDispatchMessage => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as IngestionDispatchMessage;
  } catch {
    return {};
  }
};

const persistRawSnapshot = async (
  runId: string,
  triggerType: string,
  term: string,
  payload: Record<string, unknown>
): Promise<string> => {
  const bucket = env.rawBucketName;
  if (!bucket) {
    throw new Error("Missing RAW_BUCKET_NAME for ingestion worker");
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const key = `ingestion/date=${datePart}/run=${runId}/trigger=${triggerType}/term=${toSlug(term) || "term"}/payload.json`;

  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload),
      ContentType: "application/json"
    })
    .promise();

  return key;
};

const processRecord = async (
  recordBody: string,
  appConfig: Record<string, string>,
  providerKeys: Record<string, string>
) => {
  const sqlStore = createIngestionSqlStore();
  const message = parseMessage(recordBody);
  const runId = message.runId && isUuid(message.runId) ? message.runId : randomUUID();
  const triggerType = message.triggerType ?? "scheduled";
  const language = parseLanguage(message.language);
  const maxArticlesPerTerm = parseLimit(message.maxArticlesPerTerm);
  const requestedTermIds = parseTermIds(message.termIds);

  let terms = parseTerms(message.terms);

  if (sqlStore && requestedTermIds.length > 0) {
    const resolvedFromIds = await sqlStore.resolveTermIdsToNames(requestedTermIds);
    terms = mergeUnique([...terms, ...resolvedFromIds]);
  }

  if (terms.length === 0 && sqlStore) {
    const activeTerms = await sqlStore.listActiveTermNames(50);
    terms = mergeUnique([...terms, ...activeTerms]);
  }

  if (terms.length === 0) {
    const defaultTermsFromConfig = parseDefaultTerms(appConfig.INGESTION_DEFAULT_TERMS ?? env.ingestionDefaultTerms);
    terms = mergeUnique([...terms, ...defaultTermsFromConfig]);
  }

  if (terms.length === 0) {
    throw new Error("No terms provided in message and no active/default terms configured");
  }

  const startedAt = new Date();
  const termSummaries: Record<string, unknown>[] = [];
  const runItems: PersistableRunItem[] = [];

  let providersTotal = 0;
  let providersFailed = 0;
  let itemsRaw = 0;
  let itemsDeduped = 0;
  let itemsPersisted = 0;
  let runStarted = false;

  if (sqlStore) {
    const snapshot = await sqlStore.getRunSnapshot(runId);

    if (snapshot?.status === "completed") {
      return {
        run_id: runId,
        trigger_type: triggerType,
        status: "skipped",
        skip_reason: "run_already_completed"
      };
    }

    if (
      snapshot?.status === "running" &&
      snapshot.startedAt &&
      Date.now() - snapshot.startedAt.getTime() <= RUN_DUPLICATE_WINDOW_MS
    ) {
      return {
        run_id: runId,
        trigger_type: triggerType,
        status: "skipped",
        skip_reason: "run_already_running"
      };
    }

    await sqlStore.startRun({
      runId,
      triggerType,
      language,
      maxArticlesPerTerm,
      requestId: message.requestId,
      startedAt
    });

    runStarted = true;
  }

  try {
    for (const term of terms) {
      const termId = sqlStore ? await sqlStore.ensureTrackedTerm(term, language, maxArticlesPerTerm) : null;

      const providerResults = await fetchFromProviders({
        term,
        language,
        maxArticlesPerTerm,
        providerKeys
      });

      const merged = providerResults.flatMap((result) => result.items);
      const deduped = dedupeByCanonicalUrl(merged);
      const failedProviders = providerResults.filter((result) => Boolean(result.error)).length;
      const successfulProviders = providerResults.length - failedProviders;

      const rawS3Key = await persistRawSnapshot(runId, triggerType, term, {
        runId,
        triggerType,
        requestId: message.requestId ?? null,
        requestedAt: message.requestedAt ?? null,
        term,
        termIds: requestedTermIds,
        language,
        maxArticlesPerTerm,
        providerResults,
        dedupedCount: deduped.length,
        ingestedAt: new Date().toISOString(),
        items: deduped
      });

      const persistableItems: PersistableContentItem[] = deduped.map((article) => ({
        article,
        termId,
        runId,
        term,
        triggerType,
        rawPayloadS3Key: rawS3Key
      }));

      let insertedCanonicalUrls = new Set<string>(deduped.map((item) => item.canonicalUrl));
      if (sqlStore) {
        const refs = await sqlStore.upsertContentItems(persistableItems);
        insertedCanonicalUrls = await sqlStore.upsertRunContentLinks(runId, term, refs);
      }

      const persistedByProvider = new Map<string, number>();
      for (const article of deduped) {
        if (!insertedCanonicalUrls.has(article.canonicalUrl)) continue;
        persistedByProvider.set(article.provider, (persistedByProvider.get(article.provider) ?? 0) + 1);
      }

      const persistedCount = insertedCanonicalUrls.size;

      for (const result of providerResults) {
        runItems.push({
          runId,
          provider: result.provider,
          status: result.error ? "failed" : "completed",
          fetchedCount: result.rawCount,
          persistedCount: persistedByProvider.get(result.provider) ?? 0,
          latencyMs: result.durationMs,
          errorMessage: result.error
            ? `[${result.errorType ?? "unknown"}][term:${term}] ${result.error}`
            : undefined
        });
      }

      providersTotal += providerResults.length;
      providersFailed += failedProviders;
      itemsRaw += merged.length;
      itemsDeduped += deduped.length;
      itemsPersisted += persistedCount;

      termSummaries.push({
        term,
        raw_s3_key: rawS3Key,
        providers_total: providerResults.length,
        providers_successful: successfulProviders,
        providers_failed: failedProviders,
        items_raw: merged.length,
        items_deduped: deduped.length,
        items_persisted: persistedCount
      });
    }

    if (sqlStore && runStarted) {
      await sqlStore.replaceRunItems(runItems);
      await sqlStore.finishRun({
        runId,
        status: "completed",
        finishedAt: new Date(),
        metrics: {
          providers_total: providersTotal,
          providers_failed: providersFailed,
          items_raw: itemsRaw,
          items_deduped: itemsDeduped,
          items_persisted: itemsPersisted,
          terms_count: terms.length,
          term_summaries: termSummaries
        }
      });
    }

    return {
      run_id: runId,
      trigger_type: triggerType,
      status: "processed",
      terms_count: terms.length,
      providers_total: providersTotal,
      providers_failed: providersFailed,
      items_raw: itemsRaw,
      items_deduped: itemsDeduped,
      items_persisted: itemsPersisted,
      term_summaries: termSummaries
    };
  } catch (error) {
    if (sqlStore && runStarted) {
      try {
        if (runItems.length > 0) {
          await sqlStore.replaceRunItems(runItems);
        }
        await sqlStore.finishRun({
          runId,
          status: "failed",
          finishedAt: new Date(),
          errorMessage: (error as Error).message.slice(0, 1000),
          metrics: {
            providers_total: providersTotal,
            providers_failed: providersFailed,
            items_raw: itemsRaw,
            items_deduped: itemsDeduped,
            items_persisted: itemsPersisted,
            terms_count: terms.length,
            terms_completed: termSummaries.length,
            term_summaries: termSummaries
          }
        });
      } catch (persistError) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "ingestion_sql_persist_failure",
            run_id: runId,
            persist_error: (persistError as Error).message
          })
        );
      }
    }

    throw error;
  }
};

export const main = async (event: SQSEvent) => {
  const secrets = await loadRuntimeSecrets();
  const results: Record<string, unknown>[] = [];

  for (const record of event.Records) {
    const result = await processRecord(record.body, secrets.appConfig, secrets.providerKeys);
    results.push(result);
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "ingestion_worker_batch_processed",
      records: event.Records.length,
      results
    })
  );
};
