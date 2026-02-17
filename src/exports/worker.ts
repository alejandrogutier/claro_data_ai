import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { env } from "../config/env";
import { createAppStore, type ContentFilters, type ContentRecord } from "../data/appStore";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 10;
const MAX_EXPORT_ROWS = 100000;

const s3 = new AWS.S3({ region: env.awsRegion });

type ExportJobMessage = {
  export_id?: string;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseFilters = (filters: Record<string, unknown>): ContentFilters => {
  const parsed: ContentFilters = {};

  const state = asString(filters.state);
  if (state === "active" || state === "archived" || state === "hidden") {
    parsed.state = state;
  }

  const sourceType = asString(filters.source_type);
  if (sourceType === "news" || sourceType === "social") {
    parsed.sourceType = sourceType;
  }

  const termId = asString(filters.term_id);
  if (termId && UUID_REGEX.test(termId)) {
    parsed.termId = termId;
  }

  const provider = asString(filters.provider);
  if (provider) parsed.provider = provider;

  const category = asString(filters.category);
  if (category) parsed.category = category;

  const sentimiento = asString(filters.sentimiento);
  if (sentimiento) parsed.sentimiento = sentimiento;

  const from = parseDate(filters.from);
  if (from) parsed.from = from;

  const to = parseDate(filters.to);
  if (to) parsed.to = to;

  const query = asString(filters.q);
  if (query) parsed.query = query;

  return parsed;
};

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const toCsv = (rows: ContentRecord[]): string => {
  const headers = [
    "id",
    "source_type",
    "term_id",
    "provider",
    "source_name",
    "source_id",
    "state",
    "title",
    "summary",
    "content",
    "canonical_url",
    "image_url",
    "language",
    "category",
    "published_at",
    "source_score",
    "categoria",
    "sentimiento",
    "created_at",
    "updated_at"
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.sourceType,
        row.termId,
        row.provider,
        row.sourceName,
        row.sourceId,
        row.state,
        row.title,
        row.summary,
        row.content,
        row.canonicalUrl,
        row.imageUrl,
        row.language,
        row.category,
        row.publishedAt?.toISOString() ?? null,
        row.sourceScore,
        row.categoria,
        row.sentimiento,
        row.createdAt.toISOString(),
        row.updatedAt.toISOString()
      ]
        .map((value) => csvEscape(value))
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
};

const fetchAllRows = async (filters: ContentFilters): Promise<ContentRecord[]> => {
  const store = createAppStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const rows: ContentRecord[] = [];
  let cursor: string | undefined;

  while (rows.length < MAX_EXPORT_ROWS) {
    const page = await store.listContent(Math.min(PAGE_SIZE, MAX_EXPORT_ROWS - rows.length), filters, cursor);
    rows.push(...page.items);

    if (!page.hasNext || !page.nextCursor) {
      break;
    }

    cursor = page.nextCursor;
  }

  return rows;
};

const buildExportKey = (exportId: string): string => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `exports/${y}/${m}/${d}/${h}${min}-${exportId}.csv`;
};

const processExportJob = async (exportId: string): Promise<void> => {
  const store = createAppStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  if (!env.exportBucketName) {
    throw new Error("Missing EXPORT_BUCKET_NAME");
  }

  const claimedJob = await store.claimExportJob(exportId);
  if (!claimedJob) {
    const existing = await store.getExportJob(exportId);
    if (!existing || existing.status !== "queued") {
      return;
    }
    return;
  }

  try {
    const filters = parseFilters(claimedJob.filters);
    const rows = await fetchAllRows(filters);
    const csvBody = toCsv(rows);
    const key = buildExportKey(exportId);

    await s3
      .putObject({
        Bucket: env.exportBucketName,
        Key: key,
        Body: csvBody,
        ContentType: "text/csv; charset=utf-8"
      })
      .promise();

    await store.completeExportJob(exportId, rows.length, key);
  } catch (error) {
    await store.failExportJob(exportId);
    console.error("export_job_failed", {
      export_id: exportId,
      error: (error as Error).message
    });
  }
};

export const main = async (event: SQSEvent) => {
  for (const record of event.Records) {
    let payload: ExportJobMessage | null = null;

    try {
      payload = JSON.parse(record.body) as ExportJobMessage;
    } catch {
      console.error("invalid_export_message_json", { messageId: record.messageId });
      continue;
    }

    const exportId = payload.export_id;
    if (!exportId || !UUID_REGEX.test(exportId)) {
      console.error("invalid_export_id", { messageId: record.messageId, exportId });
      continue;
    }

    await processExportJob(exportId);
  }
};
