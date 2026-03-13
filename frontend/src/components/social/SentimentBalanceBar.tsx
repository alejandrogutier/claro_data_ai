import React from "react";
import { Flex, Typography } from "antd";

const { Text } = Typography;

type Props = {
  positive: number;
  neutral: number;
  negative: number;
  unknown: number;
  compact?: boolean;
  label?: string;
};

const COLORS = {
  positive: "#10b981",
  neutral: "#38bdf8",
  negative: "#f43f5e",
};

const barStyle: React.CSSProperties = {
  display: "flex",
  height: 10,
  borderRadius: 5,
  overflow: "hidden",
  width: "100%",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
};

const compactBarStyle: React.CSSProperties = {
  ...barStyle,
  height: 8,
};

const segmentBase: React.CSSProperties = {
  height: "100%",
  transition: "width 0.3s ease",
};

const dotStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  height: 10,
  width: 10,
  borderRadius: "50%",
  backgroundColor: color,
  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
});

const SentimentBalanceBar: React.FC<Props> = ({ positive, neutral, negative, unknown, compact = false, label }) => {
  const total = positive + neutral + negative + unknown;
  if (total === 0) {
    return compact ? null : (
      <Text type="secondary" italic style={{ fontSize: 12 }}>Sin datos de sentimiento</Text>
    );
  }

  const balancePercent = ((positive + neutral) / total) * 100;
  const posPercent = (positive / total) * 100;
  const neuPercent = (neutral / total) * 100;
  const negPercent = (negative / total) * 100;

  if (compact) {
    return (
      <Flex align="center" gap={8}>
        <div style={{ ...compactBarStyle, flex: 1 }}>
          {posPercent > 0 && <div style={{ ...segmentBase, width: `${posPercent}%`, backgroundColor: COLORS.positive }} />}
          {neuPercent > 0 && <div style={{ ...segmentBase, width: `${neuPercent}%`, backgroundColor: COLORS.neutral }} />}
          {negPercent > 0 && <div style={{ ...segmentBase, width: `${negPercent}%`, backgroundColor: COLORS.negative }} />}
        </div>
        <Text strong style={{ fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {balancePercent.toFixed(0)}%
        </Text>
      </Flex>
    );
  }

  return (
    <div>
      <Flex align="center" justify="space-between" style={{ marginBottom: 4 }}>
        <Text strong style={{ fontSize: 12 }}>Balance de sentimiento</Text>
        <Text strong style={{ fontSize: 14, fontFamily: "'Barlow Condensed', sans-serif", color: "var(--claro-red, #e30613)" }}>
          {balancePercent.toFixed(1)}%
        </Text>
      </Flex>
      <div style={barStyle}>
        {posPercent > 0 && <div style={{ ...segmentBase, width: `${posPercent}%`, backgroundColor: COLORS.positive }} title={`Positivo: ${positive}`} />}
        {neuPercent > 0 && <div style={{ ...segmentBase, width: `${neuPercent}%`, backgroundColor: COLORS.neutral }} title={`Neutro: ${neutral}`} />}
        {negPercent > 0 && <div style={{ ...segmentBase, width: `${negPercent}%`, backgroundColor: COLORS.negative }} title={`Negativo: ${negative}`} />}
      </div>
      <Flex align="center" gap={12} style={{ marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={dotStyle(COLORS.positive)} /> Positivo ({positive})
        </Text>
        <Text type="secondary" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={dotStyle(COLORS.neutral)} /> Neutro ({neutral})
        </Text>
        <Text type="secondary" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={dotStyle(COLORS.negative)} /> Negativo ({negative})
        </Text>
      </Flex>
      {label && <Text type="secondary" italic style={{ fontSize: 10, marginTop: 2, display: "block" }}>{label}</Text>}
    </div>
  );
};

export default SentimentBalanceBar;
