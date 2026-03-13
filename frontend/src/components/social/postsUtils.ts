import type { PostRow, SocialChannel, SocialPostSort } from "./postsTypes";

// ── Formatters ──────────────────────────────────────────────

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

export const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;

export const formatScore = (value: number): string =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export const formatCompact = (value: number): string => {
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

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(parsed);
};

export const formatShortDate = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "2-digit" }).format(parsed);
};

export const truncate = (value: string, max = 28): string =>
  value.length <= max ? value : `${value.slice(0, Math.max(1, max - 3))}...`;

// ── Engagement Rate ─────────────────────────────────────────

export const computeER = (post: { engagement_total: number; reach: number; impressions: number; channel: string }): number => {
  if (post.channel === "x" || post.reach === 0) {
    return post.impressions > 0 ? (post.engagement_total / post.impressions) * 100 : 0;
  }
  return post.reach > 0 ? (post.engagement_total / post.reach) * 100 : 0;
};

export const erLabel = (post: { reach: number; channel: string }): string =>
  (post.channel === "x" || post.reach === 0) ? "ER (imp)" : "ER (reach)";

// ── Channel identity ────────────────────────────────────────

export const channelIcon: Record<string, string> = {
  facebook: "\ud83d\udcd8",
  instagram: "\ud83d\udcf8",
  x: "\ud835\udd4f",
  linkedin: "\ud83d\udd17",
  tiktok: "\ud83c\udfb5",
};

/** Inline style objects for channel theming (replaces Tailwind classes) */
export const channelColorStyles: Record<string, { accent: string; text: string; bg: string; border: string }> = {
  facebook:  { accent: "#3b82f6", text: "#1d4ed8", bg: "#eff6ff",  border: "#93c5fd" },
  instagram: { accent: "#d946ef", text: "#a21caf", bg: "#fdf4ff",  border: "#d8b4fe" },
  x:         { accent: "#1e293b", text: "#1e293b", bg: "#f1f5f9",  border: "#94a3b8" },
  linkedin:  { accent: "#0284c7", text: "#0369a1", bg: "#f0f9ff",  border: "#7dd3fc" },
  tiktok:    { accent: "#ec4899", text: "#be185d", bg: "#fdf2f8",  border: "#f9a8d4" },
};

export const toChannelLabel = (channel: SocialChannel): string => {
  if (channel === "facebook") return "Facebook";
  if (channel === "instagram") return "Instagram";
  if (channel === "linkedin") return "LinkedIn";
  if (channel === "x") return "X";
  return "TikTok";
};

// ── Sort ────────────────────────────────────────────────────

export const POST_SORT_OPTIONS: SocialPostSort[] = ["published_at_desc", "exposure_desc", "engagement_desc"];

export const toPostSortLabel = (value: SocialPostSort): string => {
  if (value === "exposure_desc") return "Exposicion desc";
  if (value === "engagement_desc") return "Interacciones desc";
  return "Fecha desc";
};
