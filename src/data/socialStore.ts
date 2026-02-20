import { randomUUID } from "crypto";
import { AppStoreError } from "./appStore";
import {
  RdsDataClient,
  fieldBoolean,
  fieldDate,
  fieldLong,
  fieldString,
  sqlBoolean,
  sqlJson,
  sqlLong,
  sqlString,
  sqlTimestamp,
  sqlUuid,
  type SqlParameter,
  type SqlRow
} from "./rdsData";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_INCIDENT_STATUSES = ["open", "acknowledged", "in_progress"] as const;

type TriggerType = "scheduled" | "manual";
type RunStatus = "queued" | "running" | "completed" | "failed";
type SocialChannel = "facebook" | "instagram" | "linkedin" | "tiktok";
type SocialDatePreset = "all" | "y2024" | "y2025" | "ytd" | "90d" | "30d" | "7d" | "last_quarter" | "custom";
type SocialTrendGranularity = "auto" | "day" | "week" | "month";
type SortMode = "published_at_desc" | "exposure_desc" | "engagement_desc";
type SentimentBucket = "positive" | "negative" | "neutral" | "unknown";
type SocialComparisonMode = "weekday_aligned_week" | "exact_days" | "same_period_last_year";
type SocialScatterDimension = "post_type" | "channel" | "account" | "campaign" | "strategy" | "hashtag";
type SocialErBreakdownDimension = "hashtag" | "word" | "post_type" | "publish_frequency" | "weekday";
type ReconciliationStatus = "ok" | "warning" | "error" | "unknown";
type SocialPhase = "ingest" | "classify" | "aggregate" | "reconcile" | "alerts";
type SocialPhaseState = "pending" | "running" | "completed" | "failed" | "skipped";
type IncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
type IncidentStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "dismissed";

type SocialPhaseSnapshot = {
  status: SocialPhaseState;
  startedAt?: string;
  finishedAt?: string;
  details?: Record<string, unknown>;
};

type SocialPhaseStatusRecord = Record<SocialPhase, SocialPhaseSnapshot>;

type SocialSyncRunRecord = {
  id: string;
  triggerType: TriggerType;
  status: RunStatus;
  requestId: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  currentPhase: SocialPhase | null;
  phaseStatus: SocialPhaseStatusRecord | null;
  metrics: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: Date;
};

type SocialDashboardSettingRecord = {
  id: string;
  key: string;
  focusAccount: string | null;
  targetQuarterlySovPp: number;
  targetShs: number;
  riskThreshold: number;
  sentimentDropThreshold: number;
  erDropThreshold: number;
  alertCooldownMinutes: number;
  metadata: Record<string, unknown>;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SocialPostUpsertInput = {
  channel: SocialChannel;
  accountName: string;
  externalPostId: string;
  postUrl: string;
  postType?: string | null;
  publishedAt?: Date | null;
  text?: string | null;
  imageUrl?: string | null;
  exposure: number;
  engagementTotal: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  sourceScore?: number;
  rawPayloadS3Key?: string | null;
  diagnostics?: Record<string, unknown>;
  hashtags?: string[];
  campaignTaxonomyId?: string | null;
  strategyTaxonomyIds?: string[];
};

type SocialOverviewFilters = {
  windowDays?: 7 | 30 | 90;
  preset?: SocialDatePreset;
  from?: Date;
  to?: Date;
  channel?: SocialChannel;
  channels?: SocialChannel[];
  accounts?: string[];
  account?: string;
  postTypes?: string[];
  campaigns?: string[];
  strategies?: string[];
  hashtags?: string[];
  sentiment?: SentimentBucket;
  trendGranularity?: SocialTrendGranularity;
  comparisonMode?: SocialComparisonMode;
  comparisonDays?: number;
};

type SocialPostsFilters = SocialOverviewFilters & {
  limit: number;
  cursor?: string;
  sort: SortMode;
};

type SocialPostRecord = {
  id: string;
  contentItemId: string;
  channel: SocialChannel;
  accountName: string;
  externalPostId: string;
  postUrl: string;
  postType: string | null;
  publishedAt: Date | null;
  title: string;
  text: string | null;
  sentiment: SentimentBucket;
  sentimentRaw: string | null;
  sentimentConfidence: number | null;
  exposure: number;
  engagementTotal: number;
  impressions: number;
  reach: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  awarioCommentsCount: number;
  sourceScore: number;
  campaignKey: string | null;
  strategyKeys: string[];
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
};

type SocialPostCommentRecord = {
  id: string;
  socialPostMetricId: string;
  awarioMentionId: string;
  awarioAlertId: string;
  channel: SocialChannel;
  parentExternalPostId: string;
  externalCommentId: string | null;
  externalReplyCommentId: string | null;
  commentUrl: string | null;
  authorName: string | null;
  authorProfileUrl: string | null;
  publishedAt: Date | null;
  text: string | null;
  sentiment: SentimentBucket;
  sentimentSource: "awario" | "model" | "manual";
  isSpam: boolean;
  relatedToPostText: boolean;
  needsReview: boolean;
  confidence: number | null;
  rawPayload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type SocialPostCommentsFilters = {
  postId: string;
  limit: number;
  cursor?: string;
  sentiment?: SentimentBucket;
  isSpam?: boolean;
  relatedToPostText?: boolean;
};

type SocialPostCommentsPage = {
  items: SocialPostCommentRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type SocialPostCommentOverrideInput = {
  commentId: string;
  actorUserId: string;
  requestId?: string;
  reason?: string | null;
  isSpam?: boolean;
  relatedToPostText?: boolean;
  sentiment?: SentimentBucket;
};

type SocialPostCommentUpsertInput = {
  socialPostMetricId: string;
  awarioMentionId: string;
  awarioAlertId: string;
  channel: SocialChannel;
  parentExternalPostId: string;
  externalCommentId?: string | null;
  externalReplyCommentId?: string | null;
  commentUrl?: string | null;
  authorName?: string | null;
  authorProfileUrl?: string | null;
  publishedAt?: Date | null;
  text?: string | null;
  sentiment?: SentimentBucket;
  sentimentSource?: "awario" | "model" | "manual";
  isSpam?: boolean;
  relatedToPostText?: boolean;
  needsReview?: boolean;
  confidence?: number | null;
  rawPayload?: Record<string, unknown>;
};

type SocialPostsPage = {
  items: SocialPostRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type SocialRunsPage = {
  items: SocialSyncRunRecord[];
  nextCursor: string | null;
  hasNext: boolean;
};

type SocialMetricRow = {
  channel: SocialChannel;
  accountName: string;
  exposure: number;
  engagementTotal: number;
  sourceScore: number;
  sentiment: SentimentBucket;
  publishedAt: Date;
};

type SocialTrendSeriesItem = {
  bucketStart: string;
  bucketEnd: string;
  bucketLabel: string;
  posts: number;
  exposureTotal: number;
  engagementTotal: number;
  erGlobal: number;
  sentimientoNeto: number;
  riesgoActivo: number;
  shs: number;
};

type SocialOverviewRecord = {
  generatedAt: Date;
  lastEtlAt: Date | null;
  preset: SocialDatePreset;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  comparison: {
    modeApplied: SocialComparisonMode;
    currentWindowStart: string;
    currentWindowEnd: string;
    previousWindowStart: string;
    previousWindowEnd: string;
    label: string;
  };
  trendGranularityApplied: Exclude<SocialTrendGranularity, "auto">;
  official: false;
  kpis: {
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    classifiedItems: number;
    positivos: number;
    negativos: number;
    neutrales: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    shs: number;
    focusAccount: string | null;
    focusAccountSov: number;
  };
  previousPeriod: {
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    shs: number;
    focusAccountSov: number;
  };
  deltaVsPrevious: {
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    shs: number;
    focusAccountSov: number;
  };
  targetProgress: {
    quarterlySovTargetPp: number;
    quarterlySovDeltaPp: number;
    quarterlySovProgressPct: number;
    targetShs: number;
    shsGap: number;
    shsProgressPct: number;
    erByChannel: Array<{
      channel: SocialChannel;
      baseline2025Er: number;
      target2026Er: number;
      currentEr: number;
      gap: number;
      progressPct: number;
      source: "auto" | "manual";
    }>;
  };
  trendSeries: SocialTrendSeriesItem[];
  trendDaily: Array<{
    date: string;
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
      sentimientoNeto: number;
      riesgoActivo: number;
    }>;
  byChannel: Array<{
    channel: SocialChannel;
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    sovInterno: number;
  }>;
  byAccount: Array<{
    accountName: string;
    channelMix: SocialChannel[];
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    sovInterno: number;
  }>;
  diagnostics: {
    insufficientData: boolean;
    unclassifiedItems: number;
    unknownSentimentItems: number;
    lastRunStatus: RunStatus | null;
    processedObjects: number;
    anomalousObjectKeys: number;
    rowsPendingClassification: number;
    windowStart: string;
    windowEnd: string;
  };
  coverage: {
    dbMinDate: string | null;
    dbMaxDate: string | null;
    s3MinDate: string | null;
    s3MaxDate: string | null;
  };
  reconciliationStatus: ReconciliationStatus;
  settings: SocialDashboardSettingRecord;
};

type SocialErTargetRecord = {
  id: string;
  year: number;
  channel: SocialChannel;
  baselineEr: number;
  momentumPct: number;
  autoGrowthPct: number;
  targetEr: number;
  source: "auto" | "manual";
  overrideReason: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SocialErTargetItem = {
  channel: SocialChannel;
  baseline2025Er: number;
  target2026Er: number;
  currentEr: number;
  gap: number;
  progressPct: number;
  source: "auto" | "manual";
};

type SocialHeatmapMetric = "er" | "engagement_total" | "likes" | "comments" | "shares" | "views" | "view_rate";

type SocialHeatmapRecord = {
  generatedAt: Date;
  metric: SocialHeatmapMetric;
  items: Array<{
    month: number;
    weekday: number;
    value: number;
    posts: number;
  }>;
};

type SocialScatterRecord = {
  generatedAt: Date;
  dimension: SocialScatterDimension;
  items: Array<{
    label: string;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
    posts: number;
  }>;
};

type SocialErBreakdownRecord = {
  generatedAt: Date;
  dimension: SocialErBreakdownDimension;
  items: Array<{
    label: string;
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erGlobal: number;
  }>;
};

type SocialErTargetsRecord = {
  generatedAt: Date;
  lastEtlAt: Date | null;
  year: number;
  items: SocialErTargetItem[];
};

type SocialRunCounters = {
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
};

type SocialReconciliationSnapshotRecord = {
  id: string;
  runId: string;
  channel: SocialChannel;
  s3Rows: number;
  dbRows: number;
  deltaRows: number;
  s3MinDate: Date | null;
  s3MaxDate: Date | null;
  dbMinDate: Date | null;
  dbMaxDate: Date | null;
  status: ReconciliationStatus;
  details: Record<string, unknown>;
  createdAt: Date;
};

type SocialReconciliationSnapshotInput = {
  channel: SocialChannel;
  s3Rows: number;
  dbRows: number;
  deltaRows: number;
  s3MinDate?: Date | null;
  s3MaxDate?: Date | null;
  dbMinDate?: Date | null;
  dbMaxDate?: Date | null;
  status: Exclude<ReconciliationStatus, "unknown">;
  details?: Record<string, unknown>;
};

type SocialCoverageRecord = {
  dbMinDate: Date | null;
  dbMaxDate: Date | null;
  s3MinDate: Date | null;
  s3MaxDate: Date | null;
};

type SocialAccountsFilters = SocialOverviewFilters & {
  minPosts?: number;
  minExposure?: number;
};

type SocialAccountsRecord = {
  generatedAt: Date;
  lastEtlAt: Date | null;
  preset: SocialDatePreset;
  windowStart: string;
  windowEnd: string;
  minPosts: number;
  minExposure: number;
  items: Array<{
    accountName: string;
    channelMix: SocialChannel[];
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    erPonderado: number;
    sentimientoNeto: number;
    riesgoActivo: number;
    sovInterno: number;
    deltaExposure: number;
    deltaEngagement: number;
    deltaEr: number;
    meetsThreshold: boolean;
  }>;
};

type SocialRiskRecord = {
  generatedAt: Date;
  lastEtlAt: Date | null;
  preset: SocialDatePreset;
  windowStart: string;
  windowEnd: string;
  sentimentTrend: Array<{
    date: string;
    clasificados: number;
    positivos: number;
    negativos: number;
    neutrales: number;
    sentimientoNeto: number;
    riesgoActivo: number;
  }>;
  byChannel: Array<{
    channel: SocialChannel;
    clasificados: number;
    negativos: number;
    riesgoActivo: number;
  }>;
  byAccount: Array<{
    accountName: string;
    clasificados: number;
    negativos: number;
    riesgoActivo: number;
  }>;
  alerts: Array<{
    id: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    riskScore: number;
    classifiedItems: number;
    updatedAt: string;
    cooldownUntil: string | null;
  }>;
};

type SocialEtlQualityRecord = {
  generatedAt: Date;
  lastEtlAt: Date | null;
  coverage: SocialCoverageRecord;
  reconciliationStatus: ReconciliationStatus;
  reconciliationByChannel: Array<{
    channel: SocialChannel;
    s3Rows: number;
    dbRows: number;
    deltaRows: number;
    s3MinDate: string | null;
    s3MaxDate: string | null;
    dbMinDate: string | null;
    dbMaxDate: string | null;
    status: ReconciliationStatus;
    runId: string;
    createdAt: string;
  }>;
  runs: Array<{
    id: string;
    triggerType: TriggerType;
    status: RunStatus;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    currentPhase: SocialPhase | null;
    counters: SocialRunCounters;
    malformedRows: number;
    errorMessage: string | null;
  }>;
};

type UpdateSocialSettingsInput = {
  focusAccount?: string | null;
  targetQuarterlySovPp?: number;
  targetShs?: number;
  riskThreshold?: number;
  sentimentDropThreshold?: number;
  erDropThreshold?: number;
  alertCooldownMinutes?: number;
  metadata?: Record<string, unknown>;
};

type UpsertErTargetInput = {
  channel: SocialChannel;
  target2026Er?: number;
  source: "auto" | "manual";
  overrideReason?: string | null;
};

type SocialIncidentInput = {
  signalVersion: string;
  riskScore: number;
  classifiedItems: number;
  severityFloor?: IncidentSeverity;
  cooldownMinutes: number;
  payload: Record<string, unknown>;
};

type SocialIncidentResult = {
  mode: "created" | "escalated" | "updated" | "deduped";
  incidentId: string | null;
  severity: IncidentSeverity;
};

type PostsCursorPayload = {
  offset: number;
};

type PostCommentsCursorPayload = {
  offset: number;
};

type RunsCursorPayload = {
  offset: number;
};

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

const parseJsonObject = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const parseJsonTextArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
};

const extractHashtagsFromText = (value: string): string[] =>
  Array.from(
    new Set(
      (value.match(/#[a-zA-Z0-9_]+/g) ?? [])
        .map((item) => item.replace(/^#+/, "").toLowerCase())
        .map((item) => item.replace(/[^a-z0-9_]/g, ""))
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 20);

const parseDecimal = (value: string | null, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const SOCIAL_PHASES: SocialPhase[] = ["ingest", "classify", "aggregate", "reconcile", "alerts"];

const buildDefaultPhaseStatus = (): SocialPhaseStatusRecord => ({
  ingest: { status: "pending" },
  classify: { status: "pending" },
  aggregate: { status: "pending" },
  reconcile: { status: "pending" },
  alerts: { status: "pending" }
});

const parsePhaseStatus = (value: string | null): SocialPhaseStatusRecord | null => {
  const parsed = parseJsonObject(value);
  if (Object.keys(parsed).length === 0) return null;

  const fallback = buildDefaultPhaseStatus();
  let hasValidEntry = false;

  for (const phase of SOCIAL_PHASES) {
    const raw = parsed[phase];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const status = typeof row.status === "string" ? row.status : null;
    if (
      status !== "pending" &&
      status !== "running" &&
      status !== "completed" &&
      status !== "failed" &&
      status !== "skipped"
    ) {
      continue;
    }

    const snapshot: SocialPhaseSnapshot = { status };
    if (typeof row.startedAt === "string" && row.startedAt.trim()) snapshot.startedAt = row.startedAt.trim();
    if (typeof row.finishedAt === "string" && row.finishedAt.trim()) snapshot.finishedAt = row.finishedAt.trim();
    if (row.details && typeof row.details === "object" && !Array.isArray(row.details)) {
      snapshot.details = row.details as Record<string, unknown>;
    }
    fallback[phase] = snapshot;
    hasValidEntry = true;
  }

  return hasValidEntry ? fallback : null;
};

const toIsoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);

const normalizeSentiment = (value: string | null): SentimentBucket => {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "positive" || normalized === "positivo") return "positive";
  if (normalized === "negative" || normalized === "negativo") return "negative";
  if (normalized === "neutral" || normalized === "neutro") return "neutral";
  return "unknown";
};

const normalizeSentimentSource = (value: string | null): "awario" | "model" | "manual" => {
  if (!value) return "awario";
  const normalized = value.trim().toLowerCase();
  if (normalized === "model") return "model";
  if (normalized === "manual") return "manual";
  return "awario";
};

const calculateSentimientoNeto = (positivos: number, negativos: number, classifiedItems: number): number =>
  ((positivos - negativos) / Math.max(classifiedItems, 1)) * 100;

const calculateRiesgoActivo = (negativos: number, classifiedItems: number): number =>
  (negativos / Math.max(classifiedItems, 1)) * 100;

const calculateErGlobal = (engagementTotal: number, exposureTotal: number): number =>
  (engagementTotal / Math.max(exposureTotal, 1)) * 100;

const calculateShs = (input: {
  sentimientoNeto: number;
  riesgoActivo: number;
  exposureActual: number;
  exposurePrevious: number;
}): number => {
  const reputacionScore = clamp(50 + input.sentimientoNeto / 2, 0, 100);
  const alcanceScore = clamp((input.exposureActual / Math.max(input.exposurePrevious, 1)) * 100, 0, 100);
  const riesgoScore = 100 - input.riesgoActivo;
  return 0.5 * reputacionScore + 0.25 * alcanceScore + 0.25 * riesgoScore;
};

const toSeverity = (riskScore: number): IncidentSeverity => {
  if (riskScore >= 80) return "SEV1";
  if (riskScore >= 60) return "SEV2";
  if (riskScore >= 40) return "SEV3";
  return "SEV4";
};

const severityRank = (severity: IncidentSeverity): number => {
  if (severity === "SEV1") return 1;
  if (severity === "SEV2") return 2;
  if (severity === "SEV3") return 3;
  return 4;
};

const toSlaMinutes = (severity: IncidentSeverity): number => {
  if (severity === "SEV1") return 30;
  if (severity === "SEV2") return 4 * 60;
  return 24 * 60;
};

const addMinutes = (base: Date, minutes: number): Date => new Date(base.getTime() + minutes * 60_000);

const encodePostsCursor = (value: PostsCursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodePostsCursor = (value?: string): PostsCursorPayload | null => {
  if (!value) return { offset: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as PostsCursorPayload;
    if (!parsed || typeof parsed.offset !== "number" || parsed.offset < 0) return null;
    return { offset: Math.floor(parsed.offset) };
  } catch {
    return null;
  }
};

const encodePostCommentsCursor = (value: PostCommentsCursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodePostCommentsCursor = (value?: string): PostCommentsCursorPayload | null => {
  if (!value) return { offset: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as PostCommentsCursorPayload;
    if (!parsed || typeof parsed.offset !== "number" || parsed.offset < 0) return null;
    return { offset: Math.floor(parsed.offset) };
  } catch {
    return null;
  }
};

const encodeRunsCursor = (value: RunsCursorPayload): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeRunsCursor = (value?: string): RunsCursorPayload | null => {
  if (!value) return { offset: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as RunsCursorPayload;
    if (!parsed || typeof parsed.offset !== "number" || parsed.offset < 0) return null;
    return { offset: Math.floor(parsed.offset) };
  } catch {
    return null;
  }
};

const parseRunRow = (row: SqlRow | undefined): SocialSyncRunRecord | null => {
  const id = fieldString(row, 0);
  const triggerType = fieldString(row, 1) as TriggerType | null;
  const status = fieldString(row, 2) as RunStatus | null;
  const requestId = fieldString(row, 3);
  const queuedAt = fieldDate(row, 4);
  const startedAt = fieldDate(row, 5);
  const finishedAt = fieldDate(row, 6);
  const currentPhaseRaw = fieldString(row, 7);
  const phaseStatus = parsePhaseStatus(fieldString(row, 8));
  const metrics = parseJsonObject(fieldString(row, 9));
  const errorMessage = fieldString(row, 10);
  const createdAt = fieldDate(row, 11);

  if (!id || !triggerType || !status || !queuedAt || !createdAt) return null;
  const currentPhase =
    currentPhaseRaw === "ingest" ||
    currentPhaseRaw === "classify" ||
    currentPhaseRaw === "aggregate" ||
    currentPhaseRaw === "reconcile" ||
    currentPhaseRaw === "alerts"
      ? currentPhaseRaw
      : null;

  return {
    id,
    triggerType,
    status,
    requestId,
    queuedAt,
    startedAt,
    finishedAt,
    currentPhase,
    phaseStatus,
    metrics,
    errorMessage,
    createdAt
  };
};

const parseSettingsRow = (row: SqlRow | undefined): SocialDashboardSettingRecord | null => {
  const id = fieldString(row, 0);
  const key = fieldString(row, 1);
  const focusAccount = fieldString(row, 2);
  const targetQuarterlySovPp = parseDecimal(fieldString(row, 3), 5);
  const targetShs = parseDecimal(fieldString(row, 4), 70);
  const riskThreshold = parseDecimal(fieldString(row, 5), 60);
  const sentimentDropThreshold = parseDecimal(fieldString(row, 6), 10);
  const erDropThreshold = parseDecimal(fieldString(row, 7), 5);
  const alertCooldownMinutes = fieldLong(row, 8);
  const metadata = parseJsonObject(fieldString(row, 9));
  const updatedByUserId = fieldString(row, 10);
  const createdAt = fieldDate(row, 11);
  const updatedAt = fieldDate(row, 12);

  if (!id || !key || alertCooldownMinutes === null || !createdAt || !updatedAt) return null;

  return {
    id,
    key,
    focusAccount,
    targetQuarterlySovPp,
    targetShs,
    riskThreshold,
    sentimentDropThreshold,
    erDropThreshold,
    alertCooldownMinutes,
    metadata,
    updatedByUserId,
    createdAt,
    updatedAt
  };
};

const parseErTargetRow = (row: SqlRow | undefined): SocialErTargetRecord | null => {
  const id = fieldString(row, 0);
  const year = fieldLong(row, 1);
  const channelRaw = fieldString(row, 2);
  const channel =
    channelRaw === "facebook" || channelRaw === "instagram" || channelRaw === "linkedin" || channelRaw === "tiktok"
      ? channelRaw
      : null;
  const baselineEr = parseDecimal(fieldString(row, 3), 0);
  const momentumPct = parseDecimal(fieldString(row, 4), 0);
  const autoGrowthPct = parseDecimal(fieldString(row, 5), 0);
  const targetEr = parseDecimal(fieldString(row, 6), 0);
  const sourceRaw = fieldString(row, 7);
  const source = sourceRaw === "manual" ? "manual" : "auto";
  const overrideReason = fieldString(row, 8);
  const updatedByUserId = fieldString(row, 9);
  const createdAt = fieldDate(row, 10);
  const updatedAt = fieldDate(row, 11);

  if (!id || !year || !channel || !createdAt || !updatedAt) return null;

  return {
    id,
    year,
    channel,
    baselineEr,
    momentumPct,
    autoGrowthPct,
    targetEr,
    source,
    overrideReason,
    updatedByUserId,
    createdAt,
    updatedAt
  };
};

const parseReconciliationSnapshotRow = (row: SqlRow | undefined): SocialReconciliationSnapshotRecord | null => {
  const id = fieldString(row, 0);
  const runId = fieldString(row, 1);
  const channelRaw = fieldString(row, 2);
  const channel =
    channelRaw === "facebook" || channelRaw === "instagram" || channelRaw === "linkedin" || channelRaw === "tiktok"
      ? channelRaw
      : null;
  const s3Rows = parseDecimal(fieldString(row, 3), 0);
  const dbRows = parseDecimal(fieldString(row, 4), 0);
  const deltaRows = parseDecimal(fieldString(row, 5), 0);
  const s3MinDate = fieldDate(row, 6);
  const s3MaxDate = fieldDate(row, 7);
  const dbMinDate = fieldDate(row, 8);
  const dbMaxDate = fieldDate(row, 9);
  const statusRaw = fieldString(row, 10);
  const status =
    statusRaw === "ok" || statusRaw === "warning" || statusRaw === "error" || statusRaw === "unknown" ? statusRaw : null;
  const details = parseJsonObject(fieldString(row, 11));
  const createdAt = fieldDate(row, 12);

  if (!id || !runId || !channel || !status || !createdAt) return null;

  return {
    id,
    runId,
    channel,
    s3Rows: roundMetric(s3Rows),
    dbRows: roundMetric(dbRows),
    deltaRows: roundMetric(deltaRows),
    s3MinDate,
    s3MaxDate,
    dbMinDate,
    dbMaxDate,
    status,
    details,
    createdAt
  };
};

const parsePostRow = (row: SqlRow | undefined): SocialPostRecord | null => {
  const id = fieldString(row, 0);
  const contentItemId = fieldString(row, 1);
  const channel = fieldString(row, 2) as SocialChannel | null;
  const accountName = fieldString(row, 3);
  const externalPostId = fieldString(row, 4);
  const postUrl = fieldString(row, 5);
  const postType = fieldString(row, 6);
  const publishedAt = fieldDate(row, 7);
  const title = fieldString(row, 8);
  const text = fieldString(row, 9);
  const sentimentRaw = fieldString(row, 10);
  const sentimentConfidence = parseDecimal(fieldString(row, 11), NaN);
  const exposure = parseDecimal(fieldString(row, 12), 0);
  const engagementTotal = parseDecimal(fieldString(row, 13), 0);
  const impressions = parseDecimal(fieldString(row, 14), 0);
  const reach = parseDecimal(fieldString(row, 15), 0);
  const clicks = parseDecimal(fieldString(row, 16), 0);
  const likes = parseDecimal(fieldString(row, 17), 0);
  const comments = parseDecimal(fieldString(row, 18), 0);
  const shares = parseDecimal(fieldString(row, 19), 0);
  const views = parseDecimal(fieldString(row, 20), 0);
  const awarioCommentsCount = parseDecimal(fieldString(row, 21), 0);
  const sourceScore = parseDecimal(fieldString(row, 22), 0.5);
  const campaignKey = fieldString(row, 23);
  const strategyKeys = parseJsonTextArray(fieldString(row, 24));
  const hashtags = parseJsonTextArray(fieldString(row, 25));
  const createdAt = fieldDate(row, 26);
  const updatedAt = fieldDate(row, 27);

  if (!id || !contentItemId || !channel || !accountName || !externalPostId || !postUrl || !title || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    contentItemId,
    channel,
    accountName,
    externalPostId,
    postUrl,
    postType,
    publishedAt,
    title,
    text,
    sentiment: normalizeSentiment(sentimentRaw),
    sentimentRaw,
    sentimentConfidence: Number.isFinite(sentimentConfidence) ? sentimentConfidence : null,
    exposure,
    engagementTotal,
    impressions,
    reach,
    clicks,
    likes,
    comments,
    shares,
    views,
    awarioCommentsCount: Math.max(0, Math.floor(awarioCommentsCount)),
    sourceScore,
    campaignKey,
    strategyKeys,
    hashtags,
    createdAt,
    updatedAt
  };
};

const parsePostCommentRow = (row: SqlRow | undefined): SocialPostCommentRecord | null => {
  const id = fieldString(row, 0);
  const socialPostMetricId = fieldString(row, 1);
  const awarioMentionId = fieldString(row, 2);
  const awarioAlertId = fieldString(row, 3);
  const channel = fieldString(row, 4) as SocialChannel | null;
  const parentExternalPostId = fieldString(row, 5);
  const externalCommentId = fieldString(row, 6);
  const externalReplyCommentId = fieldString(row, 7);
  const commentUrl = fieldString(row, 8);
  const authorName = fieldString(row, 9);
  const authorProfileUrl = fieldString(row, 10);
  const publishedAt = fieldDate(row, 11);
  const text = fieldString(row, 12);
  const sentiment = normalizeSentiment(fieldString(row, 13));
  const sentimentSource = normalizeSentimentSource(fieldString(row, 14));
  const isSpam = fieldBoolean(row, 15);
  const relatedToPostText = fieldBoolean(row, 16);
  const needsReview = fieldBoolean(row, 17);
  const confidenceRaw = parseDecimal(fieldString(row, 18), NaN);
  const rawPayload = parseJsonObject(fieldString(row, 19));
  const createdAt = fieldDate(row, 20);
  const updatedAt = fieldDate(row, 21);

  if (
    !id ||
    !socialPostMetricId ||
    !awarioMentionId ||
    !awarioAlertId ||
    !channel ||
    !parentExternalPostId ||
    isSpam === null ||
    relatedToPostText === null ||
    needsReview === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    socialPostMetricId,
    awarioMentionId,
    awarioAlertId,
    channel,
    parentExternalPostId,
    externalCommentId,
    externalReplyCommentId,
    commentUrl,
    authorName,
    authorProfileUrl,
    publishedAt,
    text,
    sentiment,
    sentimentSource,
    isSpam,
    relatedToPostText,
    needsReview,
    confidence: Number.isFinite(confidenceRaw) ? confidenceRaw : null,
    rawPayload,
    createdAt,
    updatedAt
  };
};

const parseMetricRow = (row: SqlRow | undefined): SocialMetricRow | null => {
  const channel = fieldString(row, 0) as SocialChannel | null;
  const accountName = fieldString(row, 1);
  const exposure = parseDecimal(fieldString(row, 2), 0);
  const engagementTotal = parseDecimal(fieldString(row, 3), 0);
  const sourceScore = parseDecimal(fieldString(row, 4), 0.5);
  const sentimentRaw = fieldString(row, 5);
  const publishedAt = fieldDate(row, 6);

  if (!channel || !accountName || !publishedAt) return null;

  return {
    channel,
    accountName,
    exposure,
    engagementTotal,
    sourceScore,
    sentiment: normalizeSentiment(sentimentRaw),
    publishedAt
  };
};

const toMetricLong = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const parseRunCounters = (metrics: Record<string, unknown>): SocialRunCounters => ({
  objectsDiscovered: toMetricLong(metrics.objects_discovered),
  objectsProcessed: toMetricLong(metrics.objects_processed),
  objectsSkipped: toMetricLong(metrics.objects_skipped),
  rowsParsed: toMetricLong(metrics.rows_parsed),
  rowsPersisted: toMetricLong(metrics.rows_persisted),
  rowsClassified: toMetricLong(metrics.rows_classified),
  rowsPendingClassification: toMetricLong(metrics.rows_pending_classification),
  rowsUnknownSentiment: toMetricLong(metrics.rows_unknown_sentiment),
  malformedRows: toMetricLong(metrics.malformed_rows),
  anomalousObjectKeys: toMetricLong(metrics.anomalous_object_keys)
});

const metricRowsFromPosts = (posts: SocialPostRecord[]): SocialMetricRow[] =>
  posts.map((item) => ({
    channel: item.channel,
    accountName: item.accountName,
    exposure: item.exposure,
    engagementTotal: item.engagementTotal,
    sourceScore: item.sourceScore,
    sentiment: item.sentiment,
    publishedAt: item.publishedAt ?? item.createdAt
  }));

const computeGroupedMetrics = <T extends string>(
  rows: SocialMetricRow[],
  keySelector: (row: SocialMetricRow) => T
): Map<
  T,
  {
    posts: number;
    exposureTotal: number;
    engagementTotal: number;
    positivos: number;
    negativos: number;
    neutrales: number;
    unknown: number;
  }
> => {
  const grouped = new Map<
    T,
    {
      posts: number;
      exposureTotal: number;
      engagementTotal: number;
      positivos: number;
      negativos: number;
      neutrales: number;
      unknown: number;
    }
  >();

  for (const row of rows) {
    const key = keySelector(row);
    const current = grouped.get(key) ?? {
      posts: 0,
      exposureTotal: 0,
      engagementTotal: 0,
      positivos: 0,
      negativos: 0,
      neutrales: 0,
      unknown: 0
    };
    current.posts += 1;
    current.exposureTotal += row.exposure;
    current.engagementTotal += row.engagementTotal;

    if (row.sentiment === "positive") current.positivos += 1;
    else if (row.sentiment === "negative") current.negativos += 1;
    else if (row.sentiment === "neutral") current.neutrales += 1;
    else current.unknown += 1;

    grouped.set(key, current);
  }

  return grouped;
};

const BOGOTA_TIMEZONE = "America/Bogota";

const toDateOnlyUtc = (dateOnly: string): Date => {
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return new Date(Number.NaN);
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return new Date(Number.NaN);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const formatDateOnlyUtc = (value: Date): string => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysDateOnly = (dateOnly: string, days: number): string => {
  const base = toDateOnlyUtc(dateOnly);
  if (Number.isNaN(base.getTime())) return dateOnly;
  base.setUTCDate(base.getUTCDate() + days);
  return formatDateOnlyUtc(base);
};

const getBogotaDateOnly = (value: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);

const getWeekStartDateOnly = (dateOnly: string): string => {
  const base = toDateOnlyUtc(dateOnly);
  if (Number.isNaN(base.getTime())) return dateOnly;
  const day = base.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  base.setUTCDate(base.getUTCDate() - mondayOffset);
  return formatDateOnlyUtc(base);
};

const toIsoWeekLabel = (weekStartDateOnly: string): string => {
  const date = toDateOnlyUtc(weekStartDateOnly);
  if (Number.isNaN(date.getTime())) return weekStartDateOnly;

  // ISO week-year is anchored to the Thursday of the week.
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  working.setUTCDate(working.getUTCDate() + 3 - ((working.getUTCDay() + 6) % 7));
  const isoYear = working.getUTCFullYear();
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round((working.getTime() - week1.getTime()) / 86_400_000 / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

const toBogotaBoundaryIso = (dateOnly: string): string => {
  const base = toDateOnlyUtc(dateOnly);
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 5, 0, 0, 0)).toISOString();
};

const resolveTrendGranularity = (input: SocialTrendGranularity | undefined, windowDays: number): Exclude<SocialTrendGranularity, "auto"> => {
  if (input === "day" || input === "week" || input === "month") return input;
  if (windowDays > 365) return "month";
  if (windowDays > 90) return "week";
  return "day";
};

const resolveTrendBucket = (publishedAt: Date, granularity: Exclude<SocialTrendGranularity, "auto">): {
  key: string;
  bucketStart: string;
  bucketEnd: string;
  bucketLabel: string;
} => {
  const localDate = getBogotaDateOnly(publishedAt);

  if (granularity === "day") {
    return {
      key: localDate,
      bucketStart: localDate,
      bucketEnd: addDaysDateOnly(localDate, 1),
      bucketLabel: localDate
    };
  }

  if (granularity === "week") {
    const weekStart = getWeekStartDateOnly(localDate);
    return {
      key: weekStart,
      bucketStart: weekStart,
      bucketEnd: addDaysDateOnly(weekStart, 7),
      bucketLabel: toIsoWeekLabel(weekStart)
    };
  }

  const monthStart = `${localDate.slice(0, 7)}-01`;
  const monthStartDate = toDateOnlyUtc(monthStart);
  monthStartDate.setUTCMonth(monthStartDate.getUTCMonth() + 1);
  return {
    key: monthStart,
    bucketStart: monthStart,
    bucketEnd: formatDateOnlyUtc(monthStartDate),
    bucketLabel: localDate.slice(0, 7)
  };
};

const toDailyKey = (value: Date): string => getBogotaDateOnly(value);

const toBogotaMonth = (value: Date): number => {
  const dateOnly = getBogotaDateOnly(value);
  return Number.parseInt(dateOnly.slice(5, 7), 10) || 1;
};

const toBogotaWeekday = (value: Date): number => {
  const dateOnly = getBogotaDateOnly(value);
  const utc = toDateOnlyUtc(dateOnly);
  const raw = utc.getUTCDay();
  return raw === 0 ? 7 : raw;
};

const SOCIAL_CHANNELS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];

const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * 86_400_000);

const shiftYearsUtc = (value: Date, years: number): Date =>
  new Date(Date.UTC(value.getUTCFullYear() + years, value.getUTCMonth(), value.getUTCDate(), value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(), value.getUTCMilliseconds()));

const calcWindowDays = (start: Date, end: Date): number => Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

const resolveComparisonWindow = (
  mode: SocialComparisonMode | undefined,
  currentWindowStart: Date,
  currentWindowEnd: Date,
  comparisonDays?: number
): {
  modeApplied: SocialComparisonMode;
  previousWindowStart: Date;
  previousWindowEnd: Date;
  label: string;
} => {
  const modeApplied: SocialComparisonMode = mode ?? "same_period_last_year";
  if (modeApplied === "exact_days") {
    const days = Math.max(1, Math.floor(comparisonDays ?? calcWindowDays(currentWindowStart, currentWindowEnd)));
    return {
      modeApplied,
      previousWindowStart: addDays(currentWindowStart, -days),
      previousWindowEnd: currentWindowStart,
      label: `${days} dias exactos`
    };
  }

  if (modeApplied === "weekday_aligned_week") {
    return {
      modeApplied,
      previousWindowStart: addDays(currentWindowStart, -7),
      previousWindowEnd: addDays(currentWindowEnd, -7),
      label: "Ultima semana (coincidencia de dias)"
    };
  }

  return {
    modeApplied: "same_period_last_year",
    previousWindowStart: shiftYearsUtc(currentWindowStart, -1),
    previousWindowEnd: shiftYearsUtc(currentWindowEnd, -1),
    label: "Mismo periodo ano pasado"
  };
};

class SocialStore {
  constructor(private readonly rds: RdsDataClient) {}

  private postCommentSelectClause = `
    "id"::text,
    "socialPostMetricId"::text,
    "awarioMentionId",
    "awarioAlertId",
    "channel",
    "parentExternalPostId",
    "externalCommentId",
    "externalReplyCommentId",
    "commentUrl",
    "authorName",
    "authorProfileUrl",
    "publishedAt",
    "text",
    "sentiment",
    "sentimentSource",
    "isSpam",
    "relatedToPostText",
    "needsReview",
    "confidence"::text,
    "rawPayload"::text,
    "createdAt",
    "updatedAt"
  `;

  private async appendAudit(input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    requestId?: string | null;
    before?: unknown;
    after?: unknown;
  }, transactionId?: string): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."AuditLog"
          ("id", "actorUserId", "action", "resourceType", "resourceId", "requestId", "before", "after", "createdAt")
        VALUES
          (CAST(:id AS UUID), CAST(:actor_user_id AS UUID), :action, :resource_type, :resource_id, :request_id, CAST(:before AS JSONB), CAST(:after AS JSONB), NOW())
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlUuid("actor_user_id", input.actorUserId ?? null),
        sqlString("action", input.action),
        sqlString("resource_type", input.resourceType),
        sqlString("resource_id", input.resourceId ?? null),
        sqlString("request_id", input.requestId ?? null),
        sqlJson("before", input.before ?? null),
        sqlJson("after", input.after ?? null)
      ],
      { transactionId }
    );
  }

  private async ensureDefaultSettings(): Promise<SocialDashboardSettingRecord> {
    await this.rds.execute(
      `
        INSERT INTO "public"."SocialDashboardSetting"
          ("id", "key", "focusAccount", "targetQuarterlySovPp", "targetShs", "riskThreshold", "sentimentDropThreshold", "erDropThreshold", "alertCooldownMinutes", "metadata", "createdAt", "updatedAt")
        VALUES
          (CAST(:id AS UUID), 'default', :focus_account, CAST(:target_sov AS DECIMAL(6,2)), CAST(:target_shs AS DECIMAL(6,2)), CAST(:risk_threshold AS DECIMAL(6,2)), CAST(:sentiment_drop_threshold AS DECIMAL(6,2)), CAST(:er_drop_threshold AS DECIMAL(6,2)), :cooldown_minutes, CAST(:metadata AS JSONB), NOW(), NOW())
        ON CONFLICT ("key") DO NOTHING
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("focus_account", "Claro Colombia"),
        sqlString("target_sov", "5.00"),
        sqlString("target_shs", "70.00"),
        sqlString("risk_threshold", "60.00"),
        sqlString("sentiment_drop_threshold", "10.00"),
        sqlString("er_drop_threshold", "5.00"),
        sqlLong("cooldown_minutes", 60),
        sqlJson("metadata", { official: false, note: "social-only-v1" })
      ]
    );

    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "key",
          "focusAccount",
          "targetQuarterlySovPp"::text,
          "targetShs"::text,
          "riskThreshold"::text,
          "sentimentDropThreshold"::text,
          "erDropThreshold"::text,
          "alertCooldownMinutes",
          "metadata"::text,
          "updatedByUserId"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."SocialDashboardSetting"
        WHERE "key" = 'default'
        LIMIT 1
      `
    );

    const parsed = parseSettingsRow(response.records?.[0]);
    if (!parsed) {
      throw new Error("social_settings_default_parse_failed");
    }
    return parsed;
  }

  private normalizeOverviewWindow(filters: SocialOverviewFilters): {
    preset: SocialDatePreset;
    windowStart: Date;
    windowEnd: Date;
    windowDays: number;
  } {
    const now = new Date();
    const normalizedPreset: SocialDatePreset =
      filters.preset ??
      (filters.from && filters.to
        ? "custom"
        : filters.windowDays === 7
          ? "7d"
          : filters.windowDays === 30
            ? "30d"
            : filters.windowDays === 90
              ? "90d"
              : "all");

    const toSafeDate = (value: Date | undefined, fallback: Date): Date => {
      if (!value) return fallback;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) throw new AppStoreError("validation", "Invalid date filter");
      return parsed;
    };

    const toDayStartUtc = (year: number, monthIndex: number, day: number): Date => new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));

    const end = toSafeDate(filters.to, now);

    if (normalizedPreset === "custom") {
      const start = filters.from ? toSafeDate(filters.from, end) : null;
      if (!start) throw new AppStoreError("validation", "Custom preset requires from and to");
      if (start.getTime() >= end.getTime()) throw new AppStoreError("validation", "from must be before to");
      const windowDays = calcWindowDays(start, end);
      return { preset: normalizedPreset, windowStart: start, windowEnd: end, windowDays };
    }

    if (normalizedPreset === "all") {
      const start = toDayStartUtc(2024, 0, 1);
      const windowDays = calcWindowDays(start, end);
      return { preset: normalizedPreset, windowStart: start, windowEnd: end, windowDays };
    }

    if (normalizedPreset === "y2024") {
      const start = toDayStartUtc(2024, 0, 1);
      const finalEnd = toDayStartUtc(2025, 0, 1);
      const windowDays = calcWindowDays(start, finalEnd);
      return { preset: normalizedPreset, windowStart: start, windowEnd: finalEnd, windowDays };
    }

    if (normalizedPreset === "y2025") {
      const start = toDayStartUtc(2025, 0, 1);
      const finalEnd = toDayStartUtc(2026, 0, 1);
      const windowDays = calcWindowDays(start, finalEnd);
      return { preset: normalizedPreset, windowStart: start, windowEnd: finalEnd, windowDays };
    }

    if (normalizedPreset === "ytd") {
      const year = end.getUTCFullYear();
      const start = toDayStartUtc(year, 0, 1);
      const windowDays = calcWindowDays(start, end);
      return { preset: normalizedPreset, windowStart: start, windowEnd: end, windowDays };
    }

    if (normalizedPreset === "last_quarter") {
      const quarter = Math.floor(end.getUTCMonth() / 3);
      const prevQuarter = quarter === 0 ? 3 : quarter - 1;
      const year = quarter === 0 ? end.getUTCFullYear() - 1 : end.getUTCFullYear();
      const start = toDayStartUtc(year, prevQuarter * 3, 1);
      const finalEnd = toDayStartUtc(year, prevQuarter * 3 + 3, 1);
      return {
        preset: normalizedPreset,
        windowStart: start,
        windowEnd: finalEnd,
        windowDays: calcWindowDays(start, finalEnd)
      };
    }

    const windowDays = normalizedPreset === "7d" ? 7 : normalizedPreset === "30d" ? 30 : 90;
    const start = addDays(end, -windowDays);
    return { preset: normalizedPreset, windowStart: start, windowEnd: end, windowDays };
  }

  async getCoverage(): Promise<SocialCoverageRecord> {
    const [dbRangeRes, s3RangeRes] = await Promise.all([
      this.rds.execute(
        `
          SELECT
            MIN(COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt")),
            MAX(COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"))
          FROM "public"."SocialPostMetric" spm
          JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
          WHERE ci."sourceType" = CAST('social' AS "public"."SourceType")
        `
      ),
      this.rds.execute(
        `
          SELECT
            MIN("s3MinDate"),
            MAX("s3MaxDate")
          FROM "public"."SocialReconciliationSnapshot"
        `
      )
    ]);

    return {
      dbMinDate: fieldDate(dbRangeRes.records?.[0], 0),
      dbMaxDate: fieldDate(dbRangeRes.records?.[0], 1),
      s3MinDate: fieldDate(s3RangeRes.records?.[0], 0),
      s3MaxDate: fieldDate(s3RangeRes.records?.[0], 1)
    };
  }

  private sentimentFilterClause(sentiment: SentimentBucket | undefined): string {
    if (!sentiment) return "";
    if (sentiment === "positive") {
      return `AND LOWER(COALESCE(cls."sentimiento", '')) IN ('positive', 'positivo')`;
    }
    if (sentiment === "negative") {
      return `AND LOWER(COALESCE(cls."sentimiento", '')) IN ('negative', 'negativo')`;
    }
    if (sentiment === "neutral") {
      return `AND LOWER(COALESCE(cls."sentimiento", '')) IN ('neutral', 'neutro')`;
    }
    return `AND (
      cls."sentimiento" IS NULL
      OR TRIM(cls."sentimiento") = ''
      OR LOWER(cls."sentimiento") NOT IN ('positive', 'positivo', 'negative', 'negativo', 'neutral', 'neutro')
    )`;
  }

  private buildPostsWhere(filters: SocialOverviewFilters, windowStart: Date, windowEnd: Date): { clause: string; params: SqlParameter[] } {
    const conditions: string[] = [
      `COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :window_start`,
      `COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :window_end`,
      `ci."sourceType" = CAST('social' AS "public"."SourceType")`,
      `ci."state" = CAST('active' AS "public"."ContentState")`
    ];
    const params: SqlParameter[] = [sqlTimestamp("window_start", windowStart), sqlTimestamp("window_end", windowEnd)];

    const channelValues = Array.from(
      new Set([...(filters.channels ?? []), ...(filters.channel ? [filters.channel] : [])].filter(Boolean))
    );
    if (channelValues.length > 0) {
      const placeholders = channelValues.map((_, index) => `:channel_${index}`);
      conditions.push(`spm."channel" IN (${placeholders.join(", ")})`);
      for (const [index, value] of channelValues.entries()) {
        params.push(sqlString(`channel_${index}`, value));
      }
    }

    const accountValues = Array.from(
      new Set(
        [
          ...(filters.accounts ?? []),
          ...(filters.account && filters.account.trim() ? [filters.account.trim()] : [])
        ]
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .map((value) => value.toLowerCase())
      )
    );

    if (accountValues.length > 0) {
      const placeholders = accountValues.map((_, index) => `:account_name_${index}`);
      conditions.push(`LOWER(spm."accountName") IN (${placeholders.join(", ")})`);
      for (const [index, value] of accountValues.entries()) {
        params.push(sqlString(`account_name_${index}`, value));
      }
    }

    const rawPostTypes = Array.from(
      new Set(
        (filters.postTypes ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      )
    );

    if (rawPostTypes.length > 0) {
      const includesUnknown = rawPostTypes.includes("unknown");
      const knownPostTypes = rawPostTypes.filter((value) => value !== "unknown");
      const postTypeClauses: string[] = [];

      if (knownPostTypes.length > 0) {
        const placeholders = knownPostTypes.map((_, index) => `:post_type_${index}`);
        postTypeClauses.push(`LOWER(COALESCE(spm."postType", '')) IN (${placeholders.join(", ")})`);
        for (const [index, value] of knownPostTypes.entries()) {
          params.push(sqlString(`post_type_${index}`, value));
        }
      }

      if (includesUnknown) {
        postTypeClauses.push(`spm."postType" IS NULL OR BTRIM(spm."postType") = ''`);
      }

      if (postTypeClauses.length > 0) {
        conditions.push(`(${postTypeClauses.join(" OR ")})`);
      }
    }

    const campaignValues = Array.from(
      new Set(
        (filters.campaigns ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      )
    );
    if (campaignValues.length > 0) {
      const placeholders = campaignValues.map((_, index) => `:campaign_${index}`);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM "public"."TaxonomyEntry" te_campaign
          WHERE
            te_campaign."id" = spm."campaignTaxonomyId"
            AND LOWER(te_campaign."key") IN (${placeholders.join(", ")})
        )
      `);
      for (const [index, value] of campaignValues.entries()) {
        params.push(sqlString(`campaign_${index}`, value));
      }
    }

    const strategyValues = Array.from(
      new Set(
        (filters.strategies ?? [])
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      )
    );
    if (strategyValues.length > 0) {
      const placeholders = strategyValues.map((_, index) => `:strategy_${index}`);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM "public"."SocialPostStrategy" sps
          JOIN "public"."TaxonomyEntry" te_strategy ON te_strategy."id" = sps."taxonomyEntryId"
          WHERE
            sps."socialPostMetricId" = spm."id"
            AND LOWER(te_strategy."key") IN (${placeholders.join(", ")})
        )
      `);
      for (const [index, value] of strategyValues.entries()) {
        params.push(sqlString(`strategy_${index}`, value));
      }
    }

    const hashtagValues = Array.from(
      new Set(
        (filters.hashtags ?? [])
          .map((value) => value.trim().toLowerCase().replace(/^#+/, ""))
          .filter((value) => value.length > 0)
      )
    );
    if (hashtagValues.length > 0) {
      const placeholders = hashtagValues.map((_, index) => `:hashtag_${index}`);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM "public"."SocialPostHashtag" sph
          JOIN "public"."Hashtag" h ON h."id" = sph."hashtagId"
          WHERE
            sph."socialPostMetricId" = spm."id"
            AND LOWER(h."slug") IN (${placeholders.join(", ")})
        )
      `);
      for (const [index, value] of hashtagValues.entries()) {
        params.push(sqlString(`hashtag_${index}`, value));
      }
    }

    const sentimentClause = this.sentimentFilterClause(filters.sentiment);
    if (sentimentClause) conditions.push(sentimentClause.replace(/^AND /, ""));

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params
    };
  }

  private async listPostsRaw(filters: SocialOverviewFilters, windowStart: Date, windowEnd: Date, sort: SortMode, limit: number, offset: number): Promise<SocialPostRecord[]> {
    const { clause, params } = this.buildPostsWhere(filters, windowStart, windowEnd);
    const orderBy =
      sort === "exposure_desc"
        ? `spm."exposure" DESC, COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") DESC, spm."id" DESC`
        : sort === "engagement_desc"
          ? `spm."engagementTotal" DESC, COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") DESC, spm."id" DESC`
          : `COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") DESC, spm."id" DESC`;

    const response = await this.rds.execute(
      `
        SELECT
          spm."id"::text,
          spm."contentItemId"::text,
          spm."channel",
          spm."accountName",
          spm."externalPostId",
          spm."postUrl",
          spm."postType",
          COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"),
          ci."title",
          COALESCE(ci."summary", ci."content"),
          cls."sentimiento",
          cls."confianza"::text,
          spm."exposure"::text,
          spm."engagementTotal"::text,
          spm."impressions"::text,
          spm."reach"::text,
          spm."clicks"::text,
          spm."likes"::text,
          spm."comments"::text,
          spm."shares"::text,
          spm."views"::text,
          COALESCE(awario_comments."awario_comments_count", '0')::text,
          ci."sourceScore"::text,
          te_campaign."key",
          COALESCE(strategies."strategy_keys", '[]'::json)::text,
          COALESCE(hashtags."hashtag_slugs", '[]'::json)::text,
          spm."createdAt",
          spm."updatedAt"
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        LEFT JOIN "public"."TaxonomyEntry" te_campaign ON te_campaign."id" = spm."campaignTaxonomyId"
        LEFT JOIN LATERAL (
          SELECT
            c."sentimiento",
            c."confianza"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."isOverride" DESC, c."updatedAt" DESC, c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::text AS awario_comments_count
          FROM "public"."SocialPostComment" spc
          WHERE spc."socialPostMetricId" = spm."id"
        ) awario_comments ON TRUE
        LEFT JOIN LATERAL (
          SELECT to_json(COALESCE(array_agg(DISTINCT te_strategy."key"), ARRAY[]::text[])) AS strategy_keys
          FROM "public"."SocialPostStrategy" sps
          JOIN "public"."TaxonomyEntry" te_strategy ON te_strategy."id" = sps."taxonomyEntryId"
          WHERE sps."socialPostMetricId" = spm."id"
        ) strategies ON TRUE
        LEFT JOIN LATERAL (
          SELECT to_json(COALESCE(array_agg(DISTINCT h."slug"), ARRAY[]::text[])) AS hashtag_slugs
          FROM "public"."SocialPostHashtag" sph
          JOIN "public"."Hashtag" h ON h."id" = sph."hashtagId"
          WHERE sph."socialPostMetricId" = spm."id"
        ) hashtags ON TRUE
        ${clause}
        ORDER BY ${orderBy}
        LIMIT :limit OFFSET :offset
      `,
      [...params, sqlLong("limit", limit), sqlLong("offset", offset)]
    );

    return (response.records ?? []).map(parsePostRow).filter((item): item is SocialPostRecord => item !== null);
  }

  private async listMetricRowsRaw(
    filters: SocialOverviewFilters,
    windowStart: Date,
    windowEnd: Date,
    limit: number,
    offset: number
  ): Promise<SocialMetricRow[]> {
    const { clause, params } = this.buildPostsWhere(filters, windowStart, windowEnd);

    const response = await this.rds.execute(
      `
        SELECT
          spm."channel",
          spm."accountName",
          spm."exposure"::text,
          spm."engagementTotal"::text,
          ci."sourceScore"::text,
          cls."sentimiento",
          COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt")
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        LEFT JOIN LATERAL (
          SELECT
            c."sentimiento"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."isOverride" DESC, c."updatedAt" DESC, c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        ${clause}
        ORDER BY COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") DESC, spm."id" DESC
        LIMIT :limit OFFSET :offset
      `,
      [...params, sqlLong("limit", limit), sqlLong("offset", offset)]
    );

    return (response.records ?? []).map(parseMetricRow).filter((item): item is SocialMetricRow => item !== null);
  }

  async getSettings(): Promise<SocialDashboardSettingRecord> {
    return this.ensureDefaultSettings();
  }

  async updateSettings(input: {
    patch: UpdateSocialSettingsInput;
    actorUserId: string;
    requestId?: string;
  }): Promise<SocialDashboardSettingRecord> {
    if (!isUuid(input.actorUserId)) {
      throw new AppStoreError("validation", "Invalid actor user id");
    }

    const before = await this.ensureDefaultSettings();
    const tx = await this.rds.beginTransaction();

    try {
      const sets: string[] = [];
      const params: SqlParameter[] = [sqlString("key", "default"), sqlUuid("updated_by_user_id", input.actorUserId)];

      if (input.patch.focusAccount !== undefined) {
        sets.push(`"focusAccount" = :focus_account`);
        params.push(sqlString("focus_account", input.patch.focusAccount));
      }
      if (input.patch.targetQuarterlySovPp !== undefined) {
        sets.push(`"targetQuarterlySovPp" = CAST(:target_sov AS DECIMAL(6,2))`);
        params.push(sqlString("target_sov", String(clamp(input.patch.targetQuarterlySovPp, 0, 1000))));
      }
      if (input.patch.targetShs !== undefined) {
        sets.push(`"targetShs" = CAST(:target_shs AS DECIMAL(6,2))`);
        params.push(sqlString("target_shs", String(clamp(input.patch.targetShs, 0, 100))));
      }
      if (input.patch.riskThreshold !== undefined) {
        sets.push(`"riskThreshold" = CAST(:risk_threshold AS DECIMAL(6,2))`);
        params.push(sqlString("risk_threshold", String(clamp(input.patch.riskThreshold, 0, 100))));
      }
      if (input.patch.sentimentDropThreshold !== undefined) {
        sets.push(`"sentimentDropThreshold" = CAST(:sentiment_drop_threshold AS DECIMAL(6,2))`);
        params.push(sqlString("sentiment_drop_threshold", String(clamp(input.patch.sentimentDropThreshold, 0, 100))));
      }
      if (input.patch.erDropThreshold !== undefined) {
        sets.push(`"erDropThreshold" = CAST(:er_drop_threshold AS DECIMAL(6,2))`);
        params.push(sqlString("er_drop_threshold", String(clamp(input.patch.erDropThreshold, 0, 100))));
      }
      if (input.patch.alertCooldownMinutes !== undefined) {
        sets.push(`"alertCooldownMinutes" = :cooldown_minutes`);
        params.push(sqlLong("cooldown_minutes", Math.max(1, Math.floor(input.patch.alertCooldownMinutes))));
      }
      if (input.patch.metadata !== undefined) {
        sets.push(`"metadata" = CAST(:metadata AS JSONB)`);
        params.push(sqlJson("metadata", input.patch.metadata));
      }

      if (sets.length === 0) {
        throw new AppStoreError("conflict", "No changes requested");
      }

      sets.push(`"updatedByUserId" = CAST(:updated_by_user_id AS UUID)`);
      sets.push(`"updatedAt" = NOW()`);

      const updated = await this.rds.execute(
        `
          UPDATE "public"."SocialDashboardSetting"
          SET ${sets.join(", ")}
          WHERE "key" = :key
          RETURNING
            "id"::text,
            "key",
            "focusAccount",
            "targetQuarterlySovPp"::text,
            "targetShs"::text,
            "riskThreshold"::text,
            "sentimentDropThreshold"::text,
            "erDropThreshold"::text,
            "alertCooldownMinutes",
            "metadata"::text,
            "updatedByUserId"::text,
            "createdAt",
            "updatedAt"
        `,
        params,
        { transactionId: tx }
      );

      const after = parseSettingsRow(updated.records?.[0]);
      if (!after) {
        throw new Error("social_settings_update_parse_failed");
      }

      await this.appendAudit(
        {
          actorUserId: input.actorUserId,
          action: "social_settings_updated",
          resourceType: "SocialDashboardSetting",
          resourceId: after.id,
          requestId: input.requestId,
          before,
          after
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return after;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (error instanceof AppStoreError) throw error;
      throw new AppStoreError("validation", (error as Error).message);
    }
  }

  private runSelectClause = `
    "id"::text,
    "triggerType"::text,
    "status"::text,
    "requestId",
    "queuedAt",
    "startedAt",
    "finishedAt",
    "currentPhase",
    "phaseStatus"::text,
    "metrics"::text,
    "errorMessage",
    "createdAt"
  `;

  private async getRunById(runId: string): Promise<SocialSyncRunRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT ${this.runSelectClause}
        FROM "public"."SocialSyncRun"
        WHERE "id" = CAST(:run_id AS UUID)
        LIMIT 1
      `,
      [sqlUuid("run_id", runId)]
    );
    return parseRunRow(response.records?.[0]);
  }

  async queueSyncRun(input: { triggerType: TriggerType; requestId?: string }): Promise<SocialSyncRunRecord> {
    const phaseStatus = buildDefaultPhaseStatus();
    const response = await this.rds.execute(
      `
        INSERT INTO "public"."SocialSyncRun"
          ("id", "triggerType", "status", "requestId", "queuedAt", "phaseStatus", "createdAt")
        VALUES
          (CAST(:id AS UUID), CAST(:trigger_type AS "public"."TriggerType"), CAST('queued' AS "public"."RunStatus"), :request_id, NOW(), CAST(:phase_status AS JSONB), NOW())
        RETURNING
          ${this.runSelectClause}
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("trigger_type", input.triggerType),
        sqlString("request_id", input.requestId ?? null),
        sqlJson("phase_status", phaseStatus)
      ]
    );

    const parsed = parseRunRow(response.records?.[0]);
    if (!parsed) throw new Error("social_run_queue_parse_failed");
    return parsed;
  }

  async startSyncRun(input: { triggerType: TriggerType; requestId?: string; runId?: string }): Promise<SocialSyncRunRecord> {
    if (input.runId) {
      const existing = await this.getRunById(input.runId);
      if (!existing) {
        throw new AppStoreError("not_found", "Social run not found");
      }
      const nextPhaseStatus = existing.phaseStatus ?? buildDefaultPhaseStatus();
      const response = await this.rds.execute(
        `
          UPDATE "public"."SocialSyncRun"
          SET
            "status" = CAST('running' AS "public"."RunStatus"),
            "startedAt" = COALESCE("startedAt", NOW()),
            "requestId" = COALESCE("requestId", :request_id),
            "phaseStatus" = CAST(:phase_status AS JSONB),
            "errorMessage" = NULL
          WHERE "id" = CAST(:run_id AS UUID)
          RETURNING
            ${this.runSelectClause}
        `,
        [sqlString("request_id", input.requestId ?? null), sqlJson("phase_status", nextPhaseStatus), sqlUuid("run_id", input.runId)]
      );
      const parsed = parseRunRow(response.records?.[0]);
      if (!parsed) throw new Error("social_run_start_existing_parse_failed");
      return parsed;
    }

    const phaseStatus = buildDefaultPhaseStatus();
    const response = await this.rds.execute(
      `
        INSERT INTO "public"."SocialSyncRun"
          ("id", "triggerType", "status", "requestId", "queuedAt", "startedAt", "phaseStatus", "createdAt")
        VALUES
          (CAST(:id AS UUID), CAST(:trigger_type AS "public"."TriggerType"), CAST('running' AS "public"."RunStatus"), :request_id, NOW(), NOW(), CAST(:phase_status AS JSONB), NOW())
        RETURNING
          ${this.runSelectClause}
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlString("trigger_type", input.triggerType),
        sqlString("request_id", input.requestId ?? null),
        sqlJson("phase_status", phaseStatus)
      ]
    );

    const parsed = parseRunRow(response.records?.[0]);
    if (!parsed) throw new Error("social_run_start_parse_failed");
    return parsed;
  }

  async updateSyncRunPhase(input: {
    runId: string;
    phase: SocialPhase;
    state: SocialPhaseState;
    details?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
  }): Promise<void> {
    const existing = await this.getRunById(input.runId);
    if (!existing) {
      throw new AppStoreError("not_found", "Social run not found");
    }

    const now = new Date().toISOString();
    const phaseStatus = existing.phaseStatus ?? buildDefaultPhaseStatus();
    const current = phaseStatus[input.phase] ?? { status: "pending" as SocialPhaseState };
    const next: SocialPhaseSnapshot = {
      ...current,
      status: input.state
    };

    if (input.state === "running") {
      next.startedAt = current.startedAt ?? now;
      next.finishedAt = undefined;
    }
    if (input.state === "completed" || input.state === "failed" || input.state === "skipped") {
      next.startedAt = current.startedAt ?? now;
      next.finishedAt = now;
    }
    if (input.details) {
      next.details = input.details;
    }

    phaseStatus[input.phase] = next;
    const metrics = {
      ...(existing.metrics ?? {}),
      ...(input.metrics ?? {})
    };

    await this.rds.execute(
      `
        UPDATE "public"."SocialSyncRun"
        SET
          "currentPhase" = :current_phase,
          "phaseStatus" = CAST(:phase_status AS JSONB),
          "metrics" = CAST(:metrics AS JSONB),
          "startedAt" = CASE WHEN "startedAt" IS NULL THEN NOW() ELSE "startedAt" END
        WHERE "id" = CAST(:run_id AS UUID)
      `,
      [
        sqlString("current_phase", input.phase),
        sqlJson("phase_status", phaseStatus),
        sqlJson("metrics", metrics),
        sqlUuid("run_id", input.runId)
      ]
    );
  }

  async completeSyncRun(input: { runId: string; metrics: Record<string, unknown> }): Promise<SocialSyncRunRecord> {
    const existing = await this.getRunById(input.runId);
    const phaseStatus = existing?.phaseStatus ?? buildDefaultPhaseStatus();
    const now = new Date().toISOString();
    for (const phase of SOCIAL_PHASES) {
      const current = phaseStatus[phase] ?? { status: "pending" as SocialPhaseState };
      if (current.status === "completed" || current.status === "failed" || current.status === "skipped") continue;
      phaseStatus[phase] = {
        status: "completed",
        startedAt: current.startedAt ?? now,
        finishedAt: now,
        details: current.details
      };
    }

    const response = await this.rds.execute(
      `
        UPDATE "public"."SocialSyncRun"
        SET
          "status" = CAST('completed' AS "public"."RunStatus"),
          "finishedAt" = NOW(),
          "currentPhase" = NULL,
          "phaseStatus" = CAST(:phase_status AS JSONB),
          "metrics" = CAST(:metrics AS JSONB)
        WHERE "id" = CAST(:run_id AS UUID)
        RETURNING
          ${this.runSelectClause}
      `,
      [sqlJson("phase_status", phaseStatus), sqlJson("metrics", input.metrics), sqlUuid("run_id", input.runId)]
    );

    const parsed = parseRunRow(response.records?.[0]);
    if (!parsed) throw new Error("social_run_complete_parse_failed");
    return parsed;
  }

  async failSyncRun(input: { runId: string; errorMessage: string; metrics?: Record<string, unknown> }): Promise<void> {
    const existing = await this.getRunById(input.runId);
    const phaseStatus = existing?.phaseStatus ?? buildDefaultPhaseStatus();
    const currentPhase = existing?.currentPhase;
    if (currentPhase) {
      const now = new Date().toISOString();
      const current = phaseStatus[currentPhase] ?? { status: "pending" as SocialPhaseState };
      phaseStatus[currentPhase] = {
        status: "failed",
        startedAt: current.startedAt ?? now,
        finishedAt: now,
        details: current.details
      };
    }

    const mergedMetrics = {
      ...(existing?.metrics ?? {}),
      ...(input.metrics ?? {})
    };

    await this.rds.execute(
      `
        UPDATE "public"."SocialSyncRun"
        SET
          "status" = CAST('failed' AS "public"."RunStatus"),
          "finishedAt" = NOW(),
          "currentPhase" = NULL,
          "phaseStatus" = CAST(:phase_status AS JSONB),
          "errorMessage" = :error_message,
          "metrics" = CAST(:metrics_json AS JSONB)
        WHERE "id" = CAST(:run_id AS UUID)
      `,
      [
        sqlJson("phase_status", phaseStatus),
        sqlString("error_message", input.errorMessage.slice(0, 2000)),
        sqlJson("metrics_json", mergedMetrics),
        sqlUuid("run_id", input.runId)
      ]
    );
  }

  async isObjectProcessed(input: { bucket: string; objectKey: string; eTag: string; lastModified: Date }): Promise<boolean> {
    const response = await this.rds.execute(
      `
        SELECT 1
        FROM "public"."SocialSyncObject"
        WHERE
          "bucket" = :bucket
          AND "objectKey" = :object_key
          AND "eTag" = :etag
          AND "lastModified" = :last_modified
        LIMIT 1
      `,
      [
        sqlString("bucket", input.bucket),
        sqlString("object_key", input.objectKey),
        sqlString("etag", input.eTag),
        sqlTimestamp("last_modified", input.lastModified)
      ]
    );

    return Boolean(fieldString(response.records?.[0], 0));
  }

  async markObjectProcessed(input: { runId: string; bucket: string; objectKey: string; eTag: string; lastModified: Date }): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."SocialSyncObject"
          ("id", "runId", "bucket", "objectKey", "eTag", "lastModified", "createdAt")
        VALUES
          (CAST(:id AS UUID), CAST(:run_id AS UUID), :bucket, :object_key, :etag, :last_modified, NOW())
        ON CONFLICT ("bucket", "objectKey", "eTag", "lastModified") DO NOTHING
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlUuid("run_id", input.runId),
        sqlString("bucket", input.bucket),
        sqlString("object_key", input.objectKey),
        sqlString("etag", input.eTag),
        sqlTimestamp("last_modified", input.lastModified)
      ]
    );
  }

  private async replaceMetricHashtags(metricId: string, hashtags: string[], transactionId: string): Promise<void> {
    const normalizedHashtags = Array.from(
      new Set(
        hashtags
          .map((item) => item.trim().toLowerCase().replace(/^#+/, ""))
          .map((item) => item.replace(/[^a-z0-9_]/g, ""))
          .filter((item) => item.length >= 2)
      )
    ).slice(0, 20);

    await this.rds.execute(
      `DELETE FROM "public"."SocialPostHashtag" WHERE "socialPostMetricId" = CAST(:social_post_metric_id AS UUID)`,
      [sqlUuid("social_post_metric_id", metricId)],
      { transactionId }
    );
    for (const hashtag of normalizedHashtags) {
      const hashtagRes = await this.rds.execute(
        `
          INSERT INTO "public"."Hashtag"
            ("id", "slug", "display", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), :slug, :display, NOW(), NOW())
          ON CONFLICT ("slug") DO UPDATE
          SET "display" = EXCLUDED."display", "updatedAt" = NOW()
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("slug", hashtag),
          sqlString("display", `#${hashtag}`)
        ],
        { transactionId }
      );
      const hashtagId = fieldString(hashtagRes.records?.[0], 0);
      if (!hashtagId) continue;
      await this.rds.execute(
        `
          INSERT INTO "public"."SocialPostHashtag"
            ("id", "socialPostMetricId", "hashtagId", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:social_post_metric_id AS UUID), CAST(:hashtag_id AS UUID), NOW())
          ON CONFLICT ("socialPostMetricId", "hashtagId") DO NOTHING
        `,
        [sqlUuid("id", randomUUID()), sqlUuid("social_post_metric_id", metricId), sqlUuid("hashtag_id", hashtagId)],
        { transactionId }
      );
    }
  }

  private async replaceMetricStrategies(metricId: string, strategyTaxonomyIds: string[], transactionId: string): Promise<void> {
    await this.rds.execute(
      `DELETE FROM "public"."SocialPostStrategy" WHERE "socialPostMetricId" = CAST(:social_post_metric_id AS UUID)`,
      [sqlUuid("social_post_metric_id", metricId)],
      { transactionId }
    );
    for (const strategyTaxonomyId of strategyTaxonomyIds) {
      await this.rds.execute(
        `
          INSERT INTO "public"."SocialPostStrategy"
            ("id", "socialPostMetricId", "taxonomyEntryId", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:social_post_metric_id AS UUID), CAST(:taxonomy_entry_id AS UUID), NOW())
          ON CONFLICT ("socialPostMetricId", "taxonomyEntryId") DO NOTHING
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("social_post_metric_id", metricId),
          sqlUuid("taxonomy_entry_id", strategyTaxonomyId)
        ],
        { transactionId }
      );
    }
  }

  async upsertSocialPost(input: SocialPostUpsertInput): Promise<{ contentItemId: string }> {
    const canonicalUrl = input.postUrl.trim() || `social://${input.channel}/${input.externalPostId}`;
    const titleSource = (input.text ?? "").trim();
    const title = titleSource ? titleSource.slice(0, 180) : `${input.channel} post ${input.externalPostId}`;
    const summary = titleSource ? titleSource.slice(0, 500) : null;
    const content = titleSource || null;
    const sourceScore = clamp(input.sourceScore ?? 0.5, 0, 1);

    const tx = await this.rds.beginTransaction();
    try {
      const contentResponse = await this.rds.execute(
        `
          INSERT INTO "public"."ContentItem"
            ("id", "sourceType", "termId", "provider", "sourceName", "sourceId", "state", "title", "summary", "content", "canonicalUrl", "imageUrl", "language", "category", "publishedAt", "sourceScore", "rawPayloadS3Key", "metadata", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST('social' AS "public"."SourceType"), NULL, :provider, :source_name, :source_id, CAST('active' AS "public"."ContentState"), :title, :summary, :content, :canonical_url, :image_url, 'es', NULL, :published_at, CAST(:source_score AS DECIMAL(3,2)), :raw_payload_s3_key, CAST(:metadata AS JSONB), NOW(), NOW())
          ON CONFLICT ("canonicalUrl") DO UPDATE SET
            "sourceType" = CAST('social' AS "public"."SourceType"),
            "provider" = EXCLUDED."provider",
            "sourceName" = EXCLUDED."sourceName",
            "sourceId" = EXCLUDED."sourceId",
            "state" = CAST('active' AS "public"."ContentState"),
            "title" = EXCLUDED."title",
            "summary" = EXCLUDED."summary",
            "content" = EXCLUDED."content",
            "imageUrl" = EXCLUDED."imageUrl",
            "language" = EXCLUDED."language",
            "publishedAt" = EXCLUDED."publishedAt",
            "sourceScore" = EXCLUDED."sourceScore",
            "rawPayloadS3Key" = EXCLUDED."rawPayloadS3Key",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("provider", input.channel),
          sqlString("source_name", input.accountName),
          sqlString("source_id", input.externalPostId),
          sqlString("title", title),
          sqlString("summary", summary),
          sqlString("content", content),
          sqlString("canonical_url", canonicalUrl),
          sqlString("image_url", input.imageUrl ?? null),
          sqlTimestamp("published_at", input.publishedAt ?? null),
          sqlString("source_score", sourceScore.toFixed(2)),
          sqlString("raw_payload_s3_key", input.rawPayloadS3Key ?? null),
          sqlJson("metadata", {
            channel: input.channel,
            account_name: input.accountName,
            external_post_id: input.externalPostId,
            post_type: input.postType ?? null
          })
        ],
        { transactionId: tx }
      );

      const contentItemId = fieldString(contentResponse.records?.[0], 0);
      if (!contentItemId) {
        throw new Error("social_post_content_upsert_failed");
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."SocialPostMetric"
            ("id", "contentItemId", "channel", "accountName", "externalPostId", "postUrl", "postType", "campaignTaxonomyId", "publishedAt", "exposure", "engagementTotal", "impressions", "reach", "clicks", "likes", "comments", "shares", "views", "diagnostics", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST(:content_item_id AS UUID), :channel, :account_name, :external_post_id, :post_url, :post_type, CAST(:campaign_taxonomy_id AS UUID), :published_at, CAST(:exposure AS DECIMAL(18,2)), CAST(:engagement_total AS DECIMAL(18,2)), CAST(:impressions AS DECIMAL(18,2)), CAST(:reach AS DECIMAL(18,2)), CAST(:clicks AS DECIMAL(18,2)), CAST(:likes AS DECIMAL(18,2)), CAST(:comments AS DECIMAL(18,2)), CAST(:shares AS DECIMAL(18,2)), CAST(:views AS DECIMAL(18,2)), CAST(:diagnostics AS JSONB), NOW(), NOW())
          ON CONFLICT ("channel", "externalPostId") DO UPDATE SET
            "contentItemId" = EXCLUDED."contentItemId",
            "accountName" = EXCLUDED."accountName",
            "postUrl" = EXCLUDED."postUrl",
            "postType" = EXCLUDED."postType",
            "campaignTaxonomyId" = EXCLUDED."campaignTaxonomyId",
            "publishedAt" = EXCLUDED."publishedAt",
            "exposure" = EXCLUDED."exposure",
            "engagementTotal" = EXCLUDED."engagementTotal",
            "impressions" = EXCLUDED."impressions",
            "reach" = EXCLUDED."reach",
            "clicks" = EXCLUDED."clicks",
            "likes" = EXCLUDED."likes",
            "comments" = EXCLUDED."comments",
            "shares" = EXCLUDED."shares",
            "views" = EXCLUDED."views",
            "diagnostics" = EXCLUDED."diagnostics",
            "updatedAt" = NOW()
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("content_item_id", contentItemId),
          sqlString("channel", input.channel),
          sqlString("account_name", input.accountName),
          sqlString("external_post_id", input.externalPostId),
          sqlString("post_url", canonicalUrl),
          sqlString("post_type", input.postType ?? null),
          sqlUuid("campaign_taxonomy_id", input.campaignTaxonomyId ?? null),
          sqlTimestamp("published_at", input.publishedAt ?? null),
          sqlString("exposure", String(Math.max(0, input.exposure))),
          sqlString("engagement_total", String(Math.max(0, input.engagementTotal))),
          sqlString("impressions", String(Math.max(0, input.impressions ?? 0))),
          sqlString("reach", String(Math.max(0, input.reach ?? 0))),
          sqlString("clicks", String(Math.max(0, input.clicks ?? 0))),
          sqlString("likes", String(Math.max(0, input.likes ?? 0))),
          sqlString("comments", String(Math.max(0, input.comments ?? 0))),
          sqlString("shares", String(Math.max(0, input.shares ?? 0))),
          sqlString("views", String(Math.max(0, input.views ?? 0))),
          sqlJson("diagnostics", input.diagnostics ?? {})
        ],
        { transactionId: tx }
      );

      const metricRes = await this.rds.execute(
        `
          SELECT "id"::text
          FROM "public"."SocialPostMetric"
          WHERE "channel" = :channel AND "externalPostId" = :external_post_id
          LIMIT 1
        `,
        [sqlString("channel", input.channel), sqlString("external_post_id", input.externalPostId)],
        { transactionId: tx }
      );
      const metricId = fieldString(metricRes.records?.[0], 0);
      if (!metricId) throw new Error("social_post_metric_upsert_failed");
      await this.replaceMetricHashtags(metricId, input.hashtags ?? [], tx);
      await this.replaceMetricStrategies(metricId, input.strategyTaxonomyIds ?? [], tx);

      await this.rds.commitTransaction(tx);
      return { contentItemId };
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async upsertSentimentClassification(input: {
    contentItemId: string;
    sentimiento: "positivo" | "negativo" | "neutro" | "unknown";
    confianza: number | null;
    promptVersion: string;
    modelId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.rds.execute(
      `
        INSERT INTO "public"."Classification"
          ("id", "contentItemId", "categoria", "sentimiento", "etiquetas", "confianza", "promptVersion", "modelId", "isOverride", "metadata", "createdAt", "updatedAt")
        VALUES
          (CAST(:id AS UUID), CAST(:content_item_id AS UUID), :categoria, :sentimiento, CAST(:etiquetas AS JSONB), CAST(:confianza AS DECIMAL(4,3)), :prompt_version, :model_id, FALSE, CAST(:metadata AS JSONB), NOW(), NOW())
        ON CONFLICT ("contentItemId", "promptVersion", "modelId") DO UPDATE SET
          "categoria" = EXCLUDED."categoria",
          "sentimiento" = EXCLUDED."sentimiento",
          "etiquetas" = EXCLUDED."etiquetas",
          "confianza" = EXCLUDED."confianza",
          "isOverride" = FALSE,
          "metadata" = EXCLUDED."metadata",
          "updatedAt" = NOW()
      `,
      [
        sqlUuid("id", randomUUID()),
        sqlUuid("content_item_id", input.contentItemId),
        sqlString("categoria", "social_sentiment_v1"),
        sqlString("sentimiento", input.sentimiento),
        sqlJson("etiquetas", []),
        sqlString("confianza", input.confianza === null ? null : String(clamp(input.confianza, 0, 1))),
        sqlString("prompt_version", input.promptVersion),
        sqlString("model_id", input.modelId),
        sqlJson("metadata", input.metadata ?? {})
      ]
    );
  }

  async listRuns(limit: number, cursor?: string): Promise<SocialRunsPage> {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const payload = decodeRunsCursor(cursor);
    if (!payload) throw new AppStoreError("validation", "Invalid cursor");

    const response = await this.rds.execute(
      `
        SELECT
          ${this.runSelectClause}
        FROM "public"."SocialSyncRun"
        ORDER BY "queuedAt" DESC, "createdAt" DESC, "id" DESC
        LIMIT :limit OFFSET :offset
      `,
      [sqlLong("limit", safeLimit + 1), sqlLong("offset", payload.offset)]
    );

    const parsed = (response.records ?? []).map(parseRunRow).filter((item): item is SocialSyncRunRecord => item !== null);
    const hasNext = parsed.length > safeLimit;
    const items = parsed.slice(0, safeLimit);
    const nextCursor = hasNext ? encodeRunsCursor({ offset: payload.offset + safeLimit }) : null;

    return { items, nextCursor, hasNext };
  }

  async listPosts(filters: SocialPostsFilters): Promise<SocialPostsPage> {
    const safeLimit = Math.min(200, Math.max(1, filters.limit));
    const payload = decodePostsCursor(filters.cursor);
    if (!payload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const { windowStart, windowEnd } = this.normalizeOverviewWindow(filters);
    const rows = await this.listPostsRaw(filters, windowStart, windowEnd, filters.sort, safeLimit + 1, payload.offset);
    const hasNext = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit);

    return {
      items,
      hasNext,
      nextCursor: hasNext ? encodePostsCursor({ offset: payload.offset + safeLimit }) : null
    };
  }

  async listAllPosts(filters: SocialOverviewFilters, sort: SortMode = "published_at_desc", limit = 10000): Promise<SocialPostRecord[]> {
    const safeLimit = Math.min(100000, Math.max(1, Math.floor(limit)));
    const { windowStart, windowEnd } = this.normalizeOverviewWindow(filters);
    return this.listPostsRaw(filters, windowStart, windowEnd, sort, safeLimit, 0);
  }

  async listPostComments(filters: SocialPostCommentsFilters): Promise<SocialPostCommentsPage> {
    if (!isUuid(filters.postId)) {
      throw new AppStoreError("validation", "Invalid post id");
    }

    const safeLimit = Math.min(200, Math.max(1, Math.floor(filters.limit)));
    const payload = decodePostCommentsCursor(filters.cursor);
    if (!payload) {
      throw new AppStoreError("validation", "Invalid cursor");
    }

    const conditions: string[] = [`spc."socialPostMetricId" = CAST(:post_id AS UUID)`];
    const params: SqlParameter[] = [sqlUuid("post_id", filters.postId)];

    if (filters.sentiment) {
      conditions.push(`LOWER(COALESCE(spc."sentiment", 'unknown')) = :sentiment`);
      params.push(sqlString("sentiment", filters.sentiment));
    }
    if (filters.isSpam !== undefined) {
      conditions.push(`spc."isSpam" = :is_spam`);
      params.push(sqlBoolean("is_spam", filters.isSpam));
    }
    if (filters.relatedToPostText !== undefined) {
      conditions.push(`spc."relatedToPostText" = :related_to_post_text`);
      params.push(sqlBoolean("related_to_post_text", filters.relatedToPostText));
    }

    const response = await this.rds.execute(
      `
        SELECT
          ${this.postCommentSelectClause}
        FROM "public"."SocialPostComment" spc
        WHERE ${conditions.join(" AND ")}
        ORDER BY COALESCE(spc."publishedAt", spc."createdAt") DESC, spc."id" DESC
        LIMIT :limit OFFSET :offset
      `,
      [...params, sqlLong("limit", safeLimit + 1), sqlLong("offset", payload.offset)]
    );

    const rows = (response.records ?? []).map(parsePostCommentRow).filter((item): item is SocialPostCommentRecord => item !== null);
    const hasNext = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit);
    const nextCursor = hasNext ? encodePostCommentsCursor({ offset: payload.offset + safeLimit }) : null;

    return {
      items,
      hasNext,
      nextCursor
    };
  }

  async patchPostCommentOverride(input: SocialPostCommentOverrideInput): Promise<SocialPostCommentRecord> {
    if (!isUuid(input.commentId)) {
      throw new AppStoreError("validation", "Invalid comment id");
    }
    if (!isUuid(input.actorUserId)) {
      throw new AppStoreError("validation", "Invalid actor user id");
    }

    const tx = await this.rds.beginTransaction();

    try {
      const beforeRes = await this.rds.execute(
        `
          SELECT
            ${this.postCommentSelectClause}
          FROM "public"."SocialPostComment"
          WHERE "id" = CAST(:comment_id AS UUID)
          LIMIT 1
        `,
        [sqlUuid("comment_id", input.commentId)],
        { transactionId: tx }
      );
      const before = parsePostCommentRow(beforeRes.records?.[0]);
      if (!before) {
        throw new AppStoreError("not_found", "Comment not found");
      }

      const setParts: string[] = ['"updatedAt" = NOW()'];
      const params: SqlParameter[] = [sqlUuid("comment_id", input.commentId)];
      const beforePatch: Record<string, unknown> = {};
      const afterPatch: Record<string, unknown> = {};

      if (input.isSpam !== undefined) {
        setParts.push(`"isSpam" = :is_spam`);
        params.push(sqlBoolean("is_spam", input.isSpam));
        beforePatch.is_spam = before.isSpam;
        afterPatch.is_spam = input.isSpam;
      }
      if (input.relatedToPostText !== undefined) {
        setParts.push(`"relatedToPostText" = :related_to_post_text`);
        params.push(sqlBoolean("related_to_post_text", input.relatedToPostText));
        beforePatch.related_to_post_text = before.relatedToPostText;
        afterPatch.related_to_post_text = input.relatedToPostText;
      }
      if (input.sentiment !== undefined) {
        setParts.push(`"sentiment" = :sentiment`, `"sentimentSource" = 'manual'`);
        params.push(sqlString("sentiment", input.sentiment));
        beforePatch.sentiment = before.sentiment;
        afterPatch.sentiment = input.sentiment;
      }

      if (Object.keys(afterPatch).length === 0) {
        throw new AppStoreError("validation", "No fields to update");
      }

      const updateRes = await this.rds.execute(
        `
          UPDATE "public"."SocialPostComment"
          SET ${setParts.join(", ")}
          WHERE "id" = CAST(:comment_id AS UUID)
          RETURNING
            ${this.postCommentSelectClause}
        `,
        params,
        { transactionId: tx }
      );

      const after = parsePostCommentRow(updateRes.records?.[0]);
      if (!after) {
        throw new Error("Failed to parse updated comment");
      }

      await this.rds.execute(
        `
          INSERT INTO "public"."SocialPostCommentOverride"
            ("id", "socialPostCommentId", "actorUserId", "requestId", "reason", "before", "after", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:social_post_comment_id AS UUID), CAST(:actor_user_id AS UUID), :request_id, :reason, CAST(:before AS JSONB), CAST(:after AS JSONB), NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("social_post_comment_id", input.commentId),
          sqlUuid("actor_user_id", input.actorUserId),
          sqlString("request_id", input.requestId ?? null),
          sqlString("reason", input.reason ?? null),
          sqlJson("before", beforePatch),
          sqlJson("after", afterPatch)
        ],
        { transactionId: tx }
      );

      await this.appendAudit(
        {
          actorUserId: input.actorUserId,
          action: "social_post_comment_overridden",
          resourceType: "SocialPostComment",
          resourceId: input.commentId,
          requestId: input.requestId,
          before: beforePatch,
          after: afterPatch
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return after;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      if (error instanceof AppStoreError) throw error;
      throw new AppStoreError("validation", (error as Error).message);
    }
  }

  async resolvePostMatchForAwario(input: {
    channel: SocialChannel;
    parentExternalPostId: string;
    normalizedParentUrl?: string | null;
  }): Promise<{ socialPostMetricId: string; postText: string | null } | null> {
    const channel = input.channel.trim().toLowerCase() as SocialChannel;
    const parentExternalPostId = input.parentExternalPostId.trim();
    if (!parentExternalPostId) return null;

    const byExternalId = await this.rds.execute(
      `
        SELECT
          spm."id"::text,
          COALESCE(ci."content", ci."summary", ci."title")
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        WHERE
          LOWER(spm."channel") = :channel
          AND spm."externalPostId" = :external_post_id
        LIMIT 1
      `,
      [sqlString("channel", channel), sqlString("external_post_id", parentExternalPostId)]
    );
    const metricId = fieldString(byExternalId.records?.[0], 0);
    if (metricId) {
      return {
        socialPostMetricId: metricId,
        postText: fieldString(byExternalId.records?.[0], 1)
      };
    }

    if (!input.normalizedParentUrl) return null;

    const normalizedUrl = input.normalizedParentUrl.trim().toLowerCase();
    if (!normalizedUrl) return null;

    const byUrl = await this.rds.execute(
      `
        SELECT
          spm."id"::text,
          COALESCE(ci."content", ci."summary", ci."title")
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        WHERE
          LOWER(spm."channel") = :channel
          AND (
            LOWER(REGEXP_REPLACE(COALESCE(spm."postUrl", ''), '/+$', '')) = :normalized_url
            OR LOWER(REGEXP_REPLACE(COALESCE(ci."canonicalUrl", ''), '/+$', '')) = :normalized_url
          )
        LIMIT 1
      `,
      [sqlString("channel", channel), sqlString("normalized_url", normalizedUrl)]
    );
    const metricIdByUrl = fieldString(byUrl.records?.[0], 0);
    if (!metricIdByUrl) return null;
    return {
      socialPostMetricId: metricIdByUrl,
      postText: fieldString(byUrl.records?.[0], 1)
    };
  }

  async upsertAwarioComment(input: SocialPostCommentUpsertInput): Promise<{ status: "persisted" | "deduped"; id: string }> {
    if (!isUuid(input.socialPostMetricId)) {
      throw new AppStoreError("validation", "Invalid social post metric id");
    }
    if (!input.awarioMentionId?.trim()) {
      throw new AppStoreError("validation", "awarioMentionId is required");
    }

    const existingRes = await this.rds.execute(
      `
        SELECT "id"::text
        FROM "public"."SocialPostComment"
        WHERE "awarioMentionId" = :awario_mention_id
        LIMIT 1
      `,
      [sqlString("awario_mention_id", input.awarioMentionId.trim())]
    );
    const existingId = fieldString(existingRes.records?.[0], 0);
    if (existingId) {
      return { status: "deduped", id: existingId };
    }

    const id = randomUUID();
    await this.rds.execute(
      `
        INSERT INTO "public"."SocialPostComment"
          (
            "id",
            "socialPostMetricId",
            "awarioMentionId",
            "awarioAlertId",
            "channel",
            "parentExternalPostId",
            "externalCommentId",
            "externalReplyCommentId",
            "commentUrl",
            "authorName",
            "authorProfileUrl",
            "publishedAt",
            "text",
            "sentiment",
            "sentimentSource",
            "isSpam",
            "relatedToPostText",
            "needsReview",
            "confidence",
            "rawPayload",
            "createdAt",
            "updatedAt"
          )
        VALUES
          (
            CAST(:id AS UUID),
            CAST(:social_post_metric_id AS UUID),
            :awario_mention_id,
            :awario_alert_id,
            :channel,
            :parent_external_post_id,
            :external_comment_id,
            :external_reply_comment_id,
            :comment_url,
            :author_name,
            :author_profile_url,
            :published_at,
            :text,
            :sentiment,
            :sentiment_source,
            :is_spam,
            :related_to_post_text,
            :needs_review,
            CAST(:confidence AS DECIMAL(5,4)),
            CAST(:raw_payload AS JSONB),
            NOW(),
            NOW()
          )
      `,
      [
        sqlUuid("id", id),
        sqlUuid("social_post_metric_id", input.socialPostMetricId),
        sqlString("awario_mention_id", input.awarioMentionId.trim()),
        sqlString("awario_alert_id", input.awarioAlertId.trim()),
        sqlString("channel", input.channel),
        sqlString("parent_external_post_id", input.parentExternalPostId),
        sqlString("external_comment_id", input.externalCommentId ?? null),
        sqlString("external_reply_comment_id", input.externalReplyCommentId ?? null),
        sqlString("comment_url", input.commentUrl ?? null),
        sqlString("author_name", input.authorName ?? null),
        sqlString("author_profile_url", input.authorProfileUrl ?? null),
        sqlTimestamp("published_at", input.publishedAt ?? null),
        sqlString("text", input.text ?? null),
        sqlString("sentiment", input.sentiment ?? "unknown"),
        sqlString("sentiment_source", input.sentimentSource ?? "awario"),
        sqlBoolean("is_spam", input.isSpam ?? false),
        sqlBoolean("related_to_post_text", input.relatedToPostText ?? false),
        sqlBoolean("needs_review", input.needsReview ?? false),
        sqlString(
          "confidence",
          input.confidence === null || input.confidence === undefined ? null : String(clamp(input.confidence, 0, 1))
        ),
        sqlJson("raw_payload", input.rawPayload ?? {})
      ]
    );

    return { status: "persisted", id };
  }

  async backfillHashtags(limit = 5000): Promise<number> {
    const safeLimit = Math.min(50000, Math.max(1, Math.floor(limit)));
    const rows = await this.rds.execute(
      `
        SELECT
          spm."id"::text,
          COALESCE(ci."content", ci."summary", ci."title", '')
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        WHERE
          ci."sourceType" = CAST('social' AS "public"."SourceType")
          AND NOT EXISTS (
            SELECT 1
            FROM "public"."SocialPostHashtag" sph
            WHERE sph."socialPostMetricId" = spm."id"
          )
        ORDER BY spm."updatedAt" DESC
        LIMIT :limit
      `,
      [sqlLong("limit", safeLimit)]
    );

    let updated = 0;
    for (const row of rows.records ?? []) {
      const metricId = fieldString(row, 0);
      const text = fieldString(row, 1) ?? "";
      if (!metricId) continue;
      const hashtags = extractHashtagsFromText(text);
      const tx = await this.rds.beginTransaction();
      try {
        await this.replaceMetricHashtags(metricId, hashtags, tx);
        await this.rds.commitTransaction(tx);
        updated += 1;
      } catch (error) {
        await this.rds.rollbackTransaction(tx).catch(() => undefined);
        throw error;
      }
    }

    return updated;
  }

  private async getLatestRun(): Promise<SocialSyncRunRecord | null> {
    const response = await this.rds.execute(
      `
        SELECT
          ${this.runSelectClause}
        FROM "public"."SocialSyncRun"
        ORDER BY "queuedAt" DESC, "createdAt" DESC, "id" DESC
        LIMIT 1
      `
    );
    return parseRunRow(response.records?.[0]);
  }

  private async getLatestReconciliationByChannel(): Promise<SocialReconciliationSnapshotRecord[]> {
    const response = await this.rds.execute(
      `
        SELECT DISTINCT ON (s."channel")
          s."id"::text,
          s."runId"::text,
          s."channel",
          s."s3Rows"::text,
          s."dbRows"::text,
          s."deltaRows"::text,
          s."s3MinDate",
          s."s3MaxDate",
          s."dbMinDate",
          s."dbMaxDate",
          s."status",
          s."details"::text,
          s."createdAt"
        FROM "public"."SocialReconciliationSnapshot" s
        ORDER BY s."channel", s."createdAt" DESC, s."id" DESC
      `
    );

    return (response.records ?? [])
      .map(parseReconciliationSnapshotRow)
      .filter((item): item is SocialReconciliationSnapshotRecord => item !== null);
  }

  private deriveReconciliationStatus(rows: Array<{ status: ReconciliationStatus }>): ReconciliationStatus {
    if (rows.length === 0) return "unknown";
    if (rows.some((row) => row.status === "error")) return "error";
    if (rows.some((row) => row.status === "warning")) return "warning";
    if (rows.some((row) => row.status === "ok")) return "ok";
    return "unknown";
  }

  private countSentiments(rows: SocialMetricRow[]): {
    positivos: number;
    negativos: number;
    neutrales: number;
    unknown: number;
    classified: number;
  } {
    let positivos = 0;
    let negativos = 0;
    let neutrales = 0;
    let unknown = 0;
    for (const row of rows) {
      if (row.sentiment === "positive") positivos += 1;
      else if (row.sentiment === "negative") negativos += 1;
      else if (row.sentiment === "neutral") neutrales += 1;
      else unknown += 1;
    }
    return { positivos, negativos, neutrales, unknown, classified: positivos + negativos + neutrales };
  }

  private resolveTargetChannels(filters: SocialOverviewFilters): SocialChannel[] {
    const fromFilters = Array.from(new Set([...(filters.channels ?? []), ...(filters.channel ? [filters.channel] : [])]));
    return fromFilters.length > 0 ? fromFilters : [...SOCIAL_CHANNELS];
  }

  private async getStoredErTargets(year: number, channels: SocialChannel[]): Promise<Map<SocialChannel, SocialErTargetRecord>> {
    if (channels.length === 0) return new Map();
    const placeholders = channels.map((_, index) => `:channel_${index}`);
    const params: SqlParameter[] = [sqlLong("year", year)];
    for (const [index, channel] of channels.entries()) {
      params.push(sqlString(`channel_${index}`, channel));
    }

    const response = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "year",
          "channel",
          "baselineEr"::text,
          "momentumPct"::text,
          "autoGrowthPct"::text,
          "targetEr"::text,
          "source",
          "overrideReason",
          "updatedByUserId"::text,
          "createdAt",
          "updatedAt"
        FROM "public"."SocialKpiTarget"
        WHERE "year" = :year AND "channel" IN (${placeholders.join(", ")})
      `,
      params
    );

    const map = new Map<SocialChannel, SocialErTargetRecord>();
    for (const row of response.records ?? []) {
      const parsed = parseErTargetRow(row);
      if (!parsed) continue;
      map.set(parsed.channel, parsed);
    }
    return map;
  }

  private async buildErTargetRows(
    filters: SocialOverviewFilters,
    currentRows: SocialMetricRow[],
    year = 2026
  ): Promise<SocialErTargetItem[]> {
    const channels = this.resolveTargetChannels(filters);
    const currentByChannel = computeGroupedMetrics(currentRows, (row) => row.channel);

    const baselineFilters: SocialOverviewFilters = {
      ...filters,
      preset: "custom",
      from: new Date(Date.UTC(2025, 0, 1, 0, 0, 0, 0)),
      to: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0))
    };
    const rows2025 = await this.listMetricRowsRaw(baselineFilters, baselineFilters.from!, baselineFilters.to!, 100000, 0);

    const monthByChannel = new Map<
      SocialChannel,
      Map<number, { engagementTotal: number; exposureTotal: number }>
    >();
    const quarterByChannel = new Map<
      SocialChannel,
      { q1: { engagementTotal: number; exposureTotal: number }; q4: { engagementTotal: number; exposureTotal: number } }
    >();

    for (const row of rows2025) {
      const month = row.publishedAt.getUTCMonth();
      const channelMonths = monthByChannel.get(row.channel) ?? new Map<number, { engagementTotal: number; exposureTotal: number }>();
      const monthStats = channelMonths.get(month) ?? { engagementTotal: 0, exposureTotal: 0 };
      monthStats.engagementTotal += row.engagementTotal;
      monthStats.exposureTotal += row.exposure;
      channelMonths.set(month, monthStats);
      monthByChannel.set(row.channel, channelMonths);

      const quarterStats =
        quarterByChannel.get(row.channel) ?? {
          q1: { engagementTotal: 0, exposureTotal: 0 },
          q4: { engagementTotal: 0, exposureTotal: 0 }
        };
      if (month <= 2) {
        quarterStats.q1.engagementTotal += row.engagementTotal;
        quarterStats.q1.exposureTotal += row.exposure;
      }
      if (month >= 9) {
        quarterStats.q4.engagementTotal += row.engagementTotal;
        quarterStats.q4.exposureTotal += row.exposure;
      }
      quarterByChannel.set(row.channel, quarterStats);
    }

    const stored = await this.getStoredErTargets(year, channels);

    return channels.map((channel) => {
      const monthStats = monthByChannel.get(channel) ?? new Map<number, { engagementTotal: number; exposureTotal: number }>();
      const monthErs = Array.from(monthStats.values()).map((item) => calculateErGlobal(item.engagementTotal, item.exposureTotal));
      const baseline = monthErs.length > 0 ? monthErs.reduce((acc, value) => acc + value, 0) / monthErs.length : 0;
      const quarterStats = quarterByChannel.get(channel) ?? {
        q1: { engagementTotal: 0, exposureTotal: 0 },
        q4: { engagementTotal: 0, exposureTotal: 0 }
      };
      const erQ1 = calculateErGlobal(quarterStats.q1.engagementTotal, quarterStats.q1.exposureTotal);
      const erQ4 = calculateErGlobal(quarterStats.q4.engagementTotal, quarterStats.q4.exposureTotal);
      const momentumPct = (erQ4 - erQ1) / Math.max(erQ1, 0.01);
      const autoGrowthPct = clamp(0.5 * Math.max(momentumPct, 0) + 0.05, 0.03, 0.18);
      const autoTarget = baseline * (1 + autoGrowthPct);
      const storedTarget = stored.get(channel);
      const target = storedTarget?.source === "manual" ? storedTarget.targetEr : autoTarget;

      const currentStats = currentByChannel.get(channel) ?? {
        posts: 0,
        exposureTotal: 0,
        engagementTotal: 0
      };
      const currentEr = calculateErGlobal(currentStats.engagementTotal ?? 0, currentStats.exposureTotal ?? 0);
      const progressPct = (currentEr / Math.max(target, 0.001)) * 100;

      return {
        channel,
        baseline2025Er: roundMetric(storedTarget?.baselineEr ?? baseline),
        target2026Er: roundMetric(target),
        currentEr: roundMetric(currentEr),
        gap: roundMetric(currentEr - target),
        progressPct: roundMetric(progressPct),
        source: storedTarget?.source === "manual" ? "manual" : "auto"
      };
    });
  }

  async getOverview(filters: SocialOverviewFilters): Promise<SocialOverviewRecord> {
    const settings = await this.ensureDefaultSettings();
    const { preset, windowStart, windowEnd, windowDays } = this.normalizeOverviewWindow(filters);
    const comparison = resolveComparisonWindow(filters.comparisonMode, windowStart, windowEnd, filters.comparisonDays);
    const previousWindowStart = comparison.previousWindowStart;
    const previousWindowEnd = comparison.previousWindowEnd;

    const [currentRows, previousRows, latestRun, objectsRes, anomalousKeysRes, coverage, reconciliation] = await Promise.all([
      this.listMetricRowsRaw(filters, windowStart, windowEnd, 50000, 0),
      this.listMetricRowsRaw(filters, previousWindowStart, previousWindowEnd, 50000, 0),
      this.getLatestRun(),
      this.rds.execute(`SELECT COUNT(*)::bigint FROM "public"."SocialSyncObject"`),
      this.rds.execute(`SELECT COUNT(*)::bigint FROM "public"."SocialSyncObject" WHERE "objectKey" <> BTRIM("objectKey")`),
      this.getCoverage(),
      this.getLatestReconciliationByChannel()
    ]);
    const currentSent = this.countSentiments(currentRows);
    const previousSent = this.countSentiments(previousRows);

    const currentExposure = currentRows.reduce((acc, row) => acc + row.exposure, 0);
    const currentEngagement = currentRows.reduce((acc, row) => acc + row.engagementTotal, 0);
    const previousExposure = previousRows.reduce((acc, row) => acc + row.exposure, 0);
    const previousEngagement = previousRows.reduce((acc, row) => acc + row.engagementTotal, 0);

    const currentSentimientoNeto = calculateSentimientoNeto(currentSent.positivos, currentSent.negativos, currentSent.classified);
    const currentRiesgoActivo = calculateRiesgoActivo(currentSent.negativos, currentSent.classified);
    const currentEr = calculateErGlobal(currentEngagement, currentExposure);
    const currentShs = calculateShs({
      sentimientoNeto: currentSentimientoNeto,
      riesgoActivo: currentRiesgoActivo,
      exposureActual: currentExposure,
      exposurePrevious: previousExposure
    });

    const previousSentimientoNeto = calculateSentimientoNeto(previousSent.positivos, previousSent.negativos, previousSent.classified);
    const previousRiesgoActivo = calculateRiesgoActivo(previousSent.negativos, previousSent.classified);
    const previousEr = calculateErGlobal(previousEngagement, previousExposure);
    const previousShs = calculateShs({
      sentimientoNeto: previousSentimientoNeto,
      riesgoActivo: previousRiesgoActivo,
      exposureActual: previousExposure,
      exposurePrevious: Math.max(previousExposure, 1)
    });

    const maxExposure = Math.max(...currentRows.map((row) => row.exposure), 1);
    const accountContrib = new Map<string, number>();
    const channelContrib = new Map<SocialChannel, number>();
    let totalContrib = 0;
    for (const row of currentRows) {
      const qualityNorm = clamp(row.sourceScore, 0, 1);
      const exposureNorm = clamp(row.exposure / maxExposure, 0, 1);
      const contrib = 0.6 * qualityNorm + 0.4 * exposureNorm;
      totalContrib += contrib;
      accountContrib.set(row.accountName, (accountContrib.get(row.accountName) ?? 0) + contrib);
      channelContrib.set(row.channel, (channelContrib.get(row.channel) ?? 0) + contrib);
    }

    const prevMaxExposure = Math.max(...previousRows.map((row) => row.exposure), 1);
    const prevAccountContrib = new Map<string, number>();
    let prevTotalContrib = 0;
    for (const row of previousRows) {
      const qualityNorm = clamp(row.sourceScore, 0, 1);
      const exposureNorm = clamp(row.exposure / prevMaxExposure, 0, 1);
      const contrib = 0.6 * qualityNorm + 0.4 * exposureNorm;
      prevTotalContrib += contrib;
      prevAccountContrib.set(row.accountName, (prevAccountContrib.get(row.accountName) ?? 0) + contrib);
    }

    const focusAccount =
      settings.focusAccount && settings.focusAccount.trim()
        ? settings.focusAccount.trim()
        : Array.from(accountContrib.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const focusSov = focusAccount ? ((accountContrib.get(focusAccount) ?? 0) / Math.max(totalContrib, 1)) * 100 : 0;
    const previousFocusSov = focusAccount ? ((prevAccountContrib.get(focusAccount) ?? 0) / Math.max(prevTotalContrib, 1)) * 100 : 0;

    const byChannelStats = computeGroupedMetrics(currentRows, (row) => row.channel);
    const byAccountStats = computeGroupedMetrics(currentRows, (row) => row.accountName);
    const accountChannels = new Map<string, Set<SocialChannel>>();
    for (const row of currentRows) {
      const set = accountChannels.get(row.accountName) ?? new Set<SocialChannel>();
      set.add(row.channel);
      accountChannels.set(row.accountName, set);
    }

    const byChannel = Array.from(byChannelStats.entries())
      .map(([channel, stats]) => {
        const classified = stats.positivos + stats.negativos + stats.neutrales;
        return {
          channel,
          posts: stats.posts,
          exposureTotal: roundMetric(stats.exposureTotal),
          engagementTotal: roundMetric(stats.engagementTotal),
          erGlobal: roundMetric(calculateErGlobal(stats.engagementTotal, stats.exposureTotal)),
          sentimientoNeto: roundMetric(calculateSentimientoNeto(stats.positivos, stats.negativos, classified)),
          riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, classified)),
          sovInterno: roundMetric(((channelContrib.get(channel) ?? 0) / Math.max(totalContrib, 1)) * 100)
        };
      })
      .sort((a, b) => b.exposureTotal - a.exposureTotal || b.posts - a.posts);

    const byAccount = Array.from(byAccountStats.entries())
      .map(([accountName, stats]) => {
        const classified = stats.positivos + stats.negativos + stats.neutrales;
        return {
          accountName,
          channelMix: Array.from(accountChannels.get(accountName) ?? []),
          posts: stats.posts,
          exposureTotal: roundMetric(stats.exposureTotal),
          engagementTotal: roundMetric(stats.engagementTotal),
          erGlobal: roundMetric(calculateErGlobal(stats.engagementTotal, stats.exposureTotal)),
          sentimientoNeto: roundMetric(calculateSentimientoNeto(stats.positivos, stats.negativos, classified)),
          riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, classified)),
          sovInterno: roundMetric(((accountContrib.get(accountName) ?? 0) / Math.max(totalContrib, 1)) * 100)
        };
      })
      .sort((a, b) => b.sovInterno - a.sovInterno || b.exposureTotal - a.exposureTotal);

    const trendGranularityApplied = resolveTrendGranularity(filters.trendGranularity, windowDays);
    const trendMap = new Map<
      string,
      {
        bucketStart: string;
        bucketEnd: string;
        bucketLabel: string;
        posts: number;
        exposureTotal: number;
        engagementTotal: number;
        positivos: number;
        negativos: number;
        neutrales: number;
      }
    >();
    for (const row of currentRows) {
      const bucket = resolveTrendBucket(row.publishedAt, trendGranularityApplied);
      const current = trendMap.get(bucket.key) ?? {
        bucketStart: bucket.bucketStart,
        bucketEnd: bucket.bucketEnd,
        bucketLabel: bucket.bucketLabel,
        posts: 0,
        exposureTotal: 0,
        engagementTotal: 0,
        positivos: 0,
        negativos: 0,
        neutrales: 0
      };
      current.posts += 1;
      current.exposureTotal += row.exposure;
      current.engagementTotal += row.engagementTotal;
      if (row.sentiment === "positive") current.positivos += 1;
      if (row.sentiment === "negative") current.negativos += 1;
      if (row.sentiment === "neutral") current.neutrales += 1;
      trendMap.set(bucket.key, current);
    }

    const trendSeries = Array.from(trendMap.values())
      .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
      .map((stats, index, source) => {
        const classified = stats.positivos + stats.negativos + stats.neutrales;
        const previousExposureForShs = index > 0 ? source[index - 1].exposureTotal : stats.exposureTotal;
        const sentimientoNeto = calculateSentimientoNeto(stats.positivos, stats.negativos, classified);
        const riesgoActivo = calculateRiesgoActivo(stats.negativos, classified);
        return {
          bucketStart: toBogotaBoundaryIso(stats.bucketStart),
          bucketEnd: toBogotaBoundaryIso(stats.bucketEnd),
          bucketLabel: stats.bucketLabel,
          posts: stats.posts,
          exposureTotal: roundMetric(stats.exposureTotal),
          engagementTotal: roundMetric(stats.engagementTotal),
          erGlobal: roundMetric(calculateErGlobal(stats.engagementTotal, stats.exposureTotal)),
          sentimientoNeto: roundMetric(sentimientoNeto),
          riesgoActivo: roundMetric(riesgoActivo),
          shs: roundMetric(
            calculateShs({
              sentimientoNeto,
              riesgoActivo,
              exposureActual: stats.exposureTotal,
              exposurePrevious: previousExposureForShs
            })
          )
        };
      });

    const trendDaily = trendSeries.map((item) => ({
      date: item.bucketLabel,
      posts: item.posts,
      exposureTotal: item.exposureTotal,
      engagementTotal: item.engagementTotal,
      erGlobal: item.erGlobal,
      sentimientoNeto: item.sentimientoNeto,
      riesgoActivo: item.riesgoActivo
    }));

    const quarterlySovDeltaPp = focusSov - previousFocusSov;
    const quarterlySovProgressPct = (quarterlySovDeltaPp / Math.max(settings.targetQuarterlySovPp, 0.001)) * 100;
    const shsProgressPct = (currentShs / Math.max(settings.targetShs, 0.001)) * 100;
    const runCounters = latestRun ? parseRunCounters(latestRun.metrics) : parseRunCounters({});
    const erByChannel = await this.buildErTargetRows(filters, currentRows, 2026);

    return {
      generatedAt: new Date(),
      lastEtlAt: latestRun?.finishedAt ?? latestRun?.createdAt ?? null,
      preset,
      windowDays,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      comparison: {
        modeApplied: comparison.modeApplied,
        currentWindowStart: windowStart.toISOString(),
        currentWindowEnd: windowEnd.toISOString(),
        previousWindowStart: previousWindowStart.toISOString(),
        previousWindowEnd: previousWindowEnd.toISOString(),
        label: comparison.label
      },
      trendGranularityApplied,
      official: false,
      kpis: {
        posts: currentRows.length,
        exposureTotal: roundMetric(currentExposure),
        engagementTotal: roundMetric(currentEngagement),
        erGlobal: roundMetric(currentEr),
        classifiedItems: currentSent.classified,
        positivos: currentSent.positivos,
        negativos: currentSent.negativos,
        neutrales: currentSent.neutrales,
        sentimientoNeto: roundMetric(currentSentimientoNeto),
        riesgoActivo: roundMetric(currentRiesgoActivo),
        shs: roundMetric(currentShs),
        focusAccount,
        focusAccountSov: roundMetric(focusSov)
      },
      previousPeriod: {
        posts: previousRows.length,
        exposureTotal: roundMetric(previousExposure),
        engagementTotal: roundMetric(previousEngagement),
        erGlobal: roundMetric(previousEr),
        sentimientoNeto: roundMetric(previousSentimientoNeto),
        riesgoActivo: roundMetric(previousRiesgoActivo),
        shs: roundMetric(previousShs),
        focusAccountSov: roundMetric(previousFocusSov)
      },
      deltaVsPrevious: {
        posts: roundMetric(currentRows.length - previousRows.length),
        exposureTotal: roundMetric(currentExposure - previousExposure),
        engagementTotal: roundMetric(currentEngagement - previousEngagement),
        erGlobal: roundMetric(currentEr - previousEr),
        sentimientoNeto: roundMetric(currentSentimientoNeto - previousSentimientoNeto),
        riesgoActivo: roundMetric(currentRiesgoActivo - previousRiesgoActivo),
        shs: roundMetric(currentShs - previousShs),
        focusAccountSov: roundMetric(focusSov - previousFocusSov)
      },
      targetProgress: {
        quarterlySovTargetPp: roundMetric(settings.targetQuarterlySovPp),
        quarterlySovDeltaPp: roundMetric(quarterlySovDeltaPp),
        quarterlySovProgressPct: roundMetric(quarterlySovProgressPct),
        targetShs: roundMetric(settings.targetShs),
        shsGap: roundMetric(currentShs - settings.targetShs),
        shsProgressPct: roundMetric(shsProgressPct),
        erByChannel
      },
      trendSeries,
      trendDaily,
      byChannel,
      byAccount,
      diagnostics: {
        insufficientData: currentSent.classified < 20,
        unclassifiedItems: Math.max(currentRows.length - currentSent.classified, 0),
        unknownSentimentItems: currentSent.unknown,
        lastRunStatus: latestRun?.status ?? null,
        processedObjects: fieldLong(objectsRes.records?.[0], 0) ?? 0,
        anomalousObjectKeys: fieldLong(anomalousKeysRes.records?.[0], 0) ?? 0,
        rowsPendingClassification: runCounters.rowsPendingClassification,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString()
      },
      coverage: {
        dbMinDate: toIsoOrNull(coverage.dbMinDate),
        dbMaxDate: toIsoOrNull(coverage.dbMaxDate),
        s3MinDate: toIsoOrNull(coverage.s3MinDate),
        s3MaxDate: toIsoOrNull(coverage.s3MaxDate)
      },
      reconciliationStatus: this.deriveReconciliationStatus(reconciliation),
      settings
    };
  }

  async getErTargets(filters: SocialOverviewFilters, year = 2026): Promise<SocialErTargetsRecord> {
    const { windowStart, windowEnd } = this.normalizeOverviewWindow(filters);
    const [latestRun, currentRows] = await Promise.all([
      this.getLatestRun(),
      this.listMetricRowsRaw(filters, windowStart, windowEnd, 100000, 0)
    ]);
    const items = await this.buildErTargetRows(filters, currentRows, year);
    return {
      generatedAt: new Date(),
      lastEtlAt: latestRun?.finishedAt ?? latestRun?.createdAt ?? null,
      year,
      items
    };
  }

  async upsertErTargets(input: {
    actorUserId: string;
    requestId?: string;
    year?: number;
    targets: UpsertErTargetInput[];
  }): Promise<SocialErTargetsRecord> {
    if (!isUuid(input.actorUserId)) {
      throw new AppStoreError("validation", "Invalid actor user id");
    }
    const year = Math.max(2026, Math.floor(input.year ?? 2026));
    const normalizedTargets = input.targets.filter((item) => SOCIAL_CHANNELS.includes(item.channel));
    if (normalizedTargets.length === 0) {
      throw new AppStoreError("validation", "No ER targets received");
    }

    const baselineItems = await this.buildErTargetRows({}, [], year);
    const baselineByChannel = new Map<SocialChannel, SocialErTargetItem>();
    for (const item of baselineItems) baselineByChannel.set(item.channel, item);
    const before = await this.getStoredErTargets(year, normalizedTargets.map((item) => item.channel));
    const tx = await this.rds.beginTransaction();

    try {
      for (const target of normalizedTargets) {
        const baseline = baselineByChannel.get(target.channel);
        const baselineEr = baseline?.baseline2025Er ?? 0;
        const autoTarget = baseline?.target2026Er ?? 0;
        const growthPct = baselineEr > 0 ? autoTarget / baselineEr - 1 : 0;
        const finalTarget = target.source === "manual" ? Math.max(0, target.target2026Er ?? autoTarget) : autoTarget;

        await this.rds.execute(
          `
            INSERT INTO "public"."SocialKpiTarget"
              ("id", "year", "channel", "baselineEr", "momentumPct", "autoGrowthPct", "targetEr", "source", "overrideReason", "updatedByUserId", "createdAt", "updatedAt")
            VALUES
              (CAST(:id AS UUID), :year, :channel, CAST(:baseline_er AS DECIMAL(9,4)), CAST(:momentum_pct AS DECIMAL(9,4)), CAST(:auto_growth_pct AS DECIMAL(9,4)), CAST(:target_er AS DECIMAL(9,4)), :source, :override_reason, CAST(:updated_by_user_id AS UUID), NOW(), NOW())
            ON CONFLICT ("year", "channel") DO UPDATE SET
              "baselineEr" = EXCLUDED."baselineEr",
              "momentumPct" = EXCLUDED."momentumPct",
              "autoGrowthPct" = EXCLUDED."autoGrowthPct",
              "targetEr" = EXCLUDED."targetEr",
              "source" = EXCLUDED."source",
              "overrideReason" = EXCLUDED."overrideReason",
              "updatedByUserId" = EXCLUDED."updatedByUserId",
              "updatedAt" = NOW()
          `,
          [
            sqlUuid("id", randomUUID()),
            sqlLong("year", year),
            sqlString("channel", target.channel),
            sqlString("baseline_er", String(roundMetric(baselineEr))),
            sqlString("momentum_pct", "0"),
            sqlString("auto_growth_pct", String(roundMetric(growthPct))),
            sqlString("target_er", String(roundMetric(finalTarget))),
            sqlString("source", target.source),
            sqlString("override_reason", target.source === "manual" ? target.overrideReason ?? null : null),
            sqlUuid("updated_by_user_id", input.actorUserId)
          ],
          { transactionId: tx }
        );
      }

      const after = await this.getStoredErTargets(year, normalizedTargets.map((item) => item.channel));
      await this.appendAudit(
        {
          actorUserId: input.actorUserId,
          action: "social_er_targets_upserted",
          resourceType: "SocialKpiTarget",
          resourceId: String(year),
          requestId: input.requestId,
          before: Object.fromEntries(before.entries()),
          after: Object.fromEntries(after.entries())
        },
        tx
      );

      await this.rds.commitTransaction(tx);
      return this.getErTargets({}, year);
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async getHeatmap(filters: SocialOverviewFilters, metric: SocialHeatmapMetric): Promise<SocialHeatmapRecord> {
    const posts = await this.listAllPosts(filters, "published_at_desc", 100000);
    const cell = new Map<string, { posts: number; exposure: number; engagement: number; likes: number; comments: number; shares: number; views: number }>();

    for (const post of posts) {
      const refDate = post.publishedAt ?? post.createdAt;
      const month = toBogotaMonth(refDate);
      const weekday = toBogotaWeekday(refDate);
      const key = `${month}-${weekday}`;
      const current = cell.get(key) ?? { posts: 0, exposure: 0, engagement: 0, likes: 0, comments: 0, shares: 0, views: 0 };
      current.posts += 1;
      current.exposure += post.exposure;
      current.engagement += post.engagementTotal;
      current.likes += post.likes;
      current.comments += post.comments;
      current.shares += post.shares;
      current.views += post.views;
      cell.set(key, current);
    }

    const items: SocialHeatmapRecord["items"] = [];
    for (let month = 1; month <= 12; month += 1) {
      for (let weekday = 1; weekday <= 7; weekday += 1) {
        const current = cell.get(`${month}-${weekday}`) ?? { posts: 0, exposure: 0, engagement: 0, likes: 0, comments: 0, shares: 0, views: 0 };
        let value = 0;
        if (metric === "er") value = calculateErGlobal(current.engagement, current.exposure);
        else if (metric === "engagement_total") value = current.engagement;
        else if (metric === "likes") value = current.likes;
        else if (metric === "comments") value = current.comments;
        else if (metric === "shares") value = current.shares;
        else if (metric === "views") value = current.views;
        else value = (current.views / Math.max(current.exposure, 1)) * 100;
        items.push({ month, weekday, value: roundMetric(value), posts: current.posts });
      }
    }

    return {
      generatedAt: new Date(),
      metric,
      items
    };
  }

  async getScatter(filters: SocialOverviewFilters, dimension: SocialScatterDimension): Promise<SocialScatterRecord> {
    const posts = await this.listAllPosts(filters, "published_at_desc", 100000);
    const grouped = new Map<string, { posts: number; exposure: number; engagement: number }>();

    for (const post of posts) {
      const dimensions =
        dimension === "post_type"
          ? [post.postType ?? "unknown"]
          : dimension === "channel"
            ? [post.channel]
            : dimension === "account"
              ? [post.accountName]
              : dimension === "campaign"
                ? [post.campaignKey ?? "sin_campana"]
                : dimension === "strategy"
                  ? post.strategyKeys.length > 0
                    ? post.strategyKeys
                    : ["sin_estrategia"]
                  : post.hashtags.length > 0
                    ? post.hashtags
                    : ["sin_hashtag"];

      for (const label of dimensions) {
        const current = grouped.get(label) ?? { posts: 0, exposure: 0, engagement: 0 };
        current.posts += 1;
        current.exposure += post.exposure;
        current.engagement += post.engagementTotal;
        grouped.set(label, current);
      }
    }

    return {
      generatedAt: new Date(),
      dimension,
      items: Array.from(grouped.entries())
        .map(([label, stats]) => ({
          label,
          exposureTotal: roundMetric(stats.exposure),
          engagementTotal: roundMetric(stats.engagement),
          erGlobal: roundMetric(calculateErGlobal(stats.engagement, stats.exposure)),
          posts: stats.posts
        }))
        .sort((a, b) => b.exposureTotal - a.exposureTotal || b.posts - a.posts)
        .slice(0, 200)
    };
  }

  async getErBreakdown(filters: SocialOverviewFilters, dimension: SocialErBreakdownDimension): Promise<SocialErBreakdownRecord> {
    const posts = await this.listAllPosts(filters, "published_at_desc", 100000);
    const grouped = new Map<string, { posts: number; exposure: number; engagement: number }>();

    const stopWords = new Set([
      "de", "la", "el", "y", "en", "a", "que", "por", "con", "para", "del", "los", "las", "un", "una", "al", "se"
    ]);

    const window = this.normalizeOverviewWindow(filters);
    const windowDays = Math.max(1, calcWindowDays(window.windowStart, window.windowEnd));
    const accountPosts = new Map<string, number>();
    if (dimension === "publish_frequency") {
      for (const post of posts) {
        accountPosts.set(post.accountName, (accountPosts.get(post.accountName) ?? 0) + 1);
      }
    }

    for (const post of posts) {
      let labels: string[] = [];
      if (dimension === "hashtag") {
        labels = post.hashtags.length > 0 ? post.hashtags : ["sin_hashtag"];
      } else if (dimension === "word") {
        const source = `${post.title} ${post.text ?? ""}`.toLowerCase();
        labels = source
          .replace(/[^a-z0-9#_\\s]/g, " ")
          .split(/\\s+/)
          .map((item) => item.replace(/^#+/, ""))
          .filter((item) => item.length >= 4 && !stopWords.has(item))
          .slice(0, 3);
        if (labels.length === 0) labels = ["sin_palabra"];
      } else if (dimension === "post_type") {
        labels = [post.postType ?? "unknown"];
      } else if (dimension === "publish_frequency") {
        const count = accountPosts.get(post.accountName) ?? 0;
        const perDay = count / Math.max(windowDays, 1);
        labels = [perDay >= 3 ? "alta" : perDay >= 1 ? "media" : "baja"];
      } else {
        labels = [String(toBogotaWeekday(post.publishedAt ?? post.createdAt))];
      }

      for (const label of labels) {
        const current = grouped.get(label) ?? { posts: 0, exposure: 0, engagement: 0 };
        current.posts += 1;
        current.exposure += post.exposure;
        current.engagement += post.engagementTotal;
        grouped.set(label, current);
      }
    }

    return {
      generatedAt: new Date(),
      dimension,
      items: Array.from(grouped.entries())
        .map(([label, stats]) => ({
          label,
          posts: stats.posts,
          exposureTotal: roundMetric(stats.exposure),
          engagementTotal: roundMetric(stats.engagement),
          erGlobal: roundMetric(calculateErGlobal(stats.engagement, stats.exposure))
        }))
        .sort((a, b) => b.erGlobal - a.erGlobal || b.posts - a.posts)
        .slice(0, 100)
    };
  }

  async getAccounts(filters: SocialAccountsFilters): Promise<SocialAccountsRecord> {
    const minPosts = Math.max(1, Math.floor(filters.minPosts ?? 5));
    const minExposure = Math.max(0, Math.floor(filters.minExposure ?? 5000));
    const { preset, windowStart, windowEnd } = this.normalizeOverviewWindow(filters);
    const comparison = resolveComparisonWindow(filters.comparisonMode, windowStart, windowEnd, filters.comparisonDays);
    const previousWindowStart = comparison.previousWindowStart;
    const previousWindowEnd = comparison.previousWindowEnd;

    const [currentRows, previousRows, latestRun] = await Promise.all([
      this.listMetricRowsRaw(filters, windowStart, windowEnd, 50000, 0),
      this.listMetricRowsRaw(filters, previousWindowStart, previousWindowEnd, 50000, 0),
      this.getLatestRun()
    ]);

    const currentStats = computeGroupedMetrics(currentRows, (row) => row.accountName);
    const previousStats = computeGroupedMetrics(previousRows, (row) => row.accountName);
    const channelMix = new Map<string, Set<SocialChannel>>();
    for (const row of currentRows) {
      const set = channelMix.get(row.accountName) ?? new Set<SocialChannel>();
      set.add(row.channel);
      channelMix.set(row.accountName, set);
    }

    const maxExposure = Math.max(...currentRows.map((row) => row.exposure), 1);
    const accountContrib = new Map<string, number>();
    let totalContrib = 0;
    for (const row of currentRows) {
      const contrib = 0.6 * clamp(row.sourceScore, 0, 1) + 0.4 * clamp(row.exposure / maxExposure, 0, 1);
      totalContrib += contrib;
      accountContrib.set(row.accountName, (accountContrib.get(row.accountName) ?? 0) + contrib);
    }

    const items = Array.from(currentStats.entries())
      .map(([accountName, stats]) => {
        const classified = stats.positivos + stats.negativos + stats.neutrales;
        const previous = previousStats.get(accountName) ?? {
          posts: 0,
          exposureTotal: 0,
          engagementTotal: 0
        };
        const erPonderado = calculateErGlobal(stats.engagementTotal, stats.exposureTotal);
        const previousEr = calculateErGlobal(previous.engagementTotal ?? 0, previous.exposureTotal ?? 0);
        return {
          accountName,
          channelMix: Array.from(channelMix.get(accountName) ?? []),
          posts: stats.posts,
          exposureTotal: roundMetric(stats.exposureTotal),
          engagementTotal: roundMetric(stats.engagementTotal),
          erPonderado: roundMetric(erPonderado),
          sentimientoNeto: roundMetric(calculateSentimientoNeto(stats.positivos, stats.negativos, classified)),
          riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, classified)),
          sovInterno: roundMetric(((accountContrib.get(accountName) ?? 0) / Math.max(totalContrib, 1)) * 100),
          deltaExposure: roundMetric(stats.exposureTotal - (previous.exposureTotal ?? 0)),
          deltaEngagement: roundMetric(stats.engagementTotal - (previous.engagementTotal ?? 0)),
          deltaEr: roundMetric(erPonderado - previousEr),
          meetsThreshold: stats.posts >= minPosts && stats.exposureTotal >= minExposure
        };
      })
      .sort((a, b) => b.erPonderado - a.erPonderado || b.exposureTotal - a.exposureTotal);

    return {
      generatedAt: new Date(),
      lastEtlAt: latestRun?.finishedAt ?? latestRun?.createdAt ?? null,
      preset,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      minPosts,
      minExposure,
      items
    };
  }

  async getRisk(filters: SocialOverviewFilters): Promise<SocialRiskRecord> {
    const { preset, windowStart, windowEnd } = this.normalizeOverviewWindow(filters);

    const [rows, latestRun, alertsRes] = await Promise.all([
      this.listMetricRowsRaw(filters, windowStart, windowEnd, 50000, 0),
      this.getLatestRun(),
      this.rds.execute(
        `
          SELECT
            "id"::text,
            "severity"::text,
            "status"::text,
            "riskScore"::text,
            "classifiedItems",
            "updatedAt",
            "cooldownUntil"
          FROM "public"."Incident"
          WHERE
            "scope" = CAST('claro' AS "public"."TermScope")
            AND "signalVersion" = 'social-alert-v1'
            AND "status" IN ('open', 'acknowledged', 'in_progress')
          ORDER BY "updatedAt" DESC, "id" DESC
          LIMIT 30
        `
      )
    ]);
    const dayMap = new Map<string, { positivos: number; negativos: number; neutrales: number; clasificados: number }>();
    const byChannelMap = new Map<SocialChannel, { clasificados: number; negativos: number }>();
    const byAccountMap = new Map<string, { clasificados: number; negativos: number }>();

    for (const row of rows) {
      const day = toDailyKey(row.publishedAt);
      const dayCurrent = dayMap.get(day) ?? { positivos: 0, negativos: 0, neutrales: 0, clasificados: 0 };
      if (row.sentiment === "positive") {
        dayCurrent.positivos += 1;
        dayCurrent.clasificados += 1;
      } else if (row.sentiment === "negative") {
        dayCurrent.negativos += 1;
        dayCurrent.clasificados += 1;
      } else if (row.sentiment === "neutral") {
        dayCurrent.neutrales += 1;
        dayCurrent.clasificados += 1;
      }
      dayMap.set(day, dayCurrent);

      if (row.sentiment === "positive" || row.sentiment === "negative" || row.sentiment === "neutral") {
        const chCurrent = byChannelMap.get(row.channel) ?? { clasificados: 0, negativos: 0 };
        chCurrent.clasificados += 1;
        if (row.sentiment === "negative") chCurrent.negativos += 1;
        byChannelMap.set(row.channel, chCurrent);

        const acCurrent = byAccountMap.get(row.accountName) ?? { clasificados: 0, negativos: 0 };
        acCurrent.clasificados += 1;
        if (row.sentiment === "negative") acCurrent.negativos += 1;
        byAccountMap.set(row.accountName, acCurrent);
      }
    }

    const sentimentTrend = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({
        date,
        clasificados: stats.clasificados,
        positivos: stats.positivos,
        negativos: stats.negativos,
        neutrales: stats.neutrales,
        sentimientoNeto: roundMetric(calculateSentimientoNeto(stats.positivos, stats.negativos, stats.clasificados)),
        riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, stats.clasificados))
      }));

    const byChannel = Array.from(byChannelMap.entries())
      .map(([channel, stats]) => ({
        channel,
        clasificados: stats.clasificados,
        negativos: stats.negativos,
        riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, stats.clasificados))
      }))
      .sort((a, b) => b.riesgoActivo - a.riesgoActivo || b.negativos - a.negativos);

    const byAccount = Array.from(byAccountMap.entries())
      .map(([accountName, stats]) => ({
        accountName,
        clasificados: stats.clasificados,
        negativos: stats.negativos,
        riesgoActivo: roundMetric(calculateRiesgoActivo(stats.negativos, stats.clasificados))
      }))
      .sort((a, b) => b.riesgoActivo - a.riesgoActivo || b.negativos - a.negativos);

    const alerts = (alertsRes.records ?? []).map((row) => {
      const severity = fieldString(row, 1) as IncidentSeverity | null;
      const status = fieldString(row, 2) as IncidentStatus | null;
      if (!severity || !status) return null;
      return {
        id: fieldString(row, 0) ?? "",
        severity,
        status,
        riskScore: roundMetric(parseDecimal(fieldString(row, 3), 0)),
        classifiedItems: fieldLong(row, 4) ?? 0,
        updatedAt: fieldDate(row, 5)?.toISOString() ?? new Date().toISOString(),
        cooldownUntil: fieldDate(row, 6)?.toISOString() ?? null
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null && Boolean(item.id));

    return {
      generatedAt: new Date(),
      lastEtlAt: latestRun?.finishedAt ?? latestRun?.createdAt ?? null,
      preset,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      sentimentTrend,
      byChannel,
      byAccount,
      alerts
    };
  }

  async getEtlQuality(limitRuns = 20): Promise<SocialEtlQualityRecord> {
    const [latestRun, coverage, reconciliationByChannel, runsPage] = await Promise.all([
      this.getLatestRun(),
      this.getCoverage(),
      this.getLatestReconciliationByChannel(),
      this.listRuns(Math.max(1, Math.min(100, limitRuns)))
    ]);

    return {
      generatedAt: new Date(),
      lastEtlAt: latestRun?.finishedAt ?? latestRun?.createdAt ?? null,
      coverage,
      reconciliationStatus: this.deriveReconciliationStatus(reconciliationByChannel),
      reconciliationByChannel: reconciliationByChannel.map((item) => ({
        channel: item.channel,
        s3Rows: item.s3Rows,
        dbRows: item.dbRows,
        deltaRows: item.deltaRows,
        s3MinDate: toIsoOrNull(item.s3MinDate),
        s3MaxDate: toIsoOrNull(item.s3MaxDate),
        dbMinDate: toIsoOrNull(item.dbMinDate),
        dbMaxDate: toIsoOrNull(item.dbMaxDate),
        status: item.status,
        runId: item.runId,
        createdAt: item.createdAt.toISOString()
      })),
      runs: runsPage.items.map((item) => {
        const counters = parseRunCounters(item.metrics);
        return {
          id: item.id,
          triggerType: item.triggerType,
          status: item.status,
          queuedAt: item.queuedAt.toISOString(),
          startedAt: toIsoOrNull(item.startedAt),
          finishedAt: toIsoOrNull(item.finishedAt),
          currentPhase: item.currentPhase,
          counters,
          malformedRows: counters.malformedRows,
          errorMessage: item.errorMessage
        };
      })
    };
  }

  async saveReconciliationSnapshots(input: { runId: string; snapshots: SocialReconciliationSnapshotInput[] }): Promise<void> {
    await this.rds.execute(`DELETE FROM "public"."SocialReconciliationSnapshot" WHERE "runId" = CAST(:run_id AS UUID)`, [
      sqlUuid("run_id", input.runId)
    ]);

    for (const snapshot of input.snapshots) {
      await this.rds.execute(
        `
          INSERT INTO "public"."SocialReconciliationSnapshot"
            ("id", "runId", "channel", "s3Rows", "dbRows", "deltaRows", "s3MinDate", "s3MaxDate", "dbMinDate", "dbMaxDate", "status", "details", "createdAt")
          VALUES
            (CAST(:id AS UUID), CAST(:run_id AS UUID), :channel, CAST(:s3_rows AS DECIMAL(18,2)), CAST(:db_rows AS DECIMAL(18,2)), CAST(:delta_rows AS DECIMAL(18,2)), :s3_min_date, :s3_max_date, :db_min_date, :db_max_date, :status, CAST(:details AS JSONB), NOW())
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlUuid("run_id", input.runId),
          sqlString("channel", snapshot.channel),
          sqlString("s3_rows", String(Math.max(0, snapshot.s3Rows))),
          sqlString("db_rows", String(Math.max(0, snapshot.dbRows))),
          sqlString("delta_rows", String(snapshot.deltaRows)),
          sqlTimestamp("s3_min_date", snapshot.s3MinDate ?? null),
          sqlTimestamp("s3_max_date", snapshot.s3MaxDate ?? null),
          sqlTimestamp("db_min_date", snapshot.dbMinDate ?? null),
          sqlTimestamp("db_max_date", snapshot.dbMaxDate ?? null),
          sqlString("status", snapshot.status),
          sqlJson("details", snapshot.details ?? {})
        ]
      );
    }
  }

  async getDbStatsByChannel(input: { from?: Date; to?: Date } = {}): Promise<
    Record<SocialChannel, { rows: number; minDate: Date | null; maxDate: Date | null }>
  > {
    const conditions = [`ci."sourceType" = CAST('social' AS "public"."SourceType")`];
    const params: SqlParameter[] = [];

    if (input.from) {
      conditions.push(`COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_date`);
      params.push(sqlTimestamp("from_date", input.from));
    }
    if (input.to) {
      conditions.push(`COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_date`);
      params.push(sqlTimestamp("to_date", input.to));
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const response = await this.rds.execute(
      `
        SELECT
          spm."channel",
          COUNT(*)::bigint,
          MIN(COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt")),
          MAX(COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"))
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        ${whereClause}
        GROUP BY spm."channel"
      `,
      params
    );

    const seed: Record<SocialChannel, { rows: number; minDate: Date | null; maxDate: Date | null }> = {
      facebook: { rows: 0, minDate: null, maxDate: null },
      instagram: { rows: 0, minDate: null, maxDate: null },
      linkedin: { rows: 0, minDate: null, maxDate: null },
      tiktok: { rows: 0, minDate: null, maxDate: null }
    };

    for (const row of response.records ?? []) {
      const channel = fieldString(row, 0) as SocialChannel | null;
      if (!channel || !(channel in seed)) continue;
      seed[channel] = {
        rows: fieldLong(row, 1) ?? 0,
        minDate: fieldDate(row, 2),
        maxDate: fieldDate(row, 3)
      };
    }
    return seed;
  }

  async rebuildAccountDailyAggregates(input: { from: Date; to: Date; channels?: SocialChannel[] }): Promise<number> {
    const channelFilter =
      input.channels && input.channels.length > 0
        ? `AND spm."channel" IN (${input.channels.map((channel) => `'${channel}'`).join(", ")})`
        : "";
    const deleteFilter =
      input.channels && input.channels.length > 0
        ? `AND "channel" IN (${input.channels.map((channel) => `'${channel}'`).join(", ")})`
        : "";

    const rowsRes = await this.rds.execute(
      `
        SELECT
          DATE_TRUNC('day', COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt"))::date::text AS agg_date,
          spm."channel",
          spm."accountName",
          COUNT(*)::bigint,
          SUM(spm."exposure")::text,
          SUM(spm."engagementTotal")::text,
          SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('positive', 'positivo') THEN 1 ELSE 0 END)::bigint,
          SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('negative', 'negativo') THEN 1 ELSE 0 END)::bigint,
          SUM(CASE WHEN LOWER(COALESCE(cls."sentimiento", '')) IN ('neutral', 'neutro') THEN 1 ELSE 0 END)::bigint
        FROM "public"."SocialPostMetric" spm
        JOIN "public"."ContentItem" ci ON ci."id" = spm."contentItemId"
        LEFT JOIN LATERAL (
          SELECT c."sentimiento"
          FROM "public"."Classification" c
          WHERE c."contentItemId" = ci."id"
          ORDER BY c."isOverride" DESC, c."updatedAt" DESC, c."createdAt" DESC
          LIMIT 1
        ) cls ON TRUE
        WHERE
          ci."sourceType" = CAST('social' AS "public"."SourceType")
          AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") >= :from_date
          AND COALESCE(spm."publishedAt", ci."publishedAt", ci."createdAt") < :to_date
          ${channelFilter}
        GROUP BY agg_date, spm."channel", spm."accountName"
      `,
      [sqlTimestamp("from_date", input.from), sqlTimestamp("to_date", input.to)]
    );

    await this.rds.execute(
      `
        DELETE FROM "public"."SocialAccountDailyAggregate"
        WHERE "date" >= CAST(:from_date AS DATE) AND "date" < CAST(:to_date AS DATE)
        ${deleteFilter}
      `,
      [sqlString("from_date", input.from.toISOString().slice(0, 10)), sqlString("to_date", input.to.toISOString().slice(0, 10))]
    );

    let inserted = 0;
    for (const row of rowsRes.records ?? []) {
      const dateText = fieldString(row, 0);
      const channel = fieldString(row, 1) as SocialChannel | null;
      const accountName = fieldString(row, 2);
      if (!dateText || !channel || !accountName) continue;

      const posts = fieldLong(row, 3) ?? 0;
      const exposureTotal = parseDecimal(fieldString(row, 4), 0);
      const engagementTotal = parseDecimal(fieldString(row, 5), 0);
      const positivos = fieldLong(row, 6) ?? 0;
      const negativos = fieldLong(row, 7) ?? 0;
      const neutrales = fieldLong(row, 8) ?? 0;
      const classifiedItems = positivos + negativos + neutrales;
      const unknowns = Math.max(posts - classifiedItems, 0);

      await this.rds.execute(
        `
          INSERT INTO "public"."SocialAccountDailyAggregate"
            ("id", "date", "channel", "accountName", "posts", "exposureTotal", "engagementTotal", "erGlobal", "positivos", "negativos", "neutrales", "unknowns", "sentimientoNeto", "riesgoActivo", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST(:agg_date AS DATE), :channel, :account_name, :posts, CAST(:exposure_total AS DECIMAL(18,2)), CAST(:engagement_total AS DECIMAL(18,2)), CAST(:er_global AS DECIMAL(8,4)), :positivos, :negativos, :neutrales, :unknowns, CAST(:sentimiento_neto AS DECIMAL(8,4)), CAST(:riesgo_activo AS DECIMAL(8,4)), NOW(), NOW())
          ON CONFLICT ("date", "channel", "accountName") DO UPDATE SET
            "posts" = EXCLUDED."posts",
            "exposureTotal" = EXCLUDED."exposureTotal",
            "engagementTotal" = EXCLUDED."engagementTotal",
            "erGlobal" = EXCLUDED."erGlobal",
            "positivos" = EXCLUDED."positivos",
            "negativos" = EXCLUDED."negativos",
            "neutrales" = EXCLUDED."neutrales",
            "unknowns" = EXCLUDED."unknowns",
            "sentimientoNeto" = EXCLUDED."sentimientoNeto",
            "riesgoActivo" = EXCLUDED."riesgoActivo",
            "updatedAt" = NOW()
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("agg_date", dateText.slice(0, 10)),
          sqlString("channel", channel),
          sqlString("account_name", accountName),
          sqlLong("posts", posts),
          sqlString("exposure_total", String(roundMetric(exposureTotal))),
          sqlString("engagement_total", String(roundMetric(engagementTotal))),
          sqlString("er_global", String(roundMetric(calculateErGlobal(engagementTotal, exposureTotal)))),
          sqlLong("positivos", positivos),
          sqlLong("negativos", negativos),
          sqlLong("neutrales", neutrales),
          sqlLong("unknowns", unknowns),
          sqlString("sentimiento_neto", String(roundMetric(calculateSentimientoNeto(positivos, negativos, classifiedItems)))),
          sqlString("riesgo_activo", String(roundMetric(calculateRiesgoActivo(negativos, classifiedItems))))
        ]
      );
      inserted += 1;
    }

    return inserted;
  }

  async raiseSocialIncident(input: SocialIncidentInput): Promise<SocialIncidentResult> {
    const now = new Date();
    let severity = toSeverity(input.riskScore);
    if (input.severityFloor && severityRank(input.severityFloor) < severityRank(severity)) {
      severity = input.severityFloor;
    }

    const activeStatusList = ACTIVE_INCIDENT_STATUSES.map((value) => `'${value}'`).join(", ");
    const currentRes = await this.rds.execute(
      `
        SELECT
          "id"::text,
          "severity"::text,
          "status"::text,
          "cooldownUntil"
        FROM "public"."Incident"
        WHERE
          "scope" = CAST('claro' AS "public"."TermScope")
          AND "signalVersion" = :signal_version
          AND "status" IN (${activeStatusList})
        ORDER BY "updatedAt" DESC, "id" DESC
        LIMIT 1
      `,
      [sqlString("signal_version", input.signalVersion)]
    );

    const currentId = fieldString(currentRes.records?.[0], 0);
    const currentSeverity = fieldString(currentRes.records?.[0], 1) as IncidentSeverity | null;
    const currentStatus = fieldString(currentRes.records?.[0], 2) as IncidentStatus | null;
    const currentCooldown = fieldDate(currentRes.records?.[0], 3);

    if (currentId && currentStatus && currentCooldown && currentCooldown.getTime() > now.getTime()) {
      return { mode: "deduped", incidentId: currentId, severity };
    }

    const cooldownUntil = addMinutes(now, Math.max(1, input.cooldownMinutes));
    const slaDueAt = addMinutes(now, toSlaMinutes(severity));

    if (!currentId) {
      const insertRes = await this.rds.execute(
        `
          INSERT INTO "public"."Incident"
            ("id", "scope", "severity", "status", "riskScore", "classifiedItems", "ownerUserId", "slaDueAt", "cooldownUntil", "signalVersion", "payload", "createdAt", "updatedAt")
          VALUES
            (CAST(:id AS UUID), CAST('claro' AS "public"."TermScope"), CAST(:severity AS "public"."IncidentSeverity"), CAST('open' AS "public"."IncidentStatus"), CAST(:risk_score AS DECIMAL(5,2)), :classified_items, NULL, :sla_due_at, :cooldown_until, :signal_version, CAST(:payload AS JSONB), NOW(), NOW())
          RETURNING "id"::text
        `,
        [
          sqlUuid("id", randomUUID()),
          sqlString("severity", severity),
          sqlString("risk_score", String(roundMetric(input.riskScore))),
          sqlLong("classified_items", Math.max(0, Math.floor(input.classifiedItems))),
          sqlTimestamp("sla_due_at", slaDueAt),
          sqlTimestamp("cooldown_until", cooldownUntil),
          sqlString("signal_version", input.signalVersion),
          sqlJson("payload", input.payload)
        ]
      );

      return {
        mode: "created",
        incidentId: fieldString(insertRes.records?.[0], 0),
        severity
      };
    }

    const escalated = currentSeverity ? severityRank(severity) < severityRank(currentSeverity) : false;
    await this.rds.execute(
      `
        UPDATE "public"."Incident"
        SET
          "severity" = CAST(:severity AS "public"."IncidentSeverity"),
          "status" = CASE WHEN "status" = CAST('dismissed' AS "public"."IncidentStatus") THEN CAST('open' AS "public"."IncidentStatus") ELSE "status" END,
          "riskScore" = CAST(:risk_score AS DECIMAL(5,2)),
          "classifiedItems" = :classified_items,
          "cooldownUntil" = :cooldown_until,
          "slaDueAt" = :sla_due_at,
          "signalVersion" = :signal_version,
          "payload" = CAST(:payload AS JSONB),
          "updatedAt" = NOW()
        WHERE "id" = CAST(:incident_id AS UUID)
      `,
      [
        sqlString("severity", severity),
        sqlString("risk_score", String(roundMetric(input.riskScore))),
        sqlLong("classified_items", Math.max(0, Math.floor(input.classifiedItems))),
        sqlTimestamp("cooldown_until", cooldownUntil),
        sqlTimestamp("sla_due_at", slaDueAt),
        sqlString("signal_version", input.signalVersion),
        sqlJson("payload", input.payload),
        sqlUuid("incident_id", currentId)
      ]
    );

    return {
      mode: escalated ? "escalated" : "updated",
      incidentId: currentId,
      severity
    };
  }
}

export type {
  ReconciliationStatus,
  SocialComparisonMode,
  SocialChannel,
  SocialDatePreset,
  SocialScatterDimension,
  SocialErBreakdownDimension,
  SocialHeatmapMetric,
  SocialTrendGranularity,
  SocialDashboardSettingRecord,
  SocialEtlQualityRecord,
  SocialErTargetsRecord,
  SocialHeatmapRecord,
  SocialScatterRecord,
  SocialErBreakdownRecord,
  SocialIncidentResult,
  SocialPhase,
  SocialPhaseState,
  SocialReconciliationSnapshotInput,
  SocialRunCounters,
  SocialAccountsFilters,
  SocialAccountsRecord,
  SocialOverviewFilters,
  SocialOverviewRecord,
  SocialPostCommentOverrideInput,
  SocialPostCommentRecord,
  SocialPostCommentsFilters,
  SocialPostCommentsPage,
  SocialPostRecord,
  SocialPostsFilters,
  SocialPostsPage,
  SocialPostCommentUpsertInput,
  SocialPostUpsertInput,
  SocialRiskRecord,
  SocialRunsPage,
  SocialSyncRunRecord,
  SortMode,
  TriggerType
};

export const createSocialStore = (): SocialStore | null => {
  const client = RdsDataClient.fromEnv();
  if (!client) return null;
  return new SocialStore(client);
};
