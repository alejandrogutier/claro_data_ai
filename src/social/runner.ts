import { createHash } from "crypto";
import AWS from "aws-sdk";
import { env } from "../config/env";
import {
  createSocialStore,
  type SocialChannel,
  type SocialPhase,
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
const COMMENT_SENTIMENT_PROMPT_VERSION = "social-comment-sentiment-v1";

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
  saves: number;
  avgWatchTimeMs: number;
  totalWatchTimeMs: number;
  diagnostics: Record<string, unknown>;
  hashtags: string[];
};

type ChannelS3Stats = {
  rows: number;
  minDate: Date | null;
  maxDate: Date | null;
  seenIds: Set<string>;
};

const CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok", "x"];

const buildEmptyChannelStats = (): Record<SocialChannel, ChannelS3Stats> => ({
  facebook: { rows: 0, minDate: null, maxDate: null, seenIds: new Set() },
  instagram: { rows: 0, minDate: null, maxDate: null, seenIds: new Set() },
  linkedin: { rows: 0, minDate: null, maxDate: null, seenIds: new Set() },
  tiktok: { rows: 0, minDate: null, maxDate: null, seenIds: new Set() },
  x: { rows: 0, minDate: null, maxDate: null, seenIds: new Set() }
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

  // Handle D/MM/YYYY or DD/MM/YYYY format (e.g. LinkedIn comments)
  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T00:00:00Z`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

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

const parseSemicolonCsv = (content: string): CsvRecord[] => {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = (lines[0] ?? "").split(";").map((item) => item.trim());
  const records: CsvRecord[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(";");
    if (fields.every((item) => !item.trim())) continue;
    const record: CsvRecord = {};
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i] ?? `column_${i}`;
      record[key] = fields[i]?.trim() ?? "";
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
  if (key.includes("/x/")) return "x";
  return null;
};

type DataslayerFileType = "post" | "post_legacy" | "comments" | "page" | "reels" | "storie" | "text";

const detectFileType = (key: string): DataslayerFileType => {
  if (key.includes("/comments/")) return "comments";
  if (key.includes("/page/")) return "page";
  if (key.includes("/reels/")) return "reels";
  if (key.includes("/storie/")) return "storie";
  if (key.includes("/text/")) return "text";
  if (key.includes("/post/")) return "post";
  return "post_legacy";
};

const isPostFile = (fileType: DataslayerFileType): boolean =>
  fileType === "post" || fileType === "post_legacy" || fileType === "reels";

const X_ACCOUNT_NORMALIZATION: Record<string, string> = {
  ClaroColombiaOficial: "Claro Colombia",
  "Clarovideo Colombia": "Claro Video",
  "Claro Musica - AdBid": "Claro Música CO",
  "Claro Música - AdBid": "Claro Música CO",
  "K Music": "Claro Música CO"
};

const extractImageFormula = (value: string | undefined, maxLen = 2048): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const formulaMatch = trimmed.match(/^=IMAGE\("([^"]+)"\)/i);
  if (formulaMatch) {
    const url = (formulaMatch[1] ?? "").trim();
    return url.length > maxLen ? url.slice(0, maxLen) : url || null;
  }
  return trimmed.startsWith("http") ? (trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed) : null;
};

const normalizeRow = (
  channel: SocialChannel,
  row: CsvRecord,
  rowIndex: number,
  objectKey: string,
  fileType: DataslayerFileType,
  tweetTextLookup?: Map<string, string>
): NormalizedSocialRow | null => {
  if (channel === "facebook") {
    if (fileType === "reels") {
      const externalPostId = row["Post ID"]?.trim();
      const accountName = row["Page name"]?.trim();
      if (!externalPostId || !accountName) return null;
      const postUrl = normalizeUrl(row["Link to post"], `social://facebook/${externalPostId}`);
      const reach = toNumber(row["Total reach"]);
      const impressions = toNumber(row["Reels Unique Impressions"]) || toNumber(row["Total impressions"]);
      const views = toNumber(row["Reels play count"]);
      const exposure = reach > 0 ? reach : views;
      const likes = toNumber(row["Reels likes"]);
      const comments = toNumber(row["Reels Comments"]);
      const shares = toNumber(row["Reels Shares"]);
      const engagementTotal = likes + comments + shares;

      const avgWatchTimeMs = toNumber(row["Reels average video time watched"]);
      const totalWatchTimeMs = toNumber(row["Reels total view time"]);

      return {
        channel,
        accountName,
        externalPostId,
        postUrl,
        postType: "reel",
        publishedAt: toDate(row["Date"]),
        text: null,
        imageUrl: normalizeText(row["Post image URL"], 2048),
        exposure,
        engagementTotal,
        impressions,
        reach,
        clicks: 0,
        likes,
        comments,
        shares,
        views,
        saves: 0,
        avgWatchTimeMs,
        totalWatchTimeMs,
        diagnostics: {
          object_key: objectKey,
          row_index: rowIndex + 1,
          file_type: "reels",
          reels_avg_watch_time: avgWatchTimeMs || undefined,
          reels_total_view_time: totalWatchTimeMs || undefined
        },
        hashtags: []
      };
    }

    const externalPostId = row["Post ID"]?.trim();
    const accountName = row["Page name"]?.trim();
    if (!externalPostId || !accountName) return null;

    const isNewFormat = "Total reach" in row || "Today" in row;
    const text = normalizeText(row["Post message"] ?? row["Post description"] ?? row["Post name"]);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Link to post"], `social://facebook/${externalPostId}`);

    const reach = isNewFormat ? toNumber(row["Total reach"]) : toNumber(row["Organic post reach"]);
    const impressions = isNewFormat ? toNumber(row["Total impressions"]) : toNumber(row["Organic impressions"]);
    const exposure = reach > 0 ? reach : impressions;
    const likes = toNumber(row["Post likes"]);
    const comments = toNumber(row["Post comments"]);
    const shares = toNumber(row["Post shares"]);
    const clicks = isNewFormat ? 0 : toNumber(row["Clicks"]) + toNumber(row["Post link clicks"]) + toNumber(row["Post other clicks"]);
    const views = isNewFormat ? 0 : toNumber(row["Organic video views"]) + toNumber(row["Post video plays"]) + toNumber(row["Total video views"]);
    const engagementSourceTotal = isNewFormat ? toNumber(row["Total post reactions"]) : toNumber(row["Post engagements"]);
    const engagementTotal = likes + comments + shares;

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
      saves: 0,
      avgWatchTimeMs: 0,
      totalWatchTimeMs: 0,
      diagnostics: {
        object_key: objectKey,
        row_index: rowIndex + 1,
        engagement_source_total: engagementSourceTotal,
        engagement_source_field: isNewFormat ? "Total post reactions" : "Post engagements",
        format: isNewFormat ? "new" : "legacy"
      },
      hashtags
    };
  }

  if (channel === "instagram") {
    const externalPostId = row["Media ID"]?.trim();
    const accountName = (row["Username"] ?? row["Name"])?.trim();
    if (!externalPostId || !accountName) return null;

    const isNewFormat = "Today" in row || "Media unique saves" in row;
    const text = normalizeText(row["Media caption"]);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Media permalink"] ?? row["Media URL"], `social://instagram/${externalPostId}`);
    const reelReach = toNumber(row["Reel reach"]);
    const reach = reelReach > 0 ? reelReach : toNumber(row["Media reach"]);
    const reelViews = toNumber(row["Reel views"]);
    const views = reelViews > 0 ? reelViews : toNumber(row["Media views"]);
    const exposure = reach > 0 ? reach : views;
    const reelLikes = toNumber(row["Reel likes"]);
    const likes = reelLikes > 0 ? reelLikes : toNumber(row["Media likes"]);
    const reelComments = toNumber(row["Reel comments"]);
    const comments = reelComments > 0 ? reelComments : toNumber(row["Media comments"]);
    const reelShares = toNumber(row["Reel shared times"]);
    const shares = reelShares > 0 ? reelShares : toNumber(row["Media shares"]);
    const clicks = isNewFormat ? 0 : toNumber(row["Media profile visits"]);
    const engagementSourceTotal = toNumber(row["Reel total interactions"]) || toNumber(row["Media total interactions"]);
    const engagementTotal = likes + comments + shares;
    const saves = toNumber(row["Reel saved times"]) || toNumber(row["Media unique saves"]);
    const avgWatchTimeMs = toNumber(row["Reel average watch time"]);
    const totalWatchTimeMs = toNumber(row["Reel total video view time"]);

    return {
      channel,
      accountName,
      externalPostId,
      postUrl,
      postType: normalizeText(row["Media type"], 120),
      publishedAt: toDate(row["Date"]),
      text,
      imageUrl: extractImageFormula(row["Media Image"]) ?? normalizeText(row["Media URL"], 2048),
      exposure,
      engagementTotal,
      impressions: 0,
      reach,
      clicks,
      likes,
      comments,
      shares,
      views,
      saves,
      avgWatchTimeMs,
      totalWatchTimeMs,
      diagnostics: {
        object_key: objectKey,
        row_index: rowIndex + 1,
        engagement_source_total: engagementSourceTotal,
        engagement_source_field: engagementSourceTotal === toNumber(row["Reel total interactions"]) ? "Reel total interactions" : "Media total interactions",
        format: isNewFormat ? "new" : "legacy",
        reel_avg_watch_time: avgWatchTimeMs || undefined,
        reel_total_watch_time: totalWatchTimeMs || undefined
      },
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
    const engagementSourceTotal = toNumber(row["Total engagements"]);
    const engagementTotal = likes + comments + shares;

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
      saves: 0,
      avgWatchTimeMs: 0,
      totalWatchTimeMs: 0,
      diagnostics: {
        object_key: objectKey,
        row_index: rowIndex + 1,
        engagement_source_total: engagementSourceTotal,
        engagement_source_field: "Total engagements"
      },
      hashtags
    };
  }

  if (channel === "x") {
    const externalPostId = row["Tweet ID"]?.trim();
    const rawAccountName = row["Account name"]?.trim() ?? row["Profile name"]?.trim();
    if (!externalPostId || !rawAccountName) return null;
    const accountName = X_ACCOUNT_NORMALIZATION[rawAccountName] ?? rawAccountName;
    const tweetText = tweetTextLookup?.get(externalPostId) ?? null;
    const text = normalizeText(row["Tweet text"] ?? tweetText);
    const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
    const postUrl = normalizeUrl(row["Tweet URL"], `https://x.com/${rawAccountName}/status/${externalPostId}`);
    const impressions = toNumber(row["Impressions"]);
    const likes = toNumber(row["Likes"]) || toNumber(row["Total likes"]);
    const comments = toNumber(row["Replies"]);
    const shares = toNumber(row["Retweets"]) || toNumber(row["Total retweets"]);
    const clicks = toNumber(row["Clicks"]) + toNumber(row["URL clicks"]);
    const views = toNumber(row["Video total views"]);
    const engagementSourceTotal = toNumber(row["Engagements"]);
    const engagementTotal = likes + comments + shares;

    return {
      channel,
      accountName,
      externalPostId,
      postUrl,
      postType: "tweet",
      publishedAt: toDate(row["Tweet creation date"] ?? row["Date"]),
      text,
      imageUrl: null,
      exposure: impressions,
      engagementTotal,
      impressions,
      reach: 0,
      clicks,
      likes,
      comments,
      shares,
      views,
      saves: 0,
      avgWatchTimeMs: 0,
      totalWatchTimeMs: 0,
      diagnostics: {
        object_key: objectKey,
        row_index: rowIndex + 1,
        engagement_source_total: engagementSourceTotal,
        engagement_source_field: "Engagements",
        format: fileType === "post" ? "new" : "legacy"
      },
      hashtags
    };
  }

  // tiktok (default)
  const externalPostId = row["Video ID"]?.trim();
  const accountName = row["Account nickname"]?.trim();
  if (!externalPostId || !accountName) return null;
  const isNewFormat = "Date today" in row && !("Title" in row);
  const text = normalizeText(row["Title"]);
  const hashtags = mergeHashtags(extractHashtags(text), extractHashtagsFromColumns(row));
  const postUrl = normalizeUrl(row["Share URL"], `social://tiktok/${externalPostId}`);
  const views = toNumber(row["Video Views"]);
  const likes = toNumber(row["Likes"]);
  const comments = toNumber(row["Comments"]);
  const shares = toNumber(row["Shares"]);
  const engagementSourceTotal = toNumber(row["Total Engagement"]);
  const engagementTotal = likes + comments + shares;

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
    saves: 0,
    avgWatchTimeMs: 0,
    totalWatchTimeMs: 0,
    diagnostics: {
      object_key: objectKey,
      row_index: rowIndex + 1,
      engagement_source_total: engagementSourceTotal,
      engagement_source_field: "Total Engagement",
      format: isNewFormat ? "new" : "legacy"
    },
    hashtags
  };
};

const updateChannelStats = (stats: Record<SocialChannel, ChannelS3Stats>, row: NormalizedSocialRow): void => {
  const channel = stats[row.channel];
  // Deduplicate by externalPostId to align with DB ON CONFLICT dedup
  if (channel.seenIds.has(row.externalPostId)) return;
  channel.seenIds.add(row.externalPostId);
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

  // Reap zombie runs stuck in "running" state for more than 30 minutes
  await store.reapZombieRuns(30);

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
  let objectsTopicsQueued = 0;

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
    const queueSocialTopics = Boolean(env.socialTopicQueueUrl);
    const classificationContentIds = new Set<string>();
    const topicClassificationContentIds = new Set<string>();
    const channelStats = buildEmptyChannelStats();
    const touchedChannels = new Set<SocialChannel>();

    // Pre-load X tweet text lookup from text/ file
    const tweetTextLookup = new Map<string, string>();
    const textObjects = objects.filter((o) => o.key.includes("/x/") && detectFileType(o.key) === "text" && o.size > 0);
    for (const textObj of textObjects) {
      const textBody = await fetchObjectBody(bucket, textObj.key);
      const textRows = parseCsv(textBody);
      for (const tr of textRows) {
        const tweetId = tr["Tweet ID"]?.trim();
        const tweetText = tr["Tweet text"]?.trim();
        if (tweetId && tweetText) tweetTextLookup.set(tweetId, tweetText);
      }
    }

    for (const object of objects) {
      if (object.key !== object.key.trim()) {
        anomalousObjectKeys += 1;
      }

      const channel = detectChannelFromKey(object.key);
      if (!channel || object.size <= 0) {
        objectsSkipped += 1;
        continue;
      }

      const fileType = detectFileType(object.key);

      // Only process post files in the ingest phase; comments/page/storie/text handled separately
      if (!isPostFile(fileType)) {
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
        const normalized = normalizeRow(channel, row, idx, object.key, fileType, tweetTextLookup);
        if (!normalized) {
          malformedRows += 1;
          continue;
        }

        updateChannelStats(channelStats, normalized);

        if (alreadyProcessed) {
          continue;
        }

        const persisted = await store.upsertSocialPostFast({
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
          saves: normalized.saves,
          avgWatchTimeMs: normalized.avgWatchTimeMs,
          totalWatchTimeMs: normalized.totalWatchTimeMs,
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

        if (queueSocialTopics) {
          topicClassificationContentIds.add(persisted.contentItemId);
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

    // --- Ingest Dataslayer comments ---
    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_comments",
      state: "running",
      metrics: phaseMetrics()
    });

    let commentsIngested = 0;
    let commentsDeduped = 0;
    let commentsOrphaned = 0;
    const orphanSamples = new Map<string, Set<string>>();

    const commentObjects = objects.filter((o) => detectFileType(o.key) === "comments" && o.size > 0);

    // Pre-load post metric IDs per channel to avoid per-comment lookups
    const postMetricCaches = new Map<SocialChannel, Map<string, { socialPostMetricId: string; contentItemId: string }>>();

    for (const commentObj of commentObjects) {
      const commentChannel = detectChannelFromKey(commentObj.key);
      if (!commentChannel) continue;

      const alreadyProcessedComment =
        !input.force &&
        (await store.isObjectProcessed({
          bucket,
          objectKey: commentObj.key,
          eTag: commentObj.eTag,
          lastModified: commentObj.lastModified
        }));
      if (alreadyProcessedComment) continue;

      // Load post metrics cache for this channel (once per channel)
      if (!postMetricCaches.has(commentChannel)) {
        postMetricCaches.set(commentChannel, await store.batchLoadPostMetricsByChannel(commentChannel));
      }
      const postMetricMap = postMetricCaches.get(commentChannel)!;

      const commentBody = await fetchObjectBody(bucket, commentObj.key);

      // LinkedIn comments: semicolon-delimited, Latin-1 (already re-encoded to UTF-8 by S3)
      const isLkSemicolon = commentChannel === "linkedin" && commentBody.includes(";Cuenta;");
      const commentRows = isLkSemicolon ? parseSemicolonCsv(commentBody) : parseCsv(commentBody);

      // Parse and collect all valid comments for batch insert
      const commentBatch: Array<{
        socialPostMetricId: string;
        channel: string;
        parentExternalPostId: string;
        dataslayerHash: string;
        authorName: string | null;
        publishedAt: Date | null;
        text: string;
        contentItemId: string;
      }> = [];

      for (const crow of commentRows) {
        let parentPostId: string | null = null;
        let commentText: string | null = null;
        let commentDate: Date | null = null;
        const authorName: string | null = null;

        if (commentChannel === "facebook") {
          parentPostId = crow["Post ID"]?.trim() ?? null;
          commentText = normalizeText(crow["Post comment text"]);
          commentDate = toDate(crow["Date"]);
        } else if (commentChannel === "instagram") {
          parentPostId = crow["Media ID"]?.trim() ?? null;
          commentText = normalizeText(crow["Comment Text"]);
          commentDate = toDate(crow["Date"]);
        } else if (commentChannel === "linkedin") {
          parentPostId = crow["Post ID"]?.trim() ?? null;
          commentText = normalizeText(crow["Cometarios"] ?? crow["Comentarios"]);
          commentDate = toDate(crow["Date"]);
        }

        if (!parentPostId || !commentText) continue;

        const postMetric = postMetricMap.get(parentPostId);
        if (!postMetric) {
          commentsOrphaned += 1;
          if (!orphanSamples.has(commentChannel)) orphanSamples.set(commentChannel, new Set());
          const channelSamples = orphanSamples.get(commentChannel)!;
          if (channelSamples.size < 20) channelSamples.add(parentPostId);
          continue;
        }

        const hashInput = `${commentChannel}:${parentPostId}:${commentText}:${commentDate?.toISOString() ?? ""}`;
        const dataslayerHash = createHash("sha256").update(hashInput).digest("hex");

        commentBatch.push({
          socialPostMetricId: postMetric.socialPostMetricId,
          channel: commentChannel,
          parentExternalPostId: parentPostId,
          dataslayerHash,
          authorName,
          publishedAt: commentDate,
          text: commentText,
          contentItemId: postMetric.contentItemId
        });
      }

      // Batch insert all comments for this file
      if (commentBatch.length > 0) {
        const result = await store.batchInsertDataslayerComments(commentBatch);
        commentsIngested += result.inserted;
        commentsDeduped += result.deduped;

        if (queueClassification && env.classificationQueueUrl) {
          for (const c of commentBatch) {
            classificationContentIds.add(c.contentItemId);
          }
        }
      }

      await store.markObjectProcessed({
        runId: run.id,
        bucket,
        objectKey: commentObj.key,
        eTag: commentObj.eTag,
        lastModified: commentObj.lastModified
      });
    }

    if (orphanSamples.size > 0) {
      const samples: Record<string, string[]> = {};
      for (const [ch, ids] of orphanSamples) samples[ch] = [...ids];
      console.log(JSON.stringify({
        level: "warn",
        message: "orphan_comment_samples",
        total_orphaned: commentsOrphaned,
        samples
      }));
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_comments",
      state: "completed",
      details: {
        comments_ingested: commentsIngested,
        comments_deduped: commentsDeduped,
        comments_orphaned: commentsOrphaned
      },
      metrics: phaseMetrics()
    });

    // --- Ingest page-level metrics ---
    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_pages",
      state: "running",
      metrics: phaseMetrics()
    });

    let pageMetricsIngested = 0;
    const pageObjects = objects.filter((o) => detectFileType(o.key) === "page" && o.size > 0);
    for (const pageObj of pageObjects) {
      const pageChannel = detectChannelFromKey(pageObj.key);
      if (!pageChannel) continue;

      const alreadyProcessedPage =
        !input.force &&
        (await store.isObjectProcessed({
          bucket,
          objectKey: pageObj.key,
          eTag: pageObj.eTag,
          lastModified: pageObj.lastModified
        }));
      if (alreadyProcessedPage) continue;

      const pageBody = await fetchObjectBody(bucket, pageObj.key);
      const pageRows = parseCsv(pageBody);

      // Collect all page metrics for batch insert
      const pageBatch: Array<{
        date: Date;
        channel: SocialChannel;
        accountName: string;
        followers: number;
        newFollowers: number;
        unfollows: number;
        pageReach: number;
        pageViews: number;
        postReach: number | null;
        profileVisits: number | null;
        desktopViews: number | null;
        mobileViews: number | null;
        engagements: number | null;
        engagementRate: number | null;
        profileLikes: number | null;
        videoCount: number | null;
      }> = [];

      for (const prow of pageRows) {
        const dateStr = (prow["Date"] ?? prow["Date today"] ?? prow["End date"])?.trim();
        const date = toDate(dateStr);
        if (!date) continue;

        let accountName: string | null = null;
        let followers = 0;
        let newFollowers = 0;
        let unfollows = 0;
        let pageReach = 0;
        let pageViews = 0;
        let postReach: number | null = null;
        let profileVisits: number | null = null;
        let desktopViews: number | null = null;
        let mobileViews: number | null = null;
        let engagementsVal: number | null = null;
        let engagementRate: number | null = null;
        let profileLikes: number | null = null;
        let videoCount: number | null = null;

        if (pageChannel === "facebook") {
          accountName = prow["Page name"]?.trim() ?? null;
          followers = toNumber(prow["Page followers"]);
          newFollowers = toNumber(prow["New followers"]);
          unfollows = toNumber(prow["New unfollows"]);
          pageReach = toNumber(prow["Total reach"]);
          postReach = toNumber(prow["Total reach of Page's posts"]) || null;
          profileVisits = toNumber(prow["People visiting your page"]) || null;
        } else if (pageChannel === "instagram") {
          accountName = prow["Name"]?.trim() ?? null;
          followers = toNumber(prow["Current Followers"]);
          newFollowers = toNumber(prow["New Followers"]);
          pageReach = toNumber(prow["Profile Reach"]);
        } else if (pageChannel === "linkedin") {
          accountName = "Claro Colombia";
          followers = toNumber(prow["Followers"]);
          newFollowers = toNumber(prow["New followers"]);
          pageViews = toNumber(prow["Page views"]);
          desktopViews = toNumber(prow["Desktop page views"]) || null;
          mobileViews = toNumber(prow["Mobile page views"]) || null;
          engagementsVal = toNumber(prow["Engagements"]) || null;
          const erRaw = prow["Engagement rate"]?.trim();
          engagementRate = erRaw ? parseFloat(erRaw.replace(",", ".").replace("%", "")) : null;
        } else if (pageChannel === "tiktok") {
          accountName = prow["Account nickname"]?.trim() ?? null;
          followers = toNumber(prow["Followers"]);
          profileLikes = toNumber(prow["Profile Like count"]) || null;
          videoCount = toNumber(prow["Video count"]) || null;
        } else if (pageChannel === "x") {
          let rawName = prow["Account name"]?.trim() ?? null;
          if (rawName) rawName = X_ACCOUNT_NORMALIZATION[rawName] ?? rawName;
          accountName = rawName;
          followers = toNumber(prow["Followers"]);
        }

        if (!accountName) continue;

        pageBatch.push({
          date,
          channel: pageChannel,
          accountName,
          followers,
          newFollowers,
          unfollows,
          pageReach,
          pageViews,
          postReach,
          profileVisits,
          desktopViews,
          mobileViews,
          engagements: engagementsVal,
          engagementRate,
          profileLikes,
          videoCount
        });
      }

      // Batch upsert all page metrics for this file
      if (pageBatch.length > 0) {
        pageMetricsIngested += await store.batchUpsertPageDailyMetrics(pageBatch);
      }

      await store.markObjectProcessed({
        runId: run.id,
        bucket,
        objectKey: pageObj.key,
        eTag: pageObj.eTag,
        lastModified: pageObj.lastModified
      });
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_pages",
      state: "completed",
      details: {
        page_metrics_ingested: pageMetricsIngested
      },
      metrics: phaseMetrics()
    });

    // --- Ingest story-level metrics ---
    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_stories",
      state: "running",
      metrics: phaseMetrics()
    });

    let storyMetricsIngested = 0;
    const storyObjects = objects.filter((o) => detectFileType(o.key) === "storie" && o.size > 0);
    for (const storyObj of storyObjects) {
      const storyChannel = detectChannelFromKey(storyObj.key);
      if (!storyChannel) continue;

      const alreadyProcessedStory =
        !input.force &&
        (await store.isObjectProcessed({
          bucket,
          objectKey: storyObj.key,
          eTag: storyObj.eTag,
          lastModified: storyObj.lastModified
        }));
      if (alreadyProcessedStory) continue;

      const storyBody = await fetchObjectBody(bucket, storyObj.key);
      const storyRows = parseCsv(storyBody);

      const storyBatch: Array<{
        date: Date;
        channel: SocialChannel;
        accountName: string;
        storyViews: number;
        storyReach: number;
        storyFollows: number;
        storyShares: number;
        storyReplies: number;
        storyTotalActions: number;
        storyCompletionRate: number | null;
      }> = [];

      for (const srow of storyRows) {
        const dateStr = (srow["Date"] ?? srow["Date today"])?.trim();
        const date = toDate(dateStr);
        if (!date) continue;
        const accountName = (srow["Name"] ?? srow["Username"])?.trim();
        if (!accountName) continue;

        const completionRateRaw = srow["Story Average Completion rate"]?.trim();
        const completionRate = completionRateRaw
          ? parseFloat(completionRateRaw.replace(",", ".").replace("%", ""))
          : null;

        storyBatch.push({
          date,
          channel: storyChannel,
          accountName,
          storyViews: toNumber(srow["Story views"]),
          storyReach: toNumber(srow["Story reach"]),
          storyFollows: toNumber(srow["Story follows"]),
          storyShares: toNumber(srow["Story shares"]),
          storyReplies: toNumber(srow["Story replies"]),
          storyTotalActions: toNumber(srow["Story total actions"]),
          storyCompletionRate: completionRate != null && !Number.isNaN(completionRate) ? completionRate : null
        });
      }

      if (storyBatch.length > 0) {
        storyMetricsIngested += await store.batchUpsertStoryDailyMetrics(storyBatch);
      }

      await store.markObjectProcessed({
        runId: run.id,
        bucket,
        objectKey: storyObj.key,
        eTag: storyObj.eTag,
        lastModified: storyObj.lastModified
      });
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "ingest_stories",
      state: "completed",
      details: {
        story_metrics_ingested: storyMetricsIngested
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

    if (queueSocialTopics && env.socialTopicQueueUrl) {
      const requestedAt = new Date().toISOString();
      for (const contentItemId of topicClassificationContentIds) {
        await sqs
          .sendMessage({
            QueueUrl: env.socialTopicQueueUrl,
            MessageBody: JSON.stringify({
              content_item_id: contentItemId,
              taxonomy_version: env.socialTopicTaxonomyVersion,
              prompt_version: env.socialTopicPromptVersion,
              model_id: env.bedrockModelId,
              trigger_type: input.triggerType,
              request_id: input.requestId ?? null,
              run_id: run.id,
              requested_at: requestedAt
            })
          })
          .promise();
      }
      objectsTopicsQueued = topicClassificationContentIds.size;
    }

    // Queue unclassified comments for sentiment + relatedToPostText analysis
    let commentsClassificationQueued = 0;
    if (queueClassification && env.classificationQueueUrl) {
      const unclassifiedCommentIds = await store.listUnclassifiedCommentIds(5000);
      if (unclassifiedCommentIds.length > 0) {
        const requestedAt = new Date().toISOString();
        for (const commentId of unclassifiedCommentIds) {
          await sqs
            .sendMessage({
              QueueUrl: env.classificationQueueUrl,
              MessageBody: JSON.stringify({
                comment_id: commentId,
                prompt_version: COMMENT_SENTIMENT_PROMPT_VERSION,
                model_id: env.bedrockModelId,
                trigger_type: input.triggerType,
                request_id: input.requestId ?? null,
                requested_at: requestedAt
              })
            })
            .promise();
        }
        commentsClassificationQueued = unclassifiedCommentIds.length;
      }
    }

    await store.updateSyncRunPhase({
      runId: run.id,
      phase: "classify",
      state: "completed",
      details: {
        mode: queueClassification ? "queued_async" : "inline_sync",
        rows_classified: rowsClassified,
        rows_pending_classification: rowsPendingClassification,
        rows_pending_topics: objectsTopicsQueued,
        comments_classification_queued: commentsClassificationQueued
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
      objects_topics_queued: objectsTopicsQueued,
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
