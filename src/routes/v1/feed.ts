import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppStoreError, createAppStore, type ContentRecord } from "../../data/appStore";
import { json } from "../../core/http";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NEWS_FEED_LIMIT = 2;

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

    if (error.code === "not_found") {
      return json(404, {
        error: "not_found",
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

  const termId = event.queryStringParameters?.term_id?.trim();
  if (!termId || !UUID_REGEX.test(termId)) {
    return json(422, {
      error: "validation_error",
      message: "term_id is required and must be a valid UUID"
    });
  }

  try {
    const items = await store.listNewsFeed(termId);
    return json(200, {
      term_id: termId,
      limit: NEWS_FEED_LIMIT,
      items: items.map(toApiContent)
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
