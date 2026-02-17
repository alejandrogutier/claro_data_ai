import AWS from "aws-sdk";
import type { SQSEvent } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { loadRuntimeSecrets } from "../config/secrets";
import { dedupeByCanonicalUrl, fetchFromProviders } from "./providers";
import { toSlug } from "./url";

type IngestionDispatchMessage = {
  triggerType?: "scheduled" | "manual";
  runId?: string;
  requestId?: string;
  requestedAt?: string;
  terms?: string[];
  language?: string;
  maxArticlesPerTerm?: number;
};

const s3 = new AWS.S3({ region: env.awsRegion });

const parseTerms = (terms: unknown): string[] => {
  if (!Array.isArray(terms)) return [];
  return terms
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 50);
};

const parseDefaultTerms = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 50);
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
  const message = parseMessage(recordBody);
  const runId = message.runId ?? randomUUID();
  const triggerType = message.triggerType ?? "scheduled";
  const language = parseLanguage(message.language);
  const maxArticlesPerTerm = parseLimit(message.maxArticlesPerTerm);

  const requestedTerms = parseTerms(message.terms);
  const defaultTermsFromConfig = parseDefaultTerms(appConfig.INGESTION_DEFAULT_TERMS ?? env.ingestionDefaultTerms);
  const terms = requestedTerms.length > 0 ? requestedTerms : defaultTermsFromConfig;

  if (terms.length === 0) {
    throw new Error("No terms provided in message and no INGESTION_DEFAULT_TERMS configured");
  }

  const termSummaries: Record<string, unknown>[] = [];

  for (const term of terms) {
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
      language,
      maxArticlesPerTerm,
      providerResults,
      dedupedCount: deduped.length,
      ingestedAt: new Date().toISOString(),
      items: deduped
    });

    termSummaries.push({
      term,
      raw_s3_key: rawS3Key,
      providers_total: providerResults.length,
      providers_successful: successfulProviders,
      providers_failed: failedProviders,
      items_raw: merged.length,
      items_deduped: deduped.length
    });
  }

  return {
    run_id: runId,
    trigger_type: triggerType,
    terms_count: terms.length,
    term_summaries: termSummaries
  };
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
