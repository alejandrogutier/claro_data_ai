import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppStoreError, createAppStore, type FeedRecord } from "../../data/appStore";
import { json } from "../../core/http";
import {
  deriveOriginFields,
  isValidOrigin,
  matchesOriginFilters,
  parseTagFilterValues,
  type OriginFilterInput,
  type OriginType
} from "../../core/origin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toApiContent = (item: FeedRecord) => ({
  ...deriveOriginFields({
    sourceType: item.sourceType,
    provider: item.provider,
    sourceName: item.sourceName,
    channel: item.sourceName,
    awarioAlertId: item.awarioAlertId
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
      if (error.message === "query_not_linked") {
        return json(409, {
          error: "query_not_linked",
          message: "La query no tiene vinculo Awario activo"
        });
      }

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

export const getNewsFeed = async (event: APIGatewayProxyEventV2) => {
  const store = createAppStore();
  if (!store) {
    return json(500, {
      error: "misconfigured",
      message: "Database runtime is not configured"
    });
  }

  const query = event.queryStringParameters ?? {};
  const termId = query.term_id?.trim();
  if (!termId || !UUID_REGEX.test(termId)) {
    return json(422, {
      error: "validation_error",
      message: "term_id is required and must be a valid UUID"
    });
  }

  const limitRaw = query.limit?.trim();
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  if (!Number.isFinite(limit) || Number.isNaN(limit) || limit < 1 || limit > 200) {
    return json(422, {
      error: "validation_error",
      message: "limit must be an integer between 1 and 200"
    });
  }

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

  const originFilters: OriginFilterInput = {
    origin: originFilter,
    medium: query.medium?.trim() ? query.medium.trim() : undefined,
    tags: parseTagFilterValues(query.tag, query.tags)
  };

  const hasOriginFiltering = Boolean(
    originFilters.origin || originFilters.medium || (originFilters.tags?.length ?? 0) > 0
  );

  try {
    if (!hasOriginFiltering) {
      const page = await store.listNewsFeed(termId, limit, query.cursor);
      return json(200, {
        term_id: termId,
        limit,
        items: page.items.map(toApiContent),
        page_info: {
          next_cursor: page.nextCursor,
          has_next: page.hasNext
        }
      });
    }

    const filtered: FeedRecord[] = [];
    let cursor = query.cursor;
    let hasNext = false;
    let nextCursor: string | null = null;
    let guard = 0;

    while (guard < 20) {
      guard += 1;
      const page = await store.listNewsFeed(termId, limit, cursor);
      cursor = page.nextCursor ?? undefined;
      hasNext = page.hasNext;
      nextCursor = page.nextCursor;

      for (const item of page.items) {
        const matches = matchesOriginFilters(
          deriveOriginFields({
            sourceType: item.sourceType,
            provider: item.provider,
            sourceName: item.sourceName,
            channel: item.sourceName,
            awarioAlertId: item.awarioAlertId
          }),
          originFilters
        );
        if (!matches) continue;
        if (filtered.length < limit) {
          filtered.push(item);
        }
      }

      if (!hasNext || filtered.length >= limit) break;
    }

    return json(200, {
      term_id: termId,
      limit,
      items: filtered.map(toApiContent),
      page_info: {
        next_cursor: hasNext ? nextCursor : null,
        has_next: hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
