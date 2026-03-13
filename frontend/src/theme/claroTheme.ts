import type { ThemeConfig } from "antd";

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
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    boxShadowSecondary: "0 12px 28px rgba(15, 23, 42, 0.08)",

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
    },
    Tag: {
      borderRadiusSM: 999,
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 28,
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
    },
    Segmented: {
      borderRadius: 10,
      borderRadiusSM: 8,
      itemSelectedBg: "#ffffff",
    },
  },
};
