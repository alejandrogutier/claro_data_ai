import { createHash } from "crypto";
import type { SocialChannel, SocialPostCommentUpsertInput } from "../../data/socialStore";
import { AwarioClient, type AwarioMentionRecord } from "./client";
import { extractAwarioCommentIdsFromUrl, mapAwarioSourceToChannel, normalizeAwarioMedium, normalizeAwarioUrl } from "./parser";
import { canonicalizeUrl } from "../../ingestion/url";

type SocialStoreLike = {
  resolvePostMatchForAwario(input: {
    channel: SocialChannel;
    parentExternalPostId: string;
    normalizedParentUrl?: string | null;
  }): Promise<{ socialPostMetricId: string; postText: string | null } | null>;
  upsertAwarioComment(input: SocialPostCommentUpsertInput): Promise<{ status: "persisted" | "deduped"; id: string }>;
  upsertAwarioMentionFeedItem?(input: {
    bindingId: string;
    termId: string;
    awarioAlertId: string;
    awarioMentionId: string;
    canonicalUrl: string;
    medium?: string | null;
    title: string;
    summary?: string | null;
    content?: string | null;
    publishedAt?: Date | null;
    metadata?: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
  }): Promise<{ status: "persisted" | "deduped"; id: string }>;
};

type SentimentBucket = "positive" | "negative" | "neutral" | "unknown";

export type AwarioBindingSyncRecord = {
  id: string;
  awarioAlertId: string;
  profileId: string | null;
  status: string;
};

export type AwarioSyncMetrics = {
  fetched: number;
  linked: number;
  persisted: number;
  deduped: number;
  feed_persisted: number;
  feed_deduped: number;
  skipped_no_url: number;
  skipped_unlinked: number;
  flagged_spam: number;
  flagged_related: number;
  errors: number;
};

export type AwarioSyncResult = {
  metrics: AwarioSyncMetrics;
};

export type RunAwarioCommentsSyncInput = {
  client: AwarioClient;
  socialStore: SocialStoreLike;
  bindings: AwarioBindingSyncRecord[];
  windowStart?: Date;
  windowEnd?: Date;
  maxPagesPerAlert?: number;
  pageLimit?: number;
  reviewThreshold?: number;
};

export type SyncSingleAwarioBindingInput = {
  client: AwarioClient;
  socialStore: SocialStoreLike;
  binding: AwarioBindingSyncRecord;
  feedTarget?: {
    termId: string;
  };
  windowStart?: Date;
  windowEnd?: Date;
  maxPages?: number;
  pageLimit?: number;
  reviewThreshold?: number;
  startCursor?: string | null;
  throwOnError?: boolean;
};

export type SyncSingleAwarioBindingResult = {
  metrics: AwarioSyncMetrics;
  nextCursor: string | null;
  pagesProcessed: number;
  completed: boolean;
};

const STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "y",
  "o",
  "a",
  "en",
  "por",
  "para",
  "un",
  "una",
  "que",
  "con",
  "es",
  "lo",
  "se",
  "al",
  "como",
  "más",
  "mas"
]);

const POSITIVE_TOKENS = ["gracias", "excelente", "genial", "bueno", "buen", "feliz", "me gusta", "recomiendo", "perfecto"];
const NEGATIVE_TOKENS = ["malo", "pesimo", "pésimo", "horrible", "estafa", "fraude", "queja", "no funciona", "terrible", "odio"];

const SPAM_PATTERNS = [/gratis/i, /gana dinero/i, /forex/i, /btc/i, /http[^\s]+http/i, /click aquí/i, /click aqui/i, /promo/i];

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const asString = (value: unknown): string | null => {
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : null;
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseEpochDate = (value: number): Date | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value >= 1_000_000_000_000 ? value : value >= 1_000_000_000 ? value * 1000 : NaN;
  if (!Number.isFinite(milliseconds)) return null;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    return parseEpochDate(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseEpochDate(Number.parseFloat(trimmed));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ\s]/gi, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOPWORDS.has(item));

const normalizeSentiment = (value: string | null): SentimentBucket => {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  return "unknown";
};

const classifySentimentFallback = (text: string | null): { sentiment: SentimentBucket; confidence: number } => {
  if (!text) {
    return { sentiment: "unknown", confidence: 0.45 };
  }

  const lower = text.toLowerCase();
  const positives = POSITIVE_TOKENS.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);
  const negatives = NEGATIVE_TOKENS.reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);

  if (positives === negatives) {
    if (positives === 0) return { sentiment: "unknown", confidence: 0.5 };
    return { sentiment: "neutral", confidence: 0.6 };
  }

  if (positives > negatives) {
    return { sentiment: "positive", confidence: clamp(0.55 + positives * 0.1, 0, 0.9) };
  }

  return { sentiment: "negative", confidence: clamp(0.55 + negatives * 0.1, 0, 0.9) };
};

const classifySpam = (text: string | null, sourceUrl: string | null): { isSpam: boolean; confidence: number } => {
  const normalizedText = (text ?? "").trim();
  const lower = normalizedText.toLowerCase();

  let score = 0;
  if (!normalizedText) score += 0.45;
  if (normalizedText.length > 0 && normalizedText.length < 5) score += 0.2;

  const urlMatches = lower.match(/https?:\/\//g)?.length ?? 0;
  if (urlMatches >= 2) score += 0.45;
  else if (urlMatches === 1) score += 0.2;

  if (/(.)\1{5,}/.test(lower)) score += 0.2;
  if (/^[@#\W_\d\s]+$/.test(lower) && lower.length > 0) score += 0.2;

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(lower)) score += 0.2;
  }

  if (sourceUrl && sourceUrl.includes("t.co/") && !normalizedText) {
    score += 0.2;
  }

  const confidence = clamp(score, 0.35, 0.99);
  return {
    isSpam: score >= 0.8,
    confidence
  };
};

const classifyRelatedToPostText = (commentText: string | null, postText: string | null): { related: boolean; confidence: number } => {
  if (!commentText || !postText) {
    return { related: false, confidence: 0.5 };
  }

  const commentTokens = tokenize(commentText);
  const postTokens = tokenize(postText);
  if (commentTokens.length === 0 || postTokens.length === 0) {
    return { related: false, confidence: 0.5 };
  }

  const postSet = new Set(postTokens);
  let overlap = 0;
  for (const token of commentTokens) {
    if (postSet.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(1, Math.min(commentTokens.length, postTokens.length));
  if (ratio >= 0.35) return { related: true, confidence: clamp(0.6 + ratio * 0.4, 0, 0.95) };
  if (ratio <= 0.08) return { related: false, confidence: clamp(0.55 + (0.1 - ratio), 0, 0.9) };

  return { related: ratio >= 0.2, confidence: 0.55 };
};

const getAuthorName = (record: AwarioMentionRecord): string | null => {
  const nestedAuthor = record.author;
  if (typeof nestedAuthor === "string") return asString(nestedAuthor);
  if (nestedAuthor && typeof nestedAuthor === "object" && !Array.isArray(nestedAuthor)) {
    const object = nestedAuthor as Record<string, unknown>;
    return asString(object.name) ?? asString(object.username) ?? null;
  }
  return asString(record.author_name) ?? asString(record.username) ?? null;
};

const getAuthorProfileUrl = (record: AwarioMentionRecord): string | null => {
  const nestedAuthor = record.author;
  if (nestedAuthor && typeof nestedAuthor === "object" && !Array.isArray(nestedAuthor)) {
    const object = nestedAuthor as Record<string, unknown>;
    return asString(object.profile_url) ?? asString(object.url) ?? null;
  }
  return asString(record.author_profile_url) ?? asString(record.author_url) ?? null;
};

const getMentionText = (record: AwarioMentionRecord): string | null =>
  asString(record.text) ?? asString(record.content) ?? asString(record.snippet) ?? asString(record.title) ?? null;

const getMentionUrl = (record: AwarioMentionRecord): string | null =>
  asString(record.url) ?? asString(record.link) ?? asString(record.post_url) ?? asString(record.source_url) ?? null;

const getMentionId = (record: AwarioMentionRecord, fallback: string): string =>
  asString(record.id) ?? asString(record.mention_id) ?? asString(record.mentionId) ?? fallback;

const buildDeterministicMentionFallbackId = (
  binding: AwarioBindingSyncRecord,
  mention: AwarioMentionRecord,
  mentionUrl: string | null,
  canonicalUrl: string | null,
  publishedAt: Date | null,
  text: string | null
): string => {
  const seed = [
    asString(mention.source),
    asString(mention.network),
    asString(mention.platform),
    asString(mention.author_name),
    asString(mention.username),
    asString(mention.title),
    asString(mention.snippet)
  ]
    .filter((value): value is string => Boolean(value))
    .join("|");
  const stablePayload = [
    binding.id,
    binding.awarioAlertId,
    canonicalUrl ?? "",
    mentionUrl ?? "",
    publishedAt?.toISOString() ?? "",
    text ?? "",
    seed
  ].join("|");
  const digest = createHash("sha256").update(stablePayload).digest("hex").slice(0, 24);
  return `${binding.awarioAlertId}:fallback:${digest}`;
};

const createEmptyMetrics = (): AwarioSyncMetrics => ({
  fetched: 0,
  linked: 0,
  persisted: 0,
  deduped: 0,
  feed_persisted: 0,
  feed_deduped: 0,
  skipped_no_url: 0,
  skipped_unlinked: 0,
  flagged_spam: 0,
  flagged_related: 0,
  errors: 0
});

const mergeMetrics = (target: AwarioSyncMetrics, source: AwarioSyncMetrics): void => {
  target.fetched += source.fetched;
  target.linked += source.linked;
  target.persisted += source.persisted;
  target.deduped += source.deduped;
  target.feed_persisted += source.feed_persisted;
  target.feed_deduped += source.feed_deduped;
  target.skipped_no_url += source.skipped_no_url;
  target.skipped_unlinked += source.skipped_unlinked;
  target.flagged_spam += source.flagged_spam;
  target.flagged_related += source.flagged_related;
  target.errors += source.errors;
};

export const syncAwarioBindingComments = async (input: SyncSingleAwarioBindingInput): Promise<SyncSingleAwarioBindingResult> => {
  const metrics = createEmptyMetrics();

  const binding = input.binding;
  if (binding.status.toLowerCase() !== "active" || !binding.awarioAlertId.trim()) {
    return {
      metrics,
      nextCursor: null,
      pagesProcessed: 0,
      completed: true
    };
  }

  const now = new Date();
  const windowEnd = input.windowEnd ?? now;
  const windowStart = input.windowStart ?? new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const maxPages = Math.max(1, input.maxPages ?? 50);
  const pageLimit = Math.max(1, Math.min(200, input.pageLimit ?? 100));
  const reviewThreshold = clamp(input.reviewThreshold ?? 0.6, 0.45, 0.9);

  let next: string | null = input.startCursor ?? null;
  let pages = 0;

  try {
    do {
      const page = await input.client.listMentionsPage(binding.awarioAlertId, {
        nextCursor: next,
        since: windowStart,
        until: windowEnd,
        limit: pageLimit
      });

      pages += 1;
      next = page.next;

      for (const mention of page.mentions) {
        metrics.fetched += 1;

        try {
          const source = asString(mention.source) ?? asString(mention.network) ?? asString(mention.platform);
          const channel = mapAwarioSourceToChannel(source) as SocialChannel | "unknown";
          const mentionUrl = getMentionUrl(mention);
          const canonicalUrl = canonicalizeUrl(mentionUrl ?? "");
          const text = getMentionText(mention);
          const publishedAt = asDate(mention.published_at) ?? asDate(mention.date) ?? asDate(mention.created_at);
          const mentionIdFallback = buildDeterministicMentionFallbackId(
            binding,
            mention,
            mentionUrl,
            canonicalUrl,
            publishedAt,
            text
          );
          const awarioMentionId = getMentionId(mention, mentionIdFallback);
          const normalizedMedium = normalizeAwarioMedium(source);

          if (input.feedTarget?.termId && input.socialStore.upsertAwarioMentionFeedItem) {
            if (!canonicalUrl) {
              metrics.skipped_no_url += 1;
            } else {
              const title = asString(mention.title) ?? asString(mention.snippet) ?? text ?? `Awario mention ${awarioMentionId}`;
              const summary = asString(mention.snippet) ?? null;
              const feedPersisted = await input.socialStore.upsertAwarioMentionFeedItem({
                bindingId: binding.id,
                termId: input.feedTarget.termId,
                awarioAlertId: binding.awarioAlertId,
                awarioMentionId,
                canonicalUrl,
                medium: normalizedMedium,
                title: title.slice(0, 500),
                summary,
                content: text,
                publishedAt,
                metadata: {
                  channel,
                  source: source ?? null
                },
                rawPayload: mention
              });
              if (feedPersisted.status === "persisted") metrics.feed_persisted += 1;
              else metrics.feed_deduped += 1;
            }
          }

          if (channel === "unknown") {
            metrics.skipped_unlinked += 1;
            continue;
          }

          const idsFromUrl = extractAwarioCommentIdsFromUrl(mentionUrl);
          const parentExternalPostId =
            idsFromUrl.parentExternalPostId ??
            asString(mention.parent_post_id) ??
            asString(mention.post_id) ??
            asString(mention.story_fbid);

          if (!parentExternalPostId) {
            metrics.skipped_unlinked += 1;
            continue;
          }

          const normalizedParentUrl = idsFromUrl.normalizedParentUrl ?? normalizeAwarioUrl(mentionUrl);

          const postMatch = await input.socialStore.resolvePostMatchForAwario({
            channel,
            parentExternalPostId,
            normalizedParentUrl
          });

          if (!postMatch) {
            metrics.skipped_unlinked += 1;
            continue;
          }

          metrics.linked += 1;

          const awarioSentiment = normalizeSentiment(asString(mention.sentiment));
          const fallbackSentiment = classifySentimentFallback(text);
          const sentiment = awarioSentiment !== "unknown" ? awarioSentiment : fallbackSentiment.sentiment;
          const sentimentSource = awarioSentiment !== "unknown" ? "awario" : "model";
          const sentimentConfidence = awarioSentiment !== "unknown"
            ? clamp(asNumber(mention.sentiment_confidence) ?? asNumber(mention.confidence) ?? 0.8, 0, 1)
            : fallbackSentiment.confidence;

          const spamClassification = classifySpam(text, mentionUrl);
          const relatedClassification = classifyRelatedToPostText(text, postMatch.postText);
          const confidence = clamp(Math.min(sentimentConfidence, spamClassification.confidence, relatedClassification.confidence), 0, 1);
          const needsReview = confidence < reviewThreshold;

          if (spamClassification.isSpam) metrics.flagged_spam += 1;
          if (relatedClassification.related) metrics.flagged_related += 1;

          const scopedMentionId = awarioMentionId || `${binding.awarioAlertId}:${parentExternalPostId}:${idsFromUrl.externalCommentId ?? mentionUrl ?? metrics.fetched}`;

          const persisted = await input.socialStore.upsertAwarioComment({
            socialPostMetricId: postMatch.socialPostMetricId,
            awarioMentionId: scopedMentionId,
            awarioAlertId: binding.awarioAlertId,
            channel,
            parentExternalPostId,
            externalCommentId: idsFromUrl.externalCommentId ?? asString(mention.comment_id),
            externalReplyCommentId: idsFromUrl.externalReplyCommentId ?? asString(mention.reply_comment_id),
            commentUrl: mentionUrl,
            authorName: getAuthorName(mention),
            authorProfileUrl: getAuthorProfileUrl(mention),
            publishedAt,
            text,
            sentiment,
            sentimentSource,
            isSpam: spamClassification.isSpam,
            relatedToPostText: relatedClassification.related,
            needsReview,
            confidence,
            rawPayload: mention
          });

          if (persisted.status === "persisted") metrics.persisted += 1;
          else metrics.deduped += 1;
        } catch {
          metrics.errors += 1;
        }
      }

      if (pages >= maxPages) break;
    } while (next);
  } catch (error) {
    if (input.throwOnError) {
      throw error;
    }
    metrics.errors += 1;
  }

  return {
    metrics,
    nextCursor: next,
    pagesProcessed: pages,
    completed: !next
  };
};

export const runAwarioCommentsSync = async (input: RunAwarioCommentsSyncInput): Promise<AwarioSyncResult> => {
  const metrics = createEmptyMetrics();
  const activeBindings = input.bindings.filter((binding) => binding.status.toLowerCase() === "active" && binding.awarioAlertId.trim());

  for (const binding of activeBindings) {
    const result = await syncAwarioBindingComments({
      client: input.client,
      socialStore: input.socialStore,
      binding,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      maxPages: input.maxPagesPerAlert,
      pageLimit: input.pageLimit,
      reviewThreshold: input.reviewThreshold
    });
    mergeMetrics(metrics, result.metrics);
  }

  return { metrics };
};
