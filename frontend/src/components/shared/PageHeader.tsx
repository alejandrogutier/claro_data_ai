import React from "react";
import { Typography, Flex } from "antd";

const { Title, Paragraph } = Typography;

type Props = {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
};

export const PageHeader: React.FC<Props> = ({ title, subtitle, extra }) => (
  <Flex justify="space-between" align="flex-start" style={{ marginBottom: 24 }}>
    <div>
      <Title
        level={2}
        style={{
          margin: 0,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: "-0.3px",
          borderLeft: "4px solid #e30613",
          paddingLeft: 12,
        }}
      >
        {title}
      </Title>
      {subtitle && (
        <Paragraph type="secondary" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
          {subtitle}
        </Paragraph>
      )}
    </div>
    {extra}
  </Flex>
);
