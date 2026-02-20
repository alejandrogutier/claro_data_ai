import AWS from "aws-sdk";
import { env } from "../config/env";
import {
  createSocialStore,
  type SocialChannel,
  type SocialReconciliationSnapshotInput,
  type TriggerType
} from "../data/socialStore";

const s3 = new AWS.S3({ region: env.awsRegion });
const sqs = new AWS.SQS({ region: env.awsRegion });
const bedrock = new AWS.BedrockRuntime({ region: env.awsRegion });

const SOCIAL_BUCKET_DEFAULT = "claro-dataslayer-dump";
const SOCIAL_PREFIX_DEFAULT = "raw/organic/";
const MAX_BEDROCK_ATTEMPTS = 3;
const SENTIMENT_PROMPT_VERSION = "social-sentiment-v1";

type SocialSyncInput = {
  triggerType: TriggerType;
  requestId?: string;
  runId?: string;
  force?: boolean;
  bucket?: string;
  prefix?: string;
};

type SocialSyncOutput = {
  runId: string;
  triggerType: TriggerType;
  status: "completed" | "failed";
  bucket: string;
  prefix: string;
  objectsDiscovered: number;
  objectsProcessed: number;
  objectsSkipped: number;
  rowsParsed: number;
  rowsPersisted: number;
  rowsClassified: number;
  rowsPendingClassification: number;
  rowsUnknownSentiment: number;
  malformedRows: number;
  anomalousObjectKeys: number;
  alert: {
    triggered: boolean;
    reason: string[];
    incidentMode: "created" | "escalated" | "updated" | "deduped" | "none";
    incidentId: string | null;
  };
  errorMessage?: string;
};

type CsvRecord = Record<string, string>;

type NormalizedSocialRow = {
  channel: SocialChannel;
  accountName: string;
  externalPostId: string;
  postUrl: string;
  postType: string | null;
  publishedAt: Date | null;
  text: string | null;
  imageUrl: string | null;
  exposure: number;
  engagementTotal: number;
  impressions: number;
  reach: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  diagnostics: Record<string, unknown>;
  hashtags: string[];
};

type ChannelS3Stats = {
  rows: number;
  minDate: Date | null;
  maxDate: Date | null;
};

const CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];

const buildEmptyChannelStats = (): Record<SocialChannel, ChannelS3Stats> => ({
  facebook: { rows: 0, minDate: null, maxDate: null },
  instagram: { rows: 0, minDate: null, maxDate: null },
  linkedin: { rows: 0, minDate: null, maxDate: null },
  tiktok: { rows: 0, minDate: null, maxDate: null }
});

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const decodeResponseBody = (body: unknown): string => {
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return "";
};

const extractBedrockText = (responseBody: string): string => {
  const parsed = JSON.parse(responseBody) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("bedrock_invalid_response");
  }

  const record = parsed as {
    content?: Array<{ type?: string; text?: string }>;
    completion?: string;
  };

  if (Array.isArray(record.content)) {
    const textBlock = record.content.find((item) => item.type === "text" && typeof item.text === "string");
    if (textBlock?.text) return textBlock.text;
  }

  if (typeof record.completion === "string" && record.completion.trim()) {
    return record.completion;
  }

  throw new Error("bedrock_missing_text_output");
};

const parseModelJson = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("model_empty_response");

  const cleaned = trimmed.startsWith("```")
    ? trimmed
        .split("\n")
        .filter((_, index, arr) => index !== 0 && index !== arr.length - 1)
        .join("\n")
        .trim()
    : trimmed;

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error("model_invalid_json");
  }
};

const shouldRetryBedrock = (error: unknown): boolean => {
  const err = error as { code?: string; name?: string; message?: string };
  const code = err.code ?? err.name ?? "";
  const message = (err.message ?? "").toLowerCase();
  if (code === "ThrottlingException" || code === "ModelTimeoutException" || code === "ServiceUnavailableException") return true;
  if (message.includes("throttl") || message.includes("timeout")) return true;
  return false;
};

const classifySentiment = async (
  text: string | null
): Promise<{ sentimiento: "positivo" | "negativo" | "neutro" | "unknown"; confianza: number | null }> => {
  const normalizedText = (text ?? "").trim();
  if (!normalizedText) return { sentimiento: "unknown", confianza: null };

  const modelId = env.bedrockModelId;
  const prompt = [
    "Clasifica el sentimiento del siguiente texto en uno de: positive, negative, neutral.",
    "Devuelve SOLO JSON valido con shape exacto: {\"sentiment\":\"positive|negative|neutral\",\"confidence\":0..1}.",
    "Texto:",
    normalizedText.slice(0, 4000)
  ].join("\n");

  for (let attempt = 1; attempt <= MAX_BEDROCK_ATTEMPTS; attempt += 1) {
    try {
      const response = await bedrock
        .invokeModel({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 250,
            temperature: 0,
            messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
          })
        })
        .promise();

      const rawBody = decodeResponseBody(response.body);
      const textOutput = extractBedrockText(rawBody);
      const parsed = parseModelJson(textOutput);

      const sentiment = typeof parsed.sentiment === "string" ? parsed.sentiment.trim().toLowerCase() : "";
      const confidenceRaw = typeof parsed.confidence === "number" ? parsed.confidence : null;
      const confidence =
        confidenceRaw !== null && Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;

      if (sentiment === "positive") return { sentimiento: "positivo", confianza: confidence };
      if (sentiment === "negative") return { sentimiento: "negativo", confianza: confidence };
      if (sentiment === "neutral") return { sentimiento: "neutro", confianza: confidence };
      return { sentimiento: "unknown", confianza: confidence };
    } catch (error) {
      if (attempt < MAX_BEDROCK_ATTEMPTS && shouldRetryBedrock(error)) {
        await sleep(attempt * 400 + Math.floor(Math.random() * 200));
        continue;
      }
      return { sentimiento: "unknown", confianza: null };
    }
  }

  return { sentimiento: "unknown", confianza: null };
};

const toNumber = (value: string | undefined): number => {
  if (!value) return 0;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized.includes("T") ? normalized : `${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeText = (value: string | undefined, maxLen = 4000): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

const normalizeHashtagToken = (value: string): string =>
  value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("es-CO")
    .replace(/^#+/u, "")
    .replace(/[^\p{L}\p{N}_]+/gu, "");

const extractHashtags = (value: string | null): string[] => {
  if (!value) return [];
  const matches = value.match(/#[\p{L}\p{N}\p{M}_]+/gu) ?? [];
  const normalized = matches.map((item) => normalizeHashtagToken(item)).filter((item) => item.length >= 2);
  return Array.from(new Set(normalized)).slice(0, 20);
};

const extractHashtagsFromColumns = (row: CsvRecord): string[] => {
  const candidates: string[] = [];
  for (const [key, raw] of Object.entries(row)) {
    if (!/hashtag/i.test(key)) continue;
    const text = (raw ?? "").trim();
    if (!text) continue;
    const tagged = text.match(/#[\p{L}\p{N}\p{M}_]+/gu);
    if (tagged && tagged.length > 0) {
      candidates.push(...tagged);
      continue;
    }
    candidates.push(...text.split(/[,\s;|]+/g));
  }

  return Array.from(
    new Set(
      candidates
        .map((item) => normalizeHashtagToken(item))
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 20);
};

const mergeHashtags = (...collections: string[][]): string[] =>
  Array.from(
    new Set(
      collections
        .flat()
        .map((item) => normalizeHashtagToken(item))
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 20);

const normalizeUrl = (value: string | undefined, fallback: string): string => {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  return raw;
};

const parseCsv = (content: string): CsvRecord[] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i] ?? "";
    const next = content[i + 1] ?? "";

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  if (rows.length === 0) return [];
  const header = rows[0]?.map((item) => item.trim()) ?? [];
  const records: CsvRecord[] = [];

  for (const data of rows.slice(1)) {
    if (data.every((item) => !item || !item.trim())) continue;
    const record: CsvRecord = {};
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i] ?? `column_${i}`;
      record[key] = data[i] ?? "";
    }
    records.push(record);
  }

  return records;
};

const detectChannelFromKey = (key: string): SocialChannel | null => {
  if (key.includes("/fb/")) return "facebook";
  if (key.includes("/ig/")) return "instagram";
  if (key.includes("/lk/")) return "linkedin";
  if (key.includes("/tiktok/")) return "tiktok";
  return null;
};

const normalizeRow = (channel: SocialChannel, row: CsvRecord, rowIndex: number, objectKey: string): NormalizedSocialRow | null => {
  if (channel === "facebook") {
    const externalPostId = row["Post ID"]?.trim();
    const accountName = row["Page name"]?.trim();
    if (!externalPostId || !accountName) return null;
    const text = normalizeText(row["Post message"] ?? row["Post description"] ?? row["Post name"]);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Link to post"], `social://facebook/${externalPostId}`);
    const reach = toNumber(row["Organic post reach"]);
    const impressions = toNumber(row["Organic impressions"]);
    const exposure = reach > 0 ? reach : impressions;
    const likes = toNumber(row["Post likes"]);
    const comments = toNumber(row["Post comments"]);
    const shares = toNumber(row["Post shares"]);
    const clicks = toNumber(row["Clicks"]) + toNumber(row["Post link clicks"]) + toNumber(row["Post other clicks"]);
    const views = toNumber(row["Organic video views"]) + toNumber(row["Post video plays"]) + toNumber(row["Total video views"]);
    const engagementTotalRaw = toNumber(row["Post engagements"]);
    const engagementTotal = engagementTotalRaw > 0 ? engagementTotalRaw : likes + comments + shares;

    return {
      channel,
      accountName,
      externalPostId,
      postUrl,
      postType: normalizeText(row["Post type"], 120),
      publishedAt: toDate(row["Date"]),
      text,
      imageUrl: normalizeText(row["Post image URL"], 2048),
      exposure,
      engagementTotal,
      impressions,
      reach,
      clicks,
      likes,
      comments,
      shares,
      views,
      diagnostics: { object_key: objectKey, row_index: rowIndex + 1 },
      hashtags
    };
  }

  if (channel === "instagram") {
    const externalPostId = row["Media ID"]?.trim();
    const accountName = row["Username"]?.trim();
    if (!externalPostId || !accountName) return null;
    const text = normalizeText(row["Media caption"]);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Media permalink"] ?? row["Media URL"], `social://instagram/${externalPostId}`);
    const reach = toNumber(row["Media reach"]);
    const views = toNumber(row["Media views"]);
    const exposure = reach > 0 ? reach : views;
    const likes = toNumber(row["Media likes"]);
    const comments = toNumber(row["Media comments"]);
    const shares = toNumber(row["Media shares"]);
    const clicks = toNumber(row["Media profile visits"]);
    const engagementTotalRaw = toNumber(row["Media total interactions"]);
    const engagementTotal = engagementTotalRaw > 0 ? engagementTotalRaw : likes + comments + shares;

    return {
      channel,
      accountName,
      externalPostId,
      postUrl,
      postType: normalizeText(row["Media type"], 120),
      publishedAt: toDate(row["Date"]),
      text,
      imageUrl: normalizeText(row["Media URL"], 2048),
      exposure,
      engagementTotal,
      impressions: 0,
      reach,
      clicks,
      likes,
      comments,
      shares,
      views,
      diagnostics: { object_key: objectKey, row_index: rowIndex + 1 },
      hashtags
    };
  }

  if (channel === "linkedin") {
    const externalPostId = row["Post ID"]?.trim();
    const accountName = row["Account Name"]?.trim();
    if (!externalPostId || !accountName) return null;
    const text = normalizeText(row["Post text"]);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Post url"], `social://linkedin/${externalPostId}`);
    const impressions = toNumber(row["Total impressions"]);
    const likes = toNumber(row["Total likes"]);
    const comments = toNumber(row["Total comments"]);
    const shares = toNumber(row["Total shares"]);
    const clicks = toNumber(row["Total clicks"]);
    const views = toNumber(row["Total video views"]);
    const engagementTotalRaw = toNumber(row["Total engagements"]);
    const engagementTotal = engagementTotalRaw > 0 ? engagementTotalRaw : likes + comments + shares;

    return {
      channel,
      accountName,
      externalPostId,
      postUrl,
      postType: normalizeText(row["Post content type"], 120),
      publishedAt: toDate(row["Date"]),
      text,
      imageUrl: normalizeText(row["Content image URL"], 2048),
      exposure: impressions,
      engagementTotal,
      impressions,
      reach: 0,
      clicks,
      likes,
      comments,
      shares,
      views,
      diagnostics: { object_key: objectKey, row_index: rowIndex + 1 },
      hashtags
    };
  }

  const externalPostId = row["Video ID"]?.trim();
  const accountName = row["Account nickname"]?.trim();
  if (!externalPostId || !accountName) return null;
  const text = normalizeText(row["Title"]);
  const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
  const postUrl = normalizeUrl(row["Share URL"], `social://tiktok/${externalPostId}`);
  const views = toNumber(row["Video Views"]);
  const likes = toNumber(row["Likes"]);
  const comments = toNumber(row["Comments"]);
  const shares = toNumber(row["Shares"]);
  const engagementTotalRaw = toNumber(row["Total Engagement"]);
  const engagementTotal = engagementTotalRaw > 0 ? engagementTotalRaw : likes + comments + shares;

  return {
    channel,
    accountName,
    externalPostId,
    postUrl,
    postType: "video",
    publishedAt: toDate(row["Date created"]),
    text,
    imageUrl: normalizeText(row["Cover image URL"], 2048),
    exposure: views,
    engagementTotal,
    impressions: 0,
    reach: 0,
    clicks: 0,
    likes,
    comments,
    shares,
    views,
    diagnostics: { object_key: objectKey, row_index: rowIndex + 1 },
    hashtags
  };
};

const updateChannelStats = (stats: Record<SocialChannel, ChannelS3Stats>, row: NormalizedSocialRow): void => {
  const channel = stats[row.channel];
  channel.rows += 1;
  if (!row.publishedAt) return;
  if (!channel.minDate || row.publishedAt.getTime() < channel.minDate.getTime()) {
    channel.minDate = row.publishedAt;
  }
  if (!channel.maxDate || row.publishedAt.getTime() > channel.maxDate.getTime()) {
    channel.maxDate = row.publishedAt;
  }
};

const toPhaseMetrics = (input: {
  bucket: string;
  prefix: string;
  objectsDiscovered: number;
  objectsProcessed: number;
  objectsSkipped: number;
  rowsParsed: number;
  rowsPersisted: number;
  rowsClassified: number;
  rowsPendingClassification: number;
  rowsUnknownSentiment: number;
  malformedRows: number;
  anomalousObjectKeys: number;
  alert: SocialSyncOutput["alert"];
}): Record<string, unknown> => ({
  bucket: input.bucket,
  prefix: input.prefix,
  objects_discovered: input.objectsDiscovered,
  objects_processed: input.objectsProcessed,
  objects_skipped: input.objectsSkipped,
  rows_parsed: input.rowsParsed,
  rows_persisted: input.rowsPersisted,
  rows_classified: input.rowsClassified,
  rows_pending_classification: input.rowsPendingClassification,
  rows_unknown_sentiment: input.rowsUnknownSentiment,
  malformed_rows: input.malformedRows,
  anomalous_object_keys: input.anomalousObjectKeys,
  alert: input.alert
});

const listAllObjects = async (bucket: string, prefix: string): Promise<Array<{ key: string; eTag: string; lastModified: Date; size: number }>> => {
  let continuationToken: string | undefined;
  const objects: Array<{ key: string; eTag: string; lastModified: Date; size: number }> = [];

  do {
    const response = await s3
      .listObjectsV2({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
      .promise();

    for (const item of response.Contents ?? []) {
      const key = item.Key ?? "";
      if (!key || key.endsWith("/")) continue;
      if (!item.ETag || !item.LastModified) continue;
      objects.push({
        key,
        eTag: item.ETag.replaceAll('"', ""),
        lastModified: item.LastModified,
        size: item.Size ?? 0
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects.sort((a, b) => a.key.localeCompare(b.key));
};

const fetchObjectBody = async (bucket: string, key: string): Promise<string> => {
  const response = await s3
    .getObject({
      Bucket: bucket,
      Key: key
    })
    .promise();

  const body = response.Body;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return "";
};

export const runSocialSync = async (input: SocialSyncInput): Promise<SocialSyncOutput> => {
  const store = createSocialStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const bucket = input.bucket ?? env.socialRawBucketName ?? env.rawBucketName ?? SOCIAL_BUCKET_DEFAULT;
  const prefix = input.prefix ?? env.socialRawPrefix ?? SOCIAL_PREFIX_DEFAULT;
  const run = await store.startSyncRun({ triggerType: input.triggerType, requestId: input.requestId, runId: input.runId });

  let objectsProcessed = 0;
  let objectsSkipped = 0;
  let rowsParsed = 0;
  let rowsPersisted = 0;
  let rowsClassified = 0;
  let rowsPendingClassification = 0;
  let rowsUnknownSentiment = 0;
  let malformedRows = 0;
  let anomalousObjectKeys = 0;
  let objectsDiscovered = 0;
  let aggregatedRows = 0;
  let objectsClassifiedQueued = 0;

  const alertOutput: SocialSyncOutput["alert"] = {
    triggered: false,
    reason: [],
    incidentMode: "none",
    incidentId: null
  };

  const phaseMetrics = (): Record<string, unknown> =>
    toPhaseMetrics({
      bucket,
      prefix,
      objectsDiscovered,
      objectsProcessed,
      objectsSkipped,
      rowsParsed,
      rowsPersisted,
      rowsClassified,
      rowsPendingClassification,
      rowsUnknownSentiment,
      malformedRows,
      anomalousObjectKeys,
      alert: alertOutput
    });

  try {
    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest",
      state: "running",
      details: { bucket, prefix },
      metrics: phaseMetrics()
    });

    const objects = await listAllObjects(bucket, prefix);
    objectsDiscovered = objects.length;
    const queueClassification = Boolean(env.classificationQueueUrl);
    const classificationContentIds = new Set<string>();
    const channelStats = buildEmptyChannelStats();
    const touchedChannels = new Set<SocialChannel>();

    for (const object of objects) {
      if (object.key !== object.key.trim()) {
        anomalousObjectKeys += 1;
      }

      const channel = detectChannelFromKey(object.key);
      if (!channel || object.size <= 0) {
        objectsSkipped += 1;
        continue;
      }

      const body = await fetchObjectBody(bucket, object.key);
      const csvRows = parseCsv(body);
      rowsParsed += csvRows.length;
      touchedChannels.add(channel);

      const alreadyProcessed =
        !input.force &&
        (await store.isObjectProcessed({
          bucket,
          objectKey: object.key,
          eTag: object.eTag,
          lastModified: object.lastModified
        }));
      if (alreadyProcessed) {
        objectsSkipped += 1;
      }

      for (let idx = 0; idx < csvRows.length; idx += 1) {
        const row = csvRows[idx] ?? {};
        const normalized = normalizeRow(channel, row, idx, object.key);
        if (!normalized) {
          malformedRows += 1;
          continue;
        }

        updateChannelStats(channelStats, normalized);

        if (alreadyProcessed) {
          continue;
        }

        const persisted = await store.upsertSocialPost({
          channel: normalized.channel,
          accountName: normalized.accountName,
          externalPostId: normalized.externalPostId,
          postUrl: normalized.postUrl,
          postType: normalized.postType,
          publishedAt: normalized.publishedAt,
          text: normalized.text,
          imageUrl: normalized.imageUrl,
          exposure: normalized.exposure,
          engagementTotal: normalized.engagementTotal,
          impressions: normalized.impressions,
          reach: normalized.reach,
          clicks: normalized.clicks,
          likes: normalized.likes,
          comments: normalized.comments,
          shares: normalized.shares,
          views: normalized.views,
          rawPayloadS3Key: object.key,
          diagnostics: normalized.diagnostics,
          hashtags: normalized.hashtags
        });

        rowsPersisted += 1;

        if (queueClassification) {
          classificationContentIds.add(persisted.contentItemId);
        } else {
          const sentiment = await classifySentiment(normalized.text);
          await store.upsertSentimentClassification({
            contentItemId: persisted.contentItemId,
            sentimiento: sentiment.sentimiento,
            confianza: sentiment.confianza,
            promptVersion: SENTIMENT_PROMPT_VERSION,
            modelId: env.bedrockModelId,
            metadata: {
              source: "social_etl",
              request_id: input.requestId ?? null,
              object_key: object.key
            }
          });

          if (sentiment.sentimiento === "unknown") rowsUnknownSentiment += 1;
          else rowsClassified += 1;
        }
      }

      if (!alreadyProcessed) {
        await store.markObjectProcessed({
          runId: run.id,
          bucket,
          objectKey: object.key,
          eTag: object.eTag,
          lastModified: object.lastModified
        });

        objectsProcessed += 1;
      }

      await store.updateSyncRunPhase({
        runId: run.id,
        phase: "ingest",
        state: "running",
        metrics: phaseMetrics()
      });
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest",
      state: "completed",
      details: {
        objects_discovered: objectsDiscovered,
        objects_processed: objectsProcessed,
        objects_skipped: objectsSkipped
      },
      metrics: phaseMetrics()
    });

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "classify",
      state: "running",
      metrics: phaseMetrics()
    });

    if (queueClassification && env.classificationQueueUrl) {
      const requestedAt = new Date().toISOString();
      for (const contentItemId of classificationContentIds) {
        await sqs
          .sendMessage({
            QueueUrl: env.classificationQueueUrl,
            MessageBody: JSON.stringify({
              content_item_id: contentItemId,
              prompt_version: env.classificationPromptVersion ?? SENTIMENT_PROMPT_VERSION,
              model_id: env.bedrockModelId,
              source_type: "social",
              trigger_type: input.triggerType,
              request_id: input.requestId ?? null,
              requested_at: requestedAt
            })
          })
          .promise();
      }
      rowsPendingClassification = classificationContentIds.size;
      objectsClassifiedQueued = classificationContentIds.size;
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "classify",
      state: "completed",
      details: {
        mode: queueClassification ? "queued_async" : "inline_sync",
        rows_classified: rowsClassified,
        rows_pending_classification: rowsPendingClassification
      },
      metrics: phaseMetrics()
    });

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "aggregate",
      state: "running",
      metrics: phaseMetrics()
    });

    const touched = Array.from(touchedChannels);
    const minDates = CHANNELS.map((channel) => channelStats[channel].minDate).filter((value): value is Date => value instanceof Date);
    const maxDates = CHANNELS.map((channel) => channelStats[channel].maxDate).filter((value): value is Date => value instanceof Date);
    if (touched.length > 0 && minDates.length > 0 && maxDates.length > 0) {
      const aggregateFrom = new Date(Math.min(...minDates.map((value) => value.getTime())));
      const aggregateTo = new Date(Math.max(...maxDates.map((value) => value.getTime())) + 86_400_000);
      aggregatedRows = await store.rebuildAccountDailyAggregates({
        from: aggregateFrom,
        to: aggregateTo,
        channels: touched
      });
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "aggregate",
      state: "completed",
      details: {
        channels: touched,
        rows_aggregated: aggregatedRows
      },
      metrics: phaseMetrics()
    });

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "reconcile",
      state: "running",
      metrics: phaseMetrics()
    });

    const dbStats = await store.getDbStatsByChannel();
    const snapshots: SocialReconciliationSnapshotInput[] = CHANNELS.map((channel) => {
      const s3 = channelStats[channel];
      const db = dbStats[channel];
      const deltaRows = db.rows - s3.rows;
      return {
        channel,
        s3Rows: s3.rows,
        dbRows: db.rows,
        deltaRows,
        s3MinDate: s3.minDate,
        s3MaxDate: s3.maxDate,
        dbMinDate: db.minDate,
        dbMaxDate: db.maxDate,
        status: deltaRows === 0 ? "ok" : "warning",
        details: {
          delta_pct: s3.rows > 0 ? Number(((deltaRows / s3.rows) * 100).toFixed(2)) : null
        }
      };
    });
    await store.saveReconciliationSnapshots({ runId: run.id, snapshots });

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "reconcile",
      state: "completed",
      details: {
        channels: snapshots.map((item) => ({ channel: item.channel, status: item.status, delta_rows: item.deltaRows }))
      },
      metrics: phaseMetrics()
    });

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "alerts",
      state: "running",
      metrics: phaseMetrics()
    });

    const overview = await store.getOverview({ preset: "90d" });
    const riskTriggered = overview.kpis.riesgoActivo >= overview.settings.riskThreshold;
    const sentimentDropTriggered = overview.deltaVsPrevious.sentimientoNeto <= -overview.settings.sentimentDropThreshold;
    const erDropTriggered = overview.deltaVsPrevious.erGlobal <= -overview.settings.erDropThreshold;

    if (riskTriggered || sentimentDropTriggered || erDropTriggered) {
      if (riskTriggered) alertOutput.reason.push("risk_threshold");
      if (sentimentDropTriggered) alertOutput.reason.push("sentiment_drop_threshold");
      if (erDropTriggered) alertOutput.reason.push("er_drop_threshold");

      const incidentResult = await store.raiseSocialIncident({
        signalVersion: "social-alert-v1",
        riskScore: overview.kpis.riesgoActivo,
        classifiedItems: overview.kpis.classifiedItems,
        severityFloor: sentimentDropTriggered || erDropTriggered ? "SEV3" : undefined,
        cooldownMinutes: overview.settings.alertCooldownMinutes,
        payload: {
          formula_version: "social-alert-v1",
          generated_at: overview.generatedAt.toISOString(),
          metrics: overview.kpis,
          delta_vs_previous: overview.deltaVsPrevious,
          settings: {
            risk_threshold: overview.settings.riskThreshold,
            sentiment_drop_threshold: overview.settings.sentimentDropThreshold,
            er_drop_threshold: overview.settings.erDropThreshold
          },
          reasons: alertOutput.reason
        }
      });

      alertOutput.triggered = true;
      alertOutput.incidentMode = incidentResult.mode;
      alertOutput.incidentId = incidentResult.incidentId;
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "alerts",
      state: "completed",
      details: {
        triggered: alertOutput.triggered,
        reasons: alertOutput.reason
      },
      metrics: phaseMetrics()
    });

    const metrics = {
      ...phaseMetrics(),
      objects_classification_queued: objectsClassifiedQueued,
      rows_aggregated: aggregatedRows,
      reconciliation: snapshots.map((item) => ({
        channel: item.channel,
        status: item.status,
        delta_rows: item.deltaRows
      }))
    };
    await store.completeSyncRun({ runId: run.id, metrics });

    return {
      runId: run.id,
      triggerType: input.triggerType,
      status: "completed",
      bucket,
      prefix,
      objectsDiscovered: objectsDiscovered,
      objectsProcessed,
      objectsSkipped,
      rowsParsed,
      rowsPersisted,
      rowsClassified,
      rowsPendingClassification,
      rowsUnknownSentiment,
      malformedRows,
      anomalousObjectKeys,
      alert: alertOutput
    };
  } catch (error) {
    const message = (error as Error).message || "social_sync_failed";
    const metrics = {
      ...phaseMetrics(),
      rows_aggregated: aggregatedRows
    };
    await store.failSyncRun({ runId: run.id, errorMessage: message, metrics });

    return {
      runId: run.id,
      triggerType: input.triggerType,
      status: "failed",
      bucket,
      prefix,
      objectsDiscovered,
      objectsProcessed,
      objectsSkipped,
      rowsParsed,
      rowsPersisted,
      rowsClassified,
      rowsPendingClassification,
      rowsUnknownSentiment,
      malformedRows,
      anomalousObjectKeys,
      alert: alertOutput,
      errorMessage: message
    };
  }
};
