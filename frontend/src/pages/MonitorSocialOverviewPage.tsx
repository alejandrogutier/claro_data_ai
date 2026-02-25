import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";
import type {
  MonitorSocialAccountsResponse,
  MonitorSocialErBreakdownResponse,
  MonitorSocialErTargetsResponse,
  MonitorSocialEtlQualityResponse,
  MonitorSocialFacetsResponse,
  MonitorSocialHeatmapResponse,
  MonitorSocialOverviewResponse,
  MonitorSocialPostCommentsResponse,
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

const CHANNEL_OPTIONS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];
const PRESET_OPTIONS: SocialDatePreset[] = ["ytd", "90d", "30d", "y2024", "y2025", "last_quarter", "custom", "all"];
const TAB_OPTIONS = ["summary", "accounts", "posts", "risk", "etl"] as const;
const POST_SORT_OPTIONS: SocialPostSort[] = ["published_at_desc", "exposure_desc", "engagement_desc"];
const ACCOUNT_SORT_OPTIONS: SocialAccountsSort[] = ["riesgo_desc", "er_desc", "exposure_desc", "engagement_desc", "posts_desc", "sov_desc", "account_asc"];
const FACET_SENTIMENT_OPTIONS = ["positive", "negative", "neutral", "unknown"] as const;

type SocialTab = (typeof TAB_OPTIONS)[number];
type ScaleMode = "auto" | "linear" | "log";
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

type KpiCard = {
  id: string;
  title: string;
  value: string;
  previous: string;
  goal: string;
  status: string;
  statusClass: string;
  info: string;
};

type PostRow = {
  id: string;
  published_at: string | null;
  channel: SocialChannel;
  account_name: string;
  post_type: string | null;
  title: string;
  post_url: string;
  exposure: number;
  engagement_total: number;
  likes: number;
  comments: number;
  awario_comments_count: number;
  shares: number;
  views: number;
  sentiment: string;
  sentiment_confidence: number | null;
  source_score: number;
  text?: string | null;
  campaign?: string | null;
  strategies?: string[];
  hashtags?: string[];
};

type AwarioCommentRow = MonitorSocialPostCommentsResponse["items"][number];

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
  engagement_total: { label: "Interacciones", format: "number" },
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
const MIX_METRICS: MixMetric[] = [
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
  "sov_interno"
];
const ACCOUNT_METRICS: AccountMetric[] = [
  "er_ponderado",
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
  "ctr",
  "er_impressions",
  "er_reach",
  "view_rate",
  "likes_share",
  "comments_share",
  "shares_share",
  "riesgo_activo",
  "sov_interno"
];
const SCATTER_METRICS: ScatterMetric[] = [
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
  "posts"
];
const BREAKDOWN_METRICS: BreakdownMetric[] = [
  "er_global",
  "ctr",
  "er_impressions",
  "er_reach",
  "view_rate",
  "likes_share",
  "comments_share",
  "shares_share",
  "exposure_total",
  "engagement_total",
  "impressions_total",
  "reach_total",
  "clicks_total",
  "likes_total",
  "comments_total",
  "shares_total",
  "views_total",
  "posts"
];
const SECONDARY_KPI_METRICS: SecondaryKpiMetric[] = [
  "impressions_total",
  "reach_total",
  "clicks_total",
  "likes_total",
  "comments_total",
  "shares_total",
  "views_total",
  "ctr",
  "er_impressions",
  "er_reach",
  "view_rate",
  "likes_share",
  "comments_share",
  "shares_share"
];

const formatNumber = (value: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
const formatPercent = (value: number): string => `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
const formatScore = (value: number): string => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatAxisPercentNoDecimals = (value: number): string => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}%`;
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
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
};

const truncate = (value: string, max = 28): string => (value.length <= max ? value : `${value.slice(0, Math.max(1, max - 3))}...`);

const toChannelLabel = (channel: SocialChannel): string => {
  if (channel === "facebook") return "Facebook";
  if (channel === "instagram") return "Instagram";
  if (channel === "linkedin") return "LinkedIn";
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
    new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
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
    const minPositive = positives.length > 0 ? Math.max(Math.min(...positives), 0.01) : 0.01;
    return [minPositive, "auto"];
  }
  return [0, "auto"];
};

const CHART_QUESTION_BY_KEY: Record<string, string> = {
  trend: "¿Qué responde?: ¿Cómo evolucionan exposición, interacciones y ER en el período?",
  trend_by_dimension: "¿Qué responde?: ¿Cómo evoluciona la métrica seleccionada por cada dimensión?",
  mix: "¿Qué responde?: ¿Qué canal aporta más y cómo se comporta su segunda métrica?",
  ranking: "¿Qué responde?: ¿Qué cuentas lideran según las métricas seleccionadas?",
  gap: "¿Qué responde?: ¿Qué tan lejos está cada canal de su meta ER?",
  scatter: "¿Qué responde?: ¿Qué grupos destacan al cruzar dos métricas seleccionadas?",
  heatmap: "¿Qué responde?: ¿Qué días y meses concentran mejor rendimiento?",
  topic_breakdown: "¿Qué responde?: ¿Cómo se compone cada tema según la dimensión secundaria elegida?",
  breakdown: "¿Qué responde?: ¿Qué dimensión explica mejor la métrica seleccionada?",
  share: "¿Qué responde?: ¿Cómo se distribuye el SOV interno entre cuentas?"
};

const CHANNEL_SERIES_COLORS: Record<SocialChannel, string> = {
  facebook: "#1d4ed8",
  instagram: "#c026d3",
  linkedin: "#0369a1",
  tiktok: "#0f766e"
};

const DIMENSION_SERIES_COLORS = ["#e30613", "#1d4ed8", "#0f766e", "#f59e0b", "#7c3aed", "#0891b2", "#be123c", "#374151", "#059669", "#ea580c"];
const TOPIC_SEGMENT_COLORS = [
  "#e30613",
  "#2563eb",
  "#0f766e",
  "#f59e0b",
  "#7c3aed",
  "#0891b2",
  "#be123c",
  "#475569",
  "#059669",
  "#ea580c",
  "#0284c7",
  "#a16207",
  "#334155"
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

const toDeltaClass = (value: number): string => {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-500";
};

const toPostSortLabel = (value: SocialPostSort): string => {
  if (value === "exposure_desc") return "Exposición desc";
  if (value === "engagement_desc") return "Engagement desc";
  return "Fecha desc";
};

const toAccountsSortLabel = (value: SocialAccountsSort): string => {
  if (value === "er_desc") return "ER desc";
  if (value === "exposure_desc") return "Exposición desc";
  if (value === "engagement_desc") return "Engagement desc";
  if (value === "posts_desc") return "Posts desc";
  if (value === "sov_desc") return "SOV desc";
  if (value === "account_asc") return "Cuenta A-Z";
  return "Riesgo desc";
};

const toRiskTagClass = (risk: number): string => {
  if (risk >= 80) return "bg-rose-100 text-rose-700";
  if (risk >= 60) return "bg-amber-100 text-amber-700";
  if (risk >= 40) return "bg-orange-100 text-orange-700";
  return "bg-emerald-100 text-emerald-700";
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

const KpiInfo = ({ id, text }: { id: string; text: string }) => (
  <div className="group relative inline-flex">
    <button
      type="button"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-600"
      aria-describedby={id}
    >
      i
    </button>
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg group-hover:block group-focus-within:block"
    >
      {text}
    </div>
  </div>
);

type SmartMultiSelectProps = {
  className?: string;
  label: string;
  summary: string;
  secondary: string;
  options: string[];
  selected: string[];
  search: string;
  placeholder: string;
  onSearch: (value: string) => void;
  onToggle: (value: string) => void;
  onClear: () => void;
  toLabel?: (value: string) => string;
};

const SmartMultiSelect = ({
  className,
  label,
  summary,
  secondary,
  options,
  selected,
  search,
  placeholder,
  onSearch,
  onToggle,
  onClear,
  toLabel
}: SmartMultiSelectProps) => (
  <details className={`group relative min-w-0 ${className ?? ""}`}>
    <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="truncate text-sm font-semibold text-slate-800">{summary}</p>
          <p className="truncate text-xs text-slate-500">{secondary}</p>
        </div>
        <span className="mt-1 text-xs text-slate-400">▾</span>
      </div>
    </summary>
    <div className="absolute z-30 mt-2 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-claro-red/25 focus:border-claro-red focus:ring-2"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {selected.length > 0 ? (
          selected.map((item) => (
            <span key={item} className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
              {toLabel ? toLabel(item) : item}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">Sin selección</span>
        )}
      </div>
      <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100 p-1">
        {options.length === 0 ? <p className="p-2 text-xs text-slate-500">Sin resultados.</p> : null}
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                checked ? "bg-red-50 text-red-700" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <span>{toLabel ? toLabel(option) : option}</span>
              <span className="text-xs">{checked ? "✓" : "+"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onClear} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Limpiar
        </button>
      </div>
    </div>
  </details>
);

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
    <div ref={containerRef} className="relative space-y-2">
      <div className="grid grid-cols-8 gap-1 text-xs">
        <div />
        {weekdays.map((day) => (
          <div key={day} className="text-center text-slate-500">
            {day}
          </div>
        ))}
        {months.map((month, monthIndex) => (
          <div key={month} className="contents">
            <div key={`${month}-label`} className="flex items-center justify-end pr-1 text-slate-500">
              {month}
            </div>
            {weekdays.map((_day, dayIndex) => {
              const item = byKey.get(`${monthIndex + 1}-${dayIndex + 1}`);
              const value = item?.value ?? 0;
              return (
                <div
                  key={`${month}-${dayIndex}`}
                  className="h-6 rounded"
                  style={{ background: toColor(value) }}
                  onMouseEnter={(event) => onHoverCell(event, `${month} ${weekdays[dayIndex]}`, value, item?.posts ?? 0)}
                  onMouseMove={(event) => onHoverCell(event, `${month} ${weekdays[dayIndex]}`, value, item?.posts ?? 0)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Escala color: {formatMetricValue(tooltipMetric, min)} - {formatMetricValue(tooltipMetric, max)}
      </p>
      {hovered ? (
        <div
          className="pointer-events-none absolute z-20 w-[165px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-lg"
          style={{ left: hovered.x, top: hovered.y, transform: "translateY(-105%)" }}
        >
          <p className="font-semibold text-slate-800">{hovered.label}</p>
          <p className="text-slate-600">Valor: {formatChartMetricValue(tooltipMetric, hovered.value)}</p>
          <p className="text-slate-600">Posts: {formatCompactAxisNumber(hovered.posts)}</p>
        </div>
      ) : null}
    </div>
  );
};

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
  const [riskData, setRiskData] = useState<MonitorSocialRiskResponse | null>(null);
  const [etlData, setEtlData] = useState<MonitorSocialEtlQualityResponse | null>(null);
  const [runs, setRuns] = useState<MonitorSocialRunItem[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [selectedPostDetail, setSelectedPostDetail] = useState<PostRow | null>(null);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasNext, setPostsHasNext] = useState(false);
  const [selectedPostComments, setSelectedPostComments] = useState<PostRow | null>(null);
  const [postComments, setPostComments] = useState<AwarioCommentRow[]>([]);
  const [postCommentsCursor, setPostCommentsCursor] = useState<string | null>(null);
  const [postCommentsHasNext, setPostCommentsHasNext] = useState(false);
  const [loadingPostComments, setLoadingPostComments] = useState(false);
  const [updatingCommentId, setUpdatingCommentId] = useState<string | null>(null);
  const [commentSentimentFilter, setCommentSentimentFilter] = useState<"all" | "positive" | "negative" | "neutral" | "unknown">("all");
  const [commentSpamFilter, setCommentSpamFilter] = useState<"all" | "spam" | "not_spam">("all");
  const [commentRelatedFilter, setCommentRelatedFilter] = useState<"all" | "related" | "not_related">("all");
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
  const [breakdownScaleMode, setBreakdownScaleMode] = useState<ScaleMode>("auto");

  const [channelSearch, setChannelSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [postTypeSearch, setPostTypeSearch] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [strategySearch, setStrategySearch] = useState("");
  const [hashtagSearch, setHashtagSearch] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const [minPostsInput, setMinPostsInput] = useState(String(minPosts));
  const [minExposureInput, setMinExposureInput] = useState(String(minExposure));

  useEffect(() => {
    setMinPostsInput(String(minPosts));
  }, [minPosts]);

  useEffect(() => {
    setMinExposureInput(String(minExposure));
  }, [minExposure]);

  const setQueryPatch = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || !String(value).trim()) next.delete(key);
      else next.set(key, String(value).trim());
    }
    setSearchParams(next, { replace: true });
  };

  const applyPreset = (value: SocialDatePreset) => {
    if (value === "custom") {
      setQueryPatch({ preset: value, from: from ?? "2026-01-01", to: to ?? new Date().toISOString().slice(0, 10) });
      return;
    }
    setQueryPatch({ preset: value, from: null, to: null });
  };

  const commonQuery = useMemo(() => {
    const query: Record<string, string | number | undefined> = {
      preset,
      channel: selectedChannels.length > 0 ? selectedChannels.join(",") : undefined,
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

    if (preset === "custom") {
      if (from) query.from = from;
      if (to) query.to = to;
    }

    return query;
  }, [preset, selectedChannels, selectedAccounts, selectedPostTypes, selectedCampaigns, selectedStrategies, selectedHashtags, selectedTopics, selectedSentiment, comparisonMode, comparisonDays, from, to]);

  const normalizePosts = (items: MonitorSocialPostsResponse["items"]): PostRow[] =>
    (items ?? []).map((item) => {
      const row = item as unknown as PostRow;
      return {
        id: row.id,
        published_at: row.published_at,
        channel: row.channel,
        account_name: row.account_name,
        post_type: row.post_type,
        title: row.title,
        post_url: row.post_url,
        exposure: Number(row.exposure ?? 0),
        engagement_total: Number(row.engagement_total ?? 0),
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        awario_comments_count: Number((item as unknown as { awario_comments_count?: number }).awario_comments_count ?? 0),
        shares: Number(row.shares ?? 0),
        views: Number(row.views ?? 0),
        sentiment: row.sentiment,
        sentiment_confidence: (item as unknown as { sentiment_confidence?: number | null }).sentiment_confidence ?? null,
        source_score: Number((item as unknown as { source_score?: number }).source_score ?? 0),
        text: row.text ?? null,
        campaign: (item as unknown as { campaign?: string | null }).campaign ?? null,
        strategies: (item as unknown as { strategies?: string[] }).strategies ?? [],
        hashtags: (item as unknown as { hashtags?: string[] }).hashtags ?? []
      };
    });

  const applyRequestError = (requestError: unknown) => {
    setError((requestError as Error)?.message ?? "No fue posible completar la solicitud");
    setUiError(getErrorKind(requestError));
  };

  const loadCoreDashboard = async () => {
    setLoading(true);
    setError(null);
    setUiError("none");

    try {
      const [overviewResponse, runsResponse, etlResponse, targetsResponse] = await Promise.all([
        client.getMonitorSocialOverview({ ...commonQuery, trend_granularity: "auto" }),
        client.listMonitorSocialRuns(20),
        client.getMonitorSocialEtlQuality(20),
        client.getMonitorSocialErTargets({ ...commonQuery, year: 2026 })
      ]);
      setOverview(overviewResponse);
      setRuns(runsResponse.items ?? []);
      setEtlData(etlResponse);
      setErTargets(targetsResponse);
    } catch (requestError) {
      applyRequestError(requestError);
      setOverview(null);
      setRuns([]);
      setEtlData(null);
      setErTargets(null);
    } finally {
      setLoading(false);
    }
  };

  const loadFacets = async () => {
    setLoadingFacets(true);
    try {
      const response = await client.getMonitorSocialFacets(commonQuery);
      setFacetsData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setFacetsData(null);
    } finally {
      setLoadingFacets(false);
    }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await client.getMonitorSocialAccounts({
        ...commonQuery,
        min_posts: minPosts,
        min_exposure: minExposure,
        sort: accountsSort,
        limit: accountsLimit,
        cursor: accountsCursor
      });
      setAccountsData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setAccountsData(null);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadRisk = async () => {
    setLoadingRisk(true);
    try {
      const response = await client.getMonitorSocialRisk(commonQuery);
      setRiskData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setRiskData(null);
    } finally {
      setLoadingRisk(false);
    }
  };

  const loadPostsFirstPage = async () => {
    setLoadingPosts(true);
    try {
      const response = await client.listMonitorSocialPosts({
        ...commonQuery,
        sort: postsSort,
        limit: 50
      });
      setPosts(normalizePosts(response.items ?? []));
      setPostsCursor(response.page_info.next_cursor ?? null);
      setPostsHasNext(Boolean(response.page_info.has_next));
    } catch (requestError) {
      applyRequestError(requestError);
      setPosts([]);
      setPostsCursor(null);
      setPostsHasNext(false);
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadHeatmap = async () => {
    try {
      const response = await client.getMonitorSocialHeatmap({ ...commonQuery, metric: heatmapMetric });
      setHeatmapData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setHeatmapData(null);
    }
  };

  const loadScatter = async () => {
    try {
      const response = await client.getMonitorSocialScatter({ ...commonQuery, dimension: scatterDimension });
      setScatterData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setScatterData(null);
    }
  };

  const loadTrendByDimension = async () => {
    setLoadingTrendByDimension(true);
    setTrendByDimensionError(null);
    try {
      const response = await client.getMonitorSocialTrendByDimension({
        ...commonQuery,
        dimension: trendByDimensionDimension,
        metric: trendByDimensionMetric,
        series_limit: 30
      });
      setTrendByDimensionData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setTrendByDimensionError((requestError as Error)?.message ?? "No fue posible cargar la tendencia por dimensión");
      setTrendByDimensionData(null);
    } finally {
      setLoadingTrendByDimension(false);
    }
  };

  const loadTopicBreakdown = async () => {
    setLoadingTopicBreakdown(true);
    setTopicBreakdownError(null);
    try {
      const response = await client.getMonitorSocialTopicBreakdown({
        ...commonQuery,
        dimension: topicBreakdownDimension,
        metric: topicBreakdownMetric,
        topic_limit: 15,
        segment_limit: 12
      });
      setTopicBreakdownData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setTopicBreakdownError((requestError as Error)?.message ?? "No fue posible cargar distribución por tema");
      setTopicBreakdownData(null);
    } finally {
      setLoadingTopicBreakdown(false);
    }
  };

  const loadBreakdown = async () => {
    try {
      const response = await client.getMonitorSocialErBreakdown({ ...commonQuery, dimension: breakdownDimension });
      setBreakdownData(response);
    } catch (requestError) {
      applyRequestError(requestError);
      setBreakdownData(null);
    }
  };

  useEffect(() => {
    void loadCoreDashboard();
  }, [client, commonQuery, reloadVersion]);

  useEffect(() => {
    void loadFacets();
  }, [client, commonQuery, reloadVersion]);

  useEffect(() => {
    void loadAccounts();
  }, [client, commonQuery, minPosts, minExposure, accountsSort, accountsLimit, accountsCursor, reloadVersion]);

  useEffect(() => {
    void loadRisk();
  }, [client, commonQuery, reloadVersion]);

  useEffect(() => {
    void loadPostsFirstPage();
  }, [client, commonQuery, postsSort, reloadVersion]);

  useEffect(() => {
    void loadHeatmap();
  }, [client, commonQuery, heatmapMetric, reloadVersion]);

  useEffect(() => {
    void loadScatter();
  }, [client, commonQuery, scatterDimension, reloadVersion]);

  useEffect(() => {
    void loadTrendByDimension();
  }, [client, commonQuery, trendByDimensionDimension, trendByDimensionMetric, reloadVersion]);

  useEffect(() => {
    void loadTopicBreakdown();
  }, [client, commonQuery, topicBreakdownDimension, topicBreakdownMetric, reloadVersion]);

  useEffect(() => {
    void loadBreakdown();
  }, [client, commonQuery, breakdownDimension, reloadVersion]);

  useEffect(() => {
    if (!pendingRunId) return undefined;

    const timer = setInterval(() => {
      client
        .listMonitorSocialRuns(20)
        .then((response) => {
          const items = response.items ?? [];
          setRuns(items);
          const target = items.find((item) => item.id === pendingRunId);
          if (!target) return;
          if (target.status === "completed" || target.status === "failed") {
            setPendingRunId(null);
            setReloadVersion((current) => current + 1);
          }
        })
        .catch((pollError) => {
          applyRequestError(pollError);
          setPendingRunId(null);
        });
    }, 4000);

    return () => clearInterval(timer);
  }, [client, pendingRunId]);

  useEffect(() => {
    if (!selectedPostComments) return;
    void loadPostComments(selectedPostComments);
  }, [selectedPostComments, commentSentimentFilter, commentSpamFilter, commentRelatedFilter]);

  useEffect(() => {
    if (!selectedPostDetail) return;
    const refreshed = posts.find((item) => item.id === selectedPostDetail.id);
    if (!refreshed) {
      setSelectedPostDetail(null);
      return;
    }
    if (refreshed !== selectedPostDetail) {
      setSelectedPostDetail(refreshed);
    }
  }, [posts, selectedPostDetail]);

  useEffect(() => {
    if (selectedPostDetail || posts.length === 0) return;
    setSelectedPostDetail(posts[0]);
  }, [posts, selectedPostDetail]);

  const loadMorePosts = async () => {
    if (!postsHasNext || !postsCursor || loadingMorePosts) return;
    setLoadingMorePosts(true);
    setError(null);
    setUiError("none");

    try {
      const response = await client.listMonitorSocialPosts({
        ...commonQuery,
        sort: postsSort,
        limit: 50,
        cursor: postsCursor
      });
      setPosts((current) => [...current, ...normalizePosts(response.items ?? [])]);
      setPostsCursor(response.page_info.next_cursor ?? null);
      setPostsHasNext(Boolean(response.page_info.has_next));
    } catch (loadError) {
      applyRequestError(loadError);
    } finally {
      setLoadingMorePosts(false);
    }
  };

  const buildPostCommentsQuery = (cursor?: string) => ({
    limit: 25,
    cursor,
    sentiment: commentSentimentFilter === "all" ? undefined : commentSentimentFilter,
    is_spam: commentSpamFilter === "all" ? undefined : commentSpamFilter === "spam",
    related_to_post_text: commentRelatedFilter === "all" ? undefined : commentRelatedFilter === "related"
  });

  const loadPostComments = async (post: PostRow, cursor?: string, append = false) => {
    setLoadingPostComments(true);
    setError(null);
    setUiError("none");
    try {
      const response = await client.listMonitorSocialPostComments(post.id, buildPostCommentsQuery(cursor));
      const incoming = response.items ?? [];
      setPostComments((current) => (append ? [...current, ...incoming] : incoming));
      setPostCommentsCursor(response.page_info.next_cursor ?? null);
      setPostCommentsHasNext(Boolean(response.page_info.has_next));
    } catch (loadError) {
      applyRequestError(loadError);
      if (!append) {
        setPostComments([]);
        setPostCommentsCursor(null);
        setPostCommentsHasNext(false);
      }
    } finally {
      setLoadingPostComments(false);
    }
  };

  const openCommentsModal = (post: PostRow) => {
    setSelectedPostComments(post);
    setPostComments([]);
    setPostCommentsCursor(null);
    setPostCommentsHasNext(false);
  };

  const closeCommentsModal = () => {
    setSelectedPostComments(null);
    setPostComments([]);
    setPostCommentsCursor(null);
    setPostCommentsHasNext(false);
  };

  const loadMorePostComments = async () => {
    if (!selectedPostComments || !postCommentsHasNext || !postCommentsCursor || loadingPostComments) return;
    await loadPostComments(selectedPostComments, postCommentsCursor, true);
  };

  const patchComment = async (
    commentId: string,
    payload: {
      is_spam?: boolean;
      related_to_post_text?: boolean;
      sentiment?: "positive" | "negative" | "neutral" | "unknown";
    }
  ) => {
    if (!canOverrideComments || updatingCommentId) return;
    setUpdatingCommentId(commentId);
    setError(null);
    setUiError("none");
    try {
      const updated = await client.patchMonitorSocialComment(commentId, payload);
      setPostComments((current) => current.map((item) => (item.id === commentId ? updated : item)));
    } catch (patchError) {
      applyRequestError(patchError);
    } finally {
      setUpdatingCommentId(null);
    }
  };

  const triggerRun = async () => {
    if (!canRefresh || refreshingRun) return;
    setRefreshingRun(true);
    setError(null);
    setUiError("none");
    try {
      const accepted = await client.createMonitorSocialRun({ force: false });
      setPendingRunId(accepted.run_id);
      setReloadVersion((current) => current + 1);
    } catch (runError) {
      applyRequestError(runError);
    } finally {
      setRefreshingRun(false);
    }
  };

  const exportFilteredCsv = async () => {
    if (!canExport || exportingCsv) return;
    setExportingCsv(true);
    setError(null);
    setUiError("none");
    try {
      const allPosts: PostRow[] = [];
      let cursor: string | undefined;
      let hasNext = true;

      while (hasNext) {
        const page = await client.listMonitorSocialPosts({
          ...commonQuery,
          sort: postsSort,
          limit: 200,
          cursor
        });

        allPosts.push(...normalizePosts(page.items ?? []));
        const nextCursor = page.page_info.next_cursor ?? undefined;
        hasNext = Boolean(page.page_info.has_next && nextCursor);
        cursor = nextCursor;
      }

      const ov = overview as unknown as {
        kpis?: Record<string, number>;
        previous_period?: Record<string, number>;
      };

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
      rows.push(
        [
          "id",
          "published_at",
          "channel",
          "account_name",
          "post_type",
          "campaign",
          "strategies",
          "hashtags",
          "title",
          "post_url",
          "sentiment",
          "exposure",
          "engagement_total",
          "post_er",
          "likes",
          "comments",
          "shares",
          "views"
        ].join(",")
      );

      for (const post of allPosts) {
        const er = (post.engagement_total / Math.max(post.exposure, 1)) * 100;
        rows.push(
          [
            csvEscape(post.id),
            csvEscape(post.published_at),
            csvEscape(post.channel),
            csvEscape(post.account_name),
            csvEscape(post.post_type ?? "unknown"),
            csvEscape(post.campaign ?? ""),
            csvEscape((post.strategies ?? []).join("|")),
            csvEscape((post.hashtags ?? []).join("|")),
            csvEscape(post.title),
            csvEscape(post.post_url),
            csvEscape(post.sentiment),
            csvEscape(post.exposure),
            csvEscape(post.engagement_total),
            csvEscape(er.toFixed(4)),
            csvEscape(post.likes),
            csvEscape(post.comments),
            csvEscape(post.shares),
            csvEscape(post.views)
          ].join(",")
        );
      }

      const filename = `social-overview-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
      downloadTextFile(rows.join("\n"), filename, "text/csv;charset=utf-8;");
    } catch (csvError) {
      applyRequestError(csvError);
    } finally {
      setExportingCsv(false);
    }
  };

  const exportExcel = async () => {
    if (!canExport || exportingExcel) return;
    setExportingExcel(true);
    setError(null);
    setUiError("none");
    try {
      const blob = await client.downloadMonitorSocialExcel({
        ...commonQuery,
        sort: postsSort,
        min_posts: minPosts,
        min_exposure: minExposure
      });
      const filename = `social-analytics-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.xlsx`;
      downloadBlobFile(blob, filename);
    } catch (downloadError) {
      applyRequestError(downloadError);
    } finally {
      setExportingExcel(false);
    }
  };

  const toggleMultiValue = (key: string, values: string[], value: string) => {
    const normalized = value.trim();
    const exists = values.includes(normalized);
    const next = exists ? values.filter((item) => item !== normalized) : [...values, normalized];
    setQueryPatch({
      [key]: next.length > 0 ? next.join(",") : null,
      accounts_cursor: null
    });
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

  const normalizedOverview = (overview ?? {}) as unknown as {
    kpis?: Record<string, number | string | null>;
    previous_period?: Record<string, number>;
    target_progress?: {
      target_shs?: number;
      quarterly_sov_target_pp?: number;
      er_by_channel?: Array<{
        channel: SocialChannel;
        baseline_2025_er: number;
        target_2026_er: number;
        current_er: number;
        gap: number;
        progress_pct: number;
        source: "auto" | "manual";
      }>;
    };
    comparison?: {
      label?: string;
      current_window_start?: string;
      current_window_end?: string;
      previous_window_start?: string;
      previous_window_end?: string;
    };
    trend_series?: Array<Record<string, unknown>>;
    by_channel?: Array<Record<string, unknown>>;
    reconciliation_status?: string;
    diagnostics?: Record<string, unknown>;
    last_etl_at?: string | null;
    window_start?: string;
    window_end?: string;
  };

  const trendSeries = useMemo(() => {
    const raw = normalizedOverview.trend_series;
    if (raw && raw.length > 0) {
      return raw.map((item) => ({
        bucket_label: String(item.bucket_label ?? ""),
        posts: Number(item.posts ?? 0),
        exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0),
        impressions_total: Number(item.impressions_total ?? 0),
        reach_total: Number(item.reach_total ?? 0),
        clicks_total: Number(item.clicks_total ?? 0),
        likes_total: Number(item.likes_total ?? 0),
        comments_total: Number(item.comments_total ?? 0),
        shares_total: Number(item.shares_total ?? 0),
        views_total: Number(item.views_total ?? 0),
        er_global: Number(item.er_global ?? 0),
        ctr: Number(item.ctr ?? 0),
        er_impressions: Number(item.er_impressions ?? 0),
        er_reach: Number(item.er_reach ?? 0),
        view_rate: Number(item.view_rate ?? 0),
        likes_share: Number(item.likes_share ?? 0),
        comments_share: Number(item.comments_share ?? 0),
        shares_share: Number(item.shares_share ?? 0),
        riesgo_activo: Number(item.riesgo_activo ?? 0),
        shs: Number(item.shs ?? 0)
      }));
    }
    return [];
  }, [normalizedOverview]);

  const channelData = useMemo(
    () =>
      (normalizedOverview.by_channel ?? []).map((item) => ({
        channel: String(item.channel ?? "facebook") as SocialChannel,
        posts: Number(item.posts ?? 0),
        exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0),
        impressions_total: Number(item.impressions_total ?? 0),
        reach_total: Number(item.reach_total ?? 0),
        clicks_total: Number(item.clicks_total ?? 0),
        likes_total: Number(item.likes_total ?? 0),
        comments_total: Number(item.comments_total ?? 0),
        shares_total: Number(item.shares_total ?? 0),
        views_total: Number(item.views_total ?? 0),
        er_global: Number(item.er_global ?? 0),
        ctr: Number(item.ctr ?? 0),
        er_impressions: Number(item.er_impressions ?? 0),
        er_reach: Number(item.er_reach ?? 0),
        view_rate: Number(item.view_rate ?? 0),
        likes_share: Number(item.likes_share ?? 0),
        comments_share: Number(item.comments_share ?? 0),
        shares_share: Number(item.shares_share ?? 0),
        riesgo_activo: Number(item.riesgo_activo ?? 0),
        sov_interno: Number(item.sov_interno ?? 0)
      })),
    [normalizedOverview]
  );

  const accountOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of facetsData?.facets?.account ?? []) values.add(item.value);
    for (const row of selectedAccounts) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedAccounts]);

  const postTypeOptions = useMemo(() => {
    const values = new Set<string>(["unknown"]);
    for (const item of facetsData?.facets?.post_type ?? []) values.add(normalizePostType(item.value));
    for (const row of selectedPostTypes) values.add(normalizePostType(row));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedPostTypes]);

  const campaignOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of facetsData?.facets?.campaign ?? []) values.add(item.value.toLowerCase());
    for (const row of selectedCampaigns) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedCampaigns]);

  const strategyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of facetsData?.facets?.strategy ?? []) values.add(item.value.toLowerCase());
    for (const row of selectedStrategies) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedStrategies]);

  const hashtagOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of facetsData?.facets?.hashtag ?? []) values.add(item.value.toLowerCase().replace(/^#+/, ""));
    for (const row of selectedHashtags) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedHashtags]);

  const topicOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of facetsData?.facets?.topic ?? []) values.add(item.value.toLowerCase());
    for (const row of selectedTopics) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [facetsData, selectedTopics]);

  const filterBySearch = (values: string[], term: string): string[] => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return values;
    return values.filter((item) => item.toLowerCase().includes(normalized));
  };

  const filteredChannelOptions = useMemo(() => filterBySearch(CHANNEL_OPTIONS, channelSearch), [channelSearch]);
  const filteredAccountOptions = useMemo(() => filterBySearch(accountOptions, accountSearch), [accountOptions, accountSearch]);
  const filteredPostTypeOptions = useMemo(() => filterBySearch(postTypeOptions, postTypeSearch), [postTypeOptions, postTypeSearch]);
  const filteredCampaignOptions = useMemo(() => filterBySearch(campaignOptions, campaignSearch), [campaignOptions, campaignSearch]);
  const filteredStrategyOptions = useMemo(() => filterBySearch(strategyOptions, strategySearch), [strategyOptions, strategySearch]);
  const filteredHashtagOptions = useMemo(() => filterBySearch(hashtagOptions, hashtagSearch), [hashtagOptions, hashtagSearch]);
  const filteredTopicOptions = useMemo(() => filterBySearch(topicOptions, topicSearch), [topicOptions, topicSearch]);

  const dataStatus = useMemo(() => {
    if (loading) return "loading";
    if (uiError === "permission_denied") return "permission_denied";
    if (error) return "error";
    if ((normalizedOverview.kpis?.posts as number | undefined) === 0 && posts.length === 0) return "empty";
    if ((normalizedOverview.reconciliation_status ?? "ok") !== "ok") return "recon_warning";
    if (Boolean(normalizedOverview.diagnostics?.insufficient_data)) return "partial_data";
    if (riskData?.stale_data) return "stale_data";
    return "ready";
  }, [loading, uiError, error, normalizedOverview, posts.length, riskData?.stale_data]);

  const topAccountsDual = useMemo(() => {
    const rows = [...(accountsData?.items ?? [])]
      .sort((a, b) => Number(b[accountBarMetric]) - Number(a[accountBarMetric]))
      .slice(0, 10)
      .map((item) => ({
        account_name: item.account_name,
        posts: Number(item.posts ?? 0),
        exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0),
        impressions_total: Number(item.impressions_total ?? 0),
        reach_total: Number(item.reach_total ?? 0),
        clicks_total: Number(item.clicks_total ?? 0),
        likes_total: Number(item.likes_total ?? 0),
        comments_total: Number(item.comments_total ?? 0),
        shares_total: Number(item.shares_total ?? 0),
        views_total: Number(item.views_total ?? 0),
        er_ponderado: Number(item.er_ponderado ?? 0),
        ctr: Number(item.ctr ?? 0),
        er_impressions: Number(item.er_impressions ?? 0),
        er_reach: Number(item.er_reach ?? 0),
        view_rate: Number(item.view_rate ?? 0),
        likes_share: Number(item.likes_share ?? 0),
        comments_share: Number(item.comments_share ?? 0),
        shares_share: Number(item.shares_share ?? 0),
        riesgo_activo: Number(item.riesgo_activo ?? 0),
        sov_interno: Number(item.sov_interno ?? 0)
      }));
    return rows;
  }, [accountsData, accountBarMetric]);

  const topAccountsAxisValues = useMemo(() => {
    const leftValues: number[] = [];
    const rightValues: number[] = [];
    for (const item of topAccountsDual) {
      const barValue = Number(item[accountBarMetric]);
      const lineValue = Number(item[accountLineMetric]);
      if (accountBarAxis === "left") leftValues.push(barValue);
      else rightValues.push(barValue);
      if (accountLineAxis === "left") leftValues.push(lineValue);
      else rightValues.push(lineValue);
    }
    return { leftValues, rightValues };
  }, [topAccountsDual, accountBarMetric, accountLineMetric, accountBarAxis, accountLineAxis]);

  const topAccountsLeftScale = useMemo(
    () => resolveScale(topAccountsLeftScaleMode, topAccountsAxisValues.leftValues),
    [topAccountsLeftScaleMode, topAccountsAxisValues]
  );
  const topAccountsRightScale = useMemo(
    () => resolveScale(topAccountsRightScaleMode, topAccountsAxisValues.rightValues),
    [topAccountsRightScaleMode, topAccountsAxisValues]
  );

  const topAccountsLeftMetrics = useMemo(() => {
    const metrics: AccountMetric[] = [];
    if (accountBarAxis === "left") metrics.push(accountBarMetric);
    if (accountLineAxis === "left") metrics.push(accountLineMetric);
    return Array.from(new Set(metrics));
  }, [accountBarAxis, accountLineAxis, accountBarMetric, accountLineMetric]);

  const topAccountsRightMetrics = useMemo(() => {
    const metrics: AccountMetric[] = [];
    if (accountBarAxis === "right") metrics.push(accountBarMetric);
    if (accountLineAxis === "right") metrics.push(accountLineMetric);
    return Array.from(new Set(metrics));
  }, [accountBarAxis, accountLineAxis, accountBarMetric, accountLineMetric]);

  const trendAxisValues = useMemo(() => {
    const leftValues = trendSeries.map((item) => Number(item[trendLeftMetric]));
    const rightValues = trendSeries.map((item) => Number(item[trendRightMetric]));
    return { leftValues, rightValues };
  }, [trendSeries, trendLeftMetric, trendRightMetric]);

  const trendLeftScale = useMemo(() => resolveScale("auto", trendAxisValues.leftValues), [trendAxisValues.leftValues]);
  const trendRightScale = useMemo(() => resolveScale("auto", trendAxisValues.rightValues), [trendAxisValues.rightValues]);

  const trendLeftMetrics = useMemo(() => [trendLeftMetric], [trendLeftMetric]);
  const trendRightMetrics = useMemo(() => [trendRightMetric], [trendRightMetric]);

  const trendByDimensionSeries = useMemo(() => {
    return (trendByDimensionData?.series ?? []).map((series, index) => {
      const normalized = series.label.trim().toLowerCase();
      const channelColor =
        trendByDimensionDimension === "channel" && CHANNEL_OPTIONS.includes(normalized as SocialChannel)
          ? CHANNEL_SERIES_COLORS[normalized as SocialChannel]
          : null;
      return {
        ...series,
        key: `series_${index}`,
        color: channelColor ?? DIMENSION_SERIES_COLORS[index % DIMENSION_SERIES_COLORS.length]
      };
    });
  }, [trendByDimensionData, trendByDimensionDimension]);

  useEffect(() => {
    if (trendByDimensionSeries.length === 0) {
      setVisibleTrendByDimensionSeries([]);
      return;
    }
    if (trendByDimensionDimension === "channel") {
      setVisibleTrendByDimensionSeries(trendByDimensionSeries.map((item) => item.label));
      return;
    }
    setVisibleTrendByDimensionSeries(trendByDimensionSeries.slice(0, 8).map((item) => item.label));
  }, [trendByDimensionSeries, trendByDimensionDimension, trendByDimensionMetric]);

  const filteredTrendByDimensionSeries = useMemo(() => {
    const options = trendByDimensionSeries.map((item) => item.label);
    return filterBySearch(options, trendByDimensionSeriesSearch);
  }, [trendByDimensionSeries, trendByDimensionSeriesSearch]);

  const trendByDimensionVisibleSeries = useMemo(
    () => trendByDimensionSeries.filter((item) => visibleTrendByDimensionSeries.includes(item.label)),
    [trendByDimensionSeries, visibleTrendByDimensionSeries]
  );

  const trendByDimensionSeriesByKey = useMemo(() => {
    return new Map(trendByDimensionSeries.map((item) => [item.key, item]));
  }, [trendByDimensionSeries]);

  const trendByDimensionChartData = useMemo(() => {
    if (trendByDimensionSeries.length === 0) return [];
    const buckets = new Map<
      string,
      {
        bucketLabel: string;
        values: Record<string, number>;
      }
    >();

    for (const series of trendByDimensionSeries) {
      for (const point of series.points) {
        const bucketKey = point.bucket_start;
        const current = buckets.get(bucketKey) ?? {
          bucketLabel: point.bucket_label,
          values: {}
        };
        current.bucketLabel = current.bucketLabel || point.bucket_label;
        current.values[series.key] = Number(point.value ?? 0);
        buckets.set(bucketKey, current);
      }
    }

    const orderedBucketKeys = Array.from(buckets.keys()).sort();
    return orderedBucketKeys.map((bucketKey, index) => {
      const current = buckets.get(bucketKey);
      const row: Record<string, string | number | null> = {
        bucket_label: current?.bucketLabel ?? `Bucket ${index + 1}`
      };
      for (const series of trendByDimensionSeries) {
        row[series.key] = current && Object.prototype.hasOwnProperty.call(current.values, series.key) ? current.values[series.key] : null;
      }
      return row;
    });
  }, [trendByDimensionSeries]);

  const trendByDimensionAxisValues = useMemo(
    () => trendByDimensionVisibleSeries.flatMap((series) => series.points.map((point) => Number(point.value ?? 0))),
    [trendByDimensionVisibleSeries]
  );
  const trendByDimensionHasNonPositiveValues = useMemo(
    () => trendByDimensionAxisValues.some((value) => !Number.isFinite(value) || value <= 0),
    [trendByDimensionAxisValues]
  );
  const trendByDimensionScale = useMemo(
    () => (trendByDimensionHasNonPositiveValues ? "linear" : resolveScale("auto", trendByDimensionAxisValues)),
    [trendByDimensionAxisValues, trendByDimensionHasNonPositiveValues]
  );

  const topicBreakdownSegments = useMemo(
    () =>
      (topicBreakdownData?.segments_order ?? []).map((segment, index) => ({
        ...segment,
        color: TOPIC_SEGMENT_COLORS[index % TOPIC_SEGMENT_COLORS.length]
      })),
    [topicBreakdownData]
  );

  const topicBreakdownSegmentByKey = useMemo(
    () => new Map(topicBreakdownSegments.map((segment) => [segment.key, segment])),
    [topicBreakdownSegments]
  );

  const topicBreakdownChartData = useMemo(() => {
    const segments = topicBreakdownData?.segments_order ?? [];
    return (topicBreakdownData?.items ?? []).map((item) => {
      const valuesByKey = new Map(item.segments.map((segment) => [segment.key, Number(segment.metric_value ?? 0)]));
      const row: Record<string, string | number> = {
        topic_key: item.topic_key,
        topic_label: item.topic_label,
        metric_total: Number(item.metric_total ?? 0),
        posts_total: Number(item.posts_total ?? 0)
      };

      let total = 0;
      for (const segment of segments) {
        const value = valuesByKey.get(segment.key) ?? 0;
        row[`raw_${segment.key}`] = value;
        total += value;
        row[segment.key] = value;
      }

      if (topicBreakdownNormalize100) {
        const denominator = Math.max(total, 0.00001);
        for (const segment of segments) {
          row[segment.key] = (Number(row[segment.key] ?? 0) / denominator) * 100;
        }
      }

      return row;
    });
  }, [topicBreakdownData, topicBreakdownNormalize100]);

  const topicBreakdownAxisValues = useMemo(() => {
    if (topicBreakdownNormalize100) return [100];
    return topicBreakdownChartData.flatMap((row) => topicBreakdownSegments.map((segment) => Number(row[segment.key] ?? 0)));
  }, [topicBreakdownChartData, topicBreakdownSegments, topicBreakdownNormalize100]);

  const topicBreakdownScale = "linear";

  const topicBreakdownChartHeight = useMemo(
    () => Math.max(320, topicBreakdownChartData.length * 34 + 90),
    [topicBreakdownChartData.length]
  );

  const erGapByChannel = useMemo(
    () =>
      (erTargets?.items ?? []).map((item) => ({
        channel: item.channel,
        current_er: item.current_er,
        target_2026_er: item.target_2026_er,
        gap: item.gap,
        source: item.source
      })),
    [erTargets]
  );

  const hasVisibleTargetByChannel = useMemo(() => erGapByChannel.some((item) => Math.abs(item.target_2026_er) > 0.0001), [erGapByChannel]);

  const mixAxisValues = useMemo(() => {
    const leftValues: number[] = [];
    const rightValues: number[] = [];
    for (const item of channelData) {
      const barValue = Number(item[mixBarMetric]);
      const lineValue = Number(item[mixLineMetric]);
      if (mixBarAxis === "left") leftValues.push(barValue);
      else rightValues.push(barValue);
      if (mixLineAxis === "left") leftValues.push(lineValue);
      else rightValues.push(lineValue);
    }
    return { leftValues, rightValues };
  }, [channelData, mixBarMetric, mixLineMetric, mixBarAxis, mixLineAxis]);

  const mixLeftScale = useMemo(() => resolveScale("auto", mixAxisValues.leftValues), [mixAxisValues.leftValues]);
  const mixRightScale = useMemo(() => resolveScale("auto", mixAxisValues.rightValues), [mixAxisValues.rightValues]);

  const mixLeftMetrics = useMemo(() => {
    const metrics: MixMetric[] = [];
    if (mixBarAxis === "left") metrics.push(mixBarMetric);
    if (mixLineAxis === "left") metrics.push(mixLineMetric);
    return Array.from(new Set(metrics));
  }, [mixBarAxis, mixLineAxis, mixBarMetric, mixLineMetric]);

  const mixRightMetrics = useMemo(() => {
    const metrics: MixMetric[] = [];
    if (mixBarAxis === "right") metrics.push(mixBarMetric);
    if (mixLineAxis === "right") metrics.push(mixLineMetric);
    return Array.from(new Set(metrics));
  }, [mixBarAxis, mixLineAxis, mixBarMetric, mixLineMetric]);

  const breakdownChartData = useMemo(
    () =>
      [...(breakdownData?.items ?? [])]
        .map((item) => ({
          ...item,
          metric_value: Number(item[breakdownMetric] ?? 0)
        }))
        .sort((a, b) => Number(b.metric_value) - Number(a.metric_value) || Number(b.posts) - Number(a.posts))
        .slice(0, 100),
    [breakdownData, breakdownMetric]
  );

  const breakdownScale = useMemo(
    () => resolveScale(breakdownScaleMode, breakdownChartData.map((item) => Number(item.metric_value))),
    [breakdownScaleMode, breakdownChartData]
  );

  const sovPieData = useMemo(() => {
    const sorted = [...(accountsData?.items ?? [])].sort((a, b) => b.sov_interno - a.sov_interno);
    const top = sorted.slice(0, 6).map((item) => ({ name: item.account_name, value: item.sov_interno }));
    const others = sorted.slice(6).reduce((acc, item) => acc + item.sov_interno, 0);
    if (others > 0.001) top.push({ name: "Otros", value: others });
    return top;
  }, [accountsData]);

  const pieColors = ["#e30613", "#1d4ed8", "#0f766e", "#f59f00", "#9333ea", "#64748b"];

  const scatterValues = useMemo(() => {
    const xValues = (scatterData?.items ?? []).map((item) => Number(item[scatterXMetric] ?? 0));
    const yValues = (scatterData?.items ?? []).map((item) => Number(item[scatterYMetric] ?? 0));
    return { xValues, yValues };
  }, [scatterData, scatterXMetric, scatterYMetric]);

  const scatterXScale = useMemo(() => resolveScale("auto", scatterValues.xValues), [scatterValues.xValues]);
  const scatterYScale = useMemo(() => resolveScale("auto", scatterValues.yValues), [scatterValues.yValues]);

  const scatterChartData = useMemo(
    () =>
      (scatterData?.items ?? []).map((item) => ({
        label: item.label,
        posts: Number(item.posts ?? 0),
        exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0),
        impressions_total: Number(item.impressions_total ?? 0),
        reach_total: Number(item.reach_total ?? 0),
        clicks_total: Number(item.clicks_total ?? 0),
        likes_total: Number(item.likes_total ?? 0),
        comments_total: Number(item.comments_total ?? 0),
        shares_total: Number(item.shares_total ?? 0),
        views_total: Number(item.views_total ?? 0),
        er_global: Number(item.er_global ?? 0),
        ctr: Number(item.ctr ?? 0),
        er_impressions: Number(item.er_impressions ?? 0),
        er_reach: Number(item.er_reach ?? 0),
        view_rate: Number(item.view_rate ?? 0),
        likes_share: Number(item.likes_share ?? 0),
        comments_share: Number(item.comments_share ?? 0),
        shares_share: Number(item.shares_share ?? 0),
        x_value: Number(item[scatterXMetric] ?? 0),
        y_value: Number(item[scatterYMetric] ?? 0),
        z: Math.max(1, Number(item.posts ?? 0))
      })),
    [scatterData, scatterXMetric, scatterYMetric]
  );

  const riskTopChannels = useMemo(
    () =>
      [...(riskData?.by_channel ?? [])]
        .sort((a, b) => b.riesgo_activo - a.riesgo_activo || b.negativos - a.negativos)
        .slice(0, 8),
    [riskData]
  );

  const riskTopAccounts = useMemo(
    () =>
      [...(riskData?.by_account ?? [])]
        .sort((a, b) => b.riesgo_activo - a.riesgo_activo || b.negativos - a.negativos)
        .slice(0, 8),
    [riskData]
  );

  const targetErGlobal = useMemo(() => {
    const rows = normalizedOverview.target_progress?.er_by_channel ?? [];
    if (rows.length === 0) return 0;
    return rows.reduce((acc, row) => acc + Number(row.target_2026_er ?? 0), 0) / rows.length;
  }, [normalizedOverview]);

  const kpiCards = useMemo<KpiCard[]>(() => {
    const kpis = normalizedOverview.kpis ?? {};
    const prev = normalizedOverview.previous_period ?? {};
    const targetProgress = normalizedOverview.target_progress ?? {};

    const postsCurrent = Number(kpis.posts ?? 0);
    const postsPrev = Number(prev.posts ?? 0);

    const exposureCurrent = Number(kpis.exposure_total ?? 0);
    const exposurePrev = Number(prev.exposure_total ?? 0);

    const erCurrent = Number(kpis.er_global ?? 0);
    const erPrev = Number(prev.er_global ?? 0);

    const riesgoCurrent = Number(kpis.riesgo_activo ?? 0);
    const riesgoPrev = Number(prev.riesgo_activo ?? 0);

    const shsCurrent = Number(kpis.shs ?? 0);
    const shsPrev = Number(prev.shs ?? 0);
    const targetShs = Number(targetProgress.target_shs ?? 0);

    const sovCurrent = Number(kpis.focus_account_sov ?? 0);
    const sovPrev = Number(prev.focus_account_sov ?? 0);
    const targetSovPp = Number(targetProgress.quarterly_sov_target_pp ?? 0);

    return [
      {
        id: "posts",
        title: "Posts",
        value: formatNumber(postsCurrent),
        previous: formatNumber(postsPrev),
        goal: "Meta: --",
        status: `Vs anterior: ${formatNumber(postsCurrent - postsPrev)}`,
        statusClass: toDeltaClass(postsCurrent - postsPrev),
        info: KPI_INFO.posts
      },
      {
        id: "exposure_total",
        title: "Exposición",
        value: formatNumber(exposureCurrent),
        previous: formatNumber(exposurePrev),
        goal: "Meta: --",
        status: `Vs anterior: ${formatNumber(exposureCurrent - exposurePrev)}`,
        statusClass: toDeltaClass(exposureCurrent - exposurePrev),
        info: KPI_INFO.exposure_total
      },
      {
        id: "er_global",
        title: "ER Global",
        value: formatPercent(erCurrent),
        previous: formatPercent(erPrev),
        goal: `Meta: ${formatPercent(targetErGlobal)}`,
        status: `Gap meta: ${formatPercent(erCurrent - targetErGlobal)}`,
        statusClass: toDeltaClass(erCurrent - targetErGlobal),
        info: KPI_INFO.er_global
      },
      {
        id: "riesgo_activo",
        title: "Riesgo activo",
        value: formatPercent(riesgoCurrent),
        previous: formatPercent(riesgoPrev),
        goal: `Umbral: ${formatPercent(Number((overview as unknown as { settings?: { risk_threshold?: number } })?.settings?.risk_threshold ?? 0))}`,
        status: `Vs anterior: ${formatPercent(riesgoCurrent - riesgoPrev)}`,
        statusClass: toDeltaClass(-(riesgoCurrent - riesgoPrev)),
        info: KPI_INFO.riesgo_activo
      },
      {
        id: "shs",
        title: "SHS (social)",
        value: formatScore(shsCurrent),
        previous: formatScore(shsPrev),
        goal: `Meta: ${formatScore(targetShs)}`,
        status: `Gap meta: ${formatScore(shsCurrent - targetShs)}`,
        statusClass: toDeltaClass(shsCurrent - targetShs),
        info: KPI_INFO.shs
      },
      {
        id: "focus_account_sov",
        title: "SOV interno",
        value: formatPercent(sovCurrent),
        previous: formatPercent(sovPrev),
        goal: `Meta trimestral: +${formatScore(targetSovPp)} pp`,
        status: `Cuenta foco: ${String(kpis.focus_account ?? "n/a")}`,
        statusClass: "text-slate-600",
        info: KPI_INFO.focus_account_sov
      }
    ];
  }, [normalizedOverview, targetErGlobal, overview]);

  const secondaryKpis = useMemo(
    () =>
      SECONDARY_KPI_METRICS.map((metric) => {
        const current = Number(normalizedOverview.kpis?.[metric] ?? 0);
        const previous = Number(normalizedOverview.previous_period?.[metric] ?? 0);
        const delta = current - previous;
        return {
          metric,
          label: METRIC_META[metric]?.label ?? metric,
          value: formatMetricValue(metric, current),
          delta,
          deltaLabel: `${delta >= 0 ? "+" : ""}${formatMetricValue(metric, delta)}`
        };
      }),
    [normalizedOverview]
  );

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Social Analytics</h2>
          <p className="mt-1 text-sm text-slate-600">Dashboard comparativo 2026 vs 2025 con metas ER por canal y filtros inteligentes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-700">No oficial</span>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setReloadVersion((current) => current + 1)} disabled={loading}>
            Refrescar vista
          </button>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => void triggerRun()} disabled={!canRefresh || refreshingRun}>
            {refreshingRun ? "Encolando..." : "Refresh manual ETL"}
          </button>
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => void exportFilteredCsv()} disabled={!canExport || exportingCsv}>
            {exportingCsv ? "Exportando..." : "Exportar CSV"}
          </button>
          <button className="rounded-lg bg-claro-red px-3 py-2 text-sm font-semibold text-white hover:brightness-95" type="button" onClick={() => void exportExcel()} disabled={!canExport || exportingExcel}>
            {exportingExcel ? "Exportando..." : "Exportar Excel"}
          </button>
        </div>
      </header>

      {role === "Viewer" ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Rol Viewer: lectura habilitada.</div> : null}
      {pendingRunId ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Corrida manual en progreso: {pendingRunId}</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      {dataStatus === "permission_denied" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Estado permission_denied: no tienes permisos para una o más consultas de Social Analytics.
        </div>
      ) : null}
      {dataStatus === "stale_data" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Estado stale_data: la última ETL está fuera del umbral de frescura configurado para operación.
        </div>
      ) : null}
      {dataStatus === "partial_data" ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Estado partial_data: hay clasificación pendiente o muestra insuficiente.</div> : null}
      {dataStatus === "recon_warning" ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Estado recon_warning: la reconciliación S3-DB tiene deltas.</div> : null}
      {dataStatus === "empty" ? <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Estado empty: no hay datos para los filtros seleccionados.</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Filtros inteligentes</h3>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() =>
              setQueryPatch({
                preset: "ytd",
                from: null,
                to: null,
                comparison_mode: "same_period_last_year",
                comparison_days: null,
                channel: null,
                account: null,
                post_type: null,
                campaign: null,
                strategy: null,
                hashtag: null,
                topic: null,
                sentiment: null,
                posts_sort: null,
                accounts_sort: null,
                accounts_cursor: null,
                accounts_limit: null,
                min_posts: null,
                min_exposure: null
              })
            }
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid gap-3 xl:grid-cols-10">
          <details className="group relative min-w-0 xl:col-span-2">
            <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Periodo y comparación</p>
              <p className="truncate text-sm font-semibold text-slate-800">
                {toPresetLabel(preset)} | {toComparisonLabel(comparisonMode)}
              </p>
              <p className="truncate text-xs text-slate-500">
                {formatDate((normalizedOverview.comparison?.current_window_start ?? normalizedOverview.window_start) as string | undefined)} - {" "}
                {formatDate((normalizedOverview.comparison?.current_window_end ?? normalizedOverview.window_end) as string | undefined)}
              </p>
            </summary>
            <div className="absolute z-30 mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Desde
                  <input
                    type="date"
                    value={from ?? ""}
                    onChange={(event) => setQueryPatch({ preset: "custom", from: event.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Hasta
                  <input
                    type="date"
                    value={to ?? ""}
                    onChange={(event) => setQueryPatch({ preset: "custom", to: event.target.value || null })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {PRESET_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => applyPreset(option)}
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${preset === option ? "border-red-600 bg-red-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                  >
                    {toPresetLabel(option)}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Tipo comparación
                  <select
                    value={comparisonMode}
                    onChange={(event) => setQueryPatch({ comparison_mode: event.target.value as SocialComparisonMode })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="same_period_last_year">Mismo periodo del año pasado</option>
                    <option value="weekday_aligned_week">Última semana con coincidencia de días</option>
                    <option value="exact_days">Última cantidad exacta de días</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-600">
                  Días comparación
                  <input
                    type="number"
                    min={1}
                    max={366}
                    value={comparisonDays}
                    disabled={comparisonMode !== "exact_days"}
                    onChange={(event) => setQueryPatch({ comparison_days: String(Math.max(1, Number.parseInt(event.target.value || "30", 10))) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          </details>

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Canal"
            summary={selectedChannels.length > 0 ? `${selectedChannels.length} seleccionados` : "Todos"}
            secondary={`${CHANNEL_OPTIONS.length} canales`}
            options={filteredChannelOptions}
            selected={selectedChannels}
            search={channelSearch}
            placeholder="Buscar canal"
            onSearch={setChannelSearch}
            onToggle={(value) => toggleMultiValue("channel", selectedChannels, value)}
            onClear={() => setQueryPatch({ channel: null })}
            toLabel={(value) => toChannelLabel(value as SocialChannel)}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Cuenta"
            summary={selectedAccounts.length > 0 ? `${selectedAccounts.length} seleccionadas` : "Todas"}
            secondary={`${accountOptions.length} disponibles`}
            options={filteredAccountOptions}
            selected={selectedAccounts}
            search={accountSearch}
            placeholder="Buscar cuenta..."
            onSearch={setAccountSearch}
            onToggle={(value) => toggleMultiValue("account", selectedAccounts, value)}
            onClear={() => setQueryPatch({ account: null })}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Tipo de post"
            summary={selectedPostTypes.length > 0 ? `${selectedPostTypes.length} seleccionados` : "Todos"}
            secondary={`${postTypeOptions.length} tipos`}
            options={filteredPostTypeOptions}
            selected={selectedPostTypes}
            search={postTypeSearch}
            placeholder="Buscar tipo..."
            onSearch={setPostTypeSearch}
            onToggle={(value) => toggleMultiValue("post_type", selectedPostTypes, value)}
            onClear={() => setQueryPatch({ post_type: null })}
            toLabel={(value) => (value === "unknown" ? "Sin tipo" : value)}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Campaña"
            summary={selectedCampaigns.length > 0 ? `${selectedCampaigns.length} seleccionadas` : "Todas"}
            secondary={`${campaignOptions.length} disponibles`}
            options={filteredCampaignOptions}
            selected={selectedCampaigns}
            search={campaignSearch}
            placeholder="Buscar campaña..."
            onSearch={setCampaignSearch}
            onToggle={(value) => toggleMultiValue("campaign", selectedCampaigns, value)}
            onClear={() => setQueryPatch({ campaign: null })}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Estrategia"
            summary={selectedStrategies.length > 0 ? `${selectedStrategies.length} seleccionadas` : "Todas"}
            secondary={`${strategyOptions.length} disponibles`}
            options={filteredStrategyOptions}
            selected={selectedStrategies}
            search={strategySearch}
            placeholder="Buscar estrategia..."
            onSearch={setStrategySearch}
            onToggle={(value) => toggleMultiValue("strategy", selectedStrategies, value)}
            onClear={() => setQueryPatch({ strategy: null })}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Hashtag"
            summary={selectedHashtags.length > 0 ? `${selectedHashtags.length} seleccionados` : "Todos"}
            secondary={`${hashtagOptions.length} disponibles`}
            options={filteredHashtagOptions}
            selected={selectedHashtags}
            search={hashtagSearch}
            placeholder="Buscar hashtag..."
            onSearch={setHashtagSearch}
            onToggle={(value) => toggleMultiValue("hashtag", selectedHashtags, value)}
            onClear={() => setQueryPatch({ hashtag: null })}
            toLabel={(value) => `#${value}`}
          />

          <SmartMultiSelect
            className="xl:col-span-1"
            label="Tema"
            summary={selectedTopics.length > 0 ? `${selectedTopics.length} seleccionados` : "Todos"}
            secondary={`${topicOptions.length} disponibles`}
            options={filteredTopicOptions}
            selected={selectedTopics}
            search={topicSearch}
            placeholder="Buscar tema..."
            onSearch={setTopicSearch}
            onToggle={(value) => toggleMultiValue("topic", selectedTopics, value)}
            onClear={() => setQueryPatch({ topic: null })}
            toLabel={toTopicFilterLabel}
          />

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sentimiento</p>
            <select
              value={selectedSentiment}
              onChange={(event) => setQueryPatch({ sentiment: event.target.value === "all" ? null : event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="positive">Positivo</option>
              <option value="negative">Negativo</option>
              <option value="neutral">Neutro</option>
              <option value="unknown">Unknown</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {loadingFacets ? "Actualizando facetas..." : `${formatNumber(facetsData?.totals?.posts ?? 0)} posts en universo filtrado`}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Ventana activa: {formatDate((normalizedOverview.comparison?.current_window_start ?? normalizedOverview.window_start) as string | undefined)} - {" "}
          {formatDate((normalizedOverview.comparison?.current_window_end ?? normalizedOverview.window_end) as string | undefined)} | período comparado: {" "}
          {formatDate((normalizedOverview.comparison?.previous_window_start ?? "") as string | undefined)} - {" "}
          {formatDate((normalizedOverview.comparison?.previous_window_end ?? "") as string | undefined)}
        </p>
      </section>

      <section className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-panel">
        {TAB_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === option ? "bg-red-700 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            onClick={() => setQueryPatch({ tab: option })}
          >
            {option === "summary" ? "Resumen" : option === "accounts" ? "Cuentas" : option === "posts" ? "Posts" : option === "risk" ? "Riesgo" : "ETL"}
          </button>
        ))}
      </section>

      {tab === "summary" ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {kpiCards.map((card) => (
              <article key={card.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{card.title}</h3>
                  <KpiInfo id={`kpi-info-${card.id}`} text={card.info} />
                </div>
                <p className="mt-2 text-3xl font-bold text-red-700">{card.value}</p>
                <p className="truncate text-xs text-slate-600">Periodo anterior: {card.previous}</p>
                <p className="mt-1 truncate text-xs text-slate-600">{card.goal}</p>
                <p className={`mt-1 truncate text-xs font-semibold ${card.statusClass}`}>{card.status}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {secondaryKpis.map((item) => (
              <article key={item.metric} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-panel">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 text-base font-bold text-slate-900">{item.value}</p>
                <p className={`mt-0.5 text-[11px] font-semibold ${toDeltaClass(item.delta)}`}>Vs anterior: {item.deltaLabel}</p>
              </article>
            ))}
          </section>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">Tendencia</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.trend}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {normalizedOverview.comparison?.label ?? "Comparación activa"}
                  </span>
                </div>
                <div className="mb-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Eje izquierdo
                    <select
                      value={trendLeftMetric}
                      onChange={(event) => setTrendLeftMetric(event.target.value as TrendMetric)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    >
                      {TREND_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Eje derecho
                    <select
                      value={trendRightMetric}
                      onChange={(event) => setTrendRightMetric(event.target.value as TrendMetric)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    >
                      {TREND_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendSeries} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket_label" minTickGap={16} />
                      <YAxis
                        yAxisId="left"
                        width={76}
                        scale={trendLeftScale}
                        domain={resolveAxisDomain(trendLeftScale, trendAxisValues.leftValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(trendLeftMetrics, Number(value))}
                        label={{ value: METRIC_META[trendLeftMetric].label, angle: -90, position: "insideLeft", offset: 4, fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        width={76}
                        orientation="right"
                        scale={trendRightScale}
                        domain={resolveAxisDomain(trendRightScale, trendAxisValues.rightValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(trendRightMetrics, Number(value))}
                        label={{ value: METRIC_META[trendRightMetric].label, angle: 90, position: "insideRight", offset: 4, fontSize: 11 }}
                      />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const rows = tooltip.payload
                            .filter((item) => item.dataKey !== undefined)
                            .map((item) => {
                              const metric = String(item.dataKey);
                              return {
                                metric,
                                label: METRIC_META[metric]?.label ?? item.name ?? metric,
                                value: formatChartMetricValue(metric, Number(item.value ?? 0)),
                                color: item.color ?? "#334155"
                              };
                            });
                          return (
                            <div className="min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{tooltip.label ?? ""}</p>
                              {rows.map((row) => (
                                <p key={row.metric} style={{ color: row.color }} className="mt-1 flex items-center justify-between gap-2">
                                  <span>{row.label}</span>
                                  <strong>{row.value}</strong>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey={trendLeftMetric}
                        name={METRIC_META[trendLeftMetric].label}
                        stroke="#1d4ed8"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey={trendRightMetric}
                        name={METRIC_META[trendRightMetric].label}
                        stroke="#e30613"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Mix por canal</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.mix}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {mixLeftMetrics.length > 0 ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${mixLeftScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                        Izq {mixLeftScale === "log" ? "log (auto)" : "lineal"}
                      </span>
                    ) : null}
                    {mixRightMetrics.length > 0 ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${mixRightScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                        Der {mixRightScale === "log" ? "log (auto)" : "lineal"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Barra
                    <select value={mixBarMetric} onChange={(event) => setMixBarMetric(event.target.value as MixMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {MIX_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Línea
                    <select value={mixLineMetric} onChange={(event) => setMixLineMetric(event.target.value as MixMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {MIX_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Eje barra
                    <select value={mixBarAxis} onChange={(event) => setMixBarAxis(event.target.value as AxisSide)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="left">Izquierdo</option>
                      <option value="right">Derecho</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Eje línea
                    <select value={mixLineAxis} onChange={(event) => setMixLineAxis(event.target.value as AxisSide)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="left">Izquierdo</option>
                      <option value="right">Derecho</option>
                    </select>
                  </label>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="channel" tickFormatter={(value) => toChannelLabel(value as SocialChannel)} minTickGap={16} />
                      <YAxis
                        yAxisId="left"
                        hide={mixLeftMetrics.length === 0}
                        width={76}
                        scale={mixLeftScale}
                        domain={resolveAxisDomain(mixLeftScale, mixAxisValues.leftValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(mixLeftMetrics, Number(value))}
                        label={{ value: mixLeftMetrics.map((metric) => METRIC_META[metric].label).join(" / "), angle: -90, position: "insideLeft", offset: 4, fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        hide={mixRightMetrics.length === 0}
                        width={76}
                        orientation="right"
                        scale={mixRightScale}
                        domain={resolveAxisDomain(mixRightScale, mixAxisValues.rightValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(mixRightMetrics, Number(value))}
                        label={{ value: mixRightMetrics.map((metric) => METRIC_META[metric].label).join(" / "), angle: 90, position: "insideRight", offset: 4, fontSize: 11 }}
                      />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const rows = tooltip.payload
                            .filter((item) => item.dataKey !== undefined)
                            .map((item) => {
                              const metric = String(item.dataKey);
                              return {
                                metric,
                                label: METRIC_META[metric]?.label ?? item.name ?? metric,
                                value: formatChartMetricValue(metric, Number(item.value ?? 0)),
                                color: item.color ?? "#334155"
                              };
                            });
                          return (
                            <div className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{toChannelLabel(String(tooltip.label ?? "facebook") as SocialChannel)}</p>
                              {rows.map((row) => (
                                <p key={row.metric} style={{ color: row.color }} className="mt-1 flex items-center justify-between gap-2">
                                  <span>{row.label}</span>
                                  <strong>{row.value}</strong>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar yAxisId={mixBarAxis} dataKey={mixBarMetric} name={METRIC_META[mixBarMetric].label} fill="#2563eb" />
                      <Line
                        yAxisId={mixLineAxis}
                        type="monotone"
                        dataKey={mixLineMetric}
                        name={METRIC_META[mixLineMetric].label}
                        stroke="#0f766e"
                        strokeWidth={3}
                        dot={{ r: 3, fill: "#0f766e" }}
                        activeDot={{ r: 4 }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">Tendencia por dimensión</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.trend_by_dimension}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <label className="text-xs font-semibold text-slate-600">
                      Dimensión
                      <select
                        value={trendByDimensionDimension}
                        onChange={(event) => setTrendByDimensionDimension(event.target.value as SocialScatterDimension)}
                        className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="channel">Canal</option>
                        <option value="account">Cuenta</option>
                        <option value="post_type">Tipo de post</option>
                        <option value="campaign">Campaña</option>
                        <option value="strategy">Estrategia</option>
                        <option value="hashtag">Hashtag</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Métrica
                      <select
                        value={trendByDimensionMetric}
                        onChange={(event) => setTrendByDimensionMetric(event.target.value as TrendByDimensionMetric)}
                        className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        {TREND_METRICS.map((metric) => (
                          <option key={metric} value={metric}>
                            {METRIC_META[metric].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className="group relative">
                      <summary className="list-none cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Series: {visibleTrendByDimensionSeries.length}/{trendByDimensionSeries.length}
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
                        <input
                          value={trendByDimensionSeriesSearch}
                          onChange={(event) => setTrendByDimensionSeriesSearch(event.target.value)}
                          placeholder="Buscar serie..."
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        />
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() =>
                              setVisibleTrendByDimensionSeries(
                                trendByDimensionDimension === "channel"
                                  ? trendByDimensionSeries.map((item) => item.label)
                                  : trendByDimensionSeries.slice(0, 8).map((item) => item.label)
                              )
                            }
                          >
                            Top 8
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => setVisibleTrendByDimensionSeries(trendByDimensionSeries.map((item) => item.label))}
                          >
                            Todas
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => setVisibleTrendByDimensionSeries([])}
                          >
                            Ninguna
                          </button>
                        </div>
                        <div className="mt-2 max-h-60 overflow-auto rounded-lg border border-slate-100 p-1">
                          {filteredTrendByDimensionSeries.length === 0 ? <p className="p-2 text-xs text-slate-500">Sin resultados</p> : null}
                          {filteredTrendByDimensionSeries.map((label) => {
                            const checked = visibleTrendByDimensionSeries.includes(label);
                            const series = trendByDimensionSeries.find((item) => item.label === label);
                            return (
                              <button
                                key={label}
                                type="button"
                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                                  checked ? "bg-red-50 text-red-700" : "text-slate-700 hover:bg-slate-50"
                                }`}
                                onClick={() => toggleTrendByDimensionSeries(label)}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series?.color ?? "#64748b" }} />
                                  <span>{label}</span>
                                </span>
                                <span>{checked ? "✓" : "+"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>

                {trendByDimensionError ? <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{trendByDimensionError}</div> : null}
                {loadingTrendByDimension ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">Cargando tendencia por dimensión...</div> : null}
                {!loadingTrendByDimension && trendByDimensionSeries.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                    Sin datos para {toScatterDimensionLabel(trendByDimensionDimension)} con los filtros activos.
                  </div>
                ) : null}
                {!loadingTrendByDimension && trendByDimensionSeries.length > 0 && trendByDimensionVisibleSeries.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                    Selecciona al menos una serie para visualizar el gráfico.
                  </div>
                ) : null}
                {!loadingTrendByDimension && trendByDimensionVisibleSeries.length > 0 ? (
                  <div className="h-[340px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendByDimensionChartData} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket_label" minTickGap={16} />
                        <YAxis
                          yAxisId="left"
                          width={80}
                          scale={trendByDimensionScale}
                          domain={resolveAxisDomain(trendByDimensionScale, trendByDimensionAxisValues)}
                          tickFormatter={(value) => formatChartAxisByMetrics([trendByDimensionMetric], Number(value))}
                          label={{ value: METRIC_META[trendByDimensionMetric].label, angle: -90, position: "insideLeft", offset: 4, fontSize: 11 }}
                        />
                        <Tooltip
                          content={(tooltip: ChartTooltipProps) => {
                            if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                            const rows = tooltip.payload
                              .filter((item) => item.dataKey !== undefined)
                              .map((item) => {
                                const key = String(item.dataKey);
                                const series = trendByDimensionSeriesByKey.get(key);
                                return {
                                  key,
                                  label: series?.label ?? key,
                                  value: formatChartMetricValue(trendByDimensionMetric, Number(item.value ?? 0)),
                                  color: series?.color ?? item.color ?? "#334155"
                                };
                              });

                            return (
                              <div className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                                <p className="font-semibold text-slate-800">{tooltip.label ?? ""}</p>
                                {rows.map((row) => (
                                  <p key={row.key} style={{ color: row.color }} className="mt-1 flex items-center justify-between gap-2">
                                    <span>{row.label}</span>
                                    <strong>{row.value}</strong>
                                  </p>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        {trendByDimensionVisibleSeries.map((series) => (
                          <Line
                            key={series.key}
                            yAxisId="left"
                            type="linear"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            strokeWidth={2.4}
                            isAnimationActive={false}
                            dot={(dotProps: { cx?: number; cy?: number; payload?: Record<string, unknown> }) => {
                              const raw = Number(dotProps.payload?.[series.key] ?? 0);
                              const hasValue = Number.isFinite(raw) && Math.abs(raw) >= 1e-9;
                              const cx = Number.isFinite(dotProps.cx) ? Number(dotProps.cx) : 0;
                              const cy = Number.isFinite(dotProps.cy) ? Number(dotProps.cy) : 0;
                              return <circle cx={cx} cy={cy} r={hasValue ? 3 : 0} fill={series.color} stroke="#ffffff" strokeWidth={1} />;
                            }}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">Distribución por tema</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.topic_breakdown}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600">
                      Dimensión secundaria
                      <select
                        value={topicBreakdownDimension}
                        onChange={(event) => setTopicBreakdownDimension(event.target.value as SocialTopicBreakdownDimension)}
                        className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="channel">Canal</option>
                        <option value="account">Cuenta</option>
                        <option value="post_type">Tipo de post</option>
                        <option value="campaign">Campaña</option>
                        <option value="strategy">Estrategia</option>
                        <option value="hashtag">Hashtag</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Métrica
                      <select
                        value={topicBreakdownMetric}
                        onChange={(event) => setTopicBreakdownMetric(event.target.value as TrendByDimensionMetric)}
                        className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        {TREND_METRICS.map((metric) => (
                          <option key={metric} value={metric}>
                            {METRIC_META[metric].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={topicBreakdownNormalize100}
                        onChange={(event) => setTopicBreakdownNormalize100(event.target.checked)}
                        className="h-3.5 w-3.5 accent-red-700"
                      />
                      Apilar al 100%
                    </label>
                  </div>
                </div>

                {topicBreakdownError ? <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{topicBreakdownError}</div> : null}
                {loadingTopicBreakdown ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">Cargando distribución por tema...</div> : null}
                {!loadingTopicBreakdown && topicBreakdownChartData.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                    Sin temas clasificados para los filtros activos.
                  </div>
                ) : null}
                {!loadingTopicBreakdown && topicBreakdownChartData.length > 0 ? (
                  <div className="w-full min-w-0" style={{ height: `${topicBreakdownChartHeight}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topicBreakdownChartData} layout="vertical" margin={{ top: 8, right: 16, left: 20, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          scale={topicBreakdownScale}
                          domain={topicBreakdownNormalize100 ? [0, 100] : resolveAxisDomain(topicBreakdownScale, topicBreakdownAxisValues)}
                          tickFormatter={(value) =>
                            topicBreakdownNormalize100
                              ? formatAxisPercentNoDecimals(Number(value))
                              : formatChartAxisByMetrics([topicBreakdownMetric], Number(value))
                          }
                          label={{
                            value: topicBreakdownNormalize100 ? `${METRIC_META[topicBreakdownMetric].label} (%)` : METRIC_META[topicBreakdownMetric].label,
                            position: "insideBottom",
                            offset: -6,
                            fontSize: 11
                          }}
                        />
                        <YAxis type="category" dataKey="topic_label" width={185} tickFormatter={(value) => truncate(String(value), 30)} />
                        <Tooltip
                          content={(tooltip: ChartTooltipProps) => {
                            if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                            const payload = (tooltip.payload[0]?.payload ?? {}) as Record<string, unknown>;
                            const topicLabel = String(payload.topic_label ?? tooltip.label ?? "");
                            const metricTotal = Number(payload.metric_total ?? 0);
                            const rows = tooltip.payload
                              .filter((item) => item.dataKey !== undefined)
                              .map((item) => {
                                const key = String(item.dataKey);
                                const segment = topicBreakdownSegmentByKey.get(key);
                                const shownValue = Number(item.value ?? 0);
                                const rawValue = Number(payload[`raw_${key}`] ?? shownValue);
                                return {
                                  key,
                                  label: segment?.label ?? item.name ?? key,
                                  shownValue,
                                  rawValue,
                                  color: segment?.color ?? item.color ?? "#334155"
                                };
                              })
                              .filter((row) => Math.abs(row.shownValue) > 0.000001 || Math.abs(row.rawValue) > 0.000001);

                            return (
                              <div className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                                <p className="font-semibold text-slate-800">{topicLabel}</p>
                                <p className="mt-1 flex items-center justify-between gap-2 text-slate-600">
                                  <span>Total</span>
                                  <strong>{formatChartMetricValue(topicBreakdownMetric, metricTotal)}</strong>
                                </p>
                                {rows.map((row) => (
                                  <p key={row.key} style={{ color: row.color }} className="mt-1 flex items-center justify-between gap-2">
                                    <span>{row.label}</span>
                                    <strong>
                                      {topicBreakdownNormalize100
                                        ? `${formatAxisPercentNoDecimals(row.shownValue)} (${formatChartMetricValue(topicBreakdownMetric, row.rawValue)})`
                                        : formatChartMetricValue(topicBreakdownMetric, row.shownValue)}
                                    </strong>
                                  </p>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        {topicBreakdownSegments.map((segment) => (
                          <Bar key={segment.key} dataKey={segment.key} name={segment.label} stackId="topic-stack" fill={segment.color} />
                        ))}
                        {topicBreakdownNormalize100 ? <ReferenceLine x={100} stroke="#94a3b8" strokeDasharray="4 4" /> : null}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Ranking de cuentas</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.ranking}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {topAccountsLeftMetrics.length > 0 ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${topAccountsLeftScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                        Izq {topAccountsLeftScale === "log" ? "log (auto)" : "lineal"}
                      </span>
                    ) : null}
                    {topAccountsRightMetrics.length > 0 ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${topAccountsRightScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                        Der {topAccountsRightScale === "log" ? "log (auto)" : "lineal"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica barra
                    <select value={accountBarMetric} onChange={(event) => setAccountBarMetric(event.target.value as AccountMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {ACCOUNT_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica línea
                    <select value={accountLineMetric} onChange={(event) => setAccountLineMetric(event.target.value as AccountMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {ACCOUNT_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Eje barra
                    <select value={accountBarAxis} onChange={(event) => setAccountBarAxis(event.target.value as AxisSide)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="left">Izquierdo</option>
                      <option value="right">Derecho</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Eje línea
                    <select value={accountLineAxis} onChange={(event) => setAccountLineAxis(event.target.value as AxisSide)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="left">Izquierdo</option>
                      <option value="right">Derecho</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Escala eje izq
                    <select value={topAccountsLeftScaleMode} onChange={(event) => setTopAccountsLeftScaleMode(event.target.value as ScaleMode)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="auto">Auto</option>
                      <option value="linear">Lineal</option>
                      <option value="log">Log</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Escala eje der
                    <select value={topAccountsRightScaleMode} onChange={(event) => setTopAccountsRightScaleMode(event.target.value as ScaleMode)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      <option value="auto">Auto</option>
                      <option value="linear">Lineal</option>
                      <option value="log">Log</option>
                    </select>
                  </label>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAccountsDual} margin={{ top: 8, right: 14, left: 6, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="account_name" tickFormatter={(value) => truncate(String(value), 16)} minTickGap={12} />
                      <YAxis
                        yAxisId="left"
                        hide={topAccountsLeftMetrics.length === 0}
                        width={76}
                        scale={topAccountsLeftScale}
                        domain={resolveAxisDomain(topAccountsLeftScale, topAccountsAxisValues.leftValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(topAccountsLeftMetrics, Number(value))}
                        label={{ value: topAccountsLeftMetrics.map((metric) => METRIC_META[metric].label).join(" / "), angle: -90, position: "insideLeft", offset: 4, fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        hide={topAccountsRightMetrics.length === 0}
                        width={76}
                        orientation="right"
                        scale={topAccountsRightScale}
                        domain={resolveAxisDomain(topAccountsRightScale, topAccountsAxisValues.rightValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics(topAccountsRightMetrics, Number(value))}
                        label={{ value: topAccountsRightMetrics.map((metric) => METRIC_META[metric].label).join(" / "), angle: 90, position: "insideRight", offset: 4, fontSize: 11 }}
                      />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const accountName = String(tooltip.label ?? "");
                          const rows = tooltip.payload
                            .filter((item) => item.dataKey !== undefined)
                            .map((item) => {
                              const metric = String(item.dataKey);
                              return {
                                metric,
                                label: METRIC_META[metric]?.label ?? item.name ?? metric,
                                value: formatChartMetricValue(metric, Number(item.value ?? 0)),
                                color: item.color ?? "#334155"
                              };
                            });
                          return (
                            <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{accountName}</p>
                              {rows.map((row) => (
                                <p key={row.metric} style={{ color: row.color }} className="mt-1 flex items-center justify-between gap-2">
                                  <span>{row.label}</span>
                                  <strong>{row.value}</strong>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar yAxisId={accountBarAxis} dataKey={accountBarMetric} name={METRIC_META[accountBarMetric].label} fill="#c90310" />
                      <Line
                        yAxisId={accountLineAxis}
                        type="monotone"
                        dataKey={accountLineMetric}
                        name={METRIC_META[accountLineMetric].label}
                        stroke="#1d4ed8"
                        strokeWidth={3}
                        dot={{ r: 3, fill: "#1d4ed8" }}
                        activeDot={{ r: 5 }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Brecha ER vs Meta</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.gap}</p>
                  </div>
                  <span className="text-xs text-slate-500">ER actual vs ER objetivo 2026</span>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={erGapByChannel} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="channel" tickFormatter={(value) => toChannelLabel(value as SocialChannel)} />
                      <YAxis yAxisId="left" width={68} tickFormatter={(value) => formatAxisPercentNoDecimals(Number(value))} label={{ value: "ER (%)", angle: -90, position: "insideLeft", offset: 2, fontSize: 11 }} />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const first = tooltip.payload[0]?.payload ?? {};
                          const channel = String((first.channel as string | undefined) ?? tooltip.label ?? "");
                          const currentEr = Number((first.current_er as number | undefined) ?? 0);
                          const targetEr = Number((first.target_2026_er as number | undefined) ?? 0);
                          const gap = Number((first.gap as number | undefined) ?? currentEr - targetEr);
                          return (
                            <div className="min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{toChannelLabel(channel as SocialChannel)}</p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>ER actual</span>
                                <strong>{formatAxisPercentNoDecimals(currentEr)}</strong>
                              </p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>Meta ER</span>
                                <strong>{formatAxisPercentNoDecimals(targetEr)}</strong>
                              </p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>Gap</span>
                                <strong>{formatAxisPercentNoDecimals(gap)}</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="current_er" name="ER actual" fill="#e30613" />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="target_2026_er"
                        name="Meta ER 2026"
                        stroke="#0f766e"
                        strokeWidth={2.5}
                        strokeDasharray="6 4"
                        dot={{ r: 3, fill: "#0f766e" }}
                        activeDot={{ r: 4 }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {!hasVisibleTargetByChannel ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    No hay metas ER válidas (0/null) para los filtros activos.
                  </p>
                ) : null}
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Scatter por métricas</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.scatter}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600">
                      Dimensión
                      <select value={scatterDimension} onChange={(event) => setScatterDimension(event.target.value as SocialScatterDimension)} className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
                        <option value="post_type">Tipo de post</option>
                        <option value="channel">Canal</option>
                        <option value="account">Cuenta</option>
                        <option value="campaign">Campaña</option>
                        <option value="strategy">Estrategia</option>
                        <option value="hashtag">Hashtag</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Eje X
                      <select value={scatterXMetric} onChange={(event) => setScatterXMetric(event.target.value as ScatterMetric)} className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
                        {SCATTER_METRICS.map((metric) => (
                          <option key={metric} value={metric}>
                            {METRIC_META[metric].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Eje Y
                      <select value={scatterYMetric} onChange={(event) => setScatterYMetric(event.target.value as ScatterMetric)} className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
                        {SCATTER_METRICS.map((metric) => (
                          <option key={metric} value={metric}>
                            {METRIC_META[metric].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 6, right: 20, bottom: 18, left: 18 }}>
                      <CartesianGrid />
                      <XAxis
                        type="number"
                        dataKey="x_value"
                        name={METRIC_META[scatterXMetric].label}
                        scale={scatterXScale}
                        domain={resolveAxisDomain(scatterXScale, scatterValues.xValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics([scatterXMetric], Number(value))}
                        label={{ value: METRIC_META[scatterXMetric].label, position: "insideBottom", offset: -6, fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y_value"
                        name={METRIC_META[scatterYMetric].label}
                        scale={scatterYScale}
                        domain={resolveAxisDomain(scatterYScale, scatterValues.yValues)}
                        tickFormatter={(value) => formatChartAxisByMetrics([scatterYMetric], Number(value))}
                        label={{ value: METRIC_META[scatterYMetric].label, angle: -90, position: "insideLeft", offset: -2, fontSize: 11 }}
                      />
                      <ZAxis dataKey="z" name="Posts" range={[110, 680]} />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const point = tooltip.payload[0]?.payload ?? {};
                          const label = String((point.label as string | undefined) ?? "n/a");
                          const xValue = Number((point.x_value as number | undefined) ?? 0);
                          const yValue = Number((point.y_value as number | undefined) ?? 0);
                          const postsCount = Number((point.posts as number | undefined) ?? 0);
                          return (
                            <div className="min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{label}</p>
                              <p className="text-slate-600">Dimensión: {toScatterDimensionLabel(scatterDimension)}</p>
                              <p className="mt-1 flex items-center justify-between gap-2"><span>Posts</span><strong>{formatCompactAxisNumber(postsCount)}</strong></p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>{METRIC_META[scatterXMetric].label}</span>
                                <strong>{formatChartMetricValue(scatterXMetric, xValue)}</strong>
                              </p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>{METRIC_META[scatterYMetric].label}</span>
                                <strong>{formatChartMetricValue(scatterYMetric, yValue)}</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Scatter name="Grupos" data={scatterChartData} fill="#0f766e" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Heatmap actividad</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.heatmap}</p>
                  </div>
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica
                    <select value={heatmapMetric} onChange={(event) => setHeatmapMetric(event.target.value as SocialHeatmapMetric)} className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="er">ER</option>
                      <option value="engagement_total">Interacciones</option>
                      <option value="impressions">Impresiones</option>
                      <option value="reach">Reach</option>
                      <option value="clicks">Clicks</option>
                      <option value="likes">Likes</option>
                      <option value="comments">Comments</option>
                      <option value="shares">Shares</option>
                      <option value="views">Views</option>
                      <option value="ctr">CTR</option>
                      <option value="er_impressions">ER impresiones</option>
                      <option value="er_reach">ER reach</option>
                      <option value="view_rate">View rate</option>
                    </select>
                  </label>
                </div>
                <div className="min-h-[320px]">
                  <Heatmap data={heatmapData} />
                </div>
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Métrica por dimensión</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.breakdown}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={breakdownDimension} onChange={(event) => setBreakdownDimension(event.target.value as SocialErBreakdownDimension)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="hashtag">Hashtag</option>
                      <option value="word">Término más usado</option>
                      <option value="post_type">Tipo de post</option>
                      <option value="publish_frequency">Frecuencia (días entre posts)</option>
                      <option value="weekday">Día publicación</option>
                    </select>
                    <select value={breakdownMetric} onChange={(event) => setBreakdownMetric(event.target.value as BreakdownMetric)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      {BREAKDOWN_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${breakdownScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                      Escala {breakdownScale === "log" ? "log (auto)" : "lineal"}
                    </span>
                    <select value={breakdownScaleMode} onChange={(event) => setBreakdownScaleMode(event.target.value as ScaleMode)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="auto">Auto</option>
                      <option value="linear">Lineal</option>
                      <option value="log">Log</option>
                    </select>
                  </div>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownChartData} layout="vertical" margin={{ top: 6, right: 14, bottom: 8, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        scale={breakdownScale}
                        domain={resolveAxisDomain(breakdownScale, breakdownChartData.map((item) => Number(item.metric_value)))}
                        tickFormatter={(value) => formatChartAxisByMetrics([breakdownMetric], Number(value))}
                        label={{ value: METRIC_META[breakdownMetric].label, position: "insideBottom", offset: -6, fontSize: 11 }}
                      />
                      <YAxis type="category" dataKey="label" width={180} tickFormatter={(value) => truncate(String(value), 24)} />
                      <Tooltip
                        content={(tooltip: ChartTooltipProps) => {
                          if (!tooltip.active || !tooltip.payload || tooltip.payload.length === 0) return null;
                          const row = tooltip.payload[0]?.payload ?? {};
                          const label = String((row.label as string | undefined) ?? tooltip.label ?? "");
                          const selectedMetric = Number((row.metric_value as number | undefined) ?? 0);
                          const postsCount = Number((row.posts as number | undefined) ?? 0);
                          const exposure = Number((row.exposure_total as number | undefined) ?? 0);
                          return (
                            <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                              <p className="font-semibold text-slate-800">{label}</p>
                              <p className="mt-1 flex items-center justify-between gap-2">
                                <span>{METRIC_META[breakdownMetric].label}</span>
                                <strong>{formatChartMetricValue(breakdownMetric, selectedMetric)}</strong>
                              </p>
                              <p className="mt-1 flex items-center justify-between gap-2"><span>Posts</span><strong>{formatCompactAxisNumber(postsCount)}</strong></p>
                              <p className="mt-1 flex items-center justify-between gap-2"><span>Exposición</span><strong>{formatCompactAxisNumber(exposure)}</strong></p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="metric_value" name={METRIC_META[breakdownMetric].label} fill="#7c3aed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Share por cuenta</h3>
                    <p className="text-xs text-slate-500">{CHART_QUESTION_BY_KEY.share}</p>
                  </div>
                  <span className="text-xs text-slate-500">SOV interno</span>
                </div>
                <div className="h-[320px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sovPieData} dataKey="value" nameKey="name" outerRadius={98} label={(entry) => truncate(String(entry.name), 14)}>
                        {sovPieData.map((_, index) => (
                          <Cell key={index} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatAxisPercentNoDecimals(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
          </div>
        </>
      ) : null}

      {tab === "accounts" ? (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Cuentas</h3>
              <span className="text-xs text-slate-500">Ranking operativo por cuenta con umbrales y deltas completos.</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Orden
                <select
                  value={accountsSort}
                  onChange={(event) => setQueryPatch({ accounts_sort: event.target.value, accounts_cursor: null })}
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                >
                  {ACCOUNT_SORT_OPTIONS.map((sort) => (
                    <option key={sort} value={sort}>
                      {toAccountsSortLabel(sort)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Límite
                <select
                  value={accountsLimit}
                  onChange={(event) => setQueryPatch({ accounts_limit: event.target.value, accounts_cursor: null })}
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                >
                  {[25, 50, 100, 200].map((limitOption) => (
                    <option key={limitOption} value={limitOption}>
                      {limitOption}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Min posts
                <input
                  value={minPostsInput}
                  onChange={(event) => setMinPostsInput(event.target.value)}
                  className="ml-2 w-20 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  inputMode="numeric"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Min exposición
                <input
                  value={minExposureInput}
                  onChange={(event) => setMinExposureInput(event.target.value)}
                  className="ml-2 w-28 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() =>
                  setQueryPatch({
                    min_posts: String(parseIntFromQuery(minPostsInput, minPosts, 1, 2000)),
                    min_exposure: String(parseIntFromQuery(minExposureInput, minExposure, 0, 10_000_000_000)),
                    accounts_cursor: null
                  })
                }
              >
                Aplicar umbrales
              </button>
            </div>
          </div>

          <p className="mb-2 text-xs text-slate-500">
            Orden aplicado por backend: <strong>{toAccountsSortLabel(accountsData?.sort_applied ?? accountsSort)}</strong> | thresholds: {formatNumber(minPosts)} posts / {formatNumber(minExposure)} exposición
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Cuenta</th>
                  <th className="px-2 py-2">Canales</th>
                  <th className="px-2 py-2">Posts</th>
                  <th className="px-2 py-2">Exposición</th>
                  <th className="px-2 py-2">Engagement</th>
                  <th className="px-2 py-2">ER pond.</th>
                  <th className="px-2 py-2">Riesgo</th>
                  <th className="px-2 py-2">Delta exposición</th>
                  <th className="px-2 py-2">Delta engagement</th>
                  <th className="px-2 py-2">Delta ER</th>
                  <th className="px-2 py-2">SOV interno</th>
                  <th className="px-2 py-2">Threshold</th>
                  <th className="px-2 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(accountsData?.items ?? []).map((item) => (
                  <tr key={item.account_name} className="border-b border-slate-100">
                    <td className="px-2 py-2">{item.account_name}</td>
                    <td className="px-2 py-2">{item.channel_mix.map((ch) => toChannelLabel(ch)).join(", ")}</td>
                    <td className="px-2 py-2">{formatNumber(item.posts)}</td>
                    <td className="px-2 py-2">{formatNumber(item.exposure_total)}</td>
                    <td className="px-2 py-2">{formatNumber(item.engagement_total)}</td>
                    <td className="px-2 py-2">{formatPercent(item.er_ponderado)}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toRiskTagClass(item.riesgo_activo)}`}>
                        {formatPercent(item.riesgo_activo)}
                      </span>
                    </td>
                    <td className={`px-2 py-2 ${toDeltaClass(item.delta_exposure)}`}>{formatNumber(item.delta_exposure)}</td>
                    <td className={`px-2 py-2 ${toDeltaClass(item.delta_engagement)}`}>{formatNumber(item.delta_engagement)}</td>
                    <td className={`px-2 py-2 ${toDeltaClass(item.delta_er)}`}>{formatPercent(item.delta_er)}</td>
                    <td className="px-2 py-2">{formatPercent(item.sov_interno)}</td>
                    <td className="px-2 py-2">{item.meets_threshold ? "OK" : "Bajo"}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setQueryPatch({ tab: "posts", account: item.account_name })}
                      >
                        Ver posts
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loadingAccounts && (accountsData?.items?.length ?? 0) === 0 ? <p className="mt-3 text-sm text-slate-600">Sin cuentas para estos filtros.</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setQueryPatch({ accounts_cursor: null })}
              disabled={!accountsCursor}
            >
              Primera página
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setQueryPatch({ accounts_cursor: accountsData?.page_info?.next_cursor ?? null })}
              disabled={!accountsData?.page_info?.has_next || !accountsData?.page_info?.next_cursor}
            >
              Siguiente página
            </button>
            {loadingAccounts ? <span className="text-xs text-slate-500">Cargando cuentas...</span> : null}
          </div>
        </section>
      ) : null}

      {tab === "posts" ? (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Posts</h3>
              <span className="text-xs text-slate-500">Triage operativo con sentimiento, confianza y score de fuente.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Orden
                <select
                  value={postsSort}
                  onChange={(event) => setQueryPatch({ posts_sort: event.target.value })}
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                >
                  {POST_SORT_OPTIONS.map((sortOption) => (
                    <option key={sortOption} value={sortOption}>
                      {toPostSortLabel(sortOption)}
                    </option>
                  ))}
                </select>
              </label>
              {loadingPosts ? <span className="text-xs text-slate-500">Actualizando posts...</span> : null}
            </div>
          </div>

          {!loadingPosts && posts.length === 0 ? <p className="text-sm text-slate-600">Sin posts para estos filtros.</p> : null}

          {posts.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[1360px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Fecha</th>
                      <th className="px-2 py-2">Canal</th>
                      <th className="px-2 py-2">Cuenta</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Sentimiento</th>
                      <th className="px-2 py-2">Confianza</th>
                      <th className="px-2 py-2">Source score</th>
                      <th className="px-2 py-2">Campaña</th>
                      <th className="px-2 py-2">Estrategias</th>
                      <th className="px-2 py-2">Hashtags</th>
                      <th className="px-2 py-2">Post</th>
                      <th className="px-2 py-2">Comentarios (Awario)</th>
                      <th className="px-2 py-2">Exposición</th>
                      <th className="px-2 py-2">Engagement</th>
                      <th className="px-2 py-2">ER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => {
                      const er = (post.engagement_total / Math.max(post.exposure, 1)) * 100;
                      const sentimentClass =
                        post.sentiment === "positive"
                          ? "bg-emerald-100 text-emerald-700"
                          : post.sentiment === "negative"
                            ? "bg-rose-100 text-rose-700"
                            : post.sentiment === "neutral"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-slate-100 text-slate-700";
                      const isSelected = selectedPostDetail?.id === post.id;
                      return (
                        <tr
                          key={post.id}
                          className={`border-b border-slate-100 ${isSelected ? "bg-red-50/40" : "hover:bg-slate-50"} cursor-pointer`}
                          onClick={() => setSelectedPostDetail(post)}
                        >
                          <td className="px-2 py-2">{formatDate(post.published_at)}</td>
                          <td className="px-2 py-2">{toChannelLabel(post.channel)}</td>
                          <td className="px-2 py-2">{post.account_name}</td>
                          <td className="px-2 py-2">{post.post_type ?? "Sin tipo"}</td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${sentimentClass}`}>{post.sentiment}</span>
                          </td>
                          <td className="px-2 py-2">{post.sentiment_confidence === null ? "n/a" : formatScore(post.sentiment_confidence)}</td>
                          <td className="px-2 py-2">{formatScore(post.source_score)}</td>
                          <td className="px-2 py-2">{post.campaign ?? "--"}</td>
                          <td className="px-2 py-2">{post.strategies?.join(", ") || "--"}</td>
                          <td className="px-2 py-2">{post.hashtags?.map((item) => `#${item}`).join(" ") || "--"}</td>
                          <td className="px-2 py-2">
                            <div className="grid gap-1">
                              <strong>{truncate(post.title, 52)}</strong>
                              <a href={post.post_url} target="_blank" rel="noreferrer" className="text-xs text-red-700 underline" onClick={(event) => event.stopPropagation()}>
                                Ver post
                              </a>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                post.awario_comments_count > 0 ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-slate-100 text-slate-500"
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openCommentsModal(post);
                              }}
                            >
                              {formatNumber(post.awario_comments_count)}
                            </button>
                          </td>
                          <td className="px-2 py-2">{formatNumber(post.exposure)}</td>
                          <td className="px-2 py-2">{formatNumber(post.engagement_total)}</td>
                          <td className="px-2 py-2">{formatPercent(er)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <aside className="rounded-xl border border-slate-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-slate-900">Detalle del post</h4>
                {!selectedPostDetail ? <p className="mt-2 text-xs text-slate-500">Selecciona un post para ver detalle y señales operativas.</p> : null}
                {selectedPostDetail ? (
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">{selectedPostDetail.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(selectedPostDetail.published_at)} · {toChannelLabel(selectedPostDetail.channel)} · {selectedPostDetail.account_name}
                    </p>
                    <p className="text-xs text-slate-600">{selectedPostDetail.text || "Sin texto disponible."}</p>
                    <ul className="space-y-1 text-xs">
                      <li className="flex items-center justify-between"><span>Sentimiento</span><strong>{selectedPostDetail.sentiment}</strong></li>
                      <li className="flex items-center justify-between"><span>Confianza</span><strong>{selectedPostDetail.sentiment_confidence === null ? "n/a" : formatScore(selectedPostDetail.sentiment_confidence)}</strong></li>
                      <li className="flex items-center justify-between"><span>Source score</span><strong>{formatScore(selectedPostDetail.source_score)}</strong></li>
                      <li className="flex items-center justify-between"><span>Exposición</span><strong>{formatNumber(selectedPostDetail.exposure)}</strong></li>
                      <li className="flex items-center justify-between"><span>Engagement</span><strong>{formatNumber(selectedPostDetail.engagement_total)}</strong></li>
                      <li className="flex items-center justify-between"><span>Comentarios Awario</span><strong>{formatNumber(selectedPostDetail.awario_comments_count)}</strong></li>
                    </ul>
                    <div className="flex flex-wrap gap-1">
                      {(selectedPostDetail.strategies ?? []).slice(0, 6).map((value) => (
                        <span key={value} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          ) : null}

          {postsHasNext ? (
            <button className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => void loadMorePosts()} disabled={loadingMorePosts}>
              {loadingMorePosts ? "Cargando..." : "Cargar más"}
            </button>
          ) : null}
        </section>
      ) : null}

      {tab === "risk" ? (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Riesgo</h3>
              <span className="text-xs text-slate-500">Detección y respuesta con umbrales, hotspots y alertas activas.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${riskData?.stale_data ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {riskData?.stale_data ? "stale_data" : "fresh_data"}
              </span>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                Umbral riesgo: {formatPercent(riskData?.thresholds?.risk_threshold ?? 0)}
              </span>
              {loadingRisk ? <span className="text-slate-500">Actualizando...</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <article className="rounded-xl border border-slate-200 p-3 xl:col-span-2">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Tendencia de riesgo vs sentimiento</h4>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={riskData?.sentiment_trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatAxisPercentNoDecimals(Number(value))} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine
                      yAxisId="right"
                      y={riskData?.thresholds?.risk_threshold ?? 0}
                      stroke="#dc2626"
                      strokeDasharray="5 4"
                      label={{ value: "Umbral", fill: "#dc2626", fontSize: 11 }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="negativos" stroke="#b91c1c" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="riesgo_activo" stroke="#f59f00" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="sentimiento_neto" stroke="#0f766e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Hotspots por canal</h4>
              <ul className="space-y-2 text-xs">
                {riskTopChannels.map((item) => (
                  <li key={item.channel} className="rounded-lg border border-slate-200 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{toChannelLabel(item.channel)}</strong>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${toRiskTagClass(item.riesgo_activo)}`}>{formatPercent(item.riesgo_activo)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">Negativos: {formatNumber(item.negativos)} · Clasificados: {formatNumber(item.clasificados)}</p>
                  </li>
                ))}
                {riskTopChannels.length === 0 ? <li className="text-slate-500">Sin datos por canal.</li> : null}
              </ul>
            </article>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Hotspots por cuenta</h4>
              <ul className="space-y-2 text-xs">
                {riskTopAccounts.map((item) => (
                  <li key={item.account_name} className="rounded-lg border border-slate-200 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{item.account_name}</strong>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${toRiskTagClass(item.riesgo_activo)}`}>{formatPercent(item.riesgo_activo)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">Negativos: {formatNumber(item.negativos)} · Clasificados: {formatNumber(item.clasificados)}</p>
                  </li>
                ))}
                {riskTopAccounts.length === 0 ? <li className="text-slate-500">Sin datos por cuenta.</li> : null}
              </ul>
            </article>

            <article className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Alertas activas</h4>
                <a href="/app/monitor/incidents" className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Ir a Incidentes
                </a>
              </div>
              <ul className="space-y-2">
                {(riskData?.alerts ?? []).map((alert) => (
                  <li key={alert.id} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{alert.severity}</strong>
                      <span>{alert.status}</span>
                      <span>risk {formatScore(alert.risk_score)}</span>
                      <span>{formatDateTime(alert.updated_at)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{toSlaBySeverity(alert.severity)} · cooldown: {alert.cooldown_until ? formatDateTime(alert.cooldown_until) : "sin cooldown"}</p>
                  </li>
                ))}
                {(riskData?.alerts?.length ?? 0) === 0 ? <li className="text-xs text-slate-500">Sin alertas activas.</li> : null}
              </ul>
            </article>
          </div>
        </section>
      ) : null}

      {tab === "etl" ? (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Cobertura y reconciliación</h3>
              <span className="text-xs text-slate-500">¿Se está cargando todo lo que existe en S3?</span>
            </div>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center justify-between"><span>Estado reconciliación</span><strong>{normalizedOverview.reconciliation_status ?? etlData?.reconciliation_status ?? "unknown"}</strong></li>
              <li className="flex items-center justify-between"><span>DB min fecha</span><strong>{formatDate(etlData?.coverage.db_min_date ?? null)}</strong></li>
              <li className="flex items-center justify-between"><span>DB max fecha</span><strong>{formatDate(etlData?.coverage.db_max_date ?? null)}</strong></li>
              <li className="flex items-center justify-between"><span>S3 min fecha</span><strong>{formatDate(etlData?.coverage.s3_min_date ?? null)}</strong></li>
              <li className="flex items-center justify-between"><span>S3 max fecha</span><strong>{formatDate(etlData?.coverage.s3_max_date ?? null)}</strong></li>
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Corridas ETL</h3>
              <span className="text-xs text-slate-500">¿Qué faltó y por qué?</span>
            </div>
            <ul className="space-y-2 text-xs">
              {(runs ?? []).slice(0, 10).map((run) => (
                <li key={run.id} className="rounded-lg border border-slate-200 px-2 py-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{run.status}</strong>
                    <span>{run.current_phase ?? "-"}</span>
                    <span>parsed {formatNumber(run.counters.rows_parsed)}</span>
                    <span>persisted {formatNumber(run.counters.rows_persisted)}</span>
                    <span>pending cls {formatNumber(run.counters.rows_pending_classification)}</span>
                    <span>{formatDateTime(run.finished_at ?? run.queued_at)}</span>
                  </div>
                </li>
              ))}
              {runs.length === 0 ? <li className="text-slate-500">Sin corridas.</li> : null}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Última ETL: {formatDateTime(normalizedOverview.last_etl_at ?? null)}</p>
          </article>
        </section>
      ) : null}

      {selectedPostComments ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 sm:p-6">
          <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={closeCommentsModal} aria-label="Cerrar modal de comentarios" />
          <div className="relative z-[71] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Comentarios Awario vinculados</h4>
                <p className="text-xs text-slate-600">
                  {selectedPostComments.account_name} · {toChannelLabel(selectedPostComments.channel)} · {formatDate(selectedPostComments.published_at)}
                </p>
              </div>
              <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50" onClick={closeCommentsModal}>
                Cerrar
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
              <label className="text-xs font-semibold text-slate-600">
                Sentimiento
                <select
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={commentSentimentFilter}
                  onChange={(event) => setCommentSentimentFilter(event.target.value as "all" | "positive" | "negative" | "neutral" | "unknown")}
                >
                  <option value="all">Todos</option>
                  <option value="positive">Positivo</option>
                  <option value="negative">Negativo</option>
                  <option value="neutral">Neutro</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Spam
                <select
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={commentSpamFilter}
                  onChange={(event) => setCommentSpamFilter(event.target.value as "all" | "spam" | "not_spam")}
                >
                  <option value="all">Todos</option>
                  <option value="not_spam">No spam</option>
                  <option value="spam">Spam</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Relación
                <select
                  className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={commentRelatedFilter}
                  onChange={(event) => setCommentRelatedFilter(event.target.value as "all" | "related" | "not_related")}
                >
                  <option value="all">Todos</option>
                  <option value="related">Relacionados</option>
                  <option value="not_related">No relacionados</option>
                </select>
              </label>
            </div>

            <div className="max-h-[65vh] overflow-auto p-4">
              {loadingPostComments && postComments.length === 0 ? <p className="text-sm text-slate-600">Cargando comentarios...</p> : null}
              {!loadingPostComments && postComments.length === 0 ? <p className="text-sm text-slate-600">No hay comentarios para estos filtros.</p> : null}

              {postComments.length > 0 ? (
                <div className="space-y-3">
                  {postComments.map((comment) => (
                    <article key={comment.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <strong>{comment.author_name ?? "Autor desconocido"}</strong>
                        <span>{formatDateTime(comment.published_at)}</span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${
                          comment.sentiment === "positive"
                            ? "bg-emerald-50 text-emerald-700"
                            : comment.sentiment === "negative"
                              ? "bg-rose-50 text-rose-700"
                              : comment.sentiment === "neutral"
                                ? "bg-sky-50 text-sky-700"
                                : "bg-slate-100 text-slate-700"
                        }`}>
                          {comment.sentiment}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${comment.is_spam ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                          {comment.is_spam ? "spam" : "no spam"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${comment.related_to_post_text ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {comment.related_to_post_text ? "relacionado" : "no relacionado"}
                        </span>
                        {comment.needs_review ? <span className="rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-900">needs_review</span> : null}
                      </div>
                      <p className="text-sm text-slate-800">{comment.text || "(sin texto)"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {comment.comment_url ? (
                          <a href={comment.comment_url} target="_blank" rel="noreferrer" className="text-red-700 underline">
                            Ver comentario original
                          </a>
                        ) : null}
                        <span className="text-slate-500">confianza: {comment.confidence === null ? "n/a" : formatScore(comment.confidence)}</span>
                      </div>

                      {canOverrideComments ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={updatingCommentId === comment.id}
                            onClick={() => void patchComment(comment.id, { is_spam: !comment.is_spam })}
                          >
                            Marcar {comment.is_spam ? "no spam" : "spam"}
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={updatingCommentId === comment.id}
                            onClick={() => void patchComment(comment.id, { related_to_post_text: !comment.related_to_post_text })}
                          >
                            Marcar {comment.related_to_post_text ? "no relacionado" : "relacionado"}
                          </button>
                          <label className="text-slate-600">
                            Sentimiento
                            <select
                              className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs"
                              value={comment.sentiment}
                              disabled={updatingCommentId === comment.id}
                              onChange={(event) =>
                                void patchComment(comment.id, {
                                  sentiment: event.target.value as "positive" | "negative" | "neutral" | "unknown"
                                })
                              }
                            >
                              <option value="positive">positive</option>
                              <option value="negative">negative</option>
                              <option value="neutral">neutral</option>
                              <option value="unknown">unknown</option>
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {postCommentsHasNext ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => void loadMorePostComments()}
                      disabled={loadingPostComments}
                    >
                      {loadingPostComments ? "Cargando..." : "Cargar más comentarios"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
