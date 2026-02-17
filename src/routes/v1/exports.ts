import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getAuthPrincipal, getRole, hasRole } from "../../core/auth";
import { env } from "../../config/env";
import { getPathWithoutStage, getRequestId, json, parseBody } from "../../core/http";
import { AppStoreError, createAppStore } from "../../data/appStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATES = new Set(["active", "archived", "hidden"]);
const VALID_SOURCE_TYPES = new Set(["news", "social"]);
const ALLOWED_FILTER_KEYS = new Set([
  "state",
  "source_type",
  "term_id",
  "provider",
  "category",
  "sentimiento",
  "from",
  "to",
  "q"
]);

type CreateExportBody = {
  filters?: Record<string, unknown>;
};

const sqs = new AWS.SQS({ region: env.awsRegion });
const s3 = new AWS.S3({ region: env.awsRegion, signatureVersion: "v4" });

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeFilters = (value: unknown): { filters: Record<string, unknown> | null; message?: string } => {
  if (value === undefined || value === null) {
    return { filters: {} };
  }

  if (!isPlainObject(value)) {
    return { filters: null, message: "filters must be an object" };
  }

  const output: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      continue;
    }

    if (raw === null || raw === undefined) continue;

    if (typeof raw !== "string") {
      return { filters: null, message: `${key} must be a string` };
    }

    const normalized = raw.trim();
    if (!normalized) continue;

    if (key === "state" && !VALID_STATES.has(normalized)) {
      return { filters: null, message: "state must be one of active|archived|hidden" };
    }

    if (key === "source_type" && !VALID_SOURCE_TYPES.has(normalized)) {
      return { filters: null, message: "source_type must be one of news|social" };
    }

    if (key === "term_id" && !UUID_REGEX.test(normalized)) {
      return { filters: null, message: "term_id must be a valid UUID" };
    }

    if ((key === "from" || key === "to") && Number.isNaN(new Date(normalized).getTime())) {
      return { filters: null, message: `${key} must be a valid ISO datetime` };
    }

    output[key] = normalized;
  }

  return { filters: output };
};

const getExportIdFromPath = (event: APIGatewayProxyEventV2): string | null => {
  const path = getPathWithoutStage(event);
  const match = path.match(/^\/v1\/exports\/([^/]+)$/);
  if (!match) return null;
  return match[1] ?? null;
};

export const createCsvExport = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  if (!env.exportQueueUrl) {
    return json(500, {
      error: "misconfigured",
      message: "Missing EXPORT_QUEUE_URL"
    });
  }

  const body = event.body ? parseBody<CreateExportBody>(event) : { filters: {} };
  if (!body) {
    return json(400, {
      error: "invalid_json",
      message: "Body JSON invalido"
    });
  }

  const sanitized = sanitizeFilters(body.filters);
  if (!sanitized.filters) {
    return json(422, {
      error: "validation_error",
      message: sanitized.message ?? "Invalid filters"
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
    const job = await store.createExportJob({
      requestedByUserId: actorUserId,
      filters: sanitized.filters
    });

    try {
      await sqs
        .sendMessage({
          QueueUrl: env.exportQueueUrl,
          MessageBody: JSON.stringify({
            export_id: job.id,
            requested_by_user_id: actorUserId,
            request_id: getRequestId(event),
            requested_at: new Date().toISOString()
          })
        })
        .promise();
    } catch (dispatchError) {
      await store.failExportJob(job.id);
      return json(502, {
        error: "export_dispatch_failed",
        message: (dispatchError as Error).message
      });
    }

    return json(202, {
      export_id: job.id,
      status: job.status
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getCsvExport = async (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const exportId = getExportIdFromPath(event);
  if (!exportId || !UUID_REGEX.test(exportId)) {
    return json(422, {
      error: "validation_error",
      message: "Invalid export id"
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
    const job = await store.getExportJob(exportId);
    if (!job) {
      return json(404, {
        error: "not_found",
        message: "Export job not found"
      });
    }

    let downloadUrl: string | null = null;
    if (job.status === "completed" && job.s3Key && env.exportBucketName) {
      downloadUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: env.exportBucketName,
        Key: job.s3Key,
        Expires: env.exportSignedUrlSeconds ?? 900
      });
    }

    return json(200, {
      export_id: job.id,
      status: job.status,
      row_count: job.rowCount,
      created_at: job.createdAt.toISOString(),
      completed_at: job.completedAt?.toISOString() ?? null,
      download_url: downloadUrl,
      filters: job.filters
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
