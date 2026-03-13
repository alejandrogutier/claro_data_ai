import React from "react";
import { Tag } from "antd";

const SENTIMENT_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  positive: { color: "#177a3f", bg: "#ecfdf3", label: "Positivo" },
  positivo: { color: "#177a3f", bg: "#ecfdf3", label: "Positivo" },
  negative: { color: "#9d111b", bg: "#ffe8ea", label: "Negativo" },
  negativo: { color: "#9d111b", bg: "#ffe8ea", label: "Negativo" },
  neutral: { color: "#2f3f96", bg: "#eef2ff", label: "Neutro" },
  neutro: { color: "#2f3f96", bg: "#eef2ff", label: "Neutro" },
  mixed: { color: "#7c3aed", bg: "#f5f3ff", label: "Mixto" },
  mixto: { color: "#7c3aed", bg: "#f5f3ff", label: "Mixto" },
};

const DEFAULT_CFG = { color: "#4b5563", bg: "#f3f4f6", label: "" };

type Props = { sentiment: string; showLabel?: boolean };

export const SentimentTag: React.FC<Props> = ({ sentiment, showLabel = true }) => {
  const key = sentiment.toLowerCase();
  const cfg = SENTIMENT_CONFIG[key] ?? DEFAULT_CFG;
  const label = showLabel ? (cfg.label || sentiment) : sentiment;
  return (
    <Tag style={{ color: cfg.color, background: cfg.bg, border: "none" }}>
      {label}
    </Tag>
  );
};
