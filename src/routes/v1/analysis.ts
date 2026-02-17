import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { env } from "../../config/env";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import { AppStoreError, createAppStore } from "../../data/appStore";
import {
  createAnalysisStore,
  type AnalysisRunFilters,
  type AnalysisRunRecord,
  type AnalysisRunScope,
  type AnalysisRunStatus,
  type AnalysisRunTriggerType,
  type AnalysisSourceType
} from "../../data/analysisStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYSIS_SCOPES: AnalysisRunScope[] = ["overview", "channel", "competitors", "custom"];
const ANALYSIS_SOURCE_TYPES: AnalysisSourceType[] = ["news", "social"];
const ANALYSIS_STATUSES: AnalysisRunStatus[] = ["queued", "running", "completed", "failed"];
const ANALYSIS_TRIGGER_TYPES: AnalysisRunTriggerType[] = ["manual", "scheduled"];

const sqs = new AWS.SQS({ region: env.awsRegion });

type CreateAnalysisRunBody = {
  scope?: unknown;
  source_type?: unknown;
  trigger_type?: unknown;
  model_id?: unknown;
  prompt_version?: unknown;
  idempotency_key?: unknown;
  limit?: unknown;
  content_ids?: unknown;
  filters?: unknown;
};

type AnalysisFiltersBody = {
  term_id?: unknown;
  provider?: unknown;
  category?: unknown;
  sentimiento?: unknown;
  q?: unknown;
  from?: unknown;
  to?: unknown;
};

const parseLimit = (value: string | undefined, fallback: number, max: number): number | null => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > max) return null;
  return parsed;
};

const normalizeString = (value: unknown, min = 1, max = 120): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
};

const normalizeOptionalString = (value: unknown, max = 240): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const normalizeDate = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeContentIds = (value: unknown): string[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => UUID_REGEX.test(item)))];
  return ids;
};

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, { error: "validation_error", message: error.message });
    }
    if (error.code === "conflict") {
      return json(409, { error: "conflict", message: error.message });
    }
    if (error.code === "not_found") {
      return json(404, { error: "not_found", message: error.message });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

const toApiRun = (item: AnalysisRunRecord) => ({
  id: item.id,
  scope: item.scope,
  status: item.status,
  trigger_type: item.triggerType,
  source_type: item.sourceType,
  input_count: item.inputCount,
  model_id: item.modelId,
  prompt_version: item.promptVersion,
  filters: item.filters,
  output: item.output,
  request_id: item.requestId,
  requested_by_user_id: item.requestedByUserId,
  requested_by_name: item.requestedByName,
  requested_by_email: item.requestedByEmail,
  idempotency_key: item.idempotencyKey,
  window_start: item.windowStart.toISOString(),
  window_end: item.windowEnd.toISOString(),
  error_message: item.errorMessage,
  started_at: item.startedAt?.toISOString() ?? null,
  completed_at: item.completedAt?.toISOString() ?? null,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const dispatchAnalysisRun = async (
  analysisRunId: string,
  requestId: string,
  actorUserId: string | null,
  idempotencyKey: string | null
) => {
  if (!env.analysisQueueUrl) {
    throw new Error("Missing ANALYSIS_QUEUE_URL");
  }

  await sqs
    .sendMessage({
      QueueUrl: env.analysisQueueUrl,
      MessageBody: JSON.stringify({
        analysis_run_id: analysisRunId,
        request_id: requestId,
        requested_by_user_id: actorUserId,
        idempotency_key: idempotencyKey,
        requested_at: new Date().toISOString()
      })
    })
    .promise();
};

const getRunIdFromPath = (event: APIGatewayProxyEventV2): string | null => {
  const match = getPathWithoutStage(event).match(/^\/v1\/analysis\/runs\/([^/]+)$/);
  return match?.[1] ?? null;
};

export const createAnalysisRun = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const body = parseBody<CreateAnalysisRunBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const scope = body.scope === undefined ? "overview" : normalizeString(body.scope, 3, 32);
  if (!scope || !ANALYSIS_SCOPES.includes(scope as AnalysisRunScope)) {
    return json(422, { error: "validation_error", message: "scope invalido" });
  }

  const sourceType = body.source_type === undefined ? "news" : normalizeString(body.source_type, 3, 16);
  if (!sourceType || !ANALYSIS_SOURCE_TYPES.includes(sourceType as AnalysisSourceType)) {
    return json(422, { error: "validation_error", message: "source_type invalido" });
  }

  const triggerType = body.trigger_type === undefined ? "manual" : normalizeString(body.trigger_type, 6, 16);
  if (!triggerType || !ANALYSIS_TRIGGER_TYPES.includes(triggerType as AnalysisRunTriggerType)) {
    return json(422, { error: "validation_error", message: "trigger_type invalido" });
  }

  const modelId = body.model_id === undefined ? env.bedrockModelId : normalizeString(body.model_id, 8, 200);
  if (!modelId) {
    return json(422, { error: "validation_error", message: "model_id invalido" });
  }

  const promptVersion = body.prompt_version === undefined ? "analysis-v1" : normalizeString(body.prompt_version, 2, 80);
  if (!promptVersion) {
    return json(422, { error: "validation_error", message: "prompt_version invalido" });
  }

  const idempotencyKey = body.idempotency_key === undefined ? null : normalizeOptionalString(body.idempotency_key, 200);
  if (body.idempotency_key !== undefined && idempotencyKey === undefined) {
    return json(422, { error: "validation_error", message: "idempotency_key invalido" });
  }

  const limit = body.limit === undefined ? 120 : Math.floor(Number(body.limit));
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return json(422, { error: "validation_error", message: "limit debe estar entre 1 y 500" });
  }

  const filtersRaw = (body.filters ?? {}) as AnalysisFiltersBody;
  if (filtersRaw === null || typeof filtersRaw !== "object" || Array.isArray(filtersRaw)) {
    return json(422, { error: "validation_error", message: "filters debe ser objeto" });
  }

  const contentIds = normalizeContentIds(body.content_ids);
  if (contentIds === null) {
    return json(422, { error: "validation_error", message: "content_ids invalido" });
  }

  const termId = filtersRaw.term_id === undefined ? undefined : normalizeString(filtersRaw.term_id, 36, 36);
  if (filtersRaw.term_id !== undefined && (!termId || !UUID_REGEX.test(termId))) {
    return json(422, { error: "validation_error", message: "filters.term_id debe ser UUID valido" });
  }

  const provider = filtersRaw.provider === undefined ? undefined : normalizeString(filtersRaw.provider, 1, 120);
  if (filtersRaw.provider !== undefined && !provider) {
    return json(422, { error: "validation_error", message: "filters.provider invalido" });
  }

  const category = filtersRaw.category === undefined ? undefined : normalizeString(filtersRaw.category, 1, 120);
  if (filtersRaw.category !== undefined && !category) {
    return json(422, { error: "validation_error", message: "filters.category invalido" });
  }

  const sentimiento = filtersRaw.sentimiento === undefined ? undefined : normalizeString(filtersRaw.sentimiento, 1, 80);
  if (filtersRaw.sentimiento !== undefined && !sentimiento) {
    return json(422, { error: "validation_error", message: "filters.sentimiento invalido" });
  }

  const query = filtersRaw.q === undefined ? undefined : normalizeString(filtersRaw.q, 2, 220);
  if (filtersRaw.q !== undefined && !query) {
    return json(422, { error: "validation_error", message: "filters.q invalido" });
  }

  const from = filtersRaw.from === undefined ? undefined : normalizeDate(filtersRaw.from);
  if (filtersRaw.from !== undefined && !from) {
    return json(422, { error: "validation_error", message: "filters.from invalido" });
  }

  const to = filtersRaw.to === undefined ? undefined : normalizeDate(filtersRaw.to);
  if (filtersRaw.to !== undefined && !to) {
    return json(422, { error: "validation_error", message: "filters.to invalido" });
  }

  if (from && to && from.getTime() > to.getTime()) {
    return json(422, { error: "validation_error", message: "filters.from debe ser <= filters.to" });
  }

  const analysisStore = createAnalysisStore();
  const appStore = createAppStore();
  if (!analysisStore || !appStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const requestId = getRequestId(event);

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);

    const created = await analysisStore.createAnalysisRun({
      scope: scope as AnalysisRunScope,
      sourceType: sourceType as AnalysisSourceType,
      triggerType: triggerType as AnalysisRunTriggerType,
      modelId,
      promptVersion,
      idempotencyKey: idempotencyKey ?? undefined,
      requestId,
      requestedByUserId: actorUserId,
      limit,
      filters: {
        termId: termId ?? undefined,
        provider: provider ?? undefined,
        category: category ?? undefined,
        sentimiento: sentimiento ?? undefined,
        query: query ?? undefined,
        from: from ?? undefined,
        to: to ?? undefined,
        contentIds: contentIds ?? []
      }
    });

    if (!created.reused) {
      try {
        await dispatchAnalysisRun(created.run.id, requestId, actorUserId, created.run.idempotencyKey);
      } catch (dispatchError) {
        await analysisStore.failAnalysisRun(created.run.id, `analysis_dispatch_failed: ${(dispatchError as Error).message}`);
        throw dispatchError;
      }
    }

    return json(202, {
      analysis_run_id: created.run.id,
      status: "accepted",
      reused: created.reused,
      input_count: created.run.inputCount,
      idempotency_key: created.run.idempotencyKey
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listAnalysisHistory = async (event: APIGatewayProxyEventV2) => {
  const store = createAnalysisStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 50, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit debe ser entero entre 1 y 200" });
  }

  const filters: AnalysisRunFilters = {};
  if (query.status) {
    if (!ANALYSIS_STATUSES.includes(query.status as AnalysisRunStatus)) {
      return json(422, { error: "validation_error", message: "status invalido" });
    }
    filters.status = query.status as AnalysisRunStatus;
  }

  if (query.scope) {
    if (!ANALYSIS_SCOPES.includes(query.scope as AnalysisRunScope)) {
      return json(422, { error: "validation_error", message: "scope invalido" });
    }
    filters.scope = query.scope as AnalysisRunScope;
  }

  if (query.from) {
    const from = normalizeDate(query.from);
    if (!from) return json(422, { error: "validation_error", message: "from invalido" });
    filters.from = from;
  }

  if (query.to) {
    const to = normalizeDate(query.to);
    if (!to) return json(422, { error: "validation_error", message: "to invalido" });
    filters.to = to;
  }

  if (filters.from && filters.to && filters.from.getTime() > filters.to.getTime()) {
    return json(422, { error: "validation_error", message: "from debe ser <= to" });
  }

  try {
    const page = await store.listAnalysisRuns(limit, filters, query.cursor ?? undefined);
    return json(200, {
      items: page.items.map(toApiRun),
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getAnalysisRun = async (event: APIGatewayProxyEventV2) => {
  const runId = getRunIdFromPath(event);
  if (!runId || !UUID_REGEX.test(runId)) {
    return json(422, { error: "validation_error", message: "analysis run id invalido" });
  }

  const store = createAnalysisStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const run = await store.getAnalysisRun(runId);
    if (!run) {
      return json(404, { error: "not_found", message: "Analysis run not found" });
    }

    const inputSample = await store.listAnalysisRunInputIds(run.id, 50);

    return json(200, {
      run: toApiRun(run),
      input_summary: {
        input_count: run.inputCount,
        sample_content_ids: inputSample,
        sample_size: inputSample.length
      },
      output: run.output,
      error: run.errorMessage
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
