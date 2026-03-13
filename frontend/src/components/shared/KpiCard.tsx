import React from "react";
import { Card, Statistic, Tooltip, Typography, Flex } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { CLARO_GRADIENTS, CLARO_SHADOWS } from "../../theme/claroTheme";

type Props = {
  title: string;
  value: string | number;
  caption?: string;
  info?: string;
  valueStyle?: React.CSSProperties;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
};

export const KpiCard: React.FC<Props> = ({
  title,
  value,
  caption,
  info,
  valueStyle,
  prefix,
  suffix,
}) => (
  <Card
    size="small"
    hoverable
    style={{
      background: CLARO_GRADIENTS.kpiCard,
      border: "1px solid rgba(231, 233, 237, 0.5)",
      boxShadow: CLARO_SHADOWS.card,
      overflow: "hidden",
    }}
    styles={{ body: { padding: "0 16px 16px" } }}
  >
    {/* Red accent bar */}
    <div
      style={{
        height: 3,
        background: CLARO_GRADIENTS.redAccent,
        margin: "0 -16px 14px",
      }}
    />

    <Statistic
      title={
        <Flex justify="space-between" align="center">
          <span>{title}</span>
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
        fontSize: 30,
        color: "#a0000a",
        letterSpacing: "-0.5px",
        ...valueStyle,
      }}
    />
    {caption && (
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
