import React from "react";
import { Card, Typography, Flex, Tooltip } from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { CLARO_SHADOWS } from "../../theme/claroTheme";

const { Text } = Typography;

type Props = {
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
  icon?: React.ReactNode;
  accentColor?: string;
  info?: string;
};

const DELTA_COLORS = {
  positive: { text: "#15803d", bg: "rgba(21, 128, 61, 0.08)" },
  negative: { text: "#be123c", bg: "rgba(190, 18, 60, 0.08)" },
  neutral: { text: "#64748b", bg: "rgba(100, 116, 139, 0.06)" },
} as const;

const SecondaryKpiCard: React.FC<Props> = ({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  accentColor = "#e30613",
  info,
}) => {
  const deltaStyle =
    delta > 0
      ? DELTA_COLORS.positive
      : delta < 0
        ? DELTA_COLORS.negative
        : DELTA_COLORS.neutral;

  const DeltaIcon =
    delta > 0 ? ArrowUpOutlined : delta < 0 ? ArrowDownOutlined : MinusOutlined;

  return (
    <Card
      size="small"
      hoverable
      style={{
        height: "100%",
        boxShadow: CLARO_SHADOWS.card,
        border: "1px solid rgba(231, 233, 237, 0.5)",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(250,248,249,0.94) 100%)",
      }}
      styles={{ body: { padding: 0 } }}
    >
      <Flex style={{ height: "100%" }}>
        {/* Left accent bar */}
        <div
          style={{
            width: 3,
            flexShrink: 0,
            background: `linear-gradient(180deg, ${accentColor}, ${accentColor}66)`,
            borderRadius: "3px 0 0 3px",
          }}
        />

        <div style={{ flex: 1, padding: "12px 14px" }}>
          {/* Header: icon + label + info */}
          <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
            {icon && (
              <span
                style={{
                  fontSize: 13,
                  color: accentColor,
                  opacity: 0.7,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {icon}
              </span>
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                color: "#64748b",
                letterSpacing: "0.3px",
                lineHeight: 1.2,
                flex: 1,
              }}
            >
              {label}
            </Text>
            {info && (
              <Tooltip title={info}>
                <InfoCircleOutlined
                  style={{ color: "#c0c7d0", fontSize: 11, cursor: "help" }}
                />
              </Tooltip>
            )}
          </Flex>

          {/* Value */}
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#1e293b",
              fontFamily: "'Barlow Condensed', sans-serif",
              lineHeight: 1.2,
              letterSpacing: "-0.3px",
            }}
          >
            {value}
          </div>

          {/* Delta badge */}
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                color: deltaStyle.text,
                background: deltaStyle.bg,
                lineHeight: 1.4,
              }}
            >
              <DeltaIcon style={{ fontSize: 9 }} />
              {deltaLabel}
            </span>
          </div>
        </div>
      </Flex>
    </Card>
  );
};

export default SecondaryKpiCard;
