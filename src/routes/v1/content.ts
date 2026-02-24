import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  AppStoreError,
  createAppStore,
  type ClassificationRecord,
  type ContentFilters,
  type ContentRecord,
  type ContentState,
  type ContentStateEventRecord
} from "../../data/appStore";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import {
  deriveOriginFields,
  isValidOrigin,
  matchesOriginFilters,
  parseTagFilterValues,
  type OriginFilterInput,
  type OriginType
} from "../../core/origin";

const VALID_STATES = new Set(["active", "archived", "hidden"]);
const VALID_SOURCE_TYPES = new Set(["news", "social"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StateBody = {
  target_state?: string;
  reason?: string;
};

type BulkStateBody = {
  ids?: unknown;
  target_state?: string;
  reason?: string;
};

type ClassificationBody = {
  categoria?: string;
  sentimiento?: string;
  etiquetas?: unknown;
  confidence_override?: number;
  reason?: string;
};

const parseLimit = (value: string | undefined): number | null => {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 200) return null;
  return parsed;
};

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toApiContent = (item: ContentRecord) => ({
  ...deriveOriginFields({
    sourceType: item.sourceType,
    provider: item.provider,
    sourceName: item.sourceName
  }),
  id: item.id,
  source_type: item.sourceType,
  term_id: item.termId,
  provider: item.provider,
  source_name: item.sourceName,
  source_id: item.sourceId,
  state: item.state,
  title: item.title,
  summary: item.summary,
  content: item.content,
  canonical_url: item.canonicalUrl,
  image_url: item.imageUrl,
  language: item.language,
  category: item.category,
  published_at: item.publishedAt?.toISOString() ?? null,
  source_score: item.sourceScore,
  raw_payload_s3_key: item.rawPayloadS3Key,
  categoria: item.categoria,
  sentimiento: item.sentimiento,
  created_at: item.createdAt.toISOString(),
  updated_at: item.updatedAt.toISOString()
});

const toApiStateEvent = (event: ContentStateEventRecord) => ({
  id: event.id,
  content_item_id: event.contentItemId,
  previous_state: event.previousState,
  next_state: event.nextState,
  actor_user_id: event.actorUserId,
  reason: event.reason,
  created_at: event.createdAt.toISOString()
});

const toApiClassification = (classification: ClassificationRecord) => ({
  id: classification.id,
  content_item_id: classification.contentItemId,
  categoria: classification.categoria,
  sentimiento: classification.sentimiento,
  etiquetas: classification.etiquetas,
  confianza: classification.confianza,
  override_by: classification.overriddenByUserId,
  override_reason: classification.overrideReason,
  prompt_version: classification.promptVersion,
  model_id: classification.modelId,
  created_at: classification.createdAt.toISOString(),
  updated_at: classification.updatedAt.toISOString()
});

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, {
        error: "validation_error",
        message: error.message
      });
    }

    if (error.code === "not_found") {
      return json(404, {
        error: "not_found",
        message: error.message
      });
    }

    if (error.code === "conflict") {
      return json(409, {
        error: "conflict",
        message: error.message
      });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

const getIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const path = getPathWithoutStage(event);
  const match = path.match(pattern);
  if (!match) return null;
  return match[1] ?? null;
};

const normalizeReason = (reason: unknown): string | null => {
  if (reason === undefined || reason === null) return null;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
};

const normalizeTags = (raw: unknown): string[] | null => {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;

  const items = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 50);

  return [...new Set(items)];
};

const parseContentStateBody = (event: APIGatewayProxyEventV2): { targetState: ContentState; reason: string | null } | null => {
  const body = parseBody<StateBody>(event);
  if (!body) return null;

  const targetState = body.target_state;
  if (!targetState || !VALID_STATES.has(targetState)) {
    return null;
  }

  const reason = normalizeReason(body.reason);
  if (body.reason !== undefined && body.reason !== null && reason === null) {
    return null;
  }

  return {
    targetState: targetState as ContentState,
    reason
  };
};

export const listContent = async (event: APIGatewayProxyEventV2) => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit);
  if (limit === null) {
    return json(422, {
      error: "validation_error",
      message: "limit must be an integer between 1 and 200"
    });
  }

  const filters: ContentFilters = {};

  if (query.state) {
    if (!VALID_STATES.has(query.state)) {
      return json(422, {
        error: "validation_error",
        message: "state must be one of active|archived|hidden"
      });
    }
    filters.state = query.state as ContentState;
  }

  if (query.source_type) {
    if (!VALID_SOURCE_TYPES.has(query.source_type)) {
      return json(422, {
        error: "validation_error",
        message: "source_type must be one of news|social"
      });
    }
    filters.sourceType = query.source_type as "news" | "social";
  }

  if (query.term_id) {
    if (!UUID_REGEX.test(query.term_id)) {
      return json(422, {
        error: "validation_error",
        message: "term_id must be a valid UUID"
      });
    }
    filters.termId = query.term_id;
  }

  if (query.provider) filters.provider = query.provider;
  if (query.category) filters.category = query.category;
  if (query.sentimiento) filters.sentimiento = query.sentimiento;
  if (query.q) filters.query = query.q;

  const originRaw = query.origin?.trim().toLowerCase();
  let originFilter: OriginType | undefined;
  if (originRaw) {
    if (!isValidOrigin(originRaw)) {
      return json(422, {
        error: "validation_error",
        message: "origin must be one of news|awario"
      });
    }
    originFilter = originRaw;
  }

  const mediumFilter = query.medium?.trim() ? query.medium.trim() : undefined;
  const tagFilters = parseTagFilterValues(query.tag, query.tags);

  const fromDate = parseDate(query.from);
  if (query.from && !fromDate) {
    return json(422, {
      error: "validation_error",
      message: "from must be a valid ISO datetime"
    });
  }

  const toDate = parseDate(query.to);
  if (query.to && !toDate) {
    return json(422, {
      error: "validation_error",
      message: "to must be a valid ISO datetime"
    });
  }

  if (fromDate) filters.from = fromDate;
  if (toDate) filters.to = toDate;

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    return json(422, {
      error: "validation_error",
      message: "from must be before to"
    });
  }

  try {
    const originFilters: OriginFilterInput = {
      origin: originFilter,
      medium: mediumFilter,
      tags: tagFilters
    };
    const hasOriginFiltering = Boolean(originFilters.origin || originFilters.medium || (originFilters.tags?.length ?? 0) > 0);

    if (!hasOriginFiltering) {
      const result = await store.listContent(limit, filters, query.cursor ?? undefined);
      return json(200, {
        items: result.items.map(toApiContent),
        page_info: {
          next_cursor: result.nextCursor,
          has_next: result.hasNext
        }
      });
    }

    const scanLimit = Math.min(200, Math.max(limit * 3, 50));
    const filteredItems: ContentRecord[] = [];
    let scanCursor: string | undefined = query.cursor ?? undefined;
    let scanHasNext = true;
    let nextCursor: string | null = null;
    let matchedBeyondLimit = false;
    let guards = 0;

    while (scanHasNext && guards < 20) {
      guards += 1;
      const page = await store.listContent(scanLimit, filters, scanCursor);
      scanCursor = page.nextCursor ?? undefined;
      scanHasNext = page.hasNext;
      nextCursor = page.nextCursor;

      for (const item of page.items) {
        const originFields = deriveOriginFields({
          sourceType: item.sourceType,
          provider: item.provider,
          sourceName: item.sourceName
        });
        if (!matchesOriginFilters(originFields, originFilters)) continue;

        if (filteredItems.length < limit) {
          filteredItems.push(item);
        } else {
          matchedBeyondLimit = true;
        }
      }

      if (filteredItems.length >= limit && (matchedBeyondLimit || scanHasNext)) {
        break;
      }
    }

    const hasNext = filteredItems.length >= limit && (matchedBeyondLimit || scanHasNext);

    return json(200, {
      items: filteredItems.map(toApiContent),
      page_info: {
        next_cursor: hasNext ? nextCursor : null,
        has_next: hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const updateContentState = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const contentId = getIdFromPath(event, /^\/v1\/content\/([^/]+)\/state$/);
  if (!contentId || !UUID_REGEX.test(contentId)) {
    return json(422, { error: "validation_error", message: "Invalid content id" });
  }

  const parsed = parseContentStateBody(event);
  if (!parsed) {
    return json(422, {
      error: "validation_error",
      message: "Body must include target_state in active|archived|hidden and optional reason"
    });
  }

  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await store.upsertUserFromPrincipal(principal);
    const stateEvent = await store.changeContentState({
      contentItemId: contentId,
      targetState: parsed.targetState,
      reason: parsed.reason ?? undefined,
      actorUserId,
      requestId: getRequestId(event)
    });

    return json(200, toApiStateEvent(stateEvent));
  } catch (error) {
    return mapStoreError(error);
  }
};

export const bulkUpdateContentState = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const body = parseBody<BulkStateBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  if (!body.target_state || !VALID_STATES.has(body.target_state)) {
    return json(422, {
      error: "validation_error",
      message: "target_state must be one of active|archived|hidden"
    });
  }

  if (!Array.isArray(body.ids)) {
    return json(422, {
      error: "validation_error",
      message: "ids must be an array of UUIDs"
    });
  }

  const ids = [...new Set(body.ids.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
  if (ids.length < 1 || ids.length > 500) {
    return json(422, {
      error: "validation_error",
      message: "ids must contain between 1 and 500 UUIDs"
    });
  }

  const invalidId = ids.find((value) => !UUID_REGEX.test(value));
  if (invalidId) {
    return json(422, {
      error: "validation_error",
      message: `Invalid UUID in ids: ${invalidId}`
    });
  }

  const reason = normalizeReason(body.reason);
  if (body.reason !== undefined && body.reason !== null && reason === null) {
    return json(422, {
      error: "validation_error",
      message: "reason must be a non-empty string when provided"
    });
  }

  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await store.upsertUserFromPrincipal(principal);

    let processed = 0;
    const failures: Array<{ id: string; error: string; message: string }> = [];

    for (const id of ids) {
      try {
        await store.changeContentState({
          contentItemId: id,
          targetState: body.target_state as ContentState,
          reason: reason ?? undefined,
          actorUserId,
          requestId: getRequestId(event)
        });
        processed += 1;
      } catch (error) {
        if (error instanceof AppStoreError) {
          failures.push({
            id,
            error: error.code,
            message: error.message
          });
        } else {
          failures.push({
            id,
            error: "internal_error",
            message: (error as Error).message
          });
        }
      }
    }

    return json(200, {
      processed,
      failed: failures.length,
      failures
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const updateClassification = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const contentId = getIdFromPath(event, /^\/v1\/content\/([^/]+)\/classification$/);
  if (!contentId || !UUID_REGEX.test(contentId)) {
    return json(422, { error: "validation_error", message: "Invalid content id" });
  }

  const body = parseBody<ClassificationBody>(event);
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  const sentimiento = typeof body.sentimiento === "string" ? body.sentimiento.trim() : "";

  if (!categoria || !sentimiento) {
    return json(422, {
      error: "validation_error",
      message: "categoria and sentimiento are required"
    });
  }

  const etiquetas = normalizeTags(body.etiquetas);
  if (body.etiquetas !== undefined && etiquetas === null) {
    return json(422, {
      error: "validation_error",
      message: "etiquetas must be an array of strings"
    });
  }

  if (
    body.confidence_override !== undefined &&
    (typeof body.confidence_override !== "number" || body.confidence_override < 0 || body.confidence_override > 1)
  ) {
    return json(422, {
      error: "validation_error",
      message: "confidence_override must be a number between 0 and 1"
    });
  }

  const reason = normalizeReason(body.reason);
  if (body.reason !== undefined && body.reason !== null && reason === null) {
    return json(422, {
      error: "validation_error",
      message: "reason must be a non-empty string when provided"
    });
  }

  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await store.upsertUserFromPrincipal(principal);

    const classification = await store.upsertManualClassification({
      contentItemId: contentId,
      categoria,
      sentimiento,
      etiquetas,
      confianza: body.confidence_override,
      reason: reason ?? undefined,
      actorUserId,
      requestId: getRequestId(event)
    });

    return json(200, toApiClassification(classification));
  } catch (error) {
    return mapStoreError(error);
  }
};
