import React from "react";
import { Card, Statistic, Tooltip, Typography, Flex } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

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
  <Card size="small">
    <Statistic
      title={
        <Flex justify="space-between" align="center">
          <span>{title}</span>
          {info && (
            <Tooltip title={info}>
              <InfoCircleOutlined style={{ color: "#5c6370" }} />
            </Tooltip>
          )}
        </Flex>
      }
      value={value}
      prefix={prefix}
      suffix={suffix}
      valueStyle={{
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "#a0000a",
        ...valueStyle,
      }}
    />
    {caption && (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {caption}
      </Typography.Text>
    )}
  </Card>
);
