import { useEffect, useMemo, useState } from "react";
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
  YAxis
} from "recharts";
import type {
  MonitorSocialAccountsResponse,
  MonitorSocialErBreakdownResponse,
  MonitorSocialErTargetsResponse,
  MonitorSocialEtlQualityResponse,
  MonitorSocialHeatmapResponse,
  MonitorSocialOverviewResponse,
  MonitorSocialPostCommentsResponse,
  MonitorSocialPostsResponse,
  MonitorSocialRiskResponse,
  MonitorSocialRunItem,
  MonitorSocialScatterResponse,
  SocialChannel,
  SocialComparisonMode,
  SocialDatePreset,
  SocialErBreakdownDimension,
  SocialHeatmapMetric,
  SocialScatterDimension
} from "../api/client";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../auth/AuthContext";

const CHANNEL_OPTIONS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok"];
const PRESET_OPTIONS: SocialDatePreset[] = ["ytd", "90d", "30d", "y2024", "y2025", "last_quarter", "custom", "all"];
const TAB_OPTIONS = ["summary", "accounts", "posts", "risk", "etl"] as const;

type SocialTab = (typeof TAB_OPTIONS)[number];
type ScaleMode = "auto" | "linear" | "log";

type NumberFormatMode = "number" | "percent" | "score";
type AccountMetric = "er_ponderado" | "exposure_total" | "engagement_total" | "posts" | "sov_interno";
type MixMetric = "posts" | "exposure_total" | "engagement_total" | "er_global" | "riesgo_activo" | "sov_interno";

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
  campaign?: string | null;
  strategies?: string[];
  hashtags?: string[];
};

type AwarioCommentRow = MonitorSocialPostCommentsResponse["items"][number];

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
  er_global: { label: "ER", format: "percent" },
  riesgo_activo: { label: "Riesgo", format: "percent" },
  shs: { label: "SHS", format: "score" },
  sov_interno: { label: "SOV interno", format: "percent" },
  er_ponderado: { label: "ER ponderado", format: "percent" },
  target_2026_er: { label: "Meta ER 2026", format: "percent" },
  current_er: { label: "ER actual", format: "percent" },
  gap: { label: "Gap ER", format: "percent" }
};

const formatNumber = (value: number): string => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
const formatPercent = (value: number): string => `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
const formatScore = (value: number): string => new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatMetricValue = (metric: string, value: number): string => {
  const meta = METRIC_META[metric];
  if (!meta) return formatNumber(value);
  if (meta.format === "percent") return formatPercent(value);
  if (meta.format === "score") return formatScore(value);
  return formatNumber(value);
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

const toDeltaClass = (value: number): string => {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-500";
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
  <details className="group relative">
    <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-sm font-semibold text-slate-800">{summary}</p>
          <p className="text-xs text-slate-500">{secondary}</p>
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

  const byKey = new Map((data?.items ?? []).map((item) => [`${item.month}-${item.weekday}`, item]));

  const toColor = (value: number) => {
    const ratio = (value - min) / Math.max(max - min, 0.0001);
    const hue = 2 + (1 - ratio) * 180;
    const alpha = 0.2 + ratio * 0.7;
    return `hsla(${hue}, 84%, 45%, ${alpha})`;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1 text-xs">
        <div />
        {weekdays.map((day) => (
          <div key={day} className="text-center text-slate-500">
            {day}
          </div>
        ))}
        {months.map((month, monthIndex) => (
          <>
            <div key={`${month}-label`} className="flex items-center justify-end pr-1 text-slate-500">
              {month}
            </div>
            {weekdays.map((_day, dayIndex) => {
              const item = byKey.get(`${monthIndex + 1}-${dayIndex + 1}`);
              const value = item?.value ?? 0;
              return (
                <div
                  key={`${month}-${dayIndex}`}
                  title={`${month} ${weekdays[dayIndex]}: ${value.toFixed(2)} (${item?.posts ?? 0} posts)`}
                  className="h-6 rounded"
                  style={{ background: toColor(value) }}
                />
              );
            })}
          </>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Escala color: {formatMetricValue(data?.metric === "er" || data?.metric === "view_rate" ? "er_global" : "engagement_total", min)} - {" "}
        {formatMetricValue(data?.metric === "er" || data?.metric === "view_rate" ? "er_global" : "engagement_total", max)}
      </p>
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

  const [loading, setLoading] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [refreshingRun, setRefreshingRun] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<MonitorSocialOverviewResponse | null>(null);
  const [accountsData, setAccountsData] = useState<MonitorSocialAccountsResponse | null>(null);
  const [riskData, setRiskData] = useState<MonitorSocialRiskResponse | null>(null);
  const [etlData, setEtlData] = useState<MonitorSocialEtlQualityResponse | null>(null);
  const [runs, setRuns] = useState<MonitorSocialRunItem[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
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
  const [breakdownData, setBreakdownData] = useState<MonitorSocialErBreakdownResponse | null>(null);
  const [erTargets, setErTargets] = useState<MonitorSocialErTargetsResponse | null>(null);

  const [heatmapMetric, setHeatmapMetric] = useState<SocialHeatmapMetric>("er");
  const [scatterDimension, setScatterDimension] = useState<SocialScatterDimension>("channel");
  const [breakdownDimension, setBreakdownDimension] = useState<SocialErBreakdownDimension>("post_type");

  const [mixBarMetric, setMixBarMetric] = useState<MixMetric>("exposure_total");
  const [mixLineMetric, setMixLineMetric] = useState<MixMetric>("er_global");
  const [accountBarMetric, setAccountBarMetric] = useState<AccountMetric>("er_ponderado");
  const [accountLineMetric, setAccountLineMetric] = useState<AccountMetric>("exposure_total");

  const [topAccountsScaleMode, setTopAccountsScaleMode] = useState<ScaleMode>("auto");
  const [breakdownScaleMode, setBreakdownScaleMode] = useState<ScaleMode>("auto");

  const [accountSearch, setAccountSearch] = useState("");
  const [postTypeSearch, setPostTypeSearch] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [strategySearch, setStrategySearch] = useState("");
  const [hashtagSearch, setHashtagSearch] = useState("");

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
      comparison_mode: comparisonMode,
      comparison_days: comparisonMode === "exact_days" ? comparisonDays : undefined
    };

    if (preset === "custom") {
      if (from) query.from = from;
      if (to) query.to = to;
    }

    return query;
  }, [preset, selectedChannels, selectedAccounts, selectedPostTypes, selectedCampaigns, selectedStrategies, selectedHashtags, comparisonMode, comparisonDays, from, to]);

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
        campaign: (item as unknown as { campaign?: string | null }).campaign ?? null,
        strategies: (item as unknown as { strategies?: string[] }).strategies ?? [],
        hashtags: (item as unknown as { hashtags?: string[] }).hashtags ?? []
      };
    });

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const [overviewResponse, postsResponse, runsResponse, accountsResponse, riskResponse, etlResponse, heatmapResponse, scatterResponse, breakdownResponse, targetsResponse] =
        await Promise.all([
          client.getMonitorSocialOverview({ ...commonQuery, trend_granularity: "auto" }),
          client.listMonitorSocialPosts({ ...commonQuery, sort: "published_at_desc", limit: 50 }),
          client.listMonitorSocialRuns(20),
          client.getMonitorSocialAccounts(commonQuery),
          client.getMonitorSocialRisk(commonQuery),
          client.getMonitorSocialEtlQuality(20),
          client.getMonitorSocialHeatmap({ ...commonQuery, metric: heatmapMetric }),
          client.getMonitorSocialScatter({ ...commonQuery, dimension: scatterDimension }),
          client.getMonitorSocialErBreakdown({ ...commonQuery, dimension: breakdownDimension }),
          client.getMonitorSocialErTargets({ ...commonQuery, year: 2026 })
        ]);

      setOverview(overviewResponse);
      setAccountsData(accountsResponse);
      setRiskData(riskResponse);
      setEtlData(etlResponse);
      setRuns(runsResponse.items ?? []);
      setPosts(normalizePosts(postsResponse.items ?? []));
      setPostsCursor(postsResponse.page_info.next_cursor ?? null);
      setPostsHasNext(Boolean(postsResponse.page_info.has_next));
      setHeatmapData(heatmapResponse);
      setScatterData(scatterResponse);
      setBreakdownData(breakdownResponse);
      setErTargets(targetsResponse);
    } catch (loadError) {
      setError((loadError as Error).message);
      setOverview(null);
      setAccountsData(null);
      setRiskData(null);
      setEtlData(null);
      setRuns([]);
      setPosts([]);
      setPostsCursor(null);
      setPostsHasNext(false);
      setHeatmapData(null);
      setScatterData(null);
      setBreakdownData(null);
      setErTargets(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [client, commonQuery, reloadVersion, heatmapMetric, scatterDimension, breakdownDimension]);

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
          setError((pollError as Error).message);
          setPendingRunId(null);
        });
    }, 4000);

    return () => clearInterval(timer);
  }, [client, pendingRunId]);

  useEffect(() => {
    if (!selectedPostComments) return;
    void loadPostComments(selectedPostComments);
  }, [selectedPostComments, commentSentimentFilter, commentSpamFilter, commentRelatedFilter]);

  const loadMorePosts = async () => {
    if (!postsHasNext || !postsCursor || loadingMorePosts) return;
    setLoadingMorePosts(true);
    setError(null);

    try {
      const response = await client.listMonitorSocialPosts({
        ...commonQuery,
        sort: "published_at_desc",
        limit: 50,
        cursor: postsCursor
      });
      setPosts((current) => [...current, ...normalizePosts(response.items ?? [])]);
      setPostsCursor(response.page_info.next_cursor ?? null);
      setPostsHasNext(Boolean(response.page_info.has_next));
    } catch (loadError) {
      setError((loadError as Error).message);
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
    try {
      const response = await client.listMonitorSocialPostComments(post.id, buildPostCommentsQuery(cursor));
      const incoming = response.items ?? [];
      setPostComments((current) => (append ? [...current, ...incoming] : incoming));
      setPostCommentsCursor(response.page_info.next_cursor ?? null);
      setPostCommentsHasNext(Boolean(response.page_info.has_next));
    } catch (loadError) {
      setError((loadError as Error).message);
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
    void loadPostComments(post);
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
    try {
      const updated = await client.patchMonitorSocialComment(commentId, payload);
      setPostComments((current) => current.map((item) => (item.id === commentId ? updated : item)));
    } catch (patchError) {
      setError((patchError as Error).message);
    } finally {
      setUpdatingCommentId(null);
    }
  };

  const triggerRun = async () => {
    if (!canRefresh || refreshingRun) return;
    setRefreshingRun(true);
    setError(null);
    try {
      const accepted = await client.createMonitorSocialRun({ force: false });
      setPendingRunId(accepted.run_id);
      setReloadVersion((current) => current + 1);
    } catch (runError) {
      setError((runError as Error).message);
    } finally {
      setRefreshingRun(false);
    }
  };

  const exportFilteredCsv = async () => {
    if (!canExport || exportingCsv) return;
    setExportingCsv(true);
    setError(null);
    try {
      const allPosts: PostRow[] = [];
      let cursor: string | undefined;
      let hasNext = true;

      while (hasNext) {
        const page = await client.listMonitorSocialPosts({
          ...commonQuery,
          sort: "published_at_desc",
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
      setError((csvError as Error).message);
    } finally {
      setExportingCsv(false);
    }
  };

  const exportExcel = async () => {
    if (!canExport || exportingExcel) return;
    setExportingExcel(true);
    setError(null);
    try {
      const blob = await client.downloadMonitorSocialExcel({
        ...commonQuery,
        sort: "published_at_desc"
      });
      const filename = `social-analytics-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.xlsx`;
      downloadBlobFile(blob, filename);
    } catch (downloadError) {
      setError((downloadError as Error).message);
    } finally {
      setExportingExcel(false);
    }
  };

  const toggleMultiValue = (key: string, values: string[], value: string) => {
    const normalized = value.trim();
    const exists = values.includes(normalized);
    const next = exists ? values.filter((item) => item !== normalized) : [...values, normalized];
    setQueryPatch({ [key]: next.length > 0 ? next.join(",") : null });
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
        er_global: Number(item.er_global ?? 0),
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
        er_global: Number(item.er_global ?? 0),
        riesgo_activo: Number(item.riesgo_activo ?? 0),
        sov_interno: Number(item.sov_interno ?? 0)
      })),
    [normalizedOverview]
  );

  const accountOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of (overview as unknown as { by_account?: Array<{ account_name: string }> })?.by_account ?? []) values.add(row.account_name);
    for (const row of accountsData?.items ?? []) values.add(row.account_name);
    for (const row of posts) values.add(row.account_name);
    for (const row of selectedAccounts) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [overview, accountsData, posts, selectedAccounts]);

  const postTypeOptions = useMemo(() => {
    const values = new Set<string>(["unknown"]);
    for (const row of posts) values.add(normalizePostType(row.post_type ?? "unknown"));
    for (const row of selectedPostTypes) values.add(normalizePostType(row));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts, selectedPostTypes]);

  const campaignOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of posts) if (row.campaign) values.add(row.campaign.toLowerCase());
    for (const row of selectedCampaigns) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts, selectedCampaigns]);

  const strategyOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of posts) for (const strategy of row.strategies ?? []) values.add(strategy.toLowerCase());
    for (const row of selectedStrategies) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts, selectedStrategies]);

  const hashtagOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of posts) for (const hashtag of row.hashtags ?? []) values.add(hashtag.toLowerCase());
    for (const row of selectedHashtags) values.add(row);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts, selectedHashtags]);

  const filterBySearch = (values: string[], term: string): string[] => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return values;
    return values.filter((item) => item.toLowerCase().includes(normalized));
  };

  const filteredAccountOptions = useMemo(() => filterBySearch(accountOptions, accountSearch), [accountOptions, accountSearch]);
  const filteredPostTypeOptions = useMemo(() => filterBySearch(postTypeOptions, postTypeSearch), [postTypeOptions, postTypeSearch]);
  const filteredCampaignOptions = useMemo(() => filterBySearch(campaignOptions, campaignSearch), [campaignOptions, campaignSearch]);
  const filteredStrategyOptions = useMemo(() => filterBySearch(strategyOptions, strategySearch), [strategyOptions, strategySearch]);
  const filteredHashtagOptions = useMemo(() => filterBySearch(hashtagOptions, hashtagSearch), [hashtagOptions, hashtagSearch]);

  const dataStatus = useMemo(() => {
    if (loading) return "loading";
    if (error) return "error";
    if ((normalizedOverview.kpis?.posts as number | undefined) === 0 && posts.length === 0) return "empty";
    if ((normalizedOverview.reconciliation_status ?? "ok") !== "ok") return "recon_warning";
    if (Boolean(normalizedOverview.diagnostics?.insufficient_data)) return "partial_data";
    return "ready";
  }, [loading, error, normalizedOverview, posts.length]);

  const topAccountsDual = useMemo(() => {
    const rows = [...(accountsData?.items ?? [])]
      .sort((a, b) => Number(b[accountBarMetric]) - Number(a[accountBarMetric]))
      .slice(0, 10)
      .map((item) => ({
        account_name: item.account_name,
        er_ponderado: Number(item.er_ponderado ?? 0),
        exposure_total: Number(item.exposure_total ?? 0),
        engagement_total: Number(item.engagement_total ?? 0),
        posts: Number(item.posts ?? 0),
        sov_interno: Number(item.sov_interno ?? 0)
      }));
    return rows;
  }, [accountsData, accountBarMetric]);

  const topAccountsScale = useMemo(
    () => resolveScale(topAccountsScaleMode, topAccountsDual.map((item) => Number(item[accountBarMetric]))),
    [topAccountsScaleMode, topAccountsDual, accountBarMetric]
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

  const breakdownScale = useMemo(
    () => resolveScale(breakdownScaleMode, (breakdownData?.items ?? []).map((item) => item.er_global)),
    [breakdownScaleMode, breakdownData]
  );

  const sovPieData = useMemo(() => {
    const sorted = [...(accountsData?.items ?? [])].sort((a, b) => b.sov_interno - a.sov_interno);
    const top = sorted.slice(0, 6).map((item) => ({ name: item.account_name, value: item.sov_interno }));
    const others = sorted.slice(6).reduce((acc, item) => acc + item.sov_interno, 0);
    if (others > 0.001) top.push({ name: "Otros", value: others });
    return top;
  }, [accountsData]);

  const pieColors = ["#e30613", "#1d4ed8", "#0f766e", "#f59f00", "#9333ea", "#64748b"];

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
                hashtag: null
              })
            }
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <details className="group relative xl:col-span-2">
            <summary className="list-none cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Periodo y comparación</p>
              <p className="text-sm font-semibold text-slate-800">
                {toPresetLabel(preset)} | {toComparisonLabel(comparisonMode)}
              </p>
              <p className="text-xs text-slate-500">
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
            label="Canal"
            summary={selectedChannels.length > 0 ? `${selectedChannels.length} seleccionados` : "Todos"}
            secondary={`${CHANNEL_OPTIONS.length} canales`}
            options={CHANNEL_OPTIONS}
            selected={selectedChannels}
            search={""}
            placeholder="Buscar canal"
            onSearch={() => undefined}
            onToggle={(value) => toggleMultiValue("channel", selectedChannels, value)}
            onClear={() => setQueryPatch({ channel: null })}
            toLabel={(value) => toChannelLabel(value as SocialChannel)}
          />

          <SmartMultiSelect
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
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kpiCards.map((card) => (
              <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                  <KpiInfo id={`kpi-info-${card.id}`} text={card.info} />
                </div>
                <p className="mt-2 text-3xl font-bold text-red-700">{card.value}</p>
                <p className="text-xs text-slate-600">Periodo anterior: {card.previous}</p>
                <p className="mt-1 text-xs text-slate-600">{card.goal}</p>
                <p className={`mt-1 text-xs font-semibold ${card.statusClass}`}>{card.status}</p>
              </article>
            ))}
          </section>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Tendencia</h3>
                  <span className="text-xs text-slate-500">{normalizedOverview.comparison?.label ?? "Comparación activa"}</span>
                </div>
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="bucket_label" />
                      <YAxis yAxisId="left" tickFormatter={(value) => formatMetricValue("exposure_total", Number(value))} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatMetricValue("er_global", Number(value))} />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="exposure_total" name="Exposición" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="engagement_total" name="Interacciones" stroke="#f59f00" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="er_global" name="ER" stroke="#e30613" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Mix por canal</h3>
                  <span className="text-xs text-slate-500">Línea en eje derecho</span>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Barra
                    <select value={mixBarMetric} onChange={(event) => setMixBarMetric(event.target.value as MixMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {(["posts", "exposure_total", "engagement_total", "er_global", "riesgo_activo", "sov_interno"] as MixMetric[]).map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Línea
                    <select value={mixLineMetric} onChange={(event) => setMixLineMetric(event.target.value as MixMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {(["posts", "exposure_total", "engagement_total", "er_global", "riesgo_activo", "sov_interno"] as MixMetric[]).map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="channel" tickFormatter={(value) => toChannelLabel(value as SocialChannel)} />
                      <YAxis yAxisId="left" tickFormatter={(value) => formatMetricValue(mixBarMetric, Number(value))} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatMetricValue(mixLineMetric, Number(value))} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey={mixBarMetric} name={METRIC_META[mixBarMetric].label} fill="#2563eb" />
                      <Line yAxisId="right" type="monotone" dataKey={mixLineMetric} name={METRIC_META[mixLineMetric].label} stroke="#0f766e" strokeWidth={2} dot={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Top cuentas ER (doble eje)</h3>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${topAccountsScale === "log" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>
                      Escala {topAccountsScale === "log" ? "log (auto)" : "lineal"}
                    </span>
                    <select value={topAccountsScaleMode} onChange={(event) => setTopAccountsScaleMode(event.target.value as ScaleMode)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="auto">Auto</option>
                      <option value="linear">Lineal</option>
                      <option value="log">Log</option>
                    </select>
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica barra
                    <select value={accountBarMetric} onChange={(event) => setAccountBarMetric(event.target.value as AccountMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {(["er_ponderado", "exposure_total", "engagement_total", "posts", "sov_interno"] as AccountMetric[]).map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica línea
                    <select value={accountLineMetric} onChange={(event) => setAccountLineMetric(event.target.value as AccountMetric)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
                      {(["er_ponderado", "exposure_total", "engagement_total", "posts", "sov_interno"] as AccountMetric[]).map((metric) => (
                        <option key={metric} value={metric}>
                          {METRIC_META[metric].label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAccountsDual}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="account_name" tickFormatter={(value) => truncate(String(value), 16)} />
                      <YAxis
                        yAxisId="left"
                        scale={topAccountsScale}
                        domain={topAccountsScale === "log" ? [1, "auto"] : [0, "auto"]}
                        tickFormatter={(value) => formatMetricValue(accountBarMetric, Number(value))}
                      />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatMetricValue(accountLineMetric, Number(value))} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey={accountBarMetric} name={METRIC_META[accountBarMetric].label} fill="#c90310" />
                      <Line yAxisId="right" type="monotone" dataKey={accountLineMetric} name={METRIC_META[accountLineMetric].label} stroke="#1d4ed8" strokeWidth={2} dot={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Brecha ER vs Meta</h3>
                  <span className="text-xs text-slate-500">ER actual vs ER objetivo 2026</span>
                </div>
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={erGapByChannel}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="channel" tickFormatter={(value) => toChannelLabel(value as SocialChannel)} />
                      <YAxis yAxisId="left" tickFormatter={(value) => formatPercent(Number(value))} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatPercent(Number(value))} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="current_er" name="ER actual" fill="#e30613" />
                      <Line yAxisId="right" type="monotone" dataKey="target_2026_er" name="Meta ER 2026" stroke="#0f766e" strokeWidth={2} dot={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">ER vs Exposición (scatter)</h3>
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
                </div>
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid />
                      <XAxis type="number" dataKey="exposure_total" name="Exposición" tickFormatter={(value) => formatNumber(Number(value))} />
                      <YAxis type="number" dataKey="er_global" name="ER" tickFormatter={(value) => formatPercent(Number(value))} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        formatter={(value, name) => {
                          if (name === "ER") return formatPercent(Number(value));
                          return formatNumber(Number(value));
                        }}
                        labelFormatter={(label) => `Grupo: ${String(label)}`}
                      />
                      <Scatter
                        name="Grupos"
                        data={(scatterData?.items ?? []).map((item) => ({
                          ...item,
                          exposure_total: item.exposure_total,
                          er_global: item.er_global,
                          z: Math.max(item.posts, 1),
                          label: item.label
                        }))}
                        fill="#0f766e"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Heatmap actividad</h3>
                  <label className="text-xs font-semibold text-slate-600">
                    Métrica
                    <select value={heatmapMetric} onChange={(event) => setHeatmapMetric(event.target.value as SocialHeatmapMetric)} className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="er">ER</option>
                      <option value="engagement_total">Interacciones</option>
                      <option value="likes">Likes</option>
                      <option value="comments">Comments</option>
                      <option value="shares">Shares</option>
                      <option value="views">Views</option>
                      <option value="view_rate">View rate</option>
                    </select>
                  </label>
                </div>
                <Heatmap data={heatmapData} />
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">ER por dimensión</h3>
                  <div className="flex items-center gap-2">
                    <select value={breakdownDimension} onChange={(event) => setBreakdownDimension(event.target.value as SocialErBreakdownDimension)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      <option value="hashtag">Hashtag</option>
                      <option value="word">Palabra más usada</option>
                      <option value="post_type">Tipo de post</option>
                      <option value="publish_frequency">Frecuencia publicación</option>
                      <option value="weekday">Día publicación</option>
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
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownData?.items ?? []} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        scale={breakdownScale}
                        domain={breakdownScale === "log" ? [1, "auto"] : [0, "auto"]}
                        tickFormatter={(value) => formatPercent(Number(value))}
                      />
                      <YAxis type="category" dataKey="label" width={180} tickFormatter={(value) => truncate(String(value), 24)} />
                      <Tooltip formatter={(value) => formatPercent(Number(value))} />
                      <Bar dataKey="er_global" name="ER" fill="#7c3aed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel xl:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Share por cuenta</h3>
                  <span className="text-xs text-slate-500">SOV interno</span>
                </div>
                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sovPieData} dataKey="value" nameKey="name" outerRadius={90} label={(entry) => truncate(String(entry.name), 14)}>
                        {sovPieData.map((_, index) => (
                          <Cell key={index} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatPercent(Number(value))} />
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
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Cuentas</h3>
            <span className="text-xs text-slate-500">Desempeño por cuenta con deltas vs periodo comparado.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Cuenta</th>
                  <th className="px-2 py-2">Canales</th>
                  <th className="px-2 py-2">Posts</th>
                  <th className="px-2 py-2">Exposición</th>
                  <th className="px-2 py-2">Engagement</th>
                  <th className="px-2 py-2">ER pond.</th>
                  <th className="px-2 py-2">Delta ER</th>
                  <th className="px-2 py-2">SOV interno</th>
                  <th className="px-2 py-2">Threshold</th>
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
                    <td className={`px-2 py-2 ${toDeltaClass(item.delta_er)}`}>{formatPercent(item.delta_er)}</td>
                    <td className="px-2 py-2">{formatPercent(item.sov_interno)}</td>
                    <td className="px-2 py-2">{item.meets_threshold ? "OK" : "Bajo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "posts" ? (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-panel">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Posts</h3>
            <span className="text-xs text-slate-500">Incluye campaña, estrategias y hashtags detectados.</span>
          </div>

          {!loading && posts.length === 0 ? <p className="text-sm text-slate-600">Sin posts para estos filtros.</p> : null}

          {posts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Fecha</th>
                    <th className="px-2 py-2">Canal</th>
                    <th className="px-2 py-2">Cuenta</th>
                    <th className="px-2 py-2">Tipo</th>
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
                    return (
                      <tr key={post.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{formatDate(post.published_at)}</td>
                        <td className="px-2 py-2">{toChannelLabel(post.channel)}</td>
                        <td className="px-2 py-2">{post.account_name}</td>
                        <td className="px-2 py-2">{post.post_type ?? "Sin tipo"}</td>
                        <td className="px-2 py-2">{post.campaign ?? "--"}</td>
                        <td className="px-2 py-2">{post.strategies?.join(", ") || "--"}</td>
                        <td className="px-2 py-2">{post.hashtags?.map((item) => `#${item}`).join(" ") || "--"}</td>
                        <td className="px-2 py-2">
                          <div className="grid gap-1">
                            <strong>{truncate(post.title, 52)}</strong>
                            <a href={post.post_url} target="_blank" rel="noreferrer" className="text-xs text-red-700 underline">
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
                            onClick={() => openCommentsModal(post)}
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
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Riesgo</h3>
            <span className="text-xs text-slate-500">Seguimiento de negativos y riesgo activo.</span>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-3">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={riskData?.sentiment_trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="negativos" stroke="#b91c1c" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="riesgo_activo" stroke="#f59f00" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="sentimiento_neto" stroke="#0f766e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="rounded-xl border border-slate-200 p-3">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Alertas activas</h4>
              <ul className="space-y-2">
                {(riskData?.alerts ?? []).map((alert) => (
                  <li key={alert.id} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{alert.severity}</strong>
                      <span>{alert.status}</span>
                      <span>risk {formatScore(alert.risk_score)}</span>
                      <span>{formatDateTime(alert.updated_at)}</span>
                    </div>
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
