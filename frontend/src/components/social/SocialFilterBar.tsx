import React, { useMemo } from "react";
import { Card, Button, Select, Input, InputNumber, Tag, Popover, Segmented, Space, Flex, Row, Col } from "antd";
import { ClearOutlined, FilterOutlined } from "@ant-design/icons";
import type {
  MonitorSocialFacetsResponse,
  MonitorSocialOverviewResponse,
  SocialChannel,
  SocialComparisonMode,
  SocialDatePreset,
} from "../../api/client";
import FacetMultiSelect, { type FacetItem } from "./FacetMultiSelect";

/* ── Constants ── */

const CHANNEL_OPTIONS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok", "x"];
const PRESET_OPTIONS: SocialDatePreset[] = ["ytd", "90d", "30d", "y2024", "y2025", "last_quarter", "custom", "all"];
const FACET_SENTIMENT_OPTIONS = ["positive", "negative", "neutral", "unknown"] as const;

type TimeGranularity = "day" | "week" | "month" | "quarter" | "semester";
const TIME_GRANULARITY_OPTIONS: TimeGranularity[] = ["day", "week", "month", "quarter", "semester"];

/* ── Label helpers ── */

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
  if (preset === "last_quarter") return "Últ. trimestre";
  return "Custom";
};

const toTimeGranularityLabel = (g: TimeGranularity): string => {
  if (g === "day") return "Día";
  if (g === "week") return "Semana";
  if (g === "month") return "Mes";
  if (g === "quarter") return "Trimestre";
  return "Semestre";
};

const toSentimentLabel = (v: string): string => {
  if (v === "positive") return "Positivo";
  if (v === "negative") return "Negativo";
  if (v === "neutral") return "Neutro";
  return "Desconocido";
};

const toTopicFilterLabel = (value: string): string => value.replaceAll("_", " ");

const normalizePostType = (value: string): string => {
  const n = value.trim().toLowerCase();
  if (!n) return "unknown";
  if (["unknown", "sin tipo", "sin_tipo", "none", "null", "(blank)"].includes(n)) return "unknown";
  return n;
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

/* ── Types ── */

type FacetDimension = "account" | "post_type" | "campaign" | "strategy" | "hashtag" | "topic" | "sentiment";

type NormalizedOverview = {
  comparison?: { current_window_start?: string; current_window_end?: string; previous_window_start?: string; previous_window_end?: string };
  window_start?: string;
  window_end?: string;
};

export type SocialFilterBarProps = {
  preset: SocialDatePreset;
  timeGranularity: TimeGranularity;
  comparisonMode: SocialComparisonMode;
  comparisonDays: number;
  from: string | undefined;
  to: string | undefined;
  normalizedOverview: NormalizedOverview;

  selectedChannels: SocialChannel[];
  selectedAccounts: string[];
  selectedPostTypes: string[];
  selectedCampaigns: string[];
  selectedStrategies: string[];
  selectedHashtags: string[];
  selectedTopics: string[];
  selectedSentiment: string;

  facetsData: MonitorSocialFacetsResponse | null;
  loadingFacets: boolean;

  setQueryPatch: (patch: Record<string, string | null | undefined>) => void;
  applyPreset: (preset: SocialDatePreset) => void;
  clearAllFilters: () => void;
};

/* ── Component ── */

const SocialFilterBar: React.FC<SocialFilterBarProps> = ({
  preset, timeGranularity, comparisonMode, comparisonDays, from, to, normalizedOverview,
  selectedChannels, selectedAccounts, selectedPostTypes, selectedCampaigns,
  selectedStrategies, selectedHashtags, selectedTopics, selectedSentiment,
  facetsData, loadingFacets,
  setQueryPatch, applyPreset, clearAllFilters,
}) => {

  /* ── Build facet options with counts ── */

  const buildFacetOptions = (
    dimension: FacetDimension,
    selected: string[],
    normalizer?: (v: string) => string,
  ): FacetItem[] => {
    const countMap = new Map<string, number>();
    for (const item of facetsData?.facets?.[dimension] ?? []) {
      const key = normalizer ? normalizer(item.value) : item.value;
      countMap.set(key, (countMap.get(key) ?? 0) + item.count);
    }
    for (const s of selected) {
      if (!countMap.has(s)) countMap.set(s, 0);
    }
    return Array.from(countMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  };

  const channelFacetOptions: FacetItem[] = useMemo(() => {
    const countMap = new Map<string, number>();
    // Channel counts can be derived from sentiment facets per channel or just show static list
    // For now use the facets totals or derive from account facets
    for (const ch of CHANNEL_OPTIONS) countMap.set(ch, 0);
    // If we have by-channel data in facets, populate counts
    return CHANNEL_OPTIONS.map((ch) => ({ value: ch, count: countMap.get(ch) ?? 0 }));
  }, []);

  const accountFacetOptions = useMemo(
    () => buildFacetOptions("account", selectedAccounts),
    [facetsData, selectedAccounts],
  );
  const postTypeFacetOptions = useMemo(
    () => buildFacetOptions("post_type", selectedPostTypes, normalizePostType),
    [facetsData, selectedPostTypes],
  );
  const campaignFacetOptions = useMemo(
    () => buildFacetOptions("campaign", selectedCampaigns, (v) => v.toLowerCase()),
    [facetsData, selectedCampaigns],
  );
  const strategyFacetOptions = useMemo(
    () => buildFacetOptions("strategy", selectedStrategies, (v) => v.toLowerCase()),
    [facetsData, selectedStrategies],
  );
  const hashtagFacetOptions = useMemo(
    () => buildFacetOptions("hashtag", selectedHashtags, (v) => v.toLowerCase().replace(/^#+/, "")),
    [facetsData, selectedHashtags],
  );
  const topicFacetOptions = useMemo(
    () => buildFacetOptions("topic", selectedTopics, (v) => v.toLowerCase()),
    [facetsData, selectedTopics],
  );
  const sentimentFacetOptions = useMemo(
    () => buildFacetOptions("sentiment", selectedSentiment === "all" ? [] : [selectedSentiment]),
    [facetsData, selectedSentiment],
  );

  /* ── Multi-value change handler ── */

  const handleMultiChange = (key: string, values: string[]) => {
    setQueryPatch({ [key]: values.length > 0 ? values.join(",") : null, accounts_cursor: null });
  };

  /* ── Active filter count ── */

  const activeFilterCount = [
    selectedChannels, selectedAccounts, selectedPostTypes,
    selectedCampaigns, selectedStrategies, selectedHashtags, selectedTopics,
  ].reduce((acc, arr) => acc + arr.length, 0) + (selectedSentiment !== "all" ? 1 : 0);

  /* ── Active filter chips ── */

  type ActiveChip = { key: string; dimension: string; label: string; onRemove: () => void };
  const activeChips: ActiveChip[] = [];

  const addChips = (dimension: string, paramKey: string, values: string[], toLabel?: (v: string) => string) => {
    for (const v of values) {
      activeChips.push({
        key: `${paramKey}-${v}`,
        dimension,
        label: toLabel ? toLabel(v) : v,
        onRemove: () => {
          const next = values.filter((item) => item !== v);
          setQueryPatch({ [paramKey]: next.length > 0 ? next.join(",") : null, accounts_cursor: null });
        },
      });
    }
  };

  addChips("Canal", "channel", selectedChannels, (v) => toChannelLabel(v as SocialChannel));
  addChips("Cuenta", "account", selectedAccounts);
  addChips("Tipo", "post_type", selectedPostTypes, (v) => v === "unknown" ? "Sin tipo" : v);
  addChips("Campaña", "campaign", selectedCampaigns);
  addChips("Estrategia", "strategy", selectedStrategies);
  addChips("Hashtag", "hashtag", selectedHashtags, (v) => `#${v}`);
  addChips("Tema", "topic", selectedTopics, toTopicFilterLabel);
  if (selectedSentiment !== "all") {
    activeChips.push({
      key: `sentiment-${selectedSentiment}`,
      dimension: "Sentimiento",
      label: toSentimentLabel(selectedSentiment),
      onRemove: () => setQueryPatch({ sentiment: null }),
    });
  }

  /* ── Filter item style ── */
  const filterItemStyle: React.CSSProperties = { flex: "1 1 160px", minWidth: 130, maxWidth: 260 };
  const dateItemStyle: React.CSSProperties = { flex: "1.3 1 180px", minWidth: 150, maxWidth: 300 };

  return (
    <Card
      size="small"
      title={
        <Flex align="center" gap={8}>
          <FilterOutlined />
          <span style={{ fontWeight: 600 }}>Filtros inteligentes</span>
          {activeFilterCount > 0 && (
            <Tag color="red" style={{ borderRadius: 999, fontSize: 11, fontWeight: 600, margin: 0 }}>
              {activeFilterCount} activo{activeFilterCount > 1 ? "s" : ""}
            </Tag>
          )}
        </Flex>
      }
      extra={
        <Space wrap size={8}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#64748b" }}>
            Granularidad
          </span>
          <Segmented
            size="small"
            value={timeGranularity}
            onChange={(v) => setQueryPatch({ time_granularity: v as string })}
            options={TIME_GRANULARITY_OPTIONS.map((o) => ({ label: toTimeGranularityLabel(o), value: o }))}
          />
          <Button size="small" icon={<ClearOutlined />} onClick={clearAllFilters}>
            Limpiar filtros
          </Button>
        </Space>
      }
    >
      {/* ── Filter selects (dynamic flex row) ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>

        {/* Date Preset Popover */}
        <div style={dateItemStyle}>
          <Popover
            trigger="click"
            placement="bottomLeft"
            content={
              <div style={{ width: 300 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Row gutter={8}>
                    <Col span={12}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Desde</div>
                      <Input size="small" type="date" value={from ?? ""} onChange={(e) => setQueryPatch({ preset: "custom", from: e.target.value || null })} />
                    </Col>
                    <Col span={12}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Hasta</div>
                      <Input size="small" type="date" value={to ?? ""} onChange={(e) => setQueryPatch({ preset: "custom", to: e.target.value || null })} />
                    </Col>
                  </Row>
                  <Space wrap>
                    {PRESET_OPTIONS.map((o) => (
                      <Button key={o} size="small" type={preset === o ? "primary" : "default"} danger={preset === o} onClick={() => applyPreset(o)}>
                        {toPresetLabel(o)}
                      </Button>
                    ))}
                  </Space>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Tipo comparación</div>
                  <Select
                    size="small"
                    style={{ width: "100%" }}
                    value={comparisonMode}
                    onChange={(v) => setQueryPatch({ comparison_mode: v })}
                    options={[
                      { label: "Mismo periodo año pasado", value: "same_period_last_year" },
                      { label: "Semana con coincidencia de días", value: "weekday_aligned_week" },
                      { label: "Cantidad exacta de días", value: "exact_days" },
                    ]}
                  />
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Días comparación</div>
                  <InputNumber
                    size="small"
                    style={{ width: "100%" }}
                    min={1}
                    max={366}
                    value={comparisonDays}
                    disabled={comparisonMode !== "exact_days"}
                    onChange={(v) => setQueryPatch({ comparison_days: String(Math.max(1, v ?? 30)) })}
                  />
                </Space>
              </div>
            }
          >
            <div style={{
              border: "1px solid #e7e9ed",
              borderRadius: 10,
              padding: "6px 12px",
              cursor: "pointer",
              background: "#fafbfc",
              transition: "all 0.15s ease",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748b", marginBottom: 2 }}>
                Periodo
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {toPresetLabel(preset)} | {toTimeGranularityLabel(timeGranularity)}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatDate((normalizedOverview.comparison?.current_window_start ?? normalizedOverview.window_start) as string | undefined)} – {formatDate((normalizedOverview.comparison?.current_window_end ?? normalizedOverview.window_end) as string | undefined)}
              </div>
            </div>
          </Popover>
        </div>

        {/* Channel */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Canal"
            placeholder="Todos los canales"
            value={selectedChannels}
            facetItems={channelFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("channel", values)}
            toLabel={(v) => toChannelLabel(v as SocialChannel)}
          />
        </div>

        {/* Account */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Cuenta"
            placeholder="Todas las cuentas"
            value={selectedAccounts}
            facetItems={accountFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("account", values)}
          />
        </div>

        {/* Post Type */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Tipo post"
            placeholder="Todos los tipos"
            value={selectedPostTypes}
            facetItems={postTypeFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("post_type", values)}
            toLabel={(v) => v === "unknown" ? "Sin tipo" : v}
          />
        </div>

        {/* Campaign */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Campaña"
            placeholder="Todas"
            value={selectedCampaigns}
            facetItems={campaignFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("campaign", values)}
          />
        </div>

        {/* Strategy */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Estrategia"
            placeholder="Todas"
            value={selectedStrategies}
            facetItems={strategyFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("strategy", values)}
          />
        </div>

        {/* Hashtag */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Hashtag"
            placeholder="Todos"
            value={selectedHashtags}
            facetItems={hashtagFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("hashtag", values)}
            toLabel={(v) => `#${v}`}
          />
        </div>

        {/* Topic */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Tema"
            placeholder="Todos"
            value={selectedTopics}
            facetItems={topicFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("topic", values)}
            toLabel={toTopicFilterLabel}
          />
        </div>

        {/* Sentiment */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Sentimiento"
            placeholder="Todos"
            value={selectedSentiment === "all" ? [] : [selectedSentiment]}
            facetItems={sentimentFacetOptions}
            loading={loadingFacets}
            onChange={(values) => setQueryPatch({ sentiment: values.length > 0 ? values[0] : null })}
            toLabel={toSentimentLabel}
          />
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {activeChips.length > 0 && (
        <Flex wrap="wrap" gap={6} align="center" style={{ marginTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#64748b" }}>
            Filtros activos:
          </span>
          {activeChips.map((chip) => (
            <Tag
              key={chip.key}
              closable
              onClose={chip.onRemove}
              color="red"
              style={{ borderRadius: 999, fontSize: 12, margin: 0 }}
            >
              {chip.dimension}: {chip.label}
            </Tag>
          ))}
          <Button type="link" size="small" onClick={clearAllFilters} style={{ fontSize: 12, padding: 0 }}>
            Limpiar todos
          </Button>
        </Flex>
      )}

      {/* ── Window info ── */}
      <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
        Drill-down temporal: <strong>{toTimeGranularityLabel(timeGranularity)}</strong>
        {" | "}Ventana activa: {formatDate((normalizedOverview.comparison?.current_window_start ?? normalizedOverview.window_start) as string | undefined)} – {formatDate((normalizedOverview.comparison?.current_window_end ?? normalizedOverview.window_end) as string | undefined)}
        {" | "}período comparado: {formatDate((normalizedOverview.comparison?.previous_window_start ?? "") as string | undefined)} – {formatDate((normalizedOverview.comparison?.previous_window_end ?? "") as string | undefined)}
      </div>

      {/* ── Facet total ── */}
      <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
        {loadingFacets ? "Actualizando facetas..." : `${formatNumber(facetsData?.totals?.posts ?? 0)} posts en universo filtrado`}
      </div>
    </Card>
  );
};

export default SocialFilterBar;
