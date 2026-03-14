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

/* -- Constants -- */

const CHANNEL_OPTIONS: SocialChannel[] = ["facebook", "instagram", "linkedin", "tiktok", "x"];
const PRESET_OPTIONS: SocialDatePreset[] = ["ytd", "90d", "30d", "y2024", "y2025", "last_quarter", "custom", "all"];
const FACET_SENTIMENT_OPTIONS = ["positive", "negative", "neutral", "unknown"] as const;

type TimeGranularity = "day" | "week" | "month" | "quarter" | "semester";
const TIME_GRANULARITY_OPTIONS: TimeGranularity[] = ["day", "week", "month", "quarter", "semester"];

/* -- Label helpers -- */

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
  if (preset === "last_quarter") return "Ult. trim.";
  return "Custom";
};

const toTimeGranularityLabel = (g: TimeGranularity): string => {
  if (g === "day") return "Dia";
  if (g === "week") return "Sem";
  if (g === "month") return "Mes";
  if (g === "quarter") return "Trim";
  return "Sem.";
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

const formatDateShort = (value: string | null | undefined): string => {
  if (!value) return "...";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(parsed);
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

/* -- Types -- */

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

/* -- Component -- */

const SocialFilterBar: React.FC<SocialFilterBarProps> = ({
  preset, timeGranularity, comparisonMode, comparisonDays, from, to, normalizedOverview,
  selectedChannels, selectedAccounts, selectedPostTypes, selectedCampaigns,
  selectedStrategies, selectedHashtags, selectedTopics, selectedSentiment,
  facetsData, loadingFacets,
  setQueryPatch, applyPreset, clearAllFilters,
}) => {

  /* -- Build facet options with counts -- */

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
    // Derive channel counts from account facets if available
    const totalPosts = facetsData?.totals?.posts ?? 0;
    return CHANNEL_OPTIONS.map((ch) => {
      // Use account facets to estimate, or just show the channel name
      const accountItems = facetsData?.facets?.account ?? [];
      // Channel is not directly in facets, show total / channel count as estimate
      return { value: ch, count: Math.round(totalPosts / CHANNEL_OPTIONS.length) };
    });
  }, [facetsData]);

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

  /* -- Multi-value change handler -- */

  const handleMultiChange = (key: string, values: string[]) => {
    setQueryPatch({ [key]: values.length > 0 ? values.join(",") : null, accounts_cursor: null });
  };

  /* -- Active filter count -- */

  const activeFilterCount = [
    selectedChannels, selectedAccounts, selectedPostTypes,
    selectedCampaigns, selectedStrategies, selectedHashtags, selectedTopics,
  ].reduce((acc, arr) => acc + arr.length, 0) + (selectedSentiment !== "all" ? 1 : 0);

  /* -- Active filter chips -- */

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
  addChips("Camp.", "campaign", selectedCampaigns);
  addChips("Estrat.", "strategy", selectedStrategies);
  addChips("Hashtag", "hashtag", selectedHashtags, (v) => `#${v}`);
  addChips("Tema", "topic", selectedTopics, toTopicFilterLabel);
  if (selectedSentiment !== "all") {
    activeChips.push({
      key: `sentiment-${selectedSentiment}`,
      dimension: "Sent.",
      label: toSentimentLabel(selectedSentiment),
      onRemove: () => setQueryPatch({ sentiment: null }),
    });
  }

  /* -- Computed dates -- */
  const windowStart = (normalizedOverview.comparison?.current_window_start ?? normalizedOverview.window_start) as string | undefined;
  const windowEnd = (normalizedOverview.comparison?.current_window_end ?? normalizedOverview.window_end) as string | undefined;
  const prevStart = (normalizedOverview.comparison?.previous_window_start ?? "") as string | undefined;
  const prevEnd = (normalizedOverview.comparison?.previous_window_end ?? "") as string | undefined;

  /* -- Filter item style: flex 1 with 0 basis so all distribute evenly -- */
  const filterItemStyle: React.CSSProperties = { flex: "1 1 0", minWidth: 100 };
  const dateItemStyle: React.CSSProperties = { flex: "1.2 1 0", minWidth: 110 };

  return (
    <Card
      size="small"
      styles={{ body: { padding: "10px 16px 12px" }, header: { padding: "8px 16px", minHeight: 44 } }}
      title={
        <Flex align="center" gap={8}>
          <FilterOutlined style={{ fontSize: 13, color: "#94a3b8" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Filtros</span>
          {activeFilterCount > 0 && (
            <Tag color="red" style={{ borderRadius: 999, fontSize: 10, lineHeight: "18px", fontWeight: 700, margin: 0, padding: "0 8px" }}>
              {activeFilterCount}
            </Tag>
          )}
        </Flex>
      }
      extra={
        <Flex align="center" gap={8}>
          <Segmented
            value={timeGranularity}
            onChange={(v) => setQueryPatch({ time_granularity: v as string })}
            options={TIME_GRANULARITY_OPTIONS.map((o) => ({ label: toTimeGranularityLabel(o), value: o }))}
            style={{ fontSize: 12 }}
          />
          {activeFilterCount > 0 && (
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearAllFilters} style={{ color: "#94a3b8", fontSize: 12 }}>
              Limpiar
            </Button>
          )}
        </Flex>
      }
    >
      {/* -- Filter selects (dynamic flex row) -- */}
      <div style={{ display: "flex", flexWrap: "nowrap", gap: 8, alignItems: "flex-end" }}>

        {/* Date Preset Popover */}
        <div style={dateItemStyle}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 2 }}>
            Periodo
          </div>
          <Popover
            trigger="click"
            placement="bottomLeft"
            content={
              <div style={{ width: 300 }}>
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                  <Row gutter={8}>
                    <Col span={12}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 2 }}>Desde</div>
                      <Input size="small" type="date" value={from ?? ""} onChange={(e) => setQueryPatch({ preset: "custom", from: e.target.value || null })} />
                    </Col>
                    <Col span={12}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 2 }}>Hasta</div>
                      <Input size="small" type="date" value={to ?? ""} onChange={(e) => setQueryPatch({ preset: "custom", to: e.target.value || null })} />
                    </Col>
                  </Row>
                  <Flex wrap="wrap" gap={4}>
                    {PRESET_OPTIONS.map((o) => (
                      <Button key={o} size="small" type={preset === o ? "primary" : "default"} danger={preset === o} onClick={() => applyPreset(o)} style={{ fontSize: 12 }}>
                        {toPresetLabel(o)}
                      </Button>
                    ))}
                  </Flex>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Comparacion</div>
                  <Select
                    size="small"
                    style={{ width: "100%" }}
                    value={comparisonMode}
                    onChange={(v) => setQueryPatch({ comparison_mode: v })}
                    options={[
                      { label: "Mismo periodo ano pasado", value: "same_period_last_year" },
                      { label: "Semana con dias alineados", value: "weekday_aligned_week" },
                      { label: "Dias exactos", value: "exact_days" },
                    ]}
                  />
                  {comparisonMode === "exact_days" && (
                    <InputNumber
                      size="small"
                      style={{ width: "100%" }}
                      min={1}
                      max={366}
                      value={comparisonDays}
                      onChange={(v) => setQueryPatch({ comparison_days: String(Math.max(1, v ?? 30)) })}
                      addonBefore="Dias"
                    />
                  )}
                </Space>
              </div>
            }
          >
            <div style={{
              border: "1px solid transparent",
              borderRadius: 8,
              padding: "3px 8px",
              cursor: "pointer",
              background: "#f8f9fb",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 24,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }}>
                {toPresetLabel(preset)}
              </span>
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatDateShort(windowStart)} – {formatDateShort(windowEnd)}
              </span>
            </div>
          </Popover>
        </div>

        {/* Channel */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Canal"
            placeholder="Todos"
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
            placeholder="Todas"
            value={selectedAccounts}
            facetItems={accountFacetOptions}
            loading={loadingFacets}
            onChange={(values) => handleMultiChange("account", values)}
          />
        </div>

        {/* Post Type */}
        <div style={filterItemStyle}>
          <FacetMultiSelect
            label="Tipo"
            placeholder="Todos"
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
            label="Camp."
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
            label="Estrat."
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
            label="Sentim."
            placeholder="Todos"
            value={selectedSentiment === "all" ? [] : [selectedSentiment]}
            facetItems={sentimentFacetOptions}
            loading={loadingFacets}
            onChange={(values) => setQueryPatch({ sentiment: values.length > 0 ? values[0] : null })}
            toLabel={toSentimentLabel}
          />
        </div>
      </div>

      {/* -- Active filter chips -- */}
      {activeChips.length > 0 && (
        <Flex wrap="wrap" gap={4} align="center" style={{ marginTop: 8 }}>
          {activeChips.map((chip) => (
            <Tag
              key={chip.key}
              closable
              onClose={chip.onRemove}
              color="red"
              style={{ borderRadius: 999, fontSize: 11, margin: 0, lineHeight: "20px" }}
            >
              <span style={{ color: "#e30613", fontWeight: 600 }}>{chip.dimension}</span>{" "}{chip.label}
            </Tag>
          ))}
        </Flex>
      )}

      {/* -- Window info (compact) -- */}
      <div style={{ marginTop: 8, fontSize: 11, color: "#94a3b8", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span>
          Ventana: <strong style={{ color: "#64748b" }}>{formatDate(windowStart)} – {formatDate(windowEnd)}</strong>
        </span>
        {prevStart && (
          <span>
            vs <strong style={{ color: "#64748b" }}>{formatDate(prevStart)} – {formatDate(prevEnd)}</strong>
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {loadingFacets ? "Cargando..." : `${formatNumber(facetsData?.totals?.posts ?? 0)} posts`}
        </span>
      </div>
    </Card>
  );
};

export default SocialFilterBar;
