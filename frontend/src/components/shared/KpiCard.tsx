import React from "react";
import { Card, Statistic, Tooltip, Typography, Flex } from "antd";
import {
  InfoCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";
import { CLARO_GRADIENTS, CLARO_SHADOWS } from "../../theme/claroTheme";

type Props = {
  title: string;
  value: string | number;
  caption?: string;
  info?: string;
  valueStyle?: React.CSSProperties;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Delta info: { label, color, delta } for the pill badge */
  deltaLabel?: string;
  deltaColor?: string;
  deltaValue?: number;
  /** Previous period value shown in caption */
  previousLabel?: string;
  /** Goal string shown in caption */
  goalLabel?: string;
};

export const KpiCard: React.FC<Props> = ({
  title,
  value,
  caption,
  info,
  valueStyle,
  prefix,
  suffix,
  deltaLabel,
  deltaColor,
  deltaValue,
  previousLabel,
  goalLabel,
}) => {
  const showNewCaption = previousLabel || goalLabel || deltaLabel;

  return (
    <Card
      size="small"
      hoverable
      style={{
        background: CLARO_GRADIENTS.kpiCard,
        border: "1px solid rgba(231, 233, 237, 0.5)",
        boxShadow: CLARO_SHADOWS.card,
        overflow: "hidden",
        height: "100%",
      }}
      styles={{ body: { padding: "0 16px 14px" } }}
    >
      {/* Red accent bar */}
      <div
        style={{
          height: 3,
          background: CLARO_GRADIENTS.redAccent,
          margin: "0 -16px 12px",
        }}
      />

      <Statistic
        title={
          <Flex justify="space-between" align="center">
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                color: "#64748b",
              }}
            >
              {title}
            </span>
            {info && (
              <Tooltip title={info}>
                <InfoCircleOutlined style={{ color: "#94a3b8" }} />
              </Tooltip>
            )}
          </Flex>
        }
        value={value}
        prefix={prefix}
        suffix={suffix}
        valueStyle={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 28,
          color: "#a0000a",
          letterSpacing: "-0.5px",
          lineHeight: 1.2,
          ...valueStyle,
        }}
      />

      {/* Enhanced caption with delta badge */}
      {showNewCaption && (
        <div
          style={{
            borderTop: "1px solid #f0f2f5",
            paddingTop: 8,
            marginTop: 6,
          }}
        >
          {/* Delta pill */}
          {deltaLabel && (
            <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  color: deltaColor ?? "#64748b",
                  background:
                    deltaColor === "#15803d"
                      ? "rgba(21, 128, 61, 0.08)"
                      : deltaColor === "#be123c"
                        ? "rgba(190, 18, 60, 0.08)"
                        : "rgba(100, 116, 139, 0.06)",
                  lineHeight: 1.5,
                }}
              >
                {deltaValue !== undefined && deltaValue > 0 && (
                  <ArrowUpOutlined style={{ fontSize: 9 }} />
                )}
                {deltaValue !== undefined && deltaValue < 0 && (
                  <ArrowDownOutlined style={{ fontSize: 9 }} />
                )}
                {deltaLabel}
              </span>
            </Flex>
          )}
          {/* Previous + Goal */}
          <Flex gap={8} wrap="wrap">
            {previousLabel && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Anterior: {previousLabel}
              </Typography.Text>
            )}
            {goalLabel && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, opacity: 0.8 }}
              >
                {goalLabel}
              </Typography.Text>
            )}
          </Flex>
        </div>
      )}

      {/* Legacy caption fallback */}
      {!showNewCaption && caption && (
        <div
          style={{
            borderTop: "1px solid #f0f2f5",
            paddingTop: 8,
            marginTop: 6,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {caption}
          </Typography.Text>
        </div>
      )}
    </Card>
  );
};
