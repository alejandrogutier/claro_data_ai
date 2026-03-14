import React, { useEffect, useMemo, useRef, useState, useCallback, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card, Row, Col, Tabs, Select, Input, InputNumber, Button, Alert, Spin,
  Empty, Table, Tag, Tooltip as AntTooltip, Descriptions, Typography, Checkbox, Space, Flex
} from "antd";
import {
  ReloadOutlined, DownloadOutlined, FileExcelOutlined, InfoCircleOutlined,
  DashboardOutlined, TeamOutlined, FileTextOutlined, WarningOutlined, CloudSyncOutlined, BookOutlined,
  EyeOutlined, UsergroupAddOutlined, LinkOutlined, LikeOutlined, CommentOutlined,
  ShareAltOutlined, PlayCircleOutlined, PercentageOutlined, RiseOutlined,
  PieChartOutlined, BarChartOutlined, FundViewOutlined
} from "@ant-design/icons";
import { Group } from "@visx/group";
import { Bar, LinePath, Pie, Circle, Line as VisxLine } from "@visx/shape";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { scaleLinear, scaleBand, scaleOrdinal, scaleLog } from "@visx/scale";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { useTooltip, TooltipWithBounds, defaultStyles as defaultTooltipStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { curveMonotoneX, curveLinear } from "@visx/curve";
import { Text } from "@visx/text";
import { LegendOrdinal } from "@visx/legend";
import type {
  MonitorSocialAccountsResponse,
  MonitorSocialErBreakdownResponse,
  MonitorSocialErTargetsResponse,
  MonitorSocialEtlQualityResponse,
  MonitorSocialFacetsResponse,
  MonitorSocialHeatmapResponse,
  MonitorSocialOverviewResponse,
  MonitorSocialPostsResponse,
  MonitorSocialRiskResponse,
  MonitorSocialRunItem,
  MonitorSocialTopicBreakdownResponse,
  MonitorSocialScatterResponse,
  MonitorSocialTrendByDimensionResponse,
  SocialAccountsSort,
  SocialChannel,
  SocialComparisonMode,
  SocialDatePreset,
  SocialErBreakdownDimension,
  SocialHeatmapMetric,
  SocialPostSort,
  SocialScatterDimension,
  SocialTopicBreakdownDimension,
  SocialTrendByDimensionMetric
} from "../api/client";
import { ApiError } from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";
import PostsTab from "../components/social/PostsTab";
import { computeER } from "../components/social/postsUtils";
import type { PostRow } from "../components/social/postsTypes";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";
import SecondaryKpiCard from "../components/shared/SecondaryKpiCard";
import { SentimentTag } from "../components/shared/SentimentTag";
import SocialFilterBar from "../components/social/SocialFilterBar";
import { StatusTag } from "../components/shared/StatusTag";
import { SeverityTag } from "../components/shared/SeverityTag";

const { Text: AntText } = Typography;

const CHANNEL_OPTIONS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok", "x"];
const PRESET_OPTIONS: SocialDatePreset[] = ["ytd", "90d", "30d", "y2024", "y2025", "last_quarter", "custom", "all"];
const TAB_OPTIONS = ["summary", "accounts", "posts", "risk", "etl", "glossary"] as const;
const POST_SORT_OPTIONS: SocialPostSort[] = ["published_at_desc", "exposure_desc", "engagement_desc"];
const ACCOUNT_SORT_OPTIONS: SocialAccountsSort[] = ["riesgo_desc", "er_desc", "exposure_desc", "engagement_desc", "posts_desc", "sov_desc", "account_asc"];
const FACET_SENTIMENT_OPTIONS = ["positive", "negative", "neutral", "unknown"] as const;

type SocialTab = (typeof TAB_OPTIONS)[number];
type ScaleMode = "auto" | "linear" | "log";
type TimeGranularity = "day" | "week" | "month" | "quarter" | "semester";
type AxisSide = "left" | "right";
type MonitorSocialUiError = "none" | "permission_denied" | "error_retriable";

type NumberFormatMode = "number" | "percent" | "score";
type BaseMetricTotal =
  | "impressions_total"
  | "reach_total"
  | "clicks_total"
  | "likes_total"
  | "comments_total"
  | "shares_total"
  | "views_total";
type DerivedMetricRate = "ctr" | "er_impressions" | "er_reach" | "view_rate" | "likes_share" | "comments_share" | "shares_share";
type TrendMetric = "posts" | "exposure_total" | "engagement_total" | BaseMetricTotal | "er_global" | DerivedMetricRate | "riesgo_activo" | "shs";
type TrendByDimensionMetric = SocialTrendByDimensionMetric;
type MixMetric = "posts" | "exposure_total" | "engagement_total" | BaseMetricTotal | "er_global" | DerivedMetricRate | "riesgo_activo" | "sov_interno";
type AccountMetric =
  | "posts"
  | "exposure_total"
  | "engagement_total"
  | BaseMetricTotal
  | "er_ponderado"
  | DerivedMetricRate
  | "riesgo_activo"
  | "sov_interno";
type ScatterMetric = "posts" | "exposure_total" | "engagement_total" | BaseMetricTotal | "er_global" | DerivedMetricRate;
type BreakdownMetric = "posts" | "exposure_total" | "engagement_total" | BaseMetricTotal | "er_global" | DerivedMetricRate;
type SecondaryKpiMetric = BaseMetricTotal | DerivedMetricRate;

type KpiCardData = {
  id: string;
  title: string;
  value: string;
  previous: string;
  goal: string;
  status: string;
  statusColor: string;
  info: string;
  deltaValue: number;
};

type ChartTooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipEntry[];
};

const KPI_INFO: Record<string, string> = {
  posts: "Total de publicaciones dentro de los filtros activos.",
  exposure_total: "Exposición consolidada. En social equivale al alcance o vistas según plataforma.",
  er_global: "Engagement Rate global = interacciones totales / exposición total * 100.",
  riesgo_activo: "negativos / clasificados * 100. Mayor valor implica mayor riesgo reputacional.",
  shs: "Social Health Score no oficial: reputación 50%, alcance 25%, riesgo 25%.",
  focus_account_sov: "Participación interna no oficial de la cuenta foco sobre contribución social total."
};

const METRIC_META: Record<string, { label: string; format: NumberFormatMode }> = {
  posts: { label: "Posts", format: "number" },
  exposure_total: { label: "Exposición", format: "number" },
  engagement_total: { label: "Interacciones (L+C+S)", format: "number" },
  impressions_total: { label: "Impresiones", format: "number" },
  reach_total: { label: "Reach", format: "number" },
  clicks_total: { label: "Clicks", format: "number" },
  likes_total: { label: "Likes", format: "number" },
  comments_total: { label: "Comments", format: "number" },
  shares_total: { label: "Shares", format: "number" },
  views_total: { label: "Views", format: "number" },
  er_global: { label: "ER", format: "percent" },
  ctr: { label: "CTR", format: "percent" },
  er_impressions: { label: "ER por impresiones", format: "percent" },
  er_reach: { label: "ER por reach", format: "percent" },
  view_rate: { label: "View rate", format: "percent" },
  likes_share: { label: "Mix likes", format: "percent" },
  comments_share: { label: "Mix comments", format: "percent" },
  shares_share: { label: "Mix shares", format: "percent" },
  sentimiento_neto: { label: "Sentimiento neto", format: "percent" },
  riesgo_activo: { label: "Riesgo", format: "percent" },
  shs: { label: "SHS", format: "score" },
  sov_interno: { label: "SOV interno", format: "percent" },
  er_ponderado: { label: "ER ponderado", format: "percent" },
  target_2026_er: { label: "Meta ER 2026", format: "percent" },
  current_er: { label: "ER actual", format: "percent" },
  gap: { label: "Gap ER", format: "percent" }
};

const TREND_METRICS: TrendMetric[] = [
  "posts", "exposure_total", "engagement_total", "impressions_total", "reach_total",
  "clicks_total", "likes_total", "comments_total", "shares_total", "views_total",
  "er_global", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share", "riesgo_activo", "shs"
];
const MIX_METRICS: MixMetric[] = [
  "posts", "exposure_total", "engagement_total", "impressions_total", "reach_total",
  "clicks_total", "likes_total", "comments_total", "shares_total", "views_total",
  "er_global", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share", "riesgo_activo", "sov_interno"
];
const ACCOUNT_METRICS: AccountMetric[] = [
  "er_ponderado", "posts", "exposure_total", "engagement_total", "impressions_total",
  "reach_total", "clicks_total", "likes_total", "comments_total", "shares_total",
  "views_total", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share", "riesgo_activo", "sov_interno"
];
const SCATTER_METRICS: ScatterMetric[] = [
  "exposure_total", "engagement_total", "impressions_total", "reach_total",
  "clicks_total", "likes_total", "comments_total", "shares_total", "views_total",
  "er_global", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share", "posts"
];
const BREAKDOWN_METRICS: BreakdownMetric[] = [
  "er_global", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share", "exposure_total", "engagement_total",
  "impressions_total", "reach_total", "clicks_total", "likes_total", "comments_total",
  "shares_total", "views_total", "posts"
];
const SECONDARY_KPI_METRICS: SecondaryKpiMetric[] = [
  "impressions_total", "reach_total", "clicks_total", "likes_total", "comments_total",
  "shares_total", "views_total", "ctr", "er_impressions", "er_reach", "view_rate",
  "likes_share", "comments_share", "shares_share"
];

/* ── Secondary KPI groups with icons ── */
type SecondaryKpiGroup = { title: string; color: string; metrics: SecondaryKpiMetric[] };
const SECONDARY_KPI_GROUPS: SecondaryKpiGroup[] = [
  {
    title: "Volumen",
    color: "#2563eb",
    metrics: ["impressions_total", "reach_total", "clicks_total", "likes_total", "comments_total", "shares_total", "views_total"],
  },
  {
    title: "Tasas de eficiencia",
    color: "#0f766e",
    metrics: ["ctr", "er_impressions", "er_reach", "view_rate"],
  },
  {
    title: "Mix de interacciones",
    color: "#7c3aed",
    metrics: ["likes_share", "comments_share", "shares_share"],
  },
];

const SECONDARY_KPI_ICONS: Partial<Record<string, React.ReactNode>> = {
  impressions_total: <EyeOutlined />,
  reach_total: <UsergroupAddOutlined />,
  clicks_total: <LinkOutlined />,
  likes_total: <LikeOutlined />,
  comments_total: <CommentOutlined />,
  shares_total: <ShareAltOutlined />,
  views_total: <PlayCircleOutlined />,
  ctr: <PercentageOutlined />,
  er_impressions: <RiseOutlined />,
  er_reach: <FundViewOutlined />,
  view_rate: <BarChartOutlined />,
  likes_share: <PieChartOutlined />,
  comments_share: <PieChartOutlined />,
  shares_share: <PieChartOutlined />,
};

const SECONDARY_KPI_INFO: Partial<Record<string, string>> = {
  impressions_total: "Total de impresiones (veces que el contenido fue mostrado).",
  reach_total: "Personas únicas alcanzadas por el contenido.",
  clicks_total: "Total de clics en el contenido.",
  likes_total: "Total de reacciones positivas (likes, love, etc.).",
  comments_total: "Total de comentarios recibidos (excluye replies).",
  shares_total: "Total de veces que el contenido fue compartido.",
  views_total: "Total de reproducciones de video.",
  ctr: "Click-Through Rate = clics / impresiones × 100.",
  er_impressions: "Engagement Rate por impresiones = interacciones / impresiones × 100.",
  er_reach: "Engagement Rate por reach = interacciones / reach × 100.",
  view_rate: "Tasa de visualización = views / impresiones × 100.",
  likes_share: "Proporción de likes sobre el total de interacciones.",
  comments_share: "Proporción de comments sobre el total de interacciones.",
  shares_share: "Proporción de shares sobre el total de interacciones.",
};

const TIME_GRANULARITY_OPTIONS: TimeGranularity[] = ["day", "week", "month", "quarter", "semester"];
const ADDITIVE_METRICS = [
  "posts", "exposure_total", "engagement_total", "impressions_total", "reach_total",
  "clicks_total", "likes_total", "comments_total", "shares_total", "views_total"
];
const LOG_SCALE_FLOOR = 0.01;

const formatNumber = (value: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
const formatPercent = (value: number): string => `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
const formatScore = (value: number): string => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatAxisPercentNoDecimals = (value: number): string =>
  `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
const formatCompactAxisNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  const compact = (base: number, suffix: string) =>
    `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })
      .format(value / base)
      .replace(/([,.]0)$/u, "")}${suffix}`;
  if (abs >= 1_000_000_000) return compact(1_000_000_000, "B");
  if (abs >= 1_000_000) return compact(1_000_000, "M");
  if (abs >= 1_000) return compact(1_000, "K");
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
};

const formatMetricValue = (metric: string, value: number): string => {
  const meta = METRIC_META[metric];
  if (!meta) return formatNumber(value);
  if (meta.format === "percent") return formatPercent(value);
  if (meta.format === "score") return formatScore(value);
  return formatNumber(value);
};

const formatChartMetricValue = (metric: string, value: number): string => {
  const meta = METRIC_META[metric];
  if (meta?.format === "percent") return formatAxisPercentNoDecimals(value);
  return formatCompactAxisNumber(value);
};

const formatChartAxisByMetrics = (metrics: string[], value: number): string => {
  if (metrics.length > 0 && metrics.every((metric) => METRIC_META[metric]?.format === "percent")) {
    return formatAxisPercentNoDecimals(value);
  }
  return formatCompactAxisNumber(value);
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsed);
};

const truncate = (value: string, max = 28): string => (value.length <= max ? value : `${value.slice(0, Math.max(1, max - 3))}...`);

const toChannelLabel = (channel: SocialChannel): string => {
  if (channel === "facebook") return "Facebook";
  if (channel === "instagram") return "Instagram";
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "x") return "X";
  return "TikTok";
};

const toPresetLabel = (preset: SocialDatePreset): string => {
  if (preset === "all") return "Todo";
  if (preset === "y2024") return "2024";
  if (preset === "y2025") return "2025";
  if (preset === "ytd") return "YTD";
  if (preset === "90d") return "90d";
  if (preset === "30d") return "30d";
  if (preset === "7d") return "7d";
  if (preset === "last_quarter") return "Último trimestre";
  return "Custom";
};

const toComparisonLabel = (mode: SocialComparisonMode): string => {
  if (mode === "weekday_aligned_week") return "Última semana con coincidencia de días";
  if (mode === "exact_days") return "Última cantidad exacta de días";
  return "Mismo periodo del año pasado";
};

const toTimeGranularityLabel = (granularity: TimeGranularity): string => {
  if (granularity === "day") return "Día";
  if (granularity === "week") return "Semana";
  if (granularity === "month") return "Mes";
  if (granularity === "quarter") return "Trimestre";
  return "Semestre";
};

const toScatterDimensionLabel = (dimension: SocialScatterDimension): string => {
  if (dimension === "post_type") return "Tipo de post";
  if (dimension === "channel") return "Canal";
  if (dimension === "account") return "Cuenta";
  if (dimension === "campaign") return "Campaña";
  if (dimension === "strategy") return "Estrategia";
  return "Hashtag";
};

const toTopicFilterLabel = (value: string): string => value.replaceAll("_", " ");

const normalizePostType = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (["unknown", "sin tipo", "sin_tipo", "none", "null", "(blank)"].includes(normalized)) return "unknown";
  return normalized;
};

const parseCsvList = (raw: string | null): string[] => {
  if (!raw) return [];
  return Array.from(
    new Set(raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0))
  );
};

const parsePreset = (raw: string | null): SocialDatePreset => {
  const value = (raw ?? "ytd").trim().toLowerCase() as SocialDatePreset;
  return PRESET_OPTIONS.includes(value) ? value : "ytd";
};

const parseTab = (raw: string | null): SocialTab => {
  const value = (raw ?? "summary").trim().toLowerCase() as SocialTab;
  return TAB_OPTIONS.includes(value) ? value : "summary";
};

const parseTimeGranularity = (raw: string | null): TimeGranularity => {
  const value = (raw ?? "week").trim().toLowerCase() as TimeGranularity;
  return TIME_GRANULARITY_OPTIONS.includes(value) ? value : "week";
};

const parseComparisonMode = (raw: string | null): SocialComparisonMode => {
  const value = (raw ?? "same_period_last_year").trim().toLowerCase() as SocialComparisonMode;
  if (value === "weekday_aligned_week" || value === "exact_days" || value === "same_period_last_year") return value;
  return "same_period_last_year";
};

const parsePostSort = (raw: string | null): SocialPostSort => {
  const value = (raw ?? "published_at_desc").trim().toLowerCase() as SocialPostSort;
  return POST_SORT_OPTIONS.includes(value) ? value : "published_at_desc";
};

const parseAccountsSort = (raw: string | null): SocialAccountsSort => {
  const value = (raw ?? "riesgo_desc").trim().toLowerCase() as SocialAccountsSort;
  return ACCOUNT_SORT_OPTIONS.includes(value) ? value : "riesgo_desc";
};

const parseSentimentFilter = (raw: string | null): "all" | (typeof FACET_SENTIMENT_OPTIONS)[number] => {
  const value = (raw ?? "all").trim().toLowerCase();
  if (value === "all") return "all";
  if ((FACET_SENTIMENT_OPTIONS as readonly string[]).includes(value)) {
    return value as (typeof FACET_SENTIMENT_OPTIONS)[number];
  }
  return "all";
};

const parseIntFromQuery = (raw: string | null, fallback: number, min: number, max: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const toApiTrendGranularity = (granularity: TimeGranularity): "day" | "week" | "month" => {
  if (granularity === "day" || granularity === "week" || granularity === "month") return granularity;
  return "month";
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

const toDateOnlyUtc = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const formatDateOnlyUtc = (value: Date): string => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysUtc = (base: Date, days: number): Date => {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addMonthsUtc = (base: Date, months: number): Date => {
  const next = new Date(base.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const parseTrendBucketDate = (bucketStart: string | null | undefined, bucketLabel: string | null | undefined): Date | null => {
  if (bucketStart) {
    const parsed = new Date(bucketStart);
    if (!Number.isNaN(parsed.getTime())) return toDateOnlyUtc(parsed);
  }
  if (!bucketLabel) return null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(bucketLabel)) {
    const parsed = new Date(`${bucketLabel}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (/^\d{4}-\d{2}$/u.test(bucketLabel)) {
    const parsed = new Date(`${bucketLabel}-01T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toIsoWeekInfo = (value: Date): { isoYear: number; week: number; weekStart: Date } => {
  const date = toDateOnlyUtc(value);
  const dayNr = (date.getUTCDay() + 6) % 7;
  const weekStart = addDaysUtc(date, -dayNr);
  const thursday = addDaysUtc(weekStart, 3);
  const isoYear = thursday.getUTCFullYear();
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  const week1DayNr = (week1.getUTCDay() + 6) % 7;
  const week1Monday = addDaysUtc(week1, -week1DayNr);
  const week = 1 + Math.round((weekStart.getTime() - week1Monday.getTime()) / 604_800_000);
  return { isoYear, week, weekStart };
};

const toTimeBucketMeta = (value: Date, granularity: TimeGranularity): { key: string; label: string; start: Date; end: Date } => {
  const date = toDateOnlyUtc(value);
  if (granularity === "day") {
    return { key: formatDateOnlyUtc(date), label: formatDateOnlyUtc(date), start: date, end: addDaysUtc(date, 1) };
  }
  if (granularity === "week") {
    const info = toIsoWeekInfo(date);
    return { key: `${info.isoYear}-W${String(info.week).padStart(2, "0")}`, label: `${info.isoYear}-W${String(info.week).padStart(2, "0")}`, start: info.weekStart, end: addDaysUtc(info.weekStart, 7) };
  }
  if (granularity === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    return { key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, start, end: addMonthsUtc(start, 1) };
  }
  if (granularity === "quarter") {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    const start = new Date(Date.UTC(date.getUTCFullYear(), (quarter - 1) * 3, 1));
    return { key: `${start.getUTCFullYear()}-Q${quarter}`, label: `${start.getUTCFullYear()}-Q${quarter}`, start, end: addMonthsUtc(start, 3) };
  }
  const semester = date.getUTCMonth() < 6 ? 1 : 2;
  const start = new Date(Date.UTC(date.getUTCFullYear(), semester === 1 ? 0 : 6, 1));
  return { key: `${start.getUTCFullYear()}-S${semester}`, label: `${start.getUTCFullYear()}-S${semester}`, start, end: addMonthsUtc(start, 6) };
};

const aggregateMetricByPosts = (sum: number, weightedSum: number, posts: number, metric: string): number => {
  if (ADDITIVE_METRICS.includes(metric)) return roundMetric(sum);
  return roundMetric(weightedSum / Math.max(posts, 1));
};

const aggregateTrendSeriesRows = <
  T extends {
    bucket_start?: string | null;
    bucket_end?: string | null;
    bucket_label: string;
    posts: number;
    [key: string]: string | number | null | undefined;
  }
>(rows: T[], granularity: TimeGranularity, metrics: string[]): T[] => {
  if (granularity !== "quarter" && granularity !== "semester") return rows;
  const byBucket = new Map<string, { label: string; start: Date; end: Date; posts: number; sums: Record<string, number>; weightedSums: Record<string, number> }>();
  for (const row of rows) {
    const date = parseTrendBucketDate(row.bucket_start ?? null, row.bucket_label);
    if (!date) continue;
    const bucket = toTimeBucketMeta(date, granularity);
    const current = byBucket.get(bucket.key) ?? { label: bucket.label, start: bucket.start, end: bucket.end, posts: 0, sums: {}, weightedSums: {} };
    const posts = Number(row.posts ?? 0);
    current.posts += posts;
    for (const metric of metrics) {
      const value = Number(row[metric] ?? 0);
      current.sums[metric] = (current.sums[metric] ?? 0) + value;
      current.weightedSums[metric] = (current.weightedSums[metric] ?? 0) + value * Math.max(posts, 0);
    }
    byBucket.set(bucket.key, current);
  }
  const ordered = Array.from(byBucket.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  return ordered.map((item) => {
    const base: Record<string, string | number | null | undefined> = { bucket_start: item.start.toISOString(), bucket_end: item.end.toISOString(), bucket_label: item.label, posts: roundMetric(item.posts) };
    for (const metric of metrics) {
      base[metric] = aggregateMetricByPosts(item.sums[metric] ?? 0, item.weightedSums[metric] ?? 0, item.posts, metric);
    }
    return base as T;
  });
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] ?? 0;
};

const suggestLogScale = (values: number[]): boolean => {
  const positives = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positives.length < 6) return false;
  const p95 = percentile(positives, 0.95);
  const p05 = Math.max(percentile(positives, 0.05), 1);
  return p95 / p05 >= 20;
};

const resolveScale = (mode: ScaleMode, values: number[]): "linear" | "log" => {
  if (mode === "linear") return "linear";
  if (mode === "log") return "log";
  return suggestLogScale(values) ? "log" : "linear";
};

const resolveAxisDomain = (scale: "linear" | "log", values: number[]): [number, "auto"] => {
  if (scale === "log") {
    const positives = values.filter((value) => Number.isFinite(value) && value > 0);
    const minPositive = positives.length > 0 ? Math.max(Math.min(...positives), LOG_SCALE_FLOOR) : LOG_SCALE_FLOOR;
    return [minPositive, "auto"];
  }
  return [0, "auto"];
};

const toLogSafeValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return LOG_SCALE_FLOOR;
  return value;
};

const CHART_QUESTION_BY_KEY: Record<string, string> = {
  trend: "Cómo evolucionan exposición, interacciones y ER en el período?",
  trend_by_dimension: "Cómo evoluciona la métrica seleccionada por cada dimensión?",
  mix: "Qué canal aporta más y cómo se comporta su segunda métrica?",
  ranking: "Qué cuentas lideran según las métricas seleccionadas?",
  gap: "Qué tan lejos está cada canal de su meta ER?",
  scatter: "Qué grupos destacan al cruzar dos métricas seleccionadas?",
  heatmap: "Qué días y meses concentran mejor rendimiento?",
  topic_breakdown: "Cómo se compone cada tema según la dimensión secundaria elegida?",
  breakdown: "Qué dimensión explica mejor la métrica seleccionada?",
  share: "Cómo se distribuye el SOV interno entre cuentas?"
};

const CHANNEL_SERIES_COLORS: Record<SocialChannel, string> = {
  facebook: "#1d4ed8", instagram: "#c026d3", linkedin: "#0369a1", tiktok: "#0f766e", x: "#1d1d1b"
};

const DIMENSION_SERIES_COLORS = ["#0072B2", "#E69F00", "#009E73", "#56B4E9", "#D55E00", "#CC79A7", "#F0E442", "#000000", "#999999", "#44AA99"];
const TOPIC_SEGMENT_COLORS = [
  "#e30613", "#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#0891b2",
  "#be123c", "#475569", "#059669", "#ea580c", "#0284c7", "#a16207", "#334155"
];

const toHeatmapMetricKey = (metric: SocialHeatmapMetric | undefined): string => {
  if (metric === "er") return "er_global";
  if (metric === "engagement_total") return "engagement_total";
  if (metric === "likes") return "likes_total";
  if (metric === "comments") return "comments_total";
  if (metric === "shares") return "shares_total";
  if (metric === "views") return "views_total";
  if (metric === "view_rate") return "view_rate";
  if (metric === "impressions") return "impressions_total";
  if (metric === "reach") return "reach_total";
  if (metric === "clicks") return "clicks_total";
  if (metric === "ctr") return "ctr";
  if (metric === "er_impressions") return "er_impressions";
  if (metric === "er_reach") return "er_reach";
  return "engagement_total";
};

const toDeltaColor = (value: number): string => {
  if (value > 0) return "#15803d";
  if (value < 0) return "#be123c";
  return "#64748b";
};

const toAccountsSortLabel = (value: SocialAccountsSort): string => {
  if (value === "er_desc") return "ER desc";
  if (value === "exposure_desc") return "Exposición desc";
  if (value === "engagement_desc") return "Interacciones desc";
  if (value === "posts_desc") return "Posts desc";
  if (value === "sov_desc") return "SOV desc";
  if (value === "account_asc") return "Cuenta A-Z";
  return "Riesgo desc";
};

const toRiskTagColor = (risk: number): string => {
  if (risk >= 80) return "red";
  if (risk >= 60) return "orange";
  if (risk >= 40) return "gold";
  return "green";
};

const toSlaBySeverity = (severity: string): string => {
  if (severity === "SEV1") return "SLA <= 30 min";
  if (severity === "SEV2") return "SLA <= 4 h";
  if (severity === "SEV3") return "SLA <= 24 h";
  return "SLA monitoreo";
};

const csvEscape = (value: string | number | null | undefined): string => {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
};

const downloadTextFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadBlobFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const getErrorKind = (error: unknown): MonitorSocialUiError => {
  if (error instanceof ApiError && error.status === 403) return "permission_denied";
  return "error_retriable";
};

/* ────────────────────────────────────────────────────────
   visx tooltip styles
   ──────────────────────────────────────────────────────── */
const tooltipStyles: React.CSSProperties = {
  ...defaultTooltipStyles,
  background: "rgba(255, 255, 255, 0.96)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(231, 233, 237, 0.8)",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 12,
  fontFamily: "'Barlow', sans-serif",
  boxShadow: "0 8px 28px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06)",
  minWidth: 170,
  zIndex: 50,
  lineHeight: 1.5,
};

/* ────────────────────────────────────────────────────────
   Inline visx chart components
   ──────────────────────────────────────────────────────── */
const CHART_MARGIN = { top: 10, right: 16, bottom: 40, left: 60 };
const CHART_MARGIN_DUAL = { top: 10, right: 60, bottom: 40, left: 60 };

type VisxDualLineChartProps = {
  data: Record<string, unknown>[];
  xKey: string;
  leftKey: string;
  rightKey: string;
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  formatLeftTick: (v: number) => string;
  formatRightTick: (v: number) => string;
  formatTooltipValue: (metric: string, v: number) => string;
};

const VisxDualLineChart = ({ data, xKey, leftKey, rightKey, leftLabel, rightLabel, leftColor, rightColor, formatLeftTick, formatRightTick, formatTooltipValue }: VisxDualLineChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<Record<string, unknown>>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = CHART_MARGIN_DUAL;
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const xScale = scaleBand<string>({ domain: data.map((d) => String(d[xKey] ?? "")), range: [0, xMax], padding: 0.2 });
        const leftValues = data.map((d) => Number(d[leftKey] ?? 0));
        const rightValues = data.map((d) => Number(d[rightKey] ?? 0));
        const leftMax = Math.max(...leftValues, 1);
        const rightMax = Math.max(...rightValues, 1);
        const yLeftScale = scaleLinear<number>({ domain: [0, leftMax * 1.1], range: [yMax, 0] });
        const yRightScale = scaleLinear<number>({ domain: [0, rightMax * 1.1], range: [yMax, 0] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yLeftScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", angle: -30, dy: 4 })} numTicks={Math.min(data.length, 12)} />
                <AxisLeft stroke="#e2e8f0" scale={yLeftScale} tickFormat={(v) => formatLeftTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                <AxisRight stroke="#e2e8f0" left={xMax} scale={yRightScale} tickFormat={(v) => formatRightTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "start", dx: 4 })} />
                <LinePath
                  data={data}
                  x={(d) => (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2}
                  y={(d) => yLeftScale(Number(d[leftKey] ?? 0))}
                  stroke={leftColor}
                  strokeWidth={2.5}
                  curve={curveMonotoneX}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <LinePath
                  data={data}
                  x={(d) => (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2}
                  y={(d) => yRightScale(Number(d[rightKey] ?? 0))}
                  stroke={rightColor}
                  strokeWidth={2.5}
                  curve={curveMonotoneX}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {data.map((d, i) => {
                  const cx = (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2;
                  return (
                    <rect
                      key={i}
                      x={cx - xScale.bandwidth() / 2}
                      y={0}
                      width={xScale.bandwidth()}
                      height={yMax}
                      fill="transparent"
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        showTooltip({ tooltipData: d, tooltipLeft: point.x, tooltipTop: point.y });
                      }}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{String(tooltipData[xKey] ?? "")}</div>
                <div style={{ color: leftColor, marginTop: 4 }}>{leftLabel}: <strong>{formatTooltipValue(leftKey, Number(tooltipData[leftKey] ?? 0))}</strong></div>
                <div style={{ color: rightColor, marginTop: 2 }}>{rightLabel}: <strong>{formatTooltipValue(rightKey, Number(tooltipData[rightKey] ?? 0))}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxBarLineChartProps = {
  data: Record<string, unknown>[];
  xKey: string;
  barKey: string;
  lineKey: string;
  barLabel: string;
  lineLabel: string;
  barColor: string;
  lineColor: string;
  formatXTick?: (v: string) => string;
  formatLeftTick: (v: number) => string;
  formatRightTick: (v: number) => string;
  formatTooltipValue: (metric: string, v: number) => string;
  barAxis: AxisSide;
  lineAxis: AxisSide;
};

const VisxBarLineChart = ({ data, xKey, barKey, lineKey, barLabel, lineLabel, barColor, lineColor, formatXTick, formatLeftTick, formatRightTick, formatTooltipValue, barAxis, lineAxis }: VisxBarLineChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<Record<string, unknown>>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = CHART_MARGIN_DUAL;
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const xScale = scaleBand<string>({ domain: data.map((d) => String(d[xKey] ?? "")), range: [0, xMax], padding: 0.3 });
        const leftValues = data.map((d) => Number(d[barAxis === "left" ? barKey : lineKey] ?? 0));
        const rightValues = data.map((d) => Number(d[lineAxis === "right" ? lineKey : barKey] ?? 0));
        const leftMax = Math.max(...leftValues, 1);
        const rightMax = Math.max(...rightValues, 1);
        const yLeftScale = scaleLinear<number>({ domain: [0, leftMax * 1.1], range: [yMax, 0] });
        const yRightScale = scaleLinear<number>({ domain: [0, rightMax * 1.1], range: [yMax, 0] });

        const getBarY = barAxis === "left" ? yLeftScale : yRightScale;
        const getLineY = lineAxis === "left" ? yLeftScale : yRightScale;

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yLeftScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickFormat={formatXTick ? (v) => formatXTick(String(v)) : undefined} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", angle: -30, dy: 4 })} />
                <AxisLeft stroke="#e2e8f0" scale={yLeftScale} tickFormat={(v) => formatLeftTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                <AxisRight stroke="#e2e8f0" left={xMax} scale={yRightScale} tickFormat={(v) => formatRightTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "start", dx: 4 })} />
                {data.map((d, i) => {
                  const x = xScale(String(d[xKey] ?? "")) ?? 0;
                  const barVal = Number(d[barKey] ?? 0);
                  const barY = getBarY(barVal);
                  return (
                    <Bar
                      key={i}
                      x={x}
                      y={barY}
                      width={xScale.bandwidth()}
                      height={Math.max(0, yMax - barY)}
                      fill={barColor}
                      rx={4}
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        showTooltip({ tooltipData: d, tooltipLeft: point.x + margin.left, tooltipTop: point.y });
                      }}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
                <LinePath
                  data={data}
                  x={(d) => (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2}
                  y={(d) => getLineY(Number(d[lineKey] ?? 0))}
                  stroke={lineColor}
                  strokeWidth={3}
                  curve={curveMonotoneX}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {data.map((d, i) => {
                  const cx = (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2;
                  const cy = getLineY(Number(d[lineKey] ?? 0));
                  return <circle key={`dot-${i}`} cx={cx} cy={cy} r={3} fill={lineColor} />;
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{formatXTick ? formatXTick(String(tooltipData[xKey] ?? "")) : String(tooltipData[xKey] ?? "")}</div>
                <div style={{ color: barColor, marginTop: 4 }}>{barLabel}: <strong>{formatTooltipValue(barKey, Number(tooltipData[barKey] ?? 0))}</strong></div>
                <div style={{ color: lineColor, marginTop: 2 }}>{lineLabel}: <strong>{formatTooltipValue(lineKey, Number(tooltipData[lineKey] ?? 0))}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxMultiLineChartProps = {
  data: Record<string, unknown>[];
  xKey: string;
  series: Array<{ key: string; label: string; color: string }>;
  metric: string;
  formatYTick: (v: number) => string;
  formatTooltipValue: (v: number) => string;
};

const VisxMultiLineChart = ({ data, xKey, series, metric, formatYTick, formatTooltipValue }: VisxMultiLineChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<Record<string, unknown>>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = CHART_MARGIN;
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const xScale = scaleBand<string>({ domain: data.map((d) => String(d[xKey] ?? "")), range: [0, xMax], padding: 0.1 });
        const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0)).filter((v) => Number.isFinite(v)));
        const yMaxVal = Math.max(...allValues, 1);
        const yScale = scaleLinear<number>({ domain: [0, yMaxVal * 1.1], range: [yMax, 0] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", angle: -30, dy: 4 })} numTicks={Math.min(data.length, 12)} />
                <AxisLeft stroke="#e2e8f0" scale={yScale} tickFormat={(v) => formatYTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                {series.map((s) => (
                  <LinePath
                    key={s.key}
                    data={data.filter((d) => d[s.key] !== null && d[s.key] !== undefined)}
                    x={(d) => (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2}
                    y={(d) => yScale(Number(d[s.key] ?? 0))}
                    stroke={s.color}
                    strokeWidth={2.4}
                    curve={curveLinear}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {data.map((d, i) => {
                  const cx = (xScale(String(d[xKey] ?? "")) ?? 0) + xScale.bandwidth() / 2;
                  return (
                    <rect
                      key={i}
                      x={cx - xScale.bandwidth() / 2}
                      y={0}
                      width={xScale.bandwidth()}
                      height={yMax}
                      fill="transparent"
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        showTooltip({ tooltipData: d, tooltipLeft: point.x, tooltipTop: point.y });
                      }}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{String(tooltipData[xKey] ?? "")}</div>
                {series.map((s) => {
                  const rawKey = `raw_${s.key}`;
                  const val = Number(tooltipData[rawKey] ?? tooltipData[s.key] ?? 0);
                  return (
                    <div key={s.key} style={{ color: s.color, marginTop: 2 }}>
                      {s.label}: <strong>{formatTooltipValue(val)}</strong>
                    </div>
                  );
                })}
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxHorizontalStackedBarChartProps = {
  data: Record<string, unknown>[];
  yKey: string;
  segments: Array<{ key: string; label: string; color: string }>;
  normalize100: boolean;
  metric: string;
  formatXTick: (v: number) => string;
  onBarClick?: (topicKey: string) => void;
  chartHeight: number;
};

const VisxHorizontalStackedBarChart = ({ data, yKey, segments, normalize100, metric, formatXTick, onBarClick, chartHeight }: VisxHorizontalStackedBarChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<{ row: Record<string, unknown>; segment: { key: string; label: string; color: string } }>();

  return (
    <ParentSize>
      {({ width }) => {
        const height = chartHeight;
        if (width < 10 || height < 10) return null;
        const margin = { top: 10, right: 16, bottom: 40, left: 190 };
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const yScale = scaleBand<string>({ domain: data.map((d) => String(d[yKey] ?? "")), range: [0, yMax], padding: 0.2 });
        const maxX = normalize100 ? 100 : Math.max(...data.flatMap((d) => {
          let total = 0;
          for (const s of segments) total += Number(d[s.key] ?? 0);
          return [total];
        }), 1);
        const xScale = scaleLinear<number>({ domain: [0, maxX * 1.05], range: [0, xMax] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickFormat={(v) => formatXTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "middle" })} />
                <AxisLeft stroke="#e2e8f0" scale={yScale} tickFormat={(v) => truncate(String(v), 28)} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                {data.map((d, i) => {
                  let cumX = 0;
                  const y = yScale(String(d[yKey] ?? "")) ?? 0;
                  const barHeight = yScale.bandwidth();
                  return segments.map((s) => {
                    const val = Number(d[s.key] ?? 0);
                    const barWidth = Math.max(0, xScale(val) - xScale(0));
                    const barX = xScale(cumX);
                    cumX += val;
                    return (
                      <rect
                        key={`${i}-${s.key}`}
                        x={barX}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={s.color}
                        style={{ cursor: onBarClick ? "pointer" : "default" }}
                        onClick={() => onBarClick?.(String(d.topic_key ?? ""))}
                        onMouseMove={(event) => {
                          const point = localPoint(event) ?? { x: 0, y: 0 };
                          showTooltip({ tooltipData: { row: d, segment: s }, tooltipLeft: point.x + margin.left, tooltipTop: point.y });
                        }}
                        onMouseLeave={() => hideTooltip()}
                      />
                    );
                  });
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{String(tooltipData.row[yKey] ?? "")}</div>
                <div style={{ color: tooltipData.segment.color, marginTop: 4 }}>
                  {tooltipData.segment.label}: <strong>{formatChartMetricValue(metric, Number(tooltipData.row[`raw_${tooltipData.segment.key}`] ?? tooltipData.row[tooltipData.segment.key] ?? 0))}</strong>
                </div>
                <div style={{ color: "#64748b", marginTop: 2 }}>Total: <strong>{formatChartMetricValue(metric, Number(tooltipData.row.metric_total ?? 0))}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxHorizontalBarChartProps = {
  data: Array<{ label: string; metric_value: number; posts: number; exposure_total: number }>;
  metricLabel: string;
  formatTick: (v: number) => string;
};

const VisxHorizontalBarChart = ({ data, metricLabel, formatTick }: VisxHorizontalBarChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<(typeof data)[0]>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = { top: 10, right: 16, bottom: 40, left: 190 };
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const yScale = scaleBand<string>({ domain: data.map((d) => d.label), range: [0, yMax], padding: 0.2 });
        const xMaxVal = Math.max(...data.map((d) => d.metric_value), 1);
        const xScale = scaleLinear<number>({ domain: [0, xMaxVal * 1.1], range: [0, xMax] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickFormat={(v) => formatTick(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "middle" })} />
                <AxisLeft stroke="#e2e8f0" scale={yScale} tickFormat={(v) => truncate(String(v), 24)} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                {data.map((d, i) => {
                  const y = yScale(d.label) ?? 0;
                  const barWidth = Math.max(0, xScale(d.metric_value));
                  return (
                    <Bar
                      key={i}
                      x={0}
                      y={y}
                      width={barWidth}
                      height={yScale.bandwidth()}
                      fill="#7c3aed"
                      rx={4}
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        showTooltip({ tooltipData: d, tooltipLeft: point.x + margin.left, tooltipTop: point.y });
                      }}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{tooltipData.label}</div>
                <div style={{ marginTop: 4 }}>{metricLabel}: <strong>{formatTick(tooltipData.metric_value)}</strong></div>
                <div style={{ marginTop: 2 }}>Posts: <strong>{formatCompactAxisNumber(tooltipData.posts)}</strong></div>
                <div style={{ marginTop: 2 }}>Exposición: <strong>{formatCompactAxisNumber(tooltipData.exposure_total)}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxScatterChartProps = {
  data: Array<{ label: string; x_value: number; y_value: number; posts: number; z: number }>;
  xLabel: string;
  yLabel: string;
  xMetric: string;
  yMetric: string;
};

const VisxScatterChart = ({ data, xLabel, yLabel, xMetric, yMetric }: VisxScatterChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<(typeof data)[0]>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = { top: 10, right: 16, bottom: 50, left: 60 };
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const xMaxVal = Math.max(...data.map((d) => d.x_value), 1);
        const yMaxVal = Math.max(...data.map((d) => d.y_value), 1);
        const xScale = scaleLinear<number>({ domain: [0, xMaxVal * 1.1], range: [0, xMax] });
        const yScale = scaleLinear<number>({ domain: [0, yMaxVal * 1.1], range: [yMax, 0] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickFormat={(v) => formatChartAxisByMetrics([xMetric], Number(v))} label={xLabel} labelProps={{ fontSize: 11, dy: 10 }} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "middle" })} />
                <AxisLeft stroke="#e2e8f0" scale={yScale} tickFormat={(v) => formatChartAxisByMetrics([yMetric], Number(v))} label={yLabel} labelProps={{ fontSize: 11, dx: -10 }} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                {data.map((d, i) => {
                  const r = Math.max(4, Math.min(20, Math.sqrt(d.z) * 2));
                  return (
                    <circle
                      key={i}
                      cx={xScale(d.x_value)}
                      cy={yScale(d.y_value)}
                      r={r}
                      fill="#0f766e"
                      fillOpacity={0.5}
                      stroke="#fff"
                      strokeWidth={1.5}
                      onMouseMove={(event) => {
                        const point = localPoint(event) ?? { x: 0, y: 0 };
                        showTooltip({ tooltipData: d, tooltipLeft: point.x + margin.left, tooltipTop: point.y });
                      }}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{tooltipData.label}</div>
                <div style={{ marginTop: 4 }}>Posts: <strong>{formatCompactAxisNumber(tooltipData.posts)}</strong></div>
                <div style={{ marginTop: 2 }}>{xLabel}: <strong>{formatChartMetricValue(xMetric, tooltipData.x_value)}</strong></div>
                <div style={{ marginTop: 2 }}>{yLabel}: <strong>{formatChartMetricValue(yMetric, tooltipData.y_value)}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxPieChartProps = {
  data: Array<{ name: string; value: number }>;
  colors: string[];
};

const VisxPieChart = ({ data, colors }: VisxPieChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<(typeof data)[0]>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const radius = Math.min(width, height) / 2 - 30;
        if (radius < 10) return null;
        const centerX = width / 2;
        const centerY = height / 2;

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group top={centerY} left={centerX}>
                <Pie
                  data={data}
                  pieValue={(d) => d.value}
                  outerRadius={radius}
                  innerRadius={Math.round(radius * 0.55)}
                  cornerRadius={3}
                  padAngle={0.02}
                >
                  {(pie) =>
                    pie.arcs.map((arc, i) => {
                      const [cx, cy] = pie.path.centroid(arc);
                      return (
                        <g key={i}>
                          <path
                            d={pie.path(arc) ?? ""}
                            fill={colors[i % colors.length]}
                            onMouseMove={(event) => {
                              const point = localPoint(event) ?? { x: 0, y: 0 };
                              showTooltip({ tooltipData: arc.data, tooltipLeft: point.x, tooltipTop: point.y });
                            }}
                            onMouseLeave={() => hideTooltip()}
                          />
                          {arc.endAngle - arc.startAngle > 0.3 && (
                            <Text x={cx} y={cy} textAnchor="middle" verticalAnchor="middle" fontSize={10} fill="#fff">
                              {truncate(arc.data.name, 12)}
                            </Text>
                          )}
                        </g>
                      );
                    })
                  }
                </Pie>
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{tooltipData.name}</div>
                <div style={{ marginTop: 4 }}>SOV: <strong>{formatAxisPercentNoDecimals(tooltipData.value)}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};

type VisxRiskTrendChartProps = {
  data: Array<{ date: string; negativos: number; riesgo_activo: number; sentimiento_neto: number }>;
  thresholdY: number;
};

const VisxRiskTrendChart = ({ data, thresholdY }: VisxRiskTrendChartProps) => {
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<(typeof data)[0]>();

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10 || height < 10) return null;
        const margin = CHART_MARGIN_DUAL;
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;
        if (xMax < 1 || yMax < 1) return null;

        const xScale = scaleBand<string>({ domain: data.map((d) => d.date), range: [0, xMax], padding: 0.1 });
        const leftMax = Math.max(...data.map((d) => d.negativos), 1);
        const rightMax = Math.max(...data.map((d) => Math.max(Math.abs(d.riesgo_activo), Math.abs(d.sentimiento_neto))), 1);
        const yLeftScale = scaleLinear<number>({ domain: [0, leftMax * 1.1], range: [yMax, 0] });
        const yRightScale = scaleLinear<number>({ domain: [-rightMax * 1.1, rightMax * 1.1], range: [yMax, 0] });

        return (
          <div style={{ position: "relative" }}>
            <svg width={width} height={height}>
              <Group left={margin.left} top={margin.top}>
                <GridRows scale={yLeftScale} width={xMax} stroke="#eef0f4" strokeOpacity={0.8} strokeDasharray="3,3" />
                <AxisBottom stroke="#e2e8f0" top={yMax} scale={xScale} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", angle: -30, dy: 4 })} numTicks={Math.min(data.length, 12)} />
                <AxisLeft stroke="#e2e8f0" scale={yLeftScale} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "end", dx: -4 })} />
                <AxisRight stroke="#e2e8f0" left={xMax} scale={yRightScale} tickFormat={(v) => formatAxisPercentNoDecimals(Number(v))} tickLabelProps={() => ({ fontSize: 11, fill: "#64748b", fontFamily: "'Barlow', sans-serif", textAnchor: "start", dx: 4 })} />
                {/* Threshold line */}
                <line x1={0} x2={xMax} y1={yRightScale(thresholdY)} y2={yRightScale(thresholdY)} stroke="#dc2626" strokeDasharray="5,4" strokeWidth={1.5} />
                <Text x={xMax - 4} y={yRightScale(thresholdY) - 6} fontSize={10} fill="#dc2626" textAnchor="end">Umbral</Text>
                <LinePath data={data} x={(d) => (xScale(d.date) ?? 0) + xScale.bandwidth() / 2} y={(d) => yLeftScale(d.negativos)} stroke="#b91c1c" strokeWidth={2} curve={curveMonotoneX} strokeLinecap="round" strokeLinejoin="round" />
                <LinePath data={data} x={(d) => (xScale(d.date) ?? 0) + xScale.bandwidth() / 2} y={(d) => yRightScale(d.riesgo_activo)} stroke="#f59f00" strokeWidth={2} curve={curveMonotoneX} strokeLinecap="round" strokeLinejoin="round" />
                <LinePath data={data} x={(d) => (xScale(d.date) ?? 0) + xScale.bandwidth() / 2} y={(d) => yRightScale(d.sentimiento_neto)} stroke="#0f766e" strokeWidth={2} curve={curveMonotoneX} strokeLinecap="round" strokeLinejoin="round" />
                {data.map((d, i) => (
                  <rect
                    key={i}
                    x={(xScale(d.date) ?? 0)}
                    y={0}
                    width={xScale.bandwidth()}
                    height={yMax}
                    fill="transparent"
                    onMouseMove={(event) => {
                      const point = localPoint(event) ?? { x: 0, y: 0 };
                      showTooltip({ tooltipData: d, tooltipLeft: point.x, tooltipTop: point.y });
                    }}
                    onMouseLeave={() => hideTooltip()}
                  />
                ))}
              </Group>
            </svg>
            {tooltipOpen && tooltipData && (
              <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{tooltipData.date}</div>
                <div style={{ color: "#b91c1c", marginTop: 4 }}>Negativos: <strong>{formatCompactAxisNumber(tooltipData.negativos)}</strong></div>
                <div style={{ color: "#f59f00", marginTop: 2 }}>Riesgo activo: <strong>{formatAxisPercentNoDecimals(tooltipData.riesgo_activo)}</strong></div>
                <div style={{ color: "#0f766e", marginTop: 2 }}>Sentimiento neto: <strong>{formatAxisPercentNoDecimals(tooltipData.sentimiento_neto)}</strong></div>
              </TooltipWithBounds>
            )}
          </div>
        );
      }}
    </ParentSize>
  );
};


/* ────────────────────────────────────────────────────────
   Heatmap component
   ──────────────────────────────────────────────────────── */
const Heatmap = ({ data }: { data: MonitorSocialHeatmapResponse | null }) => {
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const values = (data?.items ?? []).map((item) => item.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<{ label: string; value: number; posts: number; x: number; y: number } | null>(null);

  const byKey = new Map((data?.items ?? []).map((item) => [`${item.month}-${item.weekday}`, item]));
  const tooltipMetric = toHeatmapMetricKey(data?.metric);

  const toColor = (value: number) => {
    const ratio = (value - min) / Math.max(max - min, 0.0001);
    const hue = 2 + (1 - ratio) * 180;
    const alpha = 0.2 + ratio * 0.7;
    return `hsla(${hue}, 84%, 45%, ${alpha})`;
  };

  const onHoverCell = (event: MouseEvent<HTMLDivElement>, label: string, value: number, posts: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(event.clientX - rect.left, 12), rect.width - 170);
    const y = Math.min(Math.max(event.clientY - rect.top, 20), rect.height - 10);
    setHovered({ label, value, posts, x, y });
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, fontSize: 12 }}>
        <div />
        {weekdays.map((day) => (
          <div key={day} style={{ textAlign: "center", color: "#64748b" }}>{day}</div>
        ))}
        {months.map((month, monthIndex) => (
          <div key={month} style={{ display: "contents" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4, color: "#64748b" }}>{month}</div>
            {weekdays.map((_day, dayIndex) => {
              const item = byKey.get(`${monthIndex + 1}-${dayIndex + 1}`);
              const value = item?.value ?? 0;
              return (
                <div
                  key={`${month}-${dayIndex}`}
                  style={{ height: 24, borderRadius: 4, cursor: "pointer", background: toColor(value) }}
                  onMouseEnter={(event) => onHoverCell(event, `${month} ${weekdays[dayIndex]}`, value, item?.posts ?? 0)}
                  onMouseMove={(event) => onHoverCell(event, `${month} ${weekdays[dayIndex]}`, value, item?.posts ?? 0)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
        Escala color: {formatMetricValue(tooltipMetric, min)} - {formatMetricValue(tooltipMetric, max)}
      </div>
      {hovered ? (
        <div style={{ position: "absolute", zIndex: 20, width: 165, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", padding: "6px 8px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", left: hovered.x, top: hovered.y, transform: "translateY(-105%)", pointerEvents: "none" }}>
          <div style={{ fontWeight: 600, color: "#1e293b" }}>{hovered.label}</div>
          <div style={{ color: "#475569" }}>Valor: {formatChartMetricValue(tooltipMetric, hovered.value)}</div>
          <div style={{ color: "#475569" }}>Posts: {formatCompactAxisNumber(hovered.posts)}</div>
        </div>
      ) : null}
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════ */
export const MonitorSocialOverviewPage = () => {
  const client = useApiClient();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = session?.role ?? "Viewer";
  const canRefresh = role === "Admin" || role === "Analyst";
  const canExport = role === "Admin" || role === "Analyst";
  const canOverrideComments = role === "Admin" || role === "Analyst";

  const tab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);
  const preset = useMemo(() => parsePreset(searchParams.get("preset")), [searchParams]);
  const from = useMemo(() => searchParams.get("from") ?? undefined, [searchParams]);
  const to = useMemo(() => searchParams.get("to") ?? undefined, [searchParams]);
  const timeGranularity = useMemo(() => parseTimeGranularity(searchParams.get("time_granularity")), [searchParams]);
  const apiTrendGranularity = useMemo(() => toApiTrendGranularity(timeGranularity), [timeGranularity]);
  const comparisonMode = useMemo(() => parseComparisonMode(searchParams.get("comparison_mode")), [searchParams]);
  const comparisonDays = useMemo(() => {
    const raw = searchParams.get("comparison_days");
    if (!raw) return 30;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(366, parsed)) : 30;
  }, [searchParams]);

  const selectedChannels = useMemo(() => parseCsvList(searchParams.get("channel")).filter((item) => CHANNEL_OPTIONS.includes(item as SocialChannel)) as SocialChannel[], [searchParams]);
  const selectedAccounts = useMemo(() => parseCsvList(searchParams.get("account")), [searchParams]);
  const selectedPostTypes = useMemo(() => parseCsvList(searchParams.get("post_type")).map(normalizePostType), [searchParams]);
  const selectedCampaigns = useMemo(() => parseCsvList(searchParams.get("campaign")).map((item) => item.toLowerCase()), [searchParams]);
  const selectedStrategies = useMemo(() => parseCsvList(searchParams.get("strategy")).map((item) => item.toLowerCase()), [searchParams]);
  const selectedHashtags = useMemo(() => parseCsvList(searchParams.get("hashtag")).map((item) => item.toLowerCase().replace(/^#+/, "")), [searchParams]);
  const selectedTopics = useMemo(() => parseCsvList(searchParams.get("topic")).map((item) => item.toLowerCase()), [searchParams]);
  const selectedSentiment = useMemo(() => parseSentimentFilter(searchParams.get("sentiment")), [searchParams]);

  const postsSort = useMemo(() => parsePostSort(searchParams.get("posts_sort") ?? searchParams.get("sort")), [searchParams]);
  const accountsSort = useMemo(() => parseAccountsSort(searchParams.get("accounts_sort") ?? searchParams.get("sort")), [searchParams]);
  const accountsCursor = useMemo(() => searchParams.get("accounts_cursor") ?? undefined, [searchParams]);
  const accountsLimit = useMemo(() => parseIntFromQuery(searchParams.get("accounts_limit"), 100, 1, 500), [searchParams]);
  const minPosts = useMemo(() => parseIntFromQuery(searchParams.get("min_posts"), 5, 1, 2000), [searchParams]);
  const minExposure = useMemo(() => parseIntFromQuery(searchParams.get("min_exposure"), 5000, 0, 10_000_000_000), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [refreshingRun, setRefreshingRun] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiError, setUiError] = useState<MonitorSocialUiError>("none");

  const [overview, setOverview] = useState<MonitorSocialOverviewResponse | null>(null);
  const [facetsData, setFacetsData] = useState<MonitorSocialFacetsResponse | null>(null);
  const [accountsData, setAccountsData] = useState<MonitorSocialAccountsResponse | null>(null);
  const [pageMetricsData, setPageMetricsData] = useState<Map<string, { followers: number; newFollowers: number; pageReach: number; pageViews: number }>>(new Map());
  const [riskData, setRiskData] = useState<MonitorSocialRiskResponse | null>(null);
  const [etlData, setEtlData] = useState<MonitorSocialEtlQualityResponse | null>(null);
  const [runs, setRuns] = useState<MonitorSocialRunItem[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasNext, setPostsHasNext] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);

  const [heatmapData, setHeatmapData] = useState<MonitorSocialHeatmapResponse | null>(null);
  const [scatterData, setScatterData] = useState<MonitorSocialScatterResponse | null>(null);
  const [trendByDimensionData, setTrendByDimensionData] = useState<MonitorSocialTrendByDimensionResponse | null>(null);
  const [topicBreakdownData, setTopicBreakdownData] = useState<MonitorSocialTopicBreakdownResponse | null>(null);
  const [breakdownData, setBreakdownData] = useState<MonitorSocialErBreakdownResponse | null>(null);
  const [erTargets, setErTargets] = useState<MonitorSocialErTargetsResponse | null>(null);
  const [loadingTrendByDimension, setLoadingTrendByDimension] = useState(false);
  const [trendByDimensionError, setTrendByDimensionError] = useState<string | null>(null);
  const [loadingTopicBreakdown, setLoadingTopicBreakdown] = useState(false);
  const [topicBreakdownError, setTopicBreakdownError] = useState<string | null>(null);

  const [heatmapMetric, setHeatmapMetric] = useState<SocialHeatmapMetric>("er");
  const [scatterDimension, setScatterDimension] = useState<SocialScatterDimension>("channel");
  const [scatterXMetric, setScatterXMetric] = useState<ScatterMetric>("exposure_total");
  const [scatterYMetric, setScatterYMetric] = useState<ScatterMetric>("er_global");
  const [trendByDimensionDimension, setTrendByDimensionDimension] = useState<SocialScatterDimension>("channel");
  const [trendByDimensionMetric, setTrendByDimensionMetric] = useState<TrendByDimensionMetric>("exposure_total");
  const [topicBreakdownDimension, setTopicBreakdownDimension] = useState<SocialTopicBreakdownDimension>("channel");
  const [topicBreakdownMetric, setTopicBreakdownMetric] = useState<TrendByDimensionMetric>("engagement_total");
  const [topicBreakdownNormalize100, setTopicBreakdownNormalize100] = useState(true);
  const [trendByDimensionSeriesSearch, setTrendByDimensionSeriesSearch] = useState("");
  const [visibleTrendByDimensionSeries, setVisibleTrendByDimensionSeries] = useState<string[]>([]);
  const [breakdownDimension, setBreakdownDimension] = useState<SocialErBreakdownDimension>("post_type");
  const [breakdownMetric, setBreakdownMetric] = useState<BreakdownMetric>("er_global");

  const [trendLeftMetric, setTrendLeftMetric] = useState<TrendMetric>("exposure_total");
  const [trendRightMetric, setTrendRightMetric] = useState<TrendMetric>("er_global");

  const [mixBarMetric, setMixBarMetric] = useState<MixMetric>("exposure_total");
  const [mixLineMetric, setMixLineMetric] = useState<MixMetric>("er_global");
  const [mixBarAxis, setMixBarAxis] = useState<AxisSide>("left");
  const [mixLineAxis, setMixLineAxis] = useState<AxisSide>("left");
  const [accountBarMetric, setAccountBarMetric] = useState<AccountMetric>("er_ponderado");
  const [accountLineMetric, setAccountLineMetric] = useState<AccountMetric>("exposure_total");
  const [accountBarAxis, setAccountBarAxis] = useState<AxisSide>("left");
  const [accountLineAxis, setAccountLineAxis] = useState<AxisSide>("left");

  const [topAccountsLeftScaleMode, setTopAccountsLeftScaleMode] = useState<ScaleMode>("auto");
  const [topAccountsRightScaleMode, setTopAccountsRightScaleMode] = useState<ScaleMode>("auto");
  const [trendByDimensionScaleMode, setTrendByDimensionScaleMode] = useState<ScaleMode>("auto");
  const [breakdownScaleMode, setBreakdownScaleMode] = useState<ScaleMode>("auto");

  const [minPostsInput, setMinPostsInput] = useState(String(minPosts));
  const [minExposureInput, setMinExposureInput] = useState(String(minExposure));

  useEffect(() => { setMinPostsInput(String(minPosts)); }, [minPosts]);
  useEffect(() => { setMinExposureInput(String(minExposure)); }, [minExposure]);

  const setQueryPatch = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || !String(value).trim()) next.delete(key);
      else next.set(key, String(value).trim());
    }
    setSearchParams(next, { replace: true });
  };

  const applyPreset = (value: SocialDatePreset) => {
    if (value === "custom") { setQueryPatch({ preset: value, from: from ?? "2026-01-01", to: to ?? new Date().toISOString().slice(0, 10) }); return; }
    setQueryPatch({ preset: value, from: null, to: null });
  };

  const commonQuery = useMemo(() => {
    const query: Record<string, string | number | undefined> = {
      preset, channel: selectedChannels.length > 0 ? selectedChannels.join(",") : undefined,
      account: selectedAccounts.length > 0 ? selectedAccounts.join(",") : undefined,
      post_type: selectedPostTypes.length > 0 ? selectedPostTypes.join(",") : undefined,
      campaign: selectedCampaigns.length > 0 ? selectedCampaigns.join(",") : undefined,
      strategy: selectedStrategies.length > 0 ? selectedStrategies.join(",") : undefined,
      hashtag: selectedHashtags.length > 0 ? selectedHashtags.join(",") : undefined,
      topic: selectedTopics.length > 0 ? selectedTopics.join(",") : undefined,
      sentiment: selectedSentiment === "all" ? undefined : selectedSentiment,
      comparison_mode: comparisonMode,
      comparison_days: comparisonMode === "exact_days" ? comparisonDays : undefined
    };
    if (preset === "custom") { if (from) query.from = from; if (to) query.to = to; }
    return query;
  }, [preset, selectedChannels, selectedAccounts, selectedPostTypes, selectedCampaigns, selectedStrategies, selectedHashtags, selectedTopics, selectedSentiment, comparisonMode, comparisonDays, from, to]);

  const normalizePosts = (items: MonitorSocialPostsResponse["items"]): PostRow[] =>
    (items ?? []).map((item) => {
      const row = item as unknown as PostRow;
      const raw = item as unknown as Record<string, unknown>;
      return {
        id: row.id, published_at: row.published_at, channel: row.channel, account_name: row.account_name,
        post_type: row.post_type, title: row.title, post_url: row.post_url, text: row.text ?? null,
        image_url: (raw.image_url as string | null) ?? null, exposure: Number(row.exposure ?? 0),
        engagement_total: Number(row.engagement_total ?? 0), likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0), awario_comments_count: Number(raw.awario_comments_count ?? 0),
        shares: Number(row.shares ?? 0), views: Number(row.views ?? 0), impressions: Number(raw.impressions ?? 0),
        reach: Number(raw.reach ?? 0), clicks: Number(raw.clicks ?? 0), saves: Number(raw.saves ?? 0),
        sentiment: row.sentiment, sentiment_confidence: (raw.sentiment_confidence as number | null) ?? null,
        source_score: Number(raw.source_score ?? 0), campaign: (raw.campaign as string | null) ?? null,
        strategies: (raw.strategies as string[]) ?? [], hashtags: (raw.hashtags as string[]) ?? [],
        topics: (raw.topics as Array<{ key: string; label: string; confidence: number; rank: number }>) ?? []
      };
    });

  const applyRequestError = (requestError: unknown) => {
    setError((requestError as Error)?.message ?? "No fue posible completar la solicitud");
    setUiError(getErrorKind(requestError));
  };

  const loadCoreDashboard = async () => {
    setLoading(true); setError(null); setUiError("none");
    try {
      const [overviewResponse, runsResponse, etlResponse, targetsResponse] = await Promise.all([
        client.getMonitorSocialOverview({ ...commonQuery, trend_granularity: apiTrendGranularity }),
        client.listMonitorSocialRuns(20), client.getMonitorSocialEtlQuality(20),
        client.getMonitorSocialErTargets({ ...commonQuery, year: 2026 })
      ]);
      setOverview(overviewResponse); setRuns(runsResponse.items ?? []); setEtlData(etlResponse); setErTargets(targetsResponse);
    } catch (requestError) { applyRequestError(requestError); setOverview(null); setRuns([]); setEtlData(null); setErTargets(null); }
    finally { setLoading(false); }
  };

  const loadFacets = async () => {
    setLoadingFacets(true);
    try { const response = await client.getMonitorSocialFacets(commonQuery); setFacetsData(response); }
    catch (requestError) { applyRequestError(requestError); setFacetsData(null); }
    finally { setLoadingFacets(false); }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const [response, pageRes] = await Promise.all([
        client.getMonitorSocialAccounts({ ...commonQuery, min_posts: minPosts, min_exposure: minExposure, sort: accountsSort, limit: accountsLimit, cursor: accountsCursor }),
        client.getMonitorSocialPageMetrics({ channels: commonQuery.channel as string | undefined })
      ]);
      setAccountsData(response);
      const pm = new Map<string, { followers: number; newFollowers: number; pageReach: number; pageViews: number }>();
      for (const item of pageRes.items) {
        const key = `${item.channel}:${item.accountName}`;
        const existing = pm.get(key);
        if (!existing || item.followers > existing.followers) pm.set(key, { followers: item.followers, newFollowers: item.newFollowers, pageReach: item.pageReach, pageViews: item.pageViews });
      }
      setPageMetricsData(pm);
    } catch (requestError) { applyRequestError(requestError); setAccountsData(null); }
    finally { setLoadingAccounts(false); }
  };

  const loadRisk = async () => {
    setLoadingRisk(true);
    try { const response = await client.getMonitorSocialRisk(commonQuery); setRiskData(response); }
    catch (requestError) { applyRequestError(requestError); setRiskData(null); }
    finally { setLoadingRisk(false); }
  };

  const loadPostsFirstPage = async () => {
    setLoadingPosts(true);
    try {
      const response = await client.listMonitorSocialPosts({ ...commonQuery, sort: postsSort, limit: 50 });
      setPosts(normalizePosts(response.items ?? []));
      setPostsCursor(response.page_info.next_cursor ?? null); setPostsHasNext(Boolean(response.page_info.has_next));
    } catch (requestError) { applyRequestError(requestError); setPosts([]); setPostsCursor(null); setPostsHasNext(false); }
    finally { setLoadingPosts(false); }
  };

  const loadHeatmap = async () => {
    try { const response = await client.getMonitorSocialHeatmap({ ...commonQuery, metric: heatmapMetric }); setHeatmapData(response); }
    catch (requestError) { applyRequestError(requestError); setHeatmapData(null); }
  };

  const loadScatter = async () => {
    try { const response = await client.getMonitorSocialScatter({ ...commonQuery, dimension: scatterDimension }); setScatterData(response); }
    catch (requestError) { applyRequestError(requestError); setScatterData(null); }
  };

  const loadTrendByDimension = async () => {
    setLoadingTrendByDimension(true); setTrendByDimensionError(null);
    try {
      const response = await client.getMonitorSocialTrendByDimension({ ...commonQuery, trend_granularity: apiTrendGranularity, dimension: trendByDimensionDimension, metric: trendByDimensionMetric, series_limit: 30 });
      setTrendByDimensionData(response);
    } catch (requestError) { applyRequestError(requestError); setTrendByDimensionError((requestError as Error)?.message ?? "No fue posible cargar la tendencia por dimensión"); setTrendByDimensionData(null); }
    finally { setLoadingTrendByDimension(false); }
  };

  const loadTopicBreakdown = async () => {
    setLoadingTopicBreakdown(true); setTopicBreakdownError(null);
    try {
      const response = await client.getMonitorSocialTopicBreakdown({ ...commonQuery, dimension: topicBreakdownDimension, metric: topicBreakdownMetric, topic_limit: 15, segment_limit: 12 });
      setTopicBreakdownData(response);
    } catch (requestError) { applyRequestError(requestError); setTopicBreakdownError((requestError as Error)?.message ?? "No fue posible cargar distribución por tema"); setTopicBreakdownData(null); }
    finally { setLoadingTopicBreakdown(false); }
  };

  const loadBreakdown = async () => {
    try { const response = await client.getMonitorSocialErBreakdown({ ...commonQuery, dimension: breakdownDimension }); setBreakdownData(response); }
    catch (requestError) { applyRequestError(requestError); setBreakdownData(null); }
  };

  useEffect(() => { void loadCoreDashboard(); }, [client, commonQuery, apiTrendGranularity, reloadVersion]);
  useEffect(() => { void loadFacets(); }, [client, commonQuery, reloadVersion]);
  useEffect(() => { void loadAccounts(); }, [client, commonQuery, minPosts, minExposure, accountsSort, accountsLimit, accountsCursor, reloadVersion]);
  useEffect(() => { void loadRisk(); }, [client, commonQuery, reloadVersion]);
  useEffect(() => { void loadPostsFirstPage(); }, [client, commonQuery, postsSort, reloadVersion]);
  useEffect(() => { void loadHeatmap(); }, [client, commonQuery, heatmapMetric, reloadVersion]);
  useEffect(() => { void loadScatter(); }, [client, commonQuery, scatterDimension, reloadVersion]);
  useEffect(() => { void loadTrendByDimension(); }, [client, commonQuery, trendByDimensionDimension, trendByDimensionMetric, apiTrendGranularity, reloadVersion]);
  useEffect(() => { void loadTopicBreakdown(); }, [client, commonQuery, topicBreakdownDimension, topicBreakdownMetric, reloadVersion]);
  useEffect(() => { void loadBreakdown(); }, [client, commonQuery, breakdownDimension, reloadVersion]);

  useEffect(() => {
    if (!pendingRunId) return undefined;
    const timer = setInterval(() => {
      client.listMonitorSocialRuns(20).then((response) => {
        const items = response.items ?? []; setRuns(items);
        const target = items.find((item) => item.id === pendingRunId);
        if (!target) return;
        if (target.status === "completed" || target.status === "failed") { setPendingRunId(null); setReloadVersion((c) => c + 1); }
      }).catch((pollError) => { applyRequestError(pollError); setPendingRunId(null); });
    }, 4000);
    return () => clearInterval(timer);
  }, [client, pendingRunId]);

  const loadMorePosts = async () => {
    if (!postsHasNext || !postsCursor || loadingMorePosts) return;
    setLoadingMorePosts(true); setError(null); setUiError("none");
    try {
      const response = await client.listMonitorSocialPosts({ ...commonQuery, sort: postsSort, limit: 50, cursor: postsCursor });
      setPosts((current) => [...current, ...normalizePosts(response.items ?? [])]);
      setPostsCursor(response.page_info.next_cursor ?? null); setPostsHasNext(Boolean(response.page_info.has_next));
    } catch (loadError) { applyRequestError(loadError); }
    finally { setLoadingMorePosts(false); }
  };

  const triggerRun = async () => {
    if (!canRefresh || refreshingRun) return;
    setRefreshingRun(true); setError(null); setUiError("none");
    try { const accepted = await client.createMonitorSocialRun({ force: false }); setPendingRunId(accepted.run_id); setReloadVersion((c) => c + 1); }
    catch (runError) { applyRequestError(runError); }
    finally { setRefreshingRun(false); }
  };

  const exportFilteredCsv = async () => {
    if (!canExport || exportingCsv) return;
    setExportingCsv(true); setError(null); setUiError("none");
    try {
      const allPosts: PostRow[] = []; let cursor: string | undefined; let hasNext = true;
      while (hasNext) {
        const page = await client.listMonitorSocialPosts({ ...commonQuery, sort: postsSort, limit: 200, cursor });
        allPosts.push(...normalizePosts(page.items ?? []));
        const nextCursor = page.page_info.next_cursor ?? undefined;
        hasNext = Boolean(page.page_info.has_next && nextCursor); cursor = nextCursor;
      }
      const ov = overview as unknown as { kpis?: Record<string, number>; previous_period?: Record<string, number> };
      const rows: string[] = [];
      rows.push("section,metric,value");
      rows.push(`resumen,generated_at,${csvEscape(new Date().toISOString())}`);
      rows.push(`resumen,preset,${csvEscape(preset)}`);
      rows.push(`resumen,comparison_mode,${csvEscape(comparisonMode)}`);
      rows.push(`resumen,posts,${csvEscape(ov.kpis?.posts ?? allPosts.length)}`);
      rows.push(`resumen,posts_previous,${csvEscape(ov.previous_period?.posts ?? 0)}`);
      rows.push(`resumen,exposure_total,${csvEscape(ov.kpis?.exposure_total ?? 0)}`);
      rows.push(`resumen,exposure_previous,${csvEscape(ov.previous_period?.exposure_total ?? 0)}`);
      rows.push("");
      rows.push(["id","published_at","channel","account_name","post_type","campaign","strategies","hashtags","title","post_url","sentiment","exposure","engagement_total","post_er","likes","comments","shares","views"].join(","));
      for (const post of allPosts) {
        const er = (post.engagement_total / Math.max(post.exposure, 1)) * 100;
        rows.push([csvEscape(post.id),csvEscape(post.published_at),csvEscape(post.channel),csvEscape(post.account_name),csvEscape(post.post_type ?? "unknown"),csvEscape(post.campaign ?? ""),csvEscape((post.strategies ?? []).join("|")),csvEscape((post.hashtags ?? []).join("|")),csvEscape(post.title),csvEscape(post.post_url),csvEscape(post.sentiment),csvEscape(post.exposure),csvEscape(post.engagement_total),csvEscape(er.toFixed(4)),csvEscape(post.likes),csvEscape(post.comments),csvEscape(post.shares),csvEscape(post.views)].join(","));
      }
      const filename = `social-overview-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
      downloadTextFile(rows.join("\n"), filename, "text/csv;charset=utf-8;");
    } catch (csvError) { applyRequestError(csvError); }
    finally { setExportingCsv(false); }
  };

  const exportExcel = async () => {
    if (!canExport || exportingExcel) return;
    setExportingExcel(true); setError(null); setUiError("none");
    try {
      const blob = await client.downloadMonitorSocialExcel({ ...commonQuery, sort: postsSort, min_posts: minPosts, min_exposure: minExposure });
      const filename = `social-analytics-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.xlsx`;
      downloadBlobFile(blob, filename);
    } catch (downloadError) { applyRequestError(downloadError); }
    finally { setExportingExcel(false); }
  };

  const toggleMultiValue = (key: string, values: string[], value: string) => {
    const normalized = value.trim();
    const exists = values.includes(normalized);
    const next = exists ? values.filter((item) => item !== normalized) : [...values, normalized];
    setQueryPatch({ [key]: next.length > 0 ? next.join(",") : null, accounts_cursor: null });
  };

  const openPostsByTopic = (topicKey: string) => {
    const normalized = topicKey.trim().toLowerCase();
    if (!normalized) return;
    setQueryPatch({ tab: "posts", topic: normalized, accounts_cursor: null });
  };

  const toggleTrendByDimensionSeries = (label: string) => {
    setVisibleTrendByDimensionSeries((current) => {
      const exists = current.includes(label);
      if (exists) return current.filter((item) => item !== label);
      const ordered = trendByDimensionSeries.map((item) => item.label);
      const next = [...current, label];
      return ordered.filter((item) => next.includes(item));
    });
  };

  /* ── Normalized overview ── */
  const normalizedOverview = (overview ?? {}) as unknown as {
    kpis?: Record<string, number | string | null>;
    previous_period?: Record<string, number>;
    target_progress?: { target_shs?: number; quarterly_sov_target_pp?: number; er_by_channel?: Array<{ channel: SocialChannel; baseline_2025_er: number; target_2026_er: number; current_er: number; gap: number; progress_pct: number; source: "auto" | "manual" }> };
    comparison?: { label?: string; current_window_start?: string; current_window_end?: string; previous_window_start?: string; previous_window_end?: string };
    trend_series?: Array<Record<string, unknown>>;
    by_channel?: Array<Record<string, unknown>>;
    reconciliation_status?: string;
    diagnostics?: Record<string, unknown>;
    last_etl_at?: string | null;
    window_start?: string;
    window_end?: string;
  };

  /* ── Trend series ── */
  const trendSeries = useMemo(() => {
    const raw = normalizedOverview.trend_series;
    if (raw && raw.length > 0) {
      const rows = raw.map((item) => ({
        bucket_start: typeof item.bucket_start === "string" ? item.bucket_start : null,
        bucket_end: typeof item.bucket_end === "string" ? item.bucket_end : null,
        bucket_label: String(item.bucket_label ?? ""),
        posts: Number(item.posts ?? 0), exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0), impressions_total: Number(item.impressions_total ?? 0),
        reach_total: Number(item.reach_total ?? 0), clicks_total: Number(item.clicks_total ?? 0),
        likes_total: Number(item.likes_total ?? 0), comments_total: Number(item.comments_total ?? 0),
        shares_total: Number(item.shares_total ?? 0), views_total: Number(item.views_total ?? 0),
        er_global: Number(item.er_global ?? 0), ctr: Number(item.ctr ?? 0),
        er_impressions: Number(item.er_impressions ?? 0), er_reach: Number(item.er_reach ?? 0),
        view_rate: Number(item.view_rate ?? 0), likes_share: Number(item.likes_share ?? 0),
        comments_share: Number(item.comments_share ?? 0), shares_share: Number(item.shares_share ?? 0),
        riesgo_activo: Number(item.riesgo_activo ?? 0), shs: Number(item.shs ?? 0)
      }));
      return aggregateTrendSeriesRows(rows, timeGranularity, TREND_METRICS.filter((m) => m !== "posts"));
    }
    return [];
  }, [normalizedOverview, timeGranularity]);

  const channelData = useMemo(() => (normalizedOverview.by_channel ?? []).map((item) => ({
    channel: String(item.channel ?? "facebook") as SocialChannel,
    posts: Number(item.posts ?? 0), exposure_total: Number(item.exposure_total ?? 0),
    engagement_total: Number(item.engagement_total ?? 0), impressions_total: Number(item.impressions_total ?? 0),
    reach_total: Number(item.reach_total ?? 0), clicks_total: Number(item.clicks_total ?? 0),
    likes_total: Number(item.likes_total ?? 0), comments_total: Number(item.comments_total ?? 0),
    shares_total: Number(item.shares_total ?? 0), views_total: Number(item.views_total ?? 0),
    er_global: Number(item.er_global ?? 0), ctr: Number(item.ctr ?? 0),
    er_impressions: Number(item.er_impressions ?? 0), er_reach: Number(item.er_reach ?? 0),
    view_rate: Number(item.view_rate ?? 0), likes_share: Number(item.likes_share ?? 0),
    comments_share: Number(item.comments_share ?? 0), shares_share: Number(item.shares_share ?? 0),
    riesgo_activo: Number(item.riesgo_activo ?? 0), sov_interno: Number(item.sov_interno ?? 0)
  })), [normalizedOverview]);

  const normalizeSearchToken = (value: string): string => value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ");
  const filterBySearch = (values: string[], term: string): string[] => { const nt = normalizeSearchToken(term); const ct = nt.replace(/\s+/g, ""); if (!nt) return values; return values.filter((item) => { const ni = normalizeSearchToken(item); return ni.includes(nt) || ni.replace(/\s+/g, "").includes(ct); }); };

  const dataStatus = useMemo(() => {
    if (loading) return "loading"; if (uiError === "permission_denied") return "permission_denied";
    if (error) return "error"; if ((normalizedOverview.kpis?.posts as number | undefined) === 0 && posts.length === 0) return "empty";
    if ((normalizedOverview.reconciliation_status ?? "ok") !== "ok") return "recon_warning";
    if (Boolean(normalizedOverview.diagnostics?.insufficient_data)) return "partial_data";
    if (riskData?.stale_data) return "stale_data"; return "ready";
  }, [loading, uiError, error, normalizedOverview, posts.length, riskData?.stale_data]);

  /* ── Chart data derivations ── */
  const topAccountsDual = useMemo(() => [...(accountsData?.items ?? [])].sort((a, b) => Number(b[accountBarMetric]) - Number(a[accountBarMetric])).slice(0, 10).map((item) => ({
    account_name: item.account_name, posts: Number(item.posts ?? 0), exposure_total: Number(item.exposure_total ?? 0),
    engagement_total: Number(item.engagement_total ?? 0), impressions_total: Number(item.impressions_total ?? 0),
    reach_total: Number(item.reach_total ?? 0), clicks_total: Number(item.clicks_total ?? 0),
    likes_total: Number(item.likes_total ?? 0), comments_total: Number(item.comments_total ?? 0),
    shares_total: Number(item.shares_total ?? 0), views_total: Number(item.views_total ?? 0),
    er_ponderado: Number(item.er_ponderado ?? 0), ctr: Number(item.ctr ?? 0),
    er_impressions: Number(item.er_impressions ?? 0), er_reach: Number(item.er_reach ?? 0),
    view_rate: Number(item.view_rate ?? 0), likes_share: Number(item.likes_share ?? 0),
    comments_share: Number(item.comments_share ?? 0), shares_share: Number(item.shares_share ?? 0),
    riesgo_activo: Number(item.riesgo_activo ?? 0), sov_interno: Number(item.sov_interno ?? 0)
  })), [accountsData, accountBarMetric]);

  const trendByDimensionSeries = useMemo(() => (trendByDimensionData?.series ?? []).map((series, index) => {
    const normalized = series.label.trim().toLowerCase();
    const channelColor = trendByDimensionDimension === "channel" && CHANNEL_OPTIONS.includes(normalized as SocialChannel) ? CHANNEL_SERIES_COLORS[normalized as SocialChannel] : null;
    const points = aggregateTrendSeriesRows((series.points ?? []).map((p) => ({ bucket_start: p.bucket_start, bucket_end: p.bucket_end, bucket_label: p.bucket_label, posts: Number(p.posts ?? 0), value: Number(p.value ?? 0) })), timeGranularity, ["value"]);
    const postsTotal = points.reduce((acc, p) => acc + Number(p.posts ?? 0), 0);
    const additiveTotal = points.reduce((acc, p) => acc + Number(p.value ?? 0), 0);
    const weightedTotal = points.reduce((acc, p) => acc + Number(p.value ?? 0) * Math.max(Number(p.posts ?? 0), 0), 0);
    const metricTotal = ADDITIVE_METRICS.includes(trendByDimensionMetric) ? roundMetric(additiveTotal) : roundMetric(weightedTotal / Math.max(postsTotal, 1));
    return { ...series, metric_total: metricTotal, posts_total: postsTotal, points, key: `series_${index}`, color: channelColor ?? DIMENSION_SERIES_COLORS[index % DIMENSION_SERIES_COLORS.length] };
  }), [trendByDimensionData, trendByDimensionDimension, timeGranularity, trendByDimensionMetric]);

  useEffect(() => {
    if (trendByDimensionSeries.length === 0) { setVisibleTrendByDimensionSeries([]); return; }
    if (trendByDimensionDimension === "channel") { setVisibleTrendByDimensionSeries(trendByDimensionSeries.map((i) => i.label)); return; }
    setVisibleTrendByDimensionSeries(trendByDimensionSeries.slice(0, 8).map((i) => i.label));
  }, [trendByDimensionSeries, trendByDimensionDimension, trendByDimensionMetric]);

  const filteredTrendByDimensionSeries = useMemo(() => filterBySearch(trendByDimensionSeries.map((i) => i.label), trendByDimensionSeriesSearch), [trendByDimensionSeries, trendByDimensionSeriesSearch]);
  const trendByDimensionVisibleSeries = useMemo(() => trendByDimensionSeries.filter((i) => visibleTrendByDimensionSeries.includes(i.label)), [trendByDimensionSeries, visibleTrendByDimensionSeries]);

  const trendByDimensionChartData = useMemo(() => {
    if (trendByDimensionSeries.length === 0) return [];
    const buckets = new Map<string, { bucketLabel: string; values: Record<string, number> }>();
    for (const series of trendByDimensionSeries) {
      for (const point of series.points) {
        const bk = point.bucket_start;
        const current = buckets.get(bk) ?? { bucketLabel: point.bucket_label, values: {} };
        current.bucketLabel = current.bucketLabel || point.bucket_label;
        current.values[series.key] = Number(point.value ?? 0);
        buckets.set(bk, current);
      }
    }
    return Array.from(buckets.keys()).sort().map((bk, i) => {
      const current = buckets.get(bk);
      const row: Record<string, string | number | null> = { bucket_label: current?.bucketLabel ?? `Bucket ${i + 1}` };
      for (const series of trendByDimensionSeries) {
        if (current && Object.prototype.hasOwnProperty.call(current.values, series.key)) {
          const rawValue = Number(current.values[series.key] ?? 0);
          row[`raw_${series.key}`] = rawValue; row[series.key] = rawValue;
        } else { row[`raw_${series.key}`] = null; row[series.key] = null; }
      }
      return row;
    });
  }, [trendByDimensionSeries, trendByDimensionScaleMode]);

  const topicBreakdownSegments = useMemo(() => (topicBreakdownData?.segments_order ?? []).map((s, i) => ({ ...s, color: TOPIC_SEGMENT_COLORS[i % TOPIC_SEGMENT_COLORS.length] })), [topicBreakdownData]);

  const topicBreakdownChartData = useMemo(() => {
    const segments = topicBreakdownData?.segments_order ?? [];
    return (topicBreakdownData?.items ?? []).map((item) => {
      const valuesByKey = new Map(item.segments.map((s) => [s.key, Number(s.metric_value ?? 0)]));
      const row: Record<string, string | number> = { topic_key: item.topic_key, topic_label: item.topic_label, metric_total: Number(item.metric_total ?? 0), posts_total: Number(item.posts_total ?? 0) };
      let total = 0;
      for (const s of segments) { const v = valuesByKey.get(s.key) ?? 0; row[`raw_${s.key}`] = v; total += v; row[s.key] = v; }
      if (topicBreakdownNormalize100) { const denom = Math.max(total, 0.00001); for (const s of segments) row[s.key] = (Number(row[s.key] ?? 0) / denom) * 100; }
      return row;
    });
  }, [topicBreakdownData, topicBreakdownNormalize100]);

  const topicBreakdownChartHeight = useMemo(() => Math.max(320, topicBreakdownChartData.length * 34 + 90), [topicBreakdownChartData.length]);

  const erGapByChannel = useMemo(() => (erTargets?.items ?? []).map((i) => ({ channel: i.channel, current_er: i.current_er, target_2026_er: i.target_2026_er, gap: i.gap, source: i.source })), [erTargets]);
  const hasVisibleTargetByChannel = useMemo(() => erGapByChannel.some((i) => Math.abs(i.target_2026_er) > 0.0001), [erGapByChannel]);

  const breakdownChartData = useMemo(() => [...(breakdownData?.items ?? [])].map((i) => ({ ...i, metric_value: Number(i[breakdownMetric] ?? 0) })).sort((a, b) => Number(b.metric_value) - Number(a.metric_value) || Number(b.posts) - Number(a.posts)).slice(0, 100), [breakdownData, breakdownMetric]);

  const sovPieData = useMemo(() => {
    const sorted = [...(accountsData?.items ?? [])].sort((a, b) => b.sov_interno - a.sov_interno);
    const top = sorted.slice(0, 6).map((i) => ({ name: i.account_name, value: i.sov_interno }));
    const others = sorted.slice(6).reduce((acc, i) => acc + i.sov_interno, 0);
    if (others > 0.001) top.push({ name: "Otros", value: others });
    return top;
  }, [accountsData]);

  const pieColors = ["#e30613", "#1d4ed8", "#0f766e", "#f59f00", "#9333ea", "#64748b"];

  const scatterChartData = useMemo(() => (scatterData?.items ?? []).map((i) => ({
    label: i.label, posts: Number(i.posts ?? 0), x_value: Number(i[scatterXMetric] ?? 0),
    y_value: Number(i[scatterYMetric] ?? 0), z: Math.max(1, Number(i.posts ?? 0)),
    exposure_total: Number(i.exposure_total ?? 0), engagement_total: Number(i.engagement_total ?? 0),
    er_global: Number(i.er_global ?? 0)
  })), [scatterData, scatterXMetric, scatterYMetric]);

  const riskSentimentTrendData = useMemo(() => {
    const rows = (riskData?.sentiment_trend ?? []).map((i) => ({
      date: String(i.date ?? ""), clasificados: Number(i.clasificados ?? 0), positivos: Number(i.positivos ?? 0),
      negativos: Number(i.negativos ?? 0), neutrales: Number(i.neutrales ?? 0),
      sentimiento_neto: Number(i.sentimiento_neto ?? 0), riesgo_activo: Number(i.riesgo_activo ?? 0)
    }));
    if (timeGranularity === "day") return rows;
    const buckets = new Map<string, { label: string; start: Date; clasificados: number; positivos: number; negativos: number; neutrales: number }>();
    for (const row of rows) {
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/u.test(row.date) ? new Date(`${row.date}T00:00:00.000Z`) : new Date(row.date);
      if (Number.isNaN(parsedDate.getTime())) continue;
      const bucket = toTimeBucketMeta(parsedDate, timeGranularity);
      const current = buckets.get(bucket.key) ?? { label: bucket.label, start: bucket.start, clasificados: 0, positivos: 0, negativos: 0, neutrales: 0 };
      current.clasificados += row.clasificados; current.positivos += row.positivos; current.negativos += row.negativos; current.neutrales += row.neutrales;
      buckets.set(bucket.key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.start.getTime() - b.start.getTime()).map((i) => ({
      date: i.label, clasificados: i.clasificados, positivos: i.positivos, negativos: i.negativos, neutrales: i.neutrales,
      sentimiento_neto: roundMetric(((i.positivos - i.negativos) / Math.max(i.clasificados, 1)) * 100),
      riesgo_activo: roundMetric((i.negativos / Math.max(i.clasificados, 1)) * 100)
    }));
  }, [riskData, timeGranularity]);

  const riskTopChannels = useMemo(() => [...(riskData?.by_channel ?? [])].sort((a, b) => b.riesgo_activo - a.riesgo_activo || b.negativos - a.negativos).slice(0, 8), [riskData]);
  const riskTopAccounts = useMemo(() => [...(riskData?.by_account ?? [])].sort((a, b) => b.riesgo_activo - a.riesgo_activo || b.negativos - a.negativos).slice(0, 8), [riskData]);

  const targetErGlobal = useMemo(() => {
    const rows = normalizedOverview.target_progress?.er_by_channel ?? [];
    if (rows.length === 0) return 0;
    return rows.reduce((acc, r) => acc + Number(r.target_2026_er ?? 0), 0) / rows.length;
  }, [normalizedOverview]);

  const kpiCards = useMemo<KpiCardData[]>(() => {
    const kpis = normalizedOverview.kpis ?? {}; const prev = normalizedOverview.previous_period ?? {}; const tp = normalizedOverview.target_progress ?? {};
    const pc = Number(kpis.posts ?? 0); const pp = Number(prev.posts ?? 0);
    const ec = Number(kpis.exposure_total ?? 0); const ep = Number(prev.exposure_total ?? 0);
    const erc = Number(kpis.er_global ?? 0); const erp = Number(prev.er_global ?? 0);
    const rc = Number(kpis.riesgo_activo ?? 0); const rp = Number(prev.riesgo_activo ?? 0);
    const sc = Number(kpis.shs ?? 0); const sp = Number(prev.shs ?? 0); const ts = Number(tp.target_shs ?? 0);
    const sovc = Number(kpis.focus_account_sov ?? 0); const sovp = Number(prev.focus_account_sov ?? 0); const tsp = Number(tp.quarterly_sov_target_pp ?? 0);
    return [
      { id: "posts", title: "Posts", value: formatNumber(pc), previous: formatNumber(pp), goal: "Meta: --", status: `Vs anterior: ${formatNumber(pc - pp)}`, statusColor: toDeltaColor(pc - pp), info: KPI_INFO.posts, deltaValue: pc - pp },
      { id: "exposure_total", title: "Exposición", value: formatNumber(ec), previous: formatNumber(ep), goal: "Meta: --", status: `Vs anterior: ${formatNumber(ec - ep)}`, statusColor: toDeltaColor(ec - ep), info: KPI_INFO.exposure_total, deltaValue: ec - ep },
      { id: "er_global", title: "ER Global", value: formatPercent(erc), previous: formatPercent(erp), goal: `Meta: ${formatPercent(targetErGlobal)}`, status: `Gap meta: ${formatPercent(erc - targetErGlobal)}`, statusColor: toDeltaColor(erc - targetErGlobal), info: KPI_INFO.er_global, deltaValue: erc - targetErGlobal },
      { id: "riesgo_activo", title: "Riesgo activo", value: formatPercent(rc), previous: formatPercent(rp), goal: `Umbral: ${formatPercent(Number((overview as unknown as { settings?: { risk_threshold?: number } })?.settings?.risk_threshold ?? 0))}`, status: `Vs anterior: ${formatPercent(rc - rp)}`, statusColor: toDeltaColor(-(rc - rp)), info: KPI_INFO.riesgo_activo, deltaValue: -(rc - rp) },
      { id: "shs", title: "SHS (social)", value: formatScore(sc), previous: formatScore(sp), goal: `Meta: ${formatScore(ts)}`, status: `Gap meta: ${formatScore(sc - ts)}`, statusColor: toDeltaColor(sc - ts), info: KPI_INFO.shs, deltaValue: sc - ts },
      { id: "focus_account_sov", title: "SOV interno", value: formatPercent(sovc), previous: formatPercent(sovp), goal: `Meta trimestral: +${formatScore(tsp)} pp`, status: `Cuenta foco: ${String(kpis.focus_account ?? "n/a")}`, statusColor: "#64748b", info: KPI_INFO.focus_account_sov, deltaValue: sovc - sovp }
    ];
  }, [normalizedOverview, targetErGlobal, overview]);

  const secondaryKpis = useMemo(() => SECONDARY_KPI_METRICS.map((metric) => {
    const current = Number(normalizedOverview.kpis?.[metric] ?? 0);
    const previous = Number(normalizedOverview.previous_period?.[metric] ?? 0);
    const delta = current - previous;
    return { metric, label: METRIC_META[metric]?.label ?? metric, value: formatMetricValue(metric, current), delta, deltaLabel: `${delta >= 0 ? "+" : ""}${formatMetricValue(metric, delta)}` };
  }), [normalizedOverview]);

  /* ── Accounts table columns ── */
  const accountColumns = useMemo(() => [
    { title: "Cuenta", dataIndex: "account_name", key: "account_name", fixed: "left" as const, width: 160 },
    { title: "Canales", key: "channels", width: 120, render: (_: unknown, item: Record<string, unknown>) => (((item.channel_mix as string[]) ?? []).map((ch: string) => toChannelLabel(ch as SocialChannel)).join(", ")) },
    { title: "Followers", key: "followers", width: 100, render: (_: unknown, item: Record<string, unknown>) => formatNumber(((item.channel_mix as string[]) ?? []).reduce((sum: number, ch: string) => sum + (pageMetricsData.get(`${ch}:${item.account_name}`)?.followers ?? 0), 0)) },
    { title: "Page Reach", key: "pageReach", width: 100, render: (_: unknown, item: Record<string, unknown>) => formatNumber(((item.channel_mix as string[]) ?? []).reduce((sum: number, ch: string) => sum + (pageMetricsData.get(`${ch}:${item.account_name}`)?.pageReach ?? 0), 0)) },
    { title: "Posts", dataIndex: "posts", key: "posts", width: 80, render: (v: number) => formatNumber(v) },
    { title: "Exposición", dataIndex: "exposure_total", key: "exposure_total", width: 110, render: (v: number) => formatNumber(v) },
    { title: "Interacciones", dataIndex: "engagement_total", key: "engagement_total", width: 120, render: (v: number) => formatNumber(v) },
    { title: "ER pond.", dataIndex: "er_ponderado", key: "er_ponderado", width: 90, render: (v: number) => formatPercent(v) },
    { title: "Riesgo", dataIndex: "riesgo_activo", key: "riesgo_activo", width: 90, render: (v: number) => <Tag color={toRiskTagColor(v)}>{formatPercent(v)}</Tag> },
    { title: "Delta exp.", dataIndex: "delta_exposure", key: "delta_exposure", width: 100, render: (v: number) => <span style={{ color: toDeltaColor(v) }}>{formatNumber(v)}</span> },
    { title: "Delta eng.", dataIndex: "delta_engagement", key: "delta_engagement", width: 100, render: (v: number) => <span style={{ color: toDeltaColor(v) }}>{formatNumber(v)}</span> },
    { title: "Delta ER", dataIndex: "delta_er", key: "delta_er", width: 90, render: (v: number) => <span style={{ color: toDeltaColor(v) }}>{formatPercent(v)}</span> },
    { title: "SOV", dataIndex: "sov_interno", key: "sov_interno", width: 80, render: (v: number) => formatPercent(v) },
    { title: "Threshold", dataIndex: "meets_threshold", key: "meets_threshold", width: 90, render: (v: boolean) => <StatusTag status={v ? "OK" : "Bajo"} /> },
    { title: "Acción", key: "action", width: 100, render: (_: unknown, item: Record<string, unknown>) => <Button size="small" onClick={() => setQueryPatch({ tab: "posts", account: String(item.account_name) })}>Ver posts</Button> }
  ], [pageMetricsData]);

  /* ══════════════════════════════════════════════════
     JSX RENDER
     ══════════════════════════════════════════════════ */
  const metricSelectOptions = (metrics: string[]) => metrics.map((m) => ({ label: METRIC_META[m]?.label ?? m, value: m }));

  const clearAllFilters = () => setQueryPatch({
    preset: "ytd", from: null, to: null, comparison_mode: "same_period_last_year", comparison_days: null,
    channel: null, account: null, post_type: null, campaign: null, strategy: null, hashtag: null,
    topic: null, sentiment: null, time_granularity: null, posts_sort: null, accounts_sort: null,
    accounts_cursor: null, accounts_limit: null, min_posts: null, min_exposure: null
  });

  const tabItems = [
    { key: "summary", label: "Resumen", icon: <DashboardOutlined /> }, { key: "accounts", label: "Cuentas", icon: <TeamOutlined /> },
    { key: "posts", label: "Posts", icon: <FileTextOutlined /> }, { key: "risk", label: "Riesgo", icon: <WarningOutlined /> },
    { key: "etl", label: "ETL", icon: <CloudSyncOutlined /> }, { key: "glossary", label: "Glosario", icon: <BookOutlined /> }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Social Analytics"
        subtitle="Dashboard comparativo 2026 vs 2025 con metas ER por canal y filtros inteligentes."
        extra={
          <Space wrap>
            <Tag color="red" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>No oficial</Tag>
            <Button icon={<ReloadOutlined />} onClick={() => setReloadVersion((c) => c + 1)} disabled={loading}>Refrescar vista</Button>
            <Button onClick={() => void triggerRun()} disabled={!canRefresh || refreshingRun} loading={refreshingRun}>Refresh manual ETL</Button>
            <Button icon={<DownloadOutlined />} onClick={() => void exportFilteredCsv()} disabled={!canExport || exportingCsv} loading={exportingCsv}>Exportar CSV</Button>
            <Button type="primary" danger icon={<FileExcelOutlined />} onClick={() => void exportExcel()} disabled={!canExport || exportingExcel} loading={exportingExcel}>Exportar Excel</Button>
          </Space>
        }
      />

      {role === "Viewer" && <Alert type="info" title="Rol Viewer: lectura habilitada." showIcon />}
      {pendingRunId && <Alert type="info" title={`Corrida manual en progreso: ${pendingRunId}`} showIcon />}
      {error && <Alert type="error" title={error} showIcon closable />}
      {dataStatus === "permission_denied" && <Alert type="error" title="Estado permission_denied: no tienes permisos para una o más consultas de Social Analytics." showIcon />}
      {dataStatus === "stale_data" && <Alert type="warning" title="Estado stale_data: la última ETL está fuera del umbral de frescura configurado para operación." showIcon />}
      {dataStatus === "partial_data" && <Alert type="warning" title="Estado partial_data: hay clasificación pendiente o muestra insuficiente." showIcon />}
      {dataStatus === "recon_warning" && <Alert type="warning" title="Estado recon_warning: la reconciliación S3-DB tiene deltas." showIcon />}
      {dataStatus === "empty" && <Alert type="info" title="Estado empty: no hay datos para los filtros seleccionados." showIcon />}

      {/* ── Filters ── */}
      <SocialFilterBar
        preset={preset}
        timeGranularity={timeGranularity}
        comparisonMode={comparisonMode}
        comparisonDays={comparisonDays}
        from={from}
        to={to}
        normalizedOverview={normalizedOverview}
        selectedChannels={selectedChannels}
        selectedAccounts={selectedAccounts}
        selectedPostTypes={selectedPostTypes}
        selectedCampaigns={selectedCampaigns}
        selectedStrategies={selectedStrategies}
        selectedHashtags={selectedHashtags}
        selectedTopics={selectedTopics}
        selectedSentiment={selectedSentiment}
        facetsData={facetsData}
        loadingFacets={loadingFacets}
        setQueryPatch={setQueryPatch}
        applyPreset={applyPreset}
        clearAllFilters={clearAllFilters}
      />

      {/* ── Tabs ── */}
      <Tabs activeKey={tab} onChange={(key) => setQueryPatch({ tab: key })} items={tabItems} />

      {/* ═══════ SUMMARY TAB ═══════ */}
      {tab === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* ── Primary KPIs ── */}
          <Row gutter={[16, 16]}>
            {kpiCards.map((card) => (
              <Col key={card.id} xs={12} md={8} xl={4}>
                <KpiCard
                  title={card.title}
                  value={card.value}
                  info={card.info}
                  previousLabel={card.previous}
                  goalLabel={card.goal}
                  deltaLabel={card.status}
                  deltaColor={card.statusColor}
                  deltaValue={card.deltaValue}
                />
              </Col>
            ))}
          </Row>

          {/* ── Secondary KPIs grouped ── */}
          {SECONDARY_KPI_GROUPS.map((group) => {
            const groupKpis = secondaryKpis.filter((k) => group.metrics.includes(k.metric as SecondaryKpiMetric));
            if (groupKpis.length === 0) return null;
            return (
              <div key={group.title}>
                <Flex align="center" gap={8} style={{ marginBottom: 10 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: group.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: group.color }}>{group.title}</span>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${group.color}22, transparent)` }} />
                </Flex>
                <Row gutter={[12, 12]}>
                  {groupKpis.map((item) => (
                    <Col key={item.metric} xs={12} sm={8} lg={6} xl={group.metrics.length <= 4 ? 6 : 3}>
                      <SecondaryKpiCard
                        label={item.label}
                        value={item.value}
                        delta={item.delta}
                        deltaLabel={item.deltaLabel}
                        icon={SECONDARY_KPI_ICONS[item.metric]}
                        accentColor={group.color}
                        info={SECONDARY_KPI_INFO[item.metric]}
                      />
                    </Col>
                  ))}
                </Row>
              </div>
            );
          })}

          {/* ── Trend + Mix ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={16}>
              <Card size="small" title="Tendencia" extra={<AntText type="secondary" style={{ fontSize: 11 }}>{normalizedOverview.comparison?.label ?? "Comparación activa"}</AntText>} styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}>
                <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.trend}</AntText>
                <Row gutter={8} style={{ marginTop: 8, marginBottom: 8 }}>
                  <Col span={12}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Eje izquierdo</div><Select size="small" style={{ width: "100%" }} value={trendLeftMetric} onChange={(v) => setTrendLeftMetric(v as TrendMetric)} options={metricSelectOptions(TREND_METRICS)} /></Col>
                  <Col span={12}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Eje derecho</div><Select size="small" style={{ width: "100%" }} value={trendRightMetric} onChange={(v) => setTrendRightMetric(v as TrendMetric)} options={metricSelectOptions(TREND_METRICS)} /></Col>
                </Row>
                <div style={{ height: 320 }}>
                  <VisxDualLineChart data={trendSeries} xKey="bucket_label" leftKey={trendLeftMetric} rightKey={trendRightMetric} leftLabel={METRIC_META[trendLeftMetric].label} rightLabel={METRIC_META[trendRightMetric].label} leftColor="#1d4ed8" rightColor="#e30613" formatLeftTick={(v) => formatChartAxisByMetrics([trendLeftMetric], v)} formatRightTick={(v) => formatChartAxisByMetrics([trendRightMetric], v)} formatTooltipValue={(m, v) => formatChartMetricValue(m, v)} />
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" title="Mix por canal" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}><AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.mix}</AntText>
                <Row gutter={8} style={{ marginTop: 8, marginBottom: 8 }}>
                  <Col span={12}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Barra</div><Select size="small" style={{ width: "100%" }} value={mixBarMetric} onChange={(v) => setMixBarMetric(v as MixMetric)} options={metricSelectOptions(MIX_METRICS)} /></Col>
                  <Col span={12}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Línea</div><Select size="small" style={{ width: "100%" }} value={mixLineMetric} onChange={(v) => setMixLineMetric(v as MixMetric)} options={metricSelectOptions(MIX_METRICS)} /></Col>
                </Row>
                <div style={{ height: 320 }}>
                  <VisxBarLineChart data={channelData} xKey="channel" barKey={mixBarMetric} lineKey={mixLineMetric} barLabel={METRIC_META[mixBarMetric].label} lineLabel={METRIC_META[mixLineMetric].label} barColor="#2563eb" lineColor="#0f766e" formatXTick={(v) => toChannelLabel(v as SocialChannel)} formatLeftTick={(v) => formatChartAxisByMetrics([mixBarMetric], v)} formatRightTick={(v) => formatChartAxisByMetrics([mixLineMetric], v)} formatTooltipValue={(m, v) => formatChartMetricValue(m, v)} barAxis={mixBarAxis} lineAxis={mixLineAxis} />
                </div>
              </Card>
            </Col>
          </Row>

          {/* ── Trend by dimension ── */}
          <Card size="small" title="Tendencia por dimensión" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }} extra={
            <Space wrap>
              <Select size="small" value={trendByDimensionDimension} onChange={(v) => setTrendByDimensionDimension(v)} options={[{label:"Canal",value:"channel"},{label:"Cuenta",value:"account"},{label:"Tipo de post",value:"post_type"},{label:"Campaña",value:"campaign"},{label:"Estrategia",value:"strategy"},{label:"Hashtag",value:"hashtag"}]} style={{ width: 130 }} />
              <Select size="small" value={trendByDimensionMetric} onChange={(v) => setTrendByDimensionMetric(v as TrendByDimensionMetric)} options={metricSelectOptions(TREND_METRICS)} style={{ width: 150 }} />
              <AntText type="secondary" style={{ fontSize: 11 }}>Series: {visibleTrendByDimensionSeries.length}/{trendByDimensionSeries.length}</AntText>
            </Space>
          }>
            <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.trend_by_dimension}</AntText>
            {trendByDimensionError && <Alert type="warning" title={trendByDimensionError} style={{ marginTop: 8, marginBottom: 8 }} />}
            {loadingTrendByDimension && <Spin style={{ display: "block", margin: "40px auto" }} />}
            {!loadingTrendByDimension && trendByDimensionSeries.length === 0 && <Empty description={`Sin datos para ${toScatterDimensionLabel(trendByDimensionDimension)} con los filtros activos.`} />}
            {!loadingTrendByDimension && trendByDimensionVisibleSeries.length > 0 && (
              <div style={{ height: 340, marginTop: 8 }}>
                <VisxMultiLineChart data={trendByDimensionChartData} xKey="bucket_label" series={trendByDimensionVisibleSeries.map((s) => ({ key: s.key, label: s.label, color: s.color }))} metric={trendByDimensionMetric} formatYTick={(v) => formatChartAxisByMetrics([trendByDimensionMetric], v)} formatTooltipValue={(v) => formatChartMetricValue(trendByDimensionMetric, v)} />
              </div>
            )}
          </Card>

          {/* ── Topic breakdown ── */}
          <Card size="small" title="Distribución por tema" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }} extra={
            <Space wrap>
              <Select size="small" value={topicBreakdownDimension} onChange={(v) => setTopicBreakdownDimension(v)} options={[{label:"Canal",value:"channel"},{label:"Cuenta",value:"account"},{label:"Tipo de post",value:"post_type"},{label:"Campaña",value:"campaign"},{label:"Estrategia",value:"strategy"},{label:"Hashtag",value:"hashtag"}]} style={{ width: 130 }} />
              <Select size="small" value={topicBreakdownMetric} onChange={(v) => setTopicBreakdownMetric(v as TrendByDimensionMetric)} options={metricSelectOptions(TREND_METRICS)} style={{ width: 150 }} />
              <Checkbox checked={topicBreakdownNormalize100} onChange={(e) => setTopicBreakdownNormalize100(e.target.checked)}>Apilar al 100%</Checkbox>
            </Space>
          }>
            <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.topic_breakdown}</AntText>
            {topicBreakdownError && <Alert type="warning" title={topicBreakdownError} style={{ marginTop: 8 }} />}
            {loadingTopicBreakdown && <Spin style={{ display: "block", margin: "40px auto" }} />}
            {!loadingTopicBreakdown && topicBreakdownChartData.length === 0 && <Empty description="Sin temas clasificados para los filtros activos." />}
            {!loadingTopicBreakdown && topicBreakdownChartData.length > 0 && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <VisxHorizontalStackedBarChart data={topicBreakdownChartData} yKey="topic_label" segments={topicBreakdownSegments} normalize100={topicBreakdownNormalize100} metric={topicBreakdownMetric} formatXTick={(v) => topicBreakdownNormalize100 ? formatAxisPercentNoDecimals(v) : formatChartAxisByMetrics([topicBreakdownMetric], v)} onBarClick={openPostsByTopic} chartHeight={topicBreakdownChartHeight} />
              </div>
            )}
          </Card>

          {/* ── Ranking + Gap ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={16}>
              <Card size="small" title="Ranking de cuentas" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}><AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.ranking}</AntText>
                <Row gutter={8} style={{ marginTop: 8, marginBottom: 8 }}>
                  <Col span={8}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Métrica barra</div><Select size="small" style={{ width: "100%" }} value={accountBarMetric} onChange={(v) => setAccountBarMetric(v as AccountMetric)} options={metricSelectOptions(ACCOUNT_METRICS)} /></Col>
                  <Col span={8}><div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Métrica línea</div><Select size="small" style={{ width: "100%" }} value={accountLineMetric} onChange={(v) => setAccountLineMetric(v as AccountMetric)} options={metricSelectOptions(ACCOUNT_METRICS)} /></Col>
                </Row>
                <div style={{ height: 320 }}>
                  <VisxBarLineChart data={topAccountsDual} xKey="account_name" barKey={accountBarMetric} lineKey={accountLineMetric} barLabel={METRIC_META[accountBarMetric].label} lineLabel={METRIC_META[accountLineMetric].label} barColor="#c90310" lineColor="#1d4ed8" formatXTick={(v) => truncate(v, 14)} formatLeftTick={(v) => formatChartAxisByMetrics([accountBarMetric], v)} formatRightTick={(v) => formatChartAxisByMetrics([accountLineMetric], v)} formatTooltipValue={(m, v) => formatChartMetricValue(m, v)} barAxis={accountBarAxis} lineAxis={accountLineAxis} />
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" title="Brecha ER vs Meta" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}><AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.gap}</AntText>
                <div style={{ height: 320, marginTop: 8 }}>
                  <VisxBarLineChart data={erGapByChannel} xKey="channel" barKey="current_er" lineKey="target_2026_er" barLabel="ER actual" lineLabel="Meta ER 2026" barColor="#e30613" lineColor="#0f766e" formatXTick={(v) => toChannelLabel(v as SocialChannel)} formatLeftTick={(v) => formatAxisPercentNoDecimals(v)} formatRightTick={(v) => formatAxisPercentNoDecimals(v)} formatTooltipValue={(_m, v) => formatAxisPercentNoDecimals(v)} barAxis="left" lineAxis="left" />
                </div>
                {!hasVisibleTargetByChannel && <Alert type="warning" title="No hay metas ER válidas (0/null) para los filtros activos." style={{ marginTop: 8 }} />}
              </Card>
            </Col>
          </Row>

          {/* ── Scatter + Heatmap ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={16}>
              <Card size="small" title="Scatter por métricas" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }} extra={
                <Space wrap>
                  <Select size="small" value={scatterDimension} onChange={(v) => setScatterDimension(v)} options={[{label:"Tipo de post",value:"post_type"},{label:"Canal",value:"channel"},{label:"Cuenta",value:"account"},{label:"Campaña",value:"campaign"},{label:"Estrategia",value:"strategy"},{label:"Hashtag",value:"hashtag"}]} style={{ width: 130 }} />
                  <Select size="small" value={scatterXMetric} onChange={(v) => setScatterXMetric(v as ScatterMetric)} options={metricSelectOptions(SCATTER_METRICS)} style={{ width: 140 }} />
                  <Select size="small" value={scatterYMetric} onChange={(v) => setScatterYMetric(v as ScatterMetric)} options={metricSelectOptions(SCATTER_METRICS)} style={{ width: 140 }} />
                </Space>
              }>
                <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.scatter}</AntText>
                <div style={{ height: 320, marginTop: 8 }}>
                  <VisxScatterChart data={scatterChartData} xLabel={METRIC_META[scatterXMetric].label} yLabel={METRIC_META[scatterYMetric].label} xMetric={scatterXMetric} yMetric={scatterYMetric} />
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" title="Heatmap actividad" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }} extra={<Select size="small" value={heatmapMetric} onChange={(v) => setHeatmapMetric(v)} options={[{label:"ER",value:"er"},{label:"Interacciones",value:"engagement_total"},{label:"Impresiones",value:"impressions"},{label:"Reach",value:"reach"},{label:"Clicks",value:"clicks"},{label:"Likes",value:"likes"},{label:"Comments",value:"comments"},{label:"Shares",value:"shares"},{label:"Views",value:"views"},{label:"CTR",value:"ctr"},{label:"ER impresiones",value:"er_impressions"},{label:"ER reach",value:"er_reach"},{label:"View rate",value:"view_rate"}]} style={{ width: 140 }} />}>
                <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.heatmap}</AntText>
                <div style={{ minHeight: 320, marginTop: 8 }}><Heatmap data={heatmapData} /></div>
              </Card>
            </Col>
          </Row>

          {/* ── Breakdown + SOV Pie ── */}
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={16}>
              <Card size="small" title="Métrica por dimensión" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }} extra={
                <Space wrap>
                  <Select size="small" value={breakdownDimension} onChange={(v) => setBreakdownDimension(v)} options={[{label:"Hashtag",value:"hashtag"},{label:"Término más usado",value:"word"},{label:"Tipo de post",value:"post_type"},{label:"Frecuencia",value:"publish_frequency"},{label:"Día publicación",value:"weekday"}]} style={{ width: 150 }} />
                  <Select size="small" value={breakdownMetric} onChange={(v) => setBreakdownMetric(v as BreakdownMetric)} options={metricSelectOptions(BREAKDOWN_METRICS)} style={{ width: 150 }} />
                </Space>
              }>
                <AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.breakdown}</AntText>
                <div style={{ height: 320, marginTop: 8 }}>
                  <VisxHorizontalBarChart data={breakdownChartData.map((i) => ({ label: String(i.label), metric_value: Number(i.metric_value), posts: Number(i.posts), exposure_total: Number(i.exposure_total) }))} metricLabel={METRIC_META[breakdownMetric].label} formatTick={(v) => formatChartAxisByMetrics([breakdownMetric], v)} />
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" title="Share por cuenta" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}><AntText type="secondary" style={{ fontSize: 12 }}>{CHART_QUESTION_BY_KEY.share}</AntText>
                <div style={{ height: 320, marginTop: 8 }}><VisxPieChart data={sovPieData} colors={pieColors} /></div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* ═══════ ACCOUNTS TAB ═══════ */}
      {tab === "accounts" && (
        <Card size="small" title="Cuentas" extra={
          <Space wrap>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Orden:</span>
            <Select size="small" value={accountsSort} onChange={(v) => setQueryPatch({ accounts_sort: v, accounts_cursor: null })} options={ACCOUNT_SORT_OPTIONS.map((s) => ({ label: toAccountsSortLabel(s), value: s }))} style={{ width: 150 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Límite:</span>
            <Select size="small" value={accountsLimit} onChange={(v) => setQueryPatch({ accounts_limit: String(v), accounts_cursor: null })} options={[25,50,100,200].map((n) => ({ label: String(n), value: n }))} style={{ width: 80 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Min posts:</span>
            <Input size="small" value={minPostsInput} onChange={(e) => setMinPostsInput(e.target.value)} style={{ width: 70 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Min exp.:</span>
            <Input size="small" value={minExposureInput} onChange={(e) => setMinExposureInput(e.target.value)} style={{ width: 100 }} />
            <Button size="small" onClick={() => setQueryPatch({ min_posts: String(parseIntFromQuery(minPostsInput, minPosts, 1, 2000)), min_exposure: String(parseIntFromQuery(minExposureInput, minExposure, 0, 10_000_000_000)), accounts_cursor: null })}>Aplicar umbrales</Button>
          </Space>
        }>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            Orden aplicado por backend: <strong>{toAccountsSortLabel(accountsData?.sort_applied ?? accountsSort)}</strong> | thresholds: {formatNumber(minPosts)} posts / {formatNumber(minExposure)} exposición
          </div>
          <Table dataSource={accountsData?.items ?? []} columns={accountColumns} rowKey="account_name" size="small" scroll={{ x: 1520 }} pagination={false} loading={loadingAccounts} />
          {!loadingAccounts && (accountsData?.items?.length ?? 0) === 0 && <Empty description="Sin cuentas para estos filtros." style={{ margin: "16px 0" }} />}
          <Space style={{ marginTop: 12 }}>
            <Button size="small" onClick={() => setQueryPatch({ accounts_cursor: null })} disabled={!accountsCursor}>Primera página</Button>
            <Button size="small" onClick={() => setQueryPatch({ accounts_cursor: accountsData?.page_info?.next_cursor ?? null })} disabled={!accountsData?.page_info?.has_next || !accountsData?.page_info?.next_cursor}>Siguiente página</Button>
            {loadingAccounts && <Spin size="small" />}
          </Space>
        </Card>
      )}

      {/* ═══════ POSTS TAB ═══════ */}
      {tab === "posts" && (
        <PostsTab posts={posts} loadingPosts={loadingPosts} postsHasNext={postsHasNext} loadingMorePosts={loadingMorePosts} postsSort={postsSort} onSortChange={(sort) => setQueryPatch({ posts_sort: sort })} onLoadMore={() => void loadMorePosts()} canOverrideComments={canOverrideComments} client={client} onError={applyRequestError} activeChannels={selectedChannels} onToggleChannel={(ch) => toggleMultiValue("channel", selectedChannels, ch)} />
      )}

      {/* ═══════ RISK TAB ═══════ */}
      {tab === "risk" && (
        <Card size="small" title="Riesgo" extra={
          <Space>
            <Tag color={riskData?.stale_data ? "orange" : "green"}>{riskData?.stale_data ? "stale_data" : "fresh_data"}</Tag>
            <AntText type="secondary" style={{ fontSize: 12 }}>Umbral riesgo: {formatPercent(riskData?.thresholds?.risk_threshold ?? 0)}</AntText>
            {loadingRisk && <Spin size="small" />}
          </Space>
        }>
          <AntText type="secondary" style={{ fontSize: 12 }}>Detección y respuesta con umbrales, hotspots y alertas activas. Serie: {toTimeGranularityLabel(timeGranularity)}.</AntText>
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} xl={16}>
              <Card size="small" title="Tendencia de riesgo vs sentimiento" styles={{ header: { borderBottom: "1px solid #f0f2f5", paddingBottom: 12 } }} style={{ overflow: "hidden" }}>
                <div style={{ height: 280 }}>
                  <VisxRiskTrendChart data={riskSentimentTrendData} thresholdY={riskData?.thresholds?.risk_threshold ?? 0} />
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card size="small" title="Hotspots por canal">
                {riskTopChannels.map((item) => (
                  <div key={item.channel} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                    <Flex justify="space-between" align="center"><strong>{toChannelLabel(item.channel)}</strong><Tag color={toRiskTagColor(item.riesgo_activo)}>{formatPercent(item.riesgo_activo)}</Tag></Flex>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Negativos: {formatNumber(item.negativos)} | Clasificados: {formatNumber(item.clasificados)}</div>
                  </div>
                ))}
                {riskTopChannels.length === 0 && <AntText type="secondary">Sin datos por canal.</AntText>}
              </Card>
            </Col>
          </Row>
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} xl={12}>
              <Card size="small" title="Hotspots por cuenta">
                {riskTopAccounts.map((item) => (
                  <div key={item.account_name} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                    <Flex justify="space-between" align="center"><strong>{item.account_name}</strong><Tag color={toRiskTagColor(item.riesgo_activo)}>{formatPercent(item.riesgo_activo)}</Tag></Flex>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Negativos: {formatNumber(item.negativos)} | Clasificados: {formatNumber(item.clasificados)}</div>
                  </div>
                ))}
                {riskTopAccounts.length === 0 && <AntText type="secondary">Sin datos por cuenta.</AntText>}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" title="Alertas activas" extra={<Button size="small" href="/app/monitor/incidents">Ir a Incidentes</Button>}>
                {(riskData?.alerts ?? []).map((alert) => (
                  <div key={alert.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12 }}>
                    <Flex justify="space-between" wrap="wrap" gap={8}><SeverityTag severity={alert.severity} /><StatusTag status={alert.status} /><span>risk {formatScore(alert.risk_score)}</span><span>{formatDateTime(alert.updated_at)}</span></Flex>
                    <div style={{ color: "#475569", marginTop: 4 }}>{toSlaBySeverity(alert.severity)} | cooldown: {alert.cooldown_until ? formatDateTime(alert.cooldown_until) : "sin cooldown"}</div>
                  </div>
                ))}
                {(riskData?.alerts?.length ?? 0) === 0 && <AntText type="secondary">Sin alertas activas.</AntText>}
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {/* ═══════ ETL TAB ═══════ */}
      {tab === "etl" && (
        <Row gutter={[12, 12]}>
          <Col xs={24} lg={12}>
            <Card size="small" title="Cobertura y reconciliación" extra={<AntText type="secondary" style={{ fontSize: 11 }}>Se está cargando todo lo que existe en S3?</AntText>}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Estado reconciliación">{normalizedOverview.reconciliation_status ?? etlData?.reconciliation_status ?? "unknown"}</Descriptions.Item>
                <Descriptions.Item label="DB min fecha">{formatDate(etlData?.coverage.db_min_date ?? null)}</Descriptions.Item>
                <Descriptions.Item label="DB max fecha">{formatDate(etlData?.coverage.db_max_date ?? null)}</Descriptions.Item>
                <Descriptions.Item label="S3 min fecha">{formatDate(etlData?.coverage.s3_min_date ?? null)}</Descriptions.Item>
                <Descriptions.Item label="S3 max fecha">{formatDate(etlData?.coverage.s3_max_date ?? null)}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Corridas ETL" extra={<AntText type="secondary" style={{ fontSize: 11 }}>Qué faltó y por qué?</AntText>}>
              {(runs ?? []).slice(0, 10).map((run) => (
                <div key={run.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12 }}>
                  <Flex justify="space-between" wrap="wrap" gap={8}>
                    <StatusTag status={run.status} />
                    <span>{run.current_phase ?? "-"}</span>
                    <span>parsed {formatNumber(run.counters.rows_parsed)}</span>
                    <span>persisted {formatNumber(run.counters.rows_persisted)}</span>
                    <span>pending cls {formatNumber(run.counters.rows_pending_classification)}</span>
                    <span>{formatDateTime(run.finished_at ?? run.queued_at)}</span>
                  </Flex>
                </div>
              ))}
              {runs.length === 0 && <AntText type="secondary">Sin corridas.</AntText>}
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Última ETL: {formatDateTime(normalizedOverview.last_etl_at ?? null)}</div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ═══════ GLOSSARY TAB ═══════ */}
      {tab === "glossary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card size="small" title="Glosario operativo">
            <AntText type="secondary" style={{ fontSize: 12 }}>Definiciones usadas en Social Overview para lectura ejecutiva y operación diaria.</AntText>
            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} lg={12}>
                <Card size="small" title="Términos clave">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Exposición">Volumen visible estimado. Equivale a reach o views según canal, con fallback por disponibilidad de dato.</Descriptions.Item>
                    <Descriptions.Item label="Reach">Usuarios únicos potencialmente impactados. Puede venir vacío o en cero según API/plataforma.</Descriptions.Item>
                    <Descriptions.Item label="ER (Engagement Rate)">Interacciones frente a una base de exposición (exposición, impresiones o reach).</Descriptions.Item>
                    <Descriptions.Item label="Sentimiento neto">Diferencia entre positivos y negativos sobre el total clasificado.</Descriptions.Item>
                    <Descriptions.Item label="Riesgo activo">Participación de menciones negativas sobre las menciones clasificadas.</Descriptions.Item>
                    <Descriptions.Item label="SOV interno">Participación relativa de cada cuenta dentro del universo social filtrado.</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="Exposición vs Reach por canal">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Facebook">exposición prioriza reach; fallback impressions.</Descriptions.Item>
                    <Descriptions.Item label="Instagram">exposición prioriza reach; fallback views.</Descriptions.Item>
                    <Descriptions.Item label="LinkedIn">exposición basada en impressions (reach puede ser 0).</Descriptions.Item>
                    <Descriptions.Item label="TikTok">exposición basada en views (reach puede ser 0).</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </Card>
          <Card size="small" title="Fórmulas">
            <Row gutter={[12, 12]}>
              <Col xs={24} lg={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="ER">(likes + comments + shares) / exposición * 100</Descriptions.Item>
                  <Descriptions.Item label="CTR">clicks / impressions * 100</Descriptions.Item>
                  <Descriptions.Item label="ER reach">(likes + comments + shares) / reach * 100</Descriptions.Item>
                  <Descriptions.Item label="Sentimiento neto">(positivos - negativos) / clasificados * 100</Descriptions.Item>
                </Descriptions>
              </Col>
              <Col xs={24} lg={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Riesgo activo">negativos / clasificados * 100</Descriptions.Item>
                  <Descriptions.Item label="SHS">(reputación * 0.50) + (alcance * 0.25) + (riesgo * 0.25)</Descriptions.Item>
                  <Descriptions.Item label="SOV interno">contribución de la cuenta / total universo filtrado * 100</Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          </Card>
        </div>
      )}
    </div>
  );
};
