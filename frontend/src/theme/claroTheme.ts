import type { ThemeConfig } from "antd";

// ── Design tokens (app-level, not AntD tokens) ──

export const CLARO_SHADOWS = {
  card: "0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)",
  cardHover:
    "0 4px 16px rgba(15, 23, 42, 0.10), 0 8px 24px rgba(15, 23, 42, 0.06)",
  elevated:
    "0 8px 28px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)",
  modal:
    "0 12px 48px rgba(15, 23, 42, 0.14), 0 4px 16px rgba(15, 23, 42, 0.06)",
  inset: "inset 0 1px 3px rgba(15, 23, 42, 0.06)",
};

export const CLARO_GRADIENTS = {
  glassCard:
    "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.72) 100%)",
  kpiCard:
    "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(250,248,249,0.92) 100%)",
  redAccent: "linear-gradient(135deg, #e30613 0%, #a0000a 100%)",
  chartCard:
    "linear-gradient(180deg, rgba(255,255,255,0.90) 0%, rgba(249,250,252,0.85) 100%)",
  filterBar:
    "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(244,246,249,0.88) 100%)",
};

export const CLARO_TRANSITIONS = {
  fast: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
  medium: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
};

export const CLARO_SPACING = {
  sectionGap: 20,
  cardPadding: 20,
  chartHeight: 320,
};

// ── AntD Theme Config ──

export const claroTheme: ThemeConfig = {
  token: {
    // Brand colors
    colorPrimary: "#e30613",
    colorPrimaryHover: "#c90310",
    colorPrimaryActive: "#a0000a",
    colorLink: "#a0000a",
    colorLinkHover: "#e30613",

    // Neutral colors
    colorText: "#16191d",
    colorTextSecondary: "#5c6370",
    colorTextTertiary: "#64748b",
    colorBgContainer: "#ffffff",
    colorBgLayout: "#f4f6f9",
    colorBorder: "#e7e9ed",
    colorBorderSecondary: "#d7dbe2",

    // Success / Error / Warning
    colorSuccess: "#1f8f4e",
    colorError: "#e30613",
    colorWarning: "#f59f00",

    // Typography
    fontFamily: "'Barlow', sans-serif",
    fontFamilyCode:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 14,

    // Border radius
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,

    // Shadows
    boxShadow: CLARO_SHADOWS.card,
    boxShadowSecondary: CLARO_SHADOWS.elevated,

    // Controls
    controlHeight: 40,
    controlHeightSM: 32,
  },
  components: {
    Layout: {
      siderBg: "#ffffff",
      bodyBg: "transparent",
      headerBg: "#ffffff",
    },
    Menu: {
      itemBorderRadius: 10,
      itemSelectedBg: "#e30613",
      itemSelectedColor: "#ffffff",
      itemHoverBg: "rgba(227, 6, 19, 0.06)",
      groupTitleColor: "#5c6370",
      groupTitleFontSize: 11,
      iconSize: 16,
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 20,
      headerFontSize: 15,
      headerFontSizeSM: 14,
    },
    Button: {
      borderRadius: 10,
      fontWeight: 600,
      primaryShadow: "none",
    },
    Table: {
      headerBg: "#fafbfc",
      headerColor: "#64748b",
      headerSplitColor: "#e7e9ed",
      rowHoverBg: "#f8fafc",
      borderRadius: 12,
      cellPaddingBlock: 12,
      cellPaddingInline: 14,
    },
    Tag: {
      borderRadiusSM: 999,
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 26,
    },
    Input: {
      borderRadius: 10,
    },
    Select: {
      borderRadius: 10,
    },
    DatePicker: {
      borderRadius: 10,
    },
    Tabs: {
      inkBarColor: "#e30613",
      itemSelectedColor: "#e30613",
      itemHoverColor: "#a0000a",
      titleFontSize: 15,
    },
    Segmented: {
      borderRadius: 10,
      borderRadiusSM: 8,
      itemSelectedBg: "#ffffff",
    },
  },
};
