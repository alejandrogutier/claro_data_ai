import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import * as XLSX from "xlsx";
import { env } from "../../config/env";
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
import { AppStoreError, createAppStore } from "../../data/appStore";
import {
  createSocialStore,
  type SocialAccountsFilters,
  type SocialAccountsSortMode,
  type SocialChannel,
  type SocialComparisonMode,
  type SocialDatePreset,
  type SocialErBreakdownDimension,
  type SocialHeatmapMetric,
  type SocialScatterDimension,
  type SocialTrendByDimensionMetric,
  type SocialTrendGranularity,
  type SortMode
} from "../../data/socialStore";
import { runSocialSync } from "../../social/runner";

type PatchSettingsBody = {
  focus_account?: unknown;
  target_quarterly_sov_pp?: unknown;
  target_shs?: unknown;
  risk_threshold?: unknown;
  sentiment_drop_threshold?: unknown;
  er_drop_threshold?: unknown;
  alert_cooldown_minutes?: unknown;
  metadata?: unknown;
};

type TriggerRunBody = {
  force?: unknown;
  bucket?: unknown;
  prefix?: unknown;
};

type PatchErTargetsBody = {
  year?: unknown;
  targets?: unknown;
};

type PatchSocialCommentBody = {
  is_spam?: unknown;
  related_to_post_text?: unknown;
  sentiment?: unknown;
  reason?: unknown;
};

const lambda = new AWS.Lambda({ region: env.awsRegion });

const CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];
const SORTS: SortMode[] = ["published_at_desc", "exposure_desc", "engagement_desc"];
const ACCOUNT_SORTS: SocialAccountsSortMode[] = ["er_desc", "exposure_desc", "engagement_desc", "posts_desc", "riesgo_desc", "sov_desc", "account_asc"];
const PRESETS: SocialDatePreset[] = ["all", "y2024", "y2025", "ytd", "90d", "30d", "7d", "last_quarter", "custom"];
const TREND_GRANULARITIES: SocialTrendGranularity[] = ["auto", "day", "week", "month"];
const COMPARISON_MODES: SocialComparisonMode[] = ["weekday_aligned_week", "exact_days", "same_period_last_year"];
const HEATMAP_METRICS: SocialHeatmapMetric[] = [
  "er",
  "engagement_total",
  "likes",
  "comments",
  "shares",
  "views",
  "view_rate",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "er_impressions",
  "er_reach"
];
const SCATTER_DIMENSIONS: SocialScatterDimension[] = ["post_type", "channel", "account", "campaign", "strategy", "hashtag"];
const ER_BREAKDOWN_DIMENSIONS: SocialErBreakdownDimension[] = ["hashtag", "word", "post_type", "publish_frequency", "weekday"];
const TREND_BY_DIMENSION_METRICS: SocialTrendByDimensionMetric[] = [
  "posts",
  "exposure_total",
  "engagement_total",
  "impressions_total",
  "reach_total",
  "clicks_total",
  "likes_total",
  "comments_total",
  "shares_total",
  "views_total",
  "er_global",
  "ctr",
  "er_impressions",
  "er_reach",
  "view_rate",
  "likes_share",
  "comments_share",
  "shares_share",
  "riesgo_activo",
  "shs"
];

const parseLimit = (value: string | undefined, fallback: number, max: number): number | null => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > max) return null;
  return parsed;
};

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseWindowDays = (value: string | undefined): 7 | 30 | 90 | null | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (parsed === 7 || parsed === 30 || parsed === 90) return parsed;
  return null;
};

const parsePreset = (value: string | undefined): SocialDatePreset | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (PRESETS.includes(normalized as SocialDatePreset)) return normalized as SocialDatePreset;
  return null;
};

const parseChannels = (value: string | undefined): SocialChannel[] | null | undefined => {
  if (value === undefined) return undefined;
  if (!value.trim()) return undefined;
  const parts = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  if (parts.length === 0) return undefined;
  const unique = Array.from(new Set(parts));
  if (!unique.every((item) => CHANNELS.includes(item as SocialChannel))) return null;
  return unique as SocialChannel[];
};

const parseSort = (value: string | undefined): SortMode | null => {
  if (!value) return "published_at_desc";
  if (SORTS.includes(value as SortMode)) return value as SortMode;
  return null;
};

const parseAccountsSort = (value: string | undefined): SocialAccountsSortMode | null => {
  if (!value) return "er_desc";
  const normalized = value.trim().toLowerCase() as SocialAccountsSortMode;
  return ACCOUNT_SORTS.includes(normalized) ? normalized : null;
};

const parseSentiment = (value: string | undefined): "positive" | "negative" | "neutral" | "unknown" | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  if (normalized === "unknown" || normalized === "desconocido") return "unknown";
  return null;
};

const parseTrendGranularity = (value: string | undefined): SocialTrendGranularity | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TREND_GRANULARITIES.includes(normalized as SocialTrendGranularity)) return normalized as SocialTrendGranularity;
  return null;
};

const parseComparisonMode = (value: string | undefined): SocialComparisonMode | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase() as SocialComparisonMode;
  if (!normalized) return undefined;
  if (COMPARISON_MODES.includes(normalized)) return normalized;
  return null;
};

const parseHeatmapMetric = (value: string | undefined): SocialHeatmapMetric | null => {
  if (!value) return "er";
  const normalized = value.trim().toLowerCase() as SocialHeatmapMetric;
  return HEATMAP_METRICS.includes(normalized) ? normalized : null;
};

const parseScatterDimension = (value: string | undefined): SocialScatterDimension | null => {
  if (!value) return "channel";
  const normalized = value.trim().toLowerCase() as SocialScatterDimension;
  return SCATTER_DIMENSIONS.includes(normalized) ? normalized : null;
};

const parseErBreakdownDimension = (value: string | undefined): SocialErBreakdownDimension | null => {
  if (!value) return "post_type";
  const normalized = value.trim().toLowerCase() as SocialErBreakdownDimension;
  return ER_BREAKDOWN_DIMENSIONS.includes(normalized) ? normalized : null;
};

const parseTrendByDimensionMetric = (value: string | undefined): SocialTrendByDimensionMetric | null => {
  if (!value) return "exposure_total";
  const normalized = value.trim().toLowerCase() as SocialTrendByDimensionMetric;
  return TREND_BY_DIMENSION_METRICS.includes(normalized) ? normalized : null;
};

const parseCsvValues = (value: string | undefined, maxItems = 100): string[] => {
  if (!value) return [];
  const parsed = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const deduped = Array.from(new Set(parsed));
  return deduped.slice(0, maxItems);
};

const parseOriginFilters = (query: Record<string, string | undefined>): { filters: OriginFilterInput; error?: ReturnType<typeof json> } => {
  const originRaw = query.origin?.trim().toLowerCase();
  let origin: OriginType | undefined;

  if (originRaw) {
    if (!isValidOrigin(originRaw)) {
      return { filters: {}, error: json(422, { error: "validation_error", message: "origin must be one of news|awario" }) };
    }
    origin = originRaw;
  }

  const medium = query.medium?.trim() ? query.medium.trim() : undefined;
  const tags = parseTagFilterValues(query.tag, query.tags);

  return {
    filters: {
      origin,
      medium,
      tags
    }
  };
};

const normalizePostTypeToken = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized === "unknown" ||
    normalized === "sin tipo" ||
    normalized === "sin_tipo" ||
    normalized === "none" ||
    normalized === "null" ||
    normalized === "(blank)"
  ) {
    return "unknown";
  }
  return normalized;
};

const parseOptionalString = (value: unknown, max = 200): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
};

const parseOptionalInt = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.floor(value);
};

const parseMetadata = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

const getIdFromPath = (event: APIGatewayProxyEventV2, pattern: RegExp): string | null => {
  const match = getPathWithoutStage(event).match(pattern);
  return match?.[1] ?? null;
};

const toCount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const buildRunCounters = (metrics: Record<string, unknown>) => ({
  objects_discovered: toCount(metrics.objects_discovered),
  objects_processed: toCount(metrics.objects_processed),
  objects_skipped: toCount(metrics.objects_skipped),
  rows_parsed: toCount(metrics.rows_parsed),
  rows_persisted: toCount(metrics.rows_persisted),
  rows_classified: toCount(metrics.rows_classified),
  rows_pending_classification: toCount(metrics.rows_pending_classification),
  rows_unknown_sentiment: toCount(metrics.rows_unknown_sentiment),
  malformed_rows: toCount(metrics.malformed_rows),
  anomalous_object_keys: toCount(metrics.anomalous_object_keys)
});

const ensureFeatureEnabled = () => {
  if (!env.socialAnalyticsV2Enabled) {
    return json(404, {
      error: "feature_disabled",
      message: "social_analytics_v2 is disabled"
    });
  }
  return null;
};

const mapStoreError = (error: unknown) => {
  if (error instanceof AppStoreError) {
    if (error.code === "validation") {
      return json(422, { error: "validation_error", message: error.message });
    }
    if (error.code === "not_found") {
      return json(404, { error: "not_found", message: error.message });
    }
    if (error.code === "conflict") {
      return json(409, { error: "conflict", message: error.message });
    }
  }

  return json(500, {
    error: "internal_error",
    message: (error as Error).message
  });
};

const parseCommonFilters = (event: APIGatewayProxyEventV2) => {
  const query = event.queryStringParameters ?? {};
  const preset = parsePreset(query.preset);
  if (preset === null) {
    return { error: json(422, { error: "validation_error", message: "preset must be all|y2024|y2025|ytd|90d|30d|7d|last_quarter|custom" }) };
  }

  const windowDays = parseWindowDays(query.window_days);
  if (windowDays === null) {
    return { error: json(422, { error: "validation_error", message: "window_days must be one of 7|30|90" }) };
  }

  const from = parseDate(query.from);
  if (query.from && !from) {
    return { error: json(422, { error: "validation_error", message: "from must be a valid ISO datetime" }) };
  }

  const to = parseDate(query.to);
  if (query.to && !to) {
    return { error: json(422, { error: "validation_error", message: "to must be a valid ISO datetime" }) };
  }

  if (from && to && from.getTime() >= to.getTime()) {
    return { error: json(422, { error: "validation_error", message: "from must be before to" }) };
  }

  const channels = parseChannels(query.channel);
  if (channels === null) {
    return { error: json(422, { error: "validation_error", message: "channel must be facebook|instagram|linkedin|tiktok (csv allowed)" }) };
  }

  const sentiment = parseSentiment(query.sentiment);
  if (sentiment === null) {
    return { error: json(422, { error: "validation_error", message: "sentiment must be positive|negative|neutral|unknown" }) };
  }

  const trendGranularity = parseTrendGranularity(query.trend_granularity);
  if (trendGranularity === null) {
    return { error: json(422, { error: "validation_error", message: "trend_granularity must be auto|day|week|month" }) };
  }

  const comparisonMode = parseComparisonMode(query.comparison_mode);
  if (comparisonMode === null) {
    return {
      error: json(422, {
        error: "validation_error",
        message: "comparison_mode must be weekday_aligned_week|exact_days|same_period_last_year"
      })
    };
  }

  const comparisonDays = query.comparison_days === undefined ? undefined : parseLimit(query.comparison_days, 30, 366);
  if (query.comparison_days !== undefined && comparisonDays === null) {
    return { error: json(422, { error: "validation_error", message: "comparison_days must be an integer between 1 and 366" }) };
  }
  if ((comparisonMode ?? "same_period_last_year") === "exact_days" && (comparisonDays === undefined || comparisonDays === null)) {
    return { error: json(422, { error: "validation_error", message: "comparison_days is required when comparison_mode=exact_days" }) };
  }

  const accounts = parseCsvValues(query.account, 200);
  const postTypes = parseCsvValues(query.post_type, 50).map(normalizePostTypeToken).filter((value) => value.length > 0);
  const campaigns = parseCsvValues(query.campaign, 100).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const strategies = parseCsvValues(query.strategy, 100).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const hashtags = parseCsvValues(query.hashtag, 200).map((value) => value.trim().toLowerCase().replace(/^#+/, "")).filter(Boolean);

  return {
    filters: {
      preset,
      windowDays: windowDays ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      channel: channels?.[0] ?? undefined,
      channels: channels && channels.length > 0 ? channels : undefined,
      account: accounts.length === 1 ? accounts[0] : undefined,
      accounts: accounts.length > 0 ? accounts : undefined,
      postTypes: postTypes.length > 0 ? postTypes : undefined,
      campaigns: campaigns.length > 0 ? campaigns : undefined,
      strategies: strategies.length > 0 ? strategies : undefined,
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      sentiment: sentiment ?? undefined,
      trendGranularity: trendGranularity ?? undefined,
      comparisonMode: comparisonMode ?? "same_period_last_year",
      comparisonDays: comparisonDays ?? undefined
    },
    query
  };
};

export const getMonitorSocialOverview = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  try {
    const overview = await store.getOverview(parsed.filters);

    return json(200, {
      generated_at: overview.generatedAt.toISOString(),
      last_etl_at: overview.lastEtlAt?.toISOString() ?? null,
      official: overview.official,
      preset: overview.preset,
      window_days: overview.windowDays,
      window_start: overview.windowStart,
      window_end: overview.windowEnd,
      comparison: {
        mode_applied: overview.comparison.modeApplied,
        current_window_start: overview.comparison.currentWindowStart,
        current_window_end: overview.comparison.currentWindowEnd,
        previous_window_start: overview.comparison.previousWindowStart,
        previous_window_end: overview.comparison.previousWindowEnd,
        label: overview.comparison.label
      },
      trend_granularity_applied: overview.trendGranularityApplied,
      kpis: {
        posts: overview.kpis.posts,
        exposure_total: overview.kpis.exposureTotal,
        engagement_total: overview.kpis.engagementTotal,
        impressions_total: overview.kpis.impressionsTotal,
        reach_total: overview.kpis.reachTotal,
        clicks_total: overview.kpis.clicksTotal,
        likes_total: overview.kpis.likesTotal,
        comments_total: overview.kpis.commentsTotal,
        shares_total: overview.kpis.sharesTotal,
        views_total: overview.kpis.viewsTotal,
        er_global: overview.kpis.erGlobal,
        ctr: overview.kpis.ctr,
        er_impressions: overview.kpis.erImpressions,
        er_reach: overview.kpis.erReach,
        view_rate: overview.kpis.viewRate,
        likes_share: overview.kpis.likesShare,
        comments_share: overview.kpis.commentsShare,
        shares_share: overview.kpis.sharesShare,
        classified_items: overview.kpis.classifiedItems,
        positivos: overview.kpis.positivos,
        negativos: overview.kpis.negativos,
        neutrales: overview.kpis.neutrales,
        sentimiento_neto: overview.kpis.sentimientoNeto,
        riesgo_activo: overview.kpis.riesgoActivo,
        shs: overview.kpis.shs,
        focus_account: overview.kpis.focusAccount,
        focus_account_sov: overview.kpis.focusAccountSov
      },
      previous_period: {
        posts: overview.previousPeriod.posts,
        exposure_total: overview.previousPeriod.exposureTotal,
        engagement_total: overview.previousPeriod.engagementTotal,
        impressions_total: overview.previousPeriod.impressionsTotal,
        reach_total: overview.previousPeriod.reachTotal,
        clicks_total: overview.previousPeriod.clicksTotal,
        likes_total: overview.previousPeriod.likesTotal,
        comments_total: overview.previousPeriod.commentsTotal,
        shares_total: overview.previousPeriod.sharesTotal,
        views_total: overview.previousPeriod.viewsTotal,
        er_global: overview.previousPeriod.erGlobal,
        ctr: overview.previousPeriod.ctr,
        er_impressions: overview.previousPeriod.erImpressions,
        er_reach: overview.previousPeriod.erReach,
        view_rate: overview.previousPeriod.viewRate,
        likes_share: overview.previousPeriod.likesShare,
        comments_share: overview.previousPeriod.commentsShare,
        shares_share: overview.previousPeriod.sharesShare,
        sentimiento_neto: overview.previousPeriod.sentimientoNeto,
        riesgo_activo: overview.previousPeriod.riesgoActivo,
        shs: overview.previousPeriod.shs,
        focus_account_sov: overview.previousPeriod.focusAccountSov
      },
      delta_vs_previous: {
        posts: overview.deltaVsPrevious.posts,
        exposure_total: overview.deltaVsPrevious.exposureTotal,
        engagement_total: overview.deltaVsPrevious.engagementTotal,
        impressions_total: overview.deltaVsPrevious.impressionsTotal,
        reach_total: overview.deltaVsPrevious.reachTotal,
        clicks_total: overview.deltaVsPrevious.clicksTotal,
        likes_total: overview.deltaVsPrevious.likesTotal,
        comments_total: overview.deltaVsPrevious.commentsTotal,
        shares_total: overview.deltaVsPrevious.sharesTotal,
        views_total: overview.deltaVsPrevious.viewsTotal,
        er_global: overview.deltaVsPrevious.erGlobal,
        ctr: overview.deltaVsPrevious.ctr,
        er_impressions: overview.deltaVsPrevious.erImpressions,
        er_reach: overview.deltaVsPrevious.erReach,
        view_rate: overview.deltaVsPrevious.viewRate,
        likes_share: overview.deltaVsPrevious.likesShare,
        comments_share: overview.deltaVsPrevious.commentsShare,
        shares_share: overview.deltaVsPrevious.sharesShare,
        sentimiento_neto: overview.deltaVsPrevious.sentimientoNeto,
        riesgo_activo: overview.deltaVsPrevious.riesgoActivo,
        shs: overview.deltaVsPrevious.shs,
        focus_account_sov: overview.deltaVsPrevious.focusAccountSov
      },
      target_progress: {
        quarterly_sov_target_pp: overview.targetProgress.quarterlySovTargetPp,
        quarterly_sov_delta_pp: overview.targetProgress.quarterlySovDeltaPp,
        quarterly_sov_progress_pct: overview.targetProgress.quarterlySovProgressPct,
        target_shs: overview.targetProgress.targetShs,
        shs_gap: overview.targetProgress.shsGap,
        shs_progress_pct: overview.targetProgress.shsProgressPct,
        er_by_channel: overview.targetProgress.erByChannel.map((item) => ({
          channel: item.channel,
          baseline_2025_er: item.baseline2025Er,
          target_2026_er: item.target2026Er,
          current_er: item.currentEr,
          gap: item.gap,
          progress_pct: item.progressPct,
          source: item.source
        }))
      },
      trend_daily: overview.trendDaily.map((item) => ({
        date: item.date,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo
      })),
      trend_series: overview.trendSeries.map((item) => ({
        bucket_start: item.bucketStart,
        bucket_end: item.bucketEnd,
        bucket_label: item.bucketLabel,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo,
        shs: item.shs
      })),
      by_channel: overview.byChannel.map((item) => ({
        channel: item.channel,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo,
        sov_interno: item.sovInterno
      })),
      by_account: overview.byAccount.map((item) => ({
        account_name: item.accountName,
        channel_mix: item.channelMix,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo,
        sov_interno: item.sovInterno
      })),
      diagnostics: {
        insufficient_data: overview.diagnostics.insufficientData,
        unclassified_items: overview.diagnostics.unclassifiedItems,
        unknown_sentiment_items: overview.diagnostics.unknownSentimentItems,
        last_run_status: overview.diagnostics.lastRunStatus,
        processed_objects: overview.diagnostics.processedObjects,
        anomalous_object_keys: overview.diagnostics.anomalousObjectKeys,
        rows_pending_classification: overview.diagnostics.rowsPendingClassification,
        window_start: overview.diagnostics.windowStart,
        window_end: overview.diagnostics.windowEnd
      },
      coverage: {
        db_min_date: overview.coverage.dbMinDate,
        db_max_date: overview.coverage.dbMaxDate,
        s3_min_date: overview.coverage.s3MinDate,
        s3_max_date: overview.coverage.s3MaxDate
      },
      reconciliation_status: overview.reconciliationStatus,
      settings: {
        id: overview.settings.id,
        key: overview.settings.key,
        focus_account: overview.settings.focusAccount,
        target_quarterly_sov_pp: overview.settings.targetQuarterlySovPp,
        target_shs: overview.settings.targetShs,
        risk_threshold: overview.settings.riskThreshold,
        sentiment_drop_threshold: overview.settings.sentimentDropThreshold,
        er_drop_threshold: overview.settings.erDropThreshold,
        alert_cooldown_minutes: overview.settings.alertCooldownMinutes,
        metadata: overview.settings.metadata,
        updated_by_user_id: overview.settings.updatedByUserId,
        created_at: overview.settings.createdAt.toISOString(),
        updated_at: overview.settings.updatedAt.toISOString()
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialAccounts = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const minPosts = parseLimit(parsed.query.min_posts, 5, 2000);
  if (minPosts === null) {
    return json(422, { error: "validation_error", message: "min_posts must be an integer between 1 and 2000" });
  }

  const minExposure = parseLimit(parsed.query.min_exposure, 5000, 10_000_000_000);
  if (minExposure === null) {
    return json(422, { error: "validation_error", message: "min_exposure must be a positive integer" });
  }

  const sort = parseAccountsSort(parsed.query.sort);
  if (!sort) {
    return json(422, { error: "validation_error", message: "sort must be one of er_desc|exposure_desc|engagement_desc|posts_desc|riesgo_desc|sov_desc|account_asc" });
  }

  const limit = parseLimit(parsed.query.limit, 100, 500);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 500" });
  }

  const filters: SocialAccountsFilters = {
    ...parsed.filters,
    minPosts,
    minExposure,
    sort,
    limit,
    cursor: parsed.query.cursor ?? undefined
  };

  try {
    const response = await store.getAccounts(filters);
    return json(200, {
      generated_at: response.generatedAt.toISOString(),
      last_etl_at: response.lastEtlAt?.toISOString() ?? null,
      preset: response.preset,
      window_start: response.windowStart,
      window_end: response.windowEnd,
      min_posts: response.minPosts,
      min_exposure: response.minExposure,
      sort_applied: response.sortApplied,
      items: response.items.map((item) => ({
        account_name: item.accountName,
        channel_mix: item.channelMix,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_ponderado: item.erPonderado,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo,
        sov_interno: item.sovInterno,
        delta_exposure: item.deltaExposure,
        delta_engagement: item.deltaEngagement,
        delta_er: item.deltaEr,
        meets_threshold: item.meetsThreshold
      })),
      page_info: {
        next_cursor: response.nextCursor,
        has_next: response.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialFacets = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  try {
    const response = await store.getFacets(parsed.filters);
    return json(200, {
      generated_at: response.generatedAt.toISOString(),
      preset: response.preset,
      window_start: response.windowStart,
      window_end: response.windowEnd,
      totals: response.totals,
      facets: {
        account: response.facets.account.map((item) => ({ value: item.value, count: item.count })),
        post_type: response.facets.postType.map((item) => ({ value: item.value, count: item.count })),
        campaign: response.facets.campaign.map((item) => ({ value: item.value, count: item.count })),
        strategy: response.facets.strategy.map((item) => ({ value: item.value, count: item.count })),
        hashtag: response.facets.hashtag.map((item) => ({ value: item.value, count: item.count })),
        sentiment: response.facets.sentiment.map((item) => ({ value: item.value, count: item.count }))
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialRisk = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  try {
    const response = await store.getRisk(parsed.filters);
    return json(200, {
      generated_at: response.generatedAt.toISOString(),
      last_etl_at: response.lastEtlAt?.toISOString() ?? null,
      preset: response.preset,
      window_start: response.windowStart,
      window_end: response.windowEnd,
      stale_data: response.staleData,
      stale_after_minutes: response.staleAfterMinutes,
      thresholds: {
        risk_threshold: response.thresholds.riskThreshold,
        sentiment_drop_threshold: response.thresholds.sentimentDropThreshold,
        er_drop_threshold: response.thresholds.erDropThreshold
      },
      sentiment_trend: response.sentimentTrend.map((item) => ({
        date: item.date,
        clasificados: item.clasificados,
        positivos: item.positivos,
        negativos: item.negativos,
        neutrales: item.neutrales,
        sentimiento_neto: item.sentimientoNeto,
        riesgo_activo: item.riesgoActivo
      })),
      by_channel: response.byChannel.map((item) => ({
        channel: item.channel,
        clasificados: item.clasificados,
        negativos: item.negativos,
        riesgo_activo: item.riesgoActivo
      })),
      by_account: response.byAccount.map((item) => ({
        account_name: item.accountName,
        clasificados: item.clasificados,
        negativos: item.negativos,
        riesgo_activo: item.riesgoActivo
      })),
      alerts: response.alerts.map((item) => ({
        id: item.id,
        severity: item.severity,
        status: item.status,
        risk_score: item.riskScore,
        classified_items: item.classifiedItems,
        updated_at: item.updatedAt,
        cooldown_until: item.cooldownUntil
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialHeatmap = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const metric = parseHeatmapMetric(parsed.query.metric);
  if (!metric) {
    return json(422, {
      error: "validation_error",
      message:
        "metric must be er|engagement_total|likes|comments|shares|views|view_rate|impressions|reach|clicks|ctr|er_impressions|er_reach"
    });
  }

  try {
    const payload = await store.getHeatmap(parsed.filters, metric);
    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      metric: payload.metric,
      items: payload.items.map((item) => ({
        month: item.month,
        weekday: item.weekday,
        value: item.value,
        posts: item.posts
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialScatter = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const dimension = parseScatterDimension(parsed.query.dimension);
  if (!dimension) {
    return json(422, {
      error: "validation_error",
      message: "dimension must be post_type|channel|account|campaign|strategy|hashtag"
    });
  }

  try {
    const payload = await store.getScatter(parsed.filters, dimension);
    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      dimension: payload.dimension,
      items: payload.items.map((item) => ({
        label: item.label,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare,
        posts: item.posts
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialTrendByDimension = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const dimension = parseScatterDimension(parsed.query.dimension);
  if (!dimension) {
    return json(422, {
      error: "validation_error",
      message: "dimension must be post_type|channel|account|campaign|strategy|hashtag"
    });
  }

  const metric = parseTrendByDimensionMetric(parsed.query.metric);
  if (!metric) {
    return json(422, {
      error: "validation_error",
      message:
        "metric must be posts|exposure_total|engagement_total|impressions_total|reach_total|clicks_total|likes_total|comments_total|shares_total|views_total|er_global|ctr|er_impressions|er_reach|view_rate|likes_share|comments_share|shares_share|riesgo_activo|shs"
    });
  }

  const seriesLimit = parseLimit(parsed.query.series_limit, 30, 50);
  if (seriesLimit === null) {
    return json(422, {
      error: "validation_error",
      message: "series_limit must be an integer between 1 and 50"
    });
  }

  try {
    const payload = await store.getTrendByDimension(parsed.filters, dimension, metric, seriesLimit);
    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      window_start: payload.windowStart,
      window_end: payload.windowEnd,
      trend_granularity_applied: payload.trendGranularityApplied,
      dimension: payload.dimension,
      metric: payload.metric,
      series_limit_applied: payload.seriesLimitApplied,
      series: payload.series.map((item) => ({
        label: item.label,
        metric_total: item.metricTotal,
        posts_total: item.postsTotal,
        points: item.points.map((point) => ({
          bucket_start: point.bucketStart,
          bucket_end: point.bucketEnd,
          bucket_label: point.bucketLabel,
          value: point.value,
          posts: point.posts
        }))
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialErBreakdown = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const dimension = parseErBreakdownDimension(parsed.query.dimension);
  if (!dimension) {
    return json(422, {
      error: "validation_error",
      message: "dimension must be hashtag|word|post_type|publish_frequency|weekday"
    });
  }

  try {
    const payload = await store.getErBreakdown(parsed.filters, dimension);
    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      dimension: payload.dimension,
      items: payload.items.map((item) => ({
        label: item.label,
        posts: item.posts,
        exposure_total: item.exposureTotal,
        engagement_total: item.engagementTotal,
        impressions_total: item.impressionsTotal,
        reach_total: item.reachTotal,
        clicks_total: item.clicksTotal,
        likes_total: item.likesTotal,
        comments_total: item.commentsTotal,
        shares_total: item.sharesTotal,
        views_total: item.viewsTotal,
        er_global: item.erGlobal,
        ctr: item.ctr,
        er_impressions: item.erImpressions,
        er_reach: item.erReach,
        view_rate: item.viewRate,
        likes_share: item.likesShare,
        comments_share: item.commentsShare,
        shares_share: item.sharesShare
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialErTargets = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const year = parseLimit(parsed.query.year, 2026, 2100);
  if (year === null) {
    return json(422, { error: "validation_error", message: "year must be an integer between 1 and 2100" });
  }

  try {
    const payload = await store.getErTargets(parsed.filters, year);
    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      last_etl_at: payload.lastEtlAt?.toISOString() ?? null,
      year: payload.year,
      items: payload.items.map((item) => ({
        channel: item.channel,
        baseline_2025_er: item.baseline2025Er,
        target_2026_er: item.target2026Er,
        current_er: item.currentEr,
        gap: item.gap,
        progress_pct: item.progressPct,
        source: item.source
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchMonitorSocialErTargets = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Admin" });
  }

  const store = createSocialStore();
  const appStore = createAppStore();
  if (!store || !appStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const body = parseBody<PatchErTargetsBody>(event);
  if (!body || !Array.isArray(body.targets) || body.targets.length === 0) {
    return json(422, { error: "validation_error", message: "targets[] is required" });
  }

  const targets = body.targets
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const channel = typeof row.channel === "string" ? row.channel.trim().toLowerCase() : "";
      if (!CHANNELS.includes(channel as SocialChannel)) return null;
      const source: "auto" | "manual" =
        typeof row.source === "string" && row.source.trim().toLowerCase() === "manual" ? "manual" : "auto";
      const target2026Er = typeof row.target_2026_er === "number" && Number.isFinite(row.target_2026_er) ? row.target_2026_er : undefined;
      const overrideReason = typeof row.override_reason === "string" ? row.override_reason.trim().slice(0, 220) : undefined;
      return {
        channel: channel as SocialChannel,
        source,
        target2026Er,
        overrideReason
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (targets.length === 0) {
    return json(422, { error: "validation_error", message: "No valid target rows provided" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const year = typeof body.year === "number" && Number.isFinite(body.year) ? Math.floor(body.year) : 2026;
    const payload = await store.upsertErTargets({
      actorUserId,
      requestId: getRequestId(event),
      year,
      targets
    });

    return json(200, {
      generated_at: payload.generatedAt.toISOString(),
      last_etl_at: payload.lastEtlAt?.toISOString() ?? null,
      year: payload.year,
      items: payload.items.map((item) => ({
        channel: item.channel,
        baseline_2025_er: item.baseline2025Er,
        target_2026_er: item.target2026Er,
        current_er: item.currentEr,
        gap: item.gap,
        progress_pct: item.progressPct,
        source: item.source
      }))
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const postMonitorSocialHashtagBackfill = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Admin" });
  }

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 5000, 50000);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 50000" });
  }

  try {
    const updated = await store.backfillHashtags(limit);
    return json(202, {
      status: "accepted",
      updated_rows: updated
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialEtlQuality = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 20, 100);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 100" });
  }

  try {
    const response = await store.getEtlQuality(limit);
    return json(200, {
      generated_at: response.generatedAt.toISOString(),
      last_etl_at: response.lastEtlAt?.toISOString() ?? null,
      coverage: {
        db_min_date: response.coverage.dbMinDate?.toISOString() ?? null,
        db_max_date: response.coverage.dbMaxDate?.toISOString() ?? null,
        s3_min_date: response.coverage.s3MinDate?.toISOString() ?? null,
        s3_max_date: response.coverage.s3MaxDate?.toISOString() ?? null
      },
      reconciliation_status: response.reconciliationStatus,
      reconciliation_by_channel: response.reconciliationByChannel,
      runs: response.runs
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialExportXlsx = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const sort = parseSort(parsed.query.sort);
  if (!sort) {
    return json(422, { error: "validation_error", message: "sort must be one of published_at_desc|exposure_desc|engagement_desc" });
  }

  const minPosts = parseLimit(parsed.query.min_posts, 5, 2000);
  if (minPosts === null) {
    return json(422, { error: "validation_error", message: "min_posts must be an integer between 1 and 2000" });
  }

  const minExposure = parseLimit(parsed.query.min_exposure, 5000, 10_000_000_000);
  if (minExposure === null) {
    return json(422, { error: "validation_error", message: "min_exposure must be a positive integer" });
  }

  try {
    const [overview, accounts, risk, etl, posts] = await Promise.all([
      store.getOverview(parsed.filters),
      store.getAccounts({ ...parsed.filters, minPosts, minExposure, sort: "er_desc", limit: 500 }),
      store.getRisk(parsed.filters),
      store.getEtlQuality(50),
      store.listAllPosts(parsed.filters, sort, 100000)
    ]);

    const workbook = XLSX.utils.book_new();

    const resumenRows: Array<Array<string | number | boolean | null>> = [
      ["generated_at", overview.generatedAt.toISOString()],
      ["last_etl_at", overview.lastEtlAt?.toISOString() ?? null],
      ["preset", overview.preset],
      ["window_start", overview.windowStart],
      ["window_end", overview.windowEnd],
      ["posts", overview.kpis.posts],
      ["exposure_total", overview.kpis.exposureTotal],
      ["engagement_total", overview.kpis.engagementTotal],
      ["er_global", overview.kpis.erGlobal],
      ["sentimiento_neto", overview.kpis.sentimientoNeto],
      ["riesgo_activo", overview.kpis.riesgoActivo],
      ["shs", overview.kpis.shs],
      ["focus_account", overview.kpis.focusAccount],
      ["focus_account_sov", overview.kpis.focusAccountSov],
      ["reconciliation_status", overview.reconciliationStatus]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumenRows), "Resumen");

    const cuentasRows: Array<Array<string | number | boolean>> = [[
      "account_name",
      "channel_mix",
      "posts",
      "exposure_total",
      "engagement_total",
      "er_ponderado",
      "sentimiento_neto",
      "riesgo_activo",
      "sov_interno",
      "delta_exposure",
      "delta_engagement",
      "delta_er",
      "meets_threshold"
    ]];
    for (const item of accounts.items) {
      cuentasRows.push([
        item.accountName,
        item.channelMix.join("|"),
        item.posts,
        item.exposureTotal,
        item.engagementTotal,
        item.erPonderado,
        item.sentimientoNeto,
        item.riesgoActivo,
        item.sovInterno,
        item.deltaExposure,
        item.deltaEngagement,
        item.deltaEr,
        item.meetsThreshold
      ]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cuentasRows), "Cuentas");

    const postsRows: Array<Array<string | number | null>> = [[
      "published_at",
      "channel",
      "account_name",
      "external_post_id",
      "post_type",
      "campaign",
      "strategies",
      "hashtags",
      "title",
      "post_url",
      "sentiment",
      "sentiment_confidence",
      "exposure",
      "engagement_total",
      "impressions",
      "reach",
      "clicks",
      "likes",
      "comments",
      "shares",
      "views",
      "source_score"
    ]];
    for (const post of posts) {
      postsRows.push([
        post.publishedAt?.toISOString() ?? null,
        post.channel,
        post.accountName,
        post.externalPostId,
        post.postType,
        post.campaignKey,
        post.strategyKeys.join("|"),
        post.hashtags.join("|"),
        post.title,
        post.postUrl,
        post.sentiment,
        post.sentimentConfidence,
        post.exposure,
        post.engagementTotal,
        post.impressions,
        post.reach,
        post.clicks,
        post.likes,
        post.comments,
        post.shares,
        post.views,
        post.sourceScore
      ]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(postsRows), "Posts");

    const riskRows: Array<Array<string | number | null>> = [[
      "date",
      "clasificados",
      "positivos",
      "negativos",
      "neutrales",
      "sentimiento_neto",
      "riesgo_activo"
    ]];
    for (const item of risk.sentimentTrend) {
      riskRows.push([item.date, item.clasificados, item.positivos, item.negativos, item.neutrales, item.sentimientoNeto, item.riesgoActivo]);
    }
    riskRows.push([]);
    riskRows.push(["alert_id", "severity", "status", "risk_score", "classified_items", "updated_at", "cooldown_until"]);
    for (const alert of risk.alerts) {
      riskRows.push([alert.id, alert.severity, alert.status, alert.riskScore, alert.classifiedItems, alert.updatedAt, alert.cooldownUntil]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(riskRows), "Riesgo");

    const etlRows: Array<Array<string | number | null>> = [["metric", "value"]];
    etlRows.push(["generated_at", etl.generatedAt.toISOString()]);
    etlRows.push(["last_etl_at", etl.lastEtlAt?.toISOString() ?? null]);
    etlRows.push(["reconciliation_status", etl.reconciliationStatus]);
    etlRows.push(["db_min_date", etl.coverage.dbMinDate?.toISOString() ?? null]);
    etlRows.push(["db_max_date", etl.coverage.dbMaxDate?.toISOString() ?? null]);
    etlRows.push(["s3_min_date", etl.coverage.s3MinDate?.toISOString() ?? null]);
    etlRows.push(["s3_max_date", etl.coverage.s3MaxDate?.toISOString() ?? null]);
    etlRows.push([]);
    etlRows.push(["channel", "s3_rows", "db_rows", "delta_rows", "status", "run_id", "created_at"]);
    for (const item of etl.reconciliationByChannel) {
      etlRows.push([item.channel, item.s3Rows, item.dbRows, item.deltaRows, item.status, item.runId, item.createdAt]);
    }
    etlRows.push([]);
    etlRows.push([
      "run_id",
      "trigger_type",
      "status",
      "queued_at",
      "started_at",
      "finished_at",
      "current_phase",
      "rows_parsed",
      "rows_persisted",
      "rows_pending_classification",
      "malformed_rows",
      "error_message"
    ]);
    for (const run of etl.runs) {
      etlRows.push([
        run.id,
        run.triggerType,
        run.status,
        run.queuedAt,
        run.startedAt,
        run.finishedAt,
        run.currentPhase,
        run.counters.rowsParsed,
        run.counters.rowsPersisted,
        run.counters.rowsPendingClassification,
        run.malformedRows,
        run.errorMessage
      ]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(etlRows), "ETL");

    const binary = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const fileName = `social-analytics-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.xlsx`;

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`
      },
      body: binary.toString("base64")
    };
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listMonitorSocialPosts = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const parsed = parseCommonFilters(event);
  if ("error" in parsed) return parsed.error;

  const limit = parseLimit(parsed.query.limit, 50, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 200" });
  }

  const sort = parseSort(parsed.query.sort);
  if (!sort) {
    return json(422, {
      error: "validation_error",
      message: "sort must be one of published_at_desc|exposure_desc|engagement_desc"
    });
  }

  const originParsed = parseOriginFilters(parsed.query);
  if (originParsed.error) return originParsed.error;
  const hasOriginFiltering = Boolean(
    originParsed.filters.origin ||
      originParsed.filters.medium ||
      (originParsed.filters.tags?.length ?? 0) > 0
  );

  const toApiPost = (item: {
    id: string;
    contentItemId: string;
    channel: string;
    accountName: string;
    externalPostId: string;
    postUrl: string;
    postType: string | null;
    publishedAt: Date | null;
    title: string;
    text: string | null;
    sentiment: string;
    sentimentRaw: string | null;
    sentimentConfidence: number | null;
    exposure: number;
    engagementTotal: number;
    impressions: number;
    reach: number;
    clicks: number;
    likes: number;
    comments: number;
    awarioCommentsCount: number;
    shares: number;
    views: number;
    sourceScore: number;
    campaignKey: string | null;
    strategyKeys: string[];
    hashtags: string[];
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    ...deriveOriginFields({
      forcedOrigin: "awario",
      channel: item.channel,
      provider: item.channel
    }),
    id: item.id,
    content_item_id: item.contentItemId,
    channel: item.channel,
    account_name: item.accountName,
    external_post_id: item.externalPostId,
    post_url: item.postUrl,
    post_type: item.postType,
    published_at: item.publishedAt?.toISOString() ?? null,
    title: item.title,
    text: item.text,
    sentiment: item.sentiment,
    sentiment_raw: item.sentimentRaw,
    sentiment_confidence: item.sentimentConfidence,
    exposure: item.exposure,
    engagement_total: item.engagementTotal,
    impressions: item.impressions,
    reach: item.reach,
    clicks: item.clicks,
    likes: item.likes,
    comments: item.comments,
    awario_comments_count: item.awarioCommentsCount,
    shares: item.shares,
    views: item.views,
    source_score: item.sourceScore,
    campaign: item.campaignKey,
    strategies: item.strategyKeys,
    hashtags: item.hashtags,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString()
  });

  try {
    if (!hasOriginFiltering) {
      const page = await store.listPosts({
        ...parsed.filters,
        sort,
        limit,
        cursor: parsed.query.cursor ?? undefined
      });

      return json(200, {
        items: page.items.map(toApiPost),
        page_info: {
          next_cursor: page.nextCursor,
          has_next: page.hasNext
        }
      });
    }

    const scanLimit = Math.min(200, Math.max(limit * 3, 60));
    const filteredItems: ReturnType<typeof toApiPost>[] = [];
    let scanCursor = parsed.query.cursor ?? undefined;
    let scanHasNext = true;
    let nextCursor: string | null = null;
    let matchedBeyondLimit = false;
    let guard = 0;

    while (scanHasNext && guard < 20) {
      guard += 1;
      const page = await store.listPosts({
        ...parsed.filters,
        sort,
        limit: scanLimit,
        cursor: scanCursor
      });

      scanCursor = page.nextCursor ?? undefined;
      scanHasNext = page.hasNext;
      nextCursor = page.nextCursor;

      for (const item of page.items) {
        const originFields = deriveOriginFields({
          forcedOrigin: "awario",
          channel: item.channel,
          provider: item.channel
        });
        if (!matchesOriginFilters(originFields, originParsed.filters)) continue;

        if (filteredItems.length < limit) {
          filteredItems.push(toApiPost(item));
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
      items: filteredItems,
      page_info: {
        next_cursor: hasNext ? nextCursor : null,
        has_next: hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const listMonitorSocialPostComments = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const postId = getIdFromPath(event, /^\/v1\/monitor\/social\/posts\/([^/]+)\/comments$/);
  if (!postId) {
    return json(422, { error: "validation_error", message: "post_id invalido" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 50, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 200" });
  }

  const sentiment = parseSentiment(query.sentiment);
  if (sentiment === null) {
    return json(422, { error: "validation_error", message: "sentiment must be positive|negative|neutral|unknown" });
  }

  let isSpam: boolean | undefined;
  if (query.is_spam !== undefined) {
    if (query.is_spam !== "true" && query.is_spam !== "false") {
      return json(422, { error: "validation_error", message: "is_spam must be true|false" });
    }
    isSpam = query.is_spam === "true";
  }

  let relatedToPostText: boolean | undefined;
  if (query.related_to_post_text !== undefined) {
    if (query.related_to_post_text !== "true" && query.related_to_post_text !== "false") {
      return json(422, { error: "validation_error", message: "related_to_post_text must be true|false" });
    }
    relatedToPostText = query.related_to_post_text === "true";
  }

  const originParsed = parseOriginFilters(query);
  if (originParsed.error) return originParsed.error;
  const hasOriginFiltering = Boolean(
    originParsed.filters.origin ||
      originParsed.filters.medium ||
      (originParsed.filters.tags?.length ?? 0) > 0
  );

  const toApiComment = (item: {
    id: string;
    socialPostMetricId: string;
    awarioMentionId: string;
    awarioAlertId: string;
    channel: string;
    parentExternalPostId: string;
    externalCommentId: string | null;
    externalReplyCommentId: string | null;
    commentUrl: string | null;
    authorName: string | null;
    authorProfileUrl: string | null;
    publishedAt: Date | null;
    text: string | null;
    sentiment: string;
    sentimentSource: "awario" | "model" | "manual";
    isSpam: boolean;
    relatedToPostText: boolean;
    needsReview: boolean;
    confidence: number | null;
    rawPayload: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    ...deriveOriginFields({
      forcedOrigin: "awario",
      channel: item.channel,
      provider: item.channel,
      awarioAlertId: item.awarioAlertId
    }),
    id: item.id,
    social_post_metric_id: item.socialPostMetricId,
    awario_mention_id: item.awarioMentionId,
    awario_alert_id: item.awarioAlertId,
    channel: item.channel,
    parent_external_post_id: item.parentExternalPostId,
    external_comment_id: item.externalCommentId,
    external_reply_comment_id: item.externalReplyCommentId,
    comment_url: item.commentUrl,
    author_name: item.authorName,
    author_profile_url: item.authorProfileUrl,
    published_at: item.publishedAt?.toISOString() ?? null,
    text: item.text,
    sentiment: item.sentiment,
    sentiment_source: item.sentimentSource,
    is_spam: item.isSpam,
    related_to_post_text: item.relatedToPostText,
    needs_review: item.needsReview,
    confidence: item.confidence,
    raw_payload: item.rawPayload,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString()
  });

  try {
    if (!hasOriginFiltering) {
      const page = await store.listPostComments({
        postId,
        limit,
        cursor: query.cursor ?? undefined,
        sentiment: sentiment ?? undefined,
        isSpam,
        relatedToPostText
      });

      return json(200, {
        items: page.items.map(toApiComment),
        page_info: {
          next_cursor: page.nextCursor,
          has_next: page.hasNext
        }
      });
    }

    const scanLimit = Math.min(200, Math.max(limit * 3, 60));
    const filteredItems: ReturnType<typeof toApiComment>[] = [];
    let scanCursor = query.cursor ?? undefined;
    let scanHasNext = true;
    let nextCursor: string | null = null;
    let matchedBeyondLimit = false;
    let guard = 0;

    while (scanHasNext && guard < 20) {
      guard += 1;
      const page = await store.listPostComments({
        postId,
        limit: scanLimit,
        cursor: scanCursor,
        sentiment: sentiment ?? undefined,
        isSpam,
        relatedToPostText
      });

      scanCursor = page.nextCursor ?? undefined;
      scanHasNext = page.hasNext;
      nextCursor = page.nextCursor;

      for (const item of page.items) {
        const originFields = deriveOriginFields({
          forcedOrigin: "awario",
          channel: item.channel,
          provider: item.channel,
          awarioAlertId: item.awarioAlertId
        });
        if (!matchesOriginFilters(originFields, originParsed.filters)) continue;

        if (filteredItems.length < limit) {
          filteredItems.push(toApiComment(item));
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
      items: filteredItems,
      page_info: {
        next_cursor: hasNext ? nextCursor : null,
        has_next: hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchMonitorSocialComment = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const commentId = getIdFromPath(event, /^\/v1\/monitor\/social\/comments\/([^/]+)$/);
  if (!commentId) {
    return json(422, { error: "validation_error", message: "comment_id invalido" });
  }

  const body = parseBody<PatchSocialCommentBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch: {
    isSpam?: boolean;
    relatedToPostText?: boolean;
    sentiment?: "positive" | "negative" | "neutral" | "unknown";
    reason?: string | null;
  } = {};

  if (body.is_spam !== undefined) {
    if (typeof body.is_spam !== "boolean") {
      return json(422, { error: "validation_error", message: "is_spam debe ser boolean" });
    }
    patch.isSpam = body.is_spam;
  }

  if (body.related_to_post_text !== undefined) {
    if (typeof body.related_to_post_text !== "boolean") {
      return json(422, { error: "validation_error", message: "related_to_post_text debe ser boolean" });
    }
    patch.relatedToPostText = body.related_to_post_text;
  }

  if (body.sentiment !== undefined) {
    if (typeof body.sentiment !== "string") {
      return json(422, { error: "validation_error", message: "sentiment invalido" });
    }
    const sentiment = body.sentiment.trim().toLowerCase();
    if (sentiment !== "positive" && sentiment !== "negative" && sentiment !== "neutral" && sentiment !== "unknown") {
      return json(422, { error: "validation_error", message: "sentiment must be positive|negative|neutral|unknown" });
    }
    patch.sentiment = sentiment;
  }

  if (body.reason !== undefined) {
    if (body.reason !== null && typeof body.reason !== "string") {
      return json(422, { error: "validation_error", message: "reason invalido" });
    }
    patch.reason = typeof body.reason === "string" ? body.reason.slice(0, 600) : null;
  }

  if (patch.isSpam === undefined && patch.relatedToPostText === undefined && patch.sentiment === undefined) {
    return json(422, { error: "validation_error", message: "No hay campos para actualizar" });
  }

  const store = createSocialStore();
  const appStore = createAppStore();
  if (!store || !appStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);

    const updated = await store.patchPostCommentOverride({
      commentId,
      actorUserId,
      requestId: getRequestId(event),
      reason: patch.reason,
      isSpam: patch.isSpam,
      relatedToPostText: patch.relatedToPostText,
      sentiment: patch.sentiment
    });

    return json(200, {
      ...deriveOriginFields({
        forcedOrigin: "awario",
        channel: updated.channel,
        provider: updated.channel,
        awarioAlertId: updated.awarioAlertId
      }),
      id: updated.id,
      social_post_metric_id: updated.socialPostMetricId,
      awario_mention_id: updated.awarioMentionId,
      awario_alert_id: updated.awarioAlertId,
      channel: updated.channel,
      parent_external_post_id: updated.parentExternalPostId,
      external_comment_id: updated.externalCommentId,
      external_reply_comment_id: updated.externalReplyCommentId,
      comment_url: updated.commentUrl,
      author_name: updated.authorName,
      author_profile_url: updated.authorProfileUrl,
      published_at: updated.publishedAt?.toISOString() ?? null,
      text: updated.text,
      sentiment: updated.sentiment,
      sentiment_source: updated.sentimentSource,
      is_spam: updated.isSpam,
      related_to_post_text: updated.relatedToPostText,
      needs_review: updated.needsReview,
      confidence: updated.confidence,
      raw_payload: updated.rawPayload,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const createMonitorSocialRun = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }

  const store = createSocialStore();
  const appStore = createAppStore();
  if (!store || !appStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const body = parseBody<TriggerRunBody>(event) ?? {};
  const force = typeof body.force === "boolean" ? body.force : false;
  const bucket = typeof body.bucket === "string" ? body.bucket.trim() : undefined;
  const prefix = typeof body.prefix === "string" ? body.prefix.trim() : undefined;
  const requestId = getRequestId(event);

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const run = await store.queueSyncRun({ triggerType: "manual", requestId });

    const payload = {
      trigger_type: "manual",
      request_id: requestId,
      requested_at: new Date().toISOString(),
      run_id: run.id,
      actor_user_id: actorUserId,
      force,
      bucket: bucket || undefined,
      prefix: prefix || undefined
    };

    if (env.socialSchedulerLambdaName) {
      await lambda
        .invoke({
          FunctionName: env.socialSchedulerLambdaName,
          InvocationType: "Event",
          Payload: JSON.stringify(payload)
        })
        .promise();
    } else {
      runSocialSync({
        triggerType: "manual",
        requestId,
        runId: run.id,
        force,
        bucket: bucket || undefined,
        prefix: prefix || undefined
      })
        .then(() => undefined)
        .catch((error) => {
          console.error("social_run_async_fallback_failed", { run_id: run.id, message: (error as Error).message });
        });
    }

    return json(202, {
      status: "accepted",
      run_id: run.id,
      queued_at: run.queuedAt.toISOString()
    });
  } catch (error) {
    return json(500, { error: "social_sync_failed", message: (error as Error).message });
  }
};

export const listMonitorSocialRuns = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit, 50, 200);
  if (limit === null) {
    return json(422, { error: "validation_error", message: "limit must be an integer between 1 and 200" });
  }

  try {
    const page = await store.listRuns(limit, query.cursor ?? undefined);
    return json(200, {
      items: page.items.map((item) => ({
        id: item.id,
        trigger_type: item.triggerType,
        status: item.status,
        request_id: item.requestId,
        queued_at: item.queuedAt.toISOString(),
        started_at: item.startedAt?.toISOString() ?? null,
        finished_at: item.finishedAt?.toISOString() ?? null,
        current_phase: item.currentPhase,
        phase_status: item.phaseStatus,
        counters: buildRunCounters(item.metrics),
        metrics: item.metrics,
        error_message: item.errorMessage,
        created_at: item.createdAt.toISOString()
      })),
      page_info: {
        next_cursor: page.nextCursor,
        has_next: page.hasNext
      }
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const getMonitorSocialSettings = async () => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const store = createSocialStore();
  if (!store) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  try {
    const settings = await store.getSettings();
    return json(200, {
      id: settings.id,
      key: settings.key,
      focus_account: settings.focusAccount,
      target_quarterly_sov_pp: settings.targetQuarterlySovPp,
      target_shs: settings.targetShs,
      risk_threshold: settings.riskThreshold,
      sentiment_drop_threshold: settings.sentimentDropThreshold,
      er_drop_threshold: settings.erDropThreshold,
      alert_cooldown_minutes: settings.alertCooldownMinutes,
      metadata: settings.metadata,
      updated_by_user_id: settings.updatedByUserId,
      created_at: settings.createdAt.toISOString(),
      updated_at: settings.updatedAt.toISOString()
    });
  } catch (error) {
    return mapStoreError(error);
  }
};

export const patchMonitorSocialSettings = async (event: APIGatewayProxyEventV2) => {
  const featureError = ensureFeatureEnabled();
  if (featureError) return featureError;

  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Admin" });
  }

  const store = createSocialStore();
  const appStore = createAppStore();
  if (!store || !appStore) {
    return json(500, { error: "misconfigured", message: "Database runtime is not configured" });
  }

  const body = parseBody<PatchSettingsBody>(event);
  if (!body) {
    return json(400, { error: "invalid_json", message: "Body JSON invalido" });
  }

  const patch = {
    focusAccount: parseOptionalString(body.focus_account, 180),
    targetQuarterlySovPp: parseOptionalNumber(body.target_quarterly_sov_pp),
    targetShs: parseOptionalNumber(body.target_shs),
    riskThreshold: parseOptionalNumber(body.risk_threshold),
    sentimentDropThreshold: parseOptionalNumber(body.sentiment_drop_threshold),
    erDropThreshold: parseOptionalNumber(body.er_drop_threshold),
    alertCooldownMinutes: parseOptionalInt(body.alert_cooldown_minutes),
    metadata: parseMetadata(body.metadata)
  };

  if (Object.values(patch).every((value) => value === undefined)) {
    return json(422, { error: "validation_error", message: "No settings patch received" });
  }

  try {
    const principal = getAuthPrincipal(event);
    const actorUserId = await appStore.upsertUserFromPrincipal(principal);
    const updated = await store.updateSettings({
      patch,
      actorUserId,
      requestId: getRequestId(event)
    });

    return json(200, {
      id: updated.id,
      key: updated.key,
      focus_account: updated.focusAccount,
      target_quarterly_sov_pp: updated.targetQuarterlySovPp,
      target_shs: updated.targetShs,
      risk_threshold: updated.riskThreshold,
      sentiment_drop_threshold: updated.sentimentDropThreshold,
      er_drop_threshold: updated.erDropThreshold,
      alert_cooldown_minutes: updated.alertCooldownMinutes,
      metadata: updated.metadata,
      updated_by_user_id: updated.updatedByUserId,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return mapStoreError(error);
  }
};
