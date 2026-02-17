import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppStoreError, createAppStore, type ContentFilters, type ContentRecord } from "../../data/appStore";
import { notImplemented } from "../../lib/placeholders";
import { getRole, hasRole } from "../../core/auth";
import { json } from "../../core/http";

const VALID_STATES = new Set(["active", "archived", "hidden"]);
const VALID_SOURCE_TYPES = new Set(["news", "social"]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, {
        error: "validation_error",
        message: error.message
      });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
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
    filters.state = query.state as "active" | "archived" | "hidden";
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
    const result = await store.listContent(limit, filters, query.cursor ?? undefined);
    return json(200, {
      items: result.items.map(toApiContent),
      page_info: {
        next_cursor: result.nextCursor,
        has_next: result.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const updateContentState = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("PATCH /v1/content/{id}/state");
};

export const bulkUpdateContentState = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("POST /v1/content/bulk/state");
};

export const updateClassification = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("PATCH /v1/content/{id}/classification");
};
