import React from "react";
import { Typography, Flex } from "antd";

const { Title, Paragraph } = Typography;

type Props = {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
};

export const PageHeader: React.FC<Props> = ({ title, subtitle, extra }) => (
  <Flex justify="space-between" align="flex-start" style={{ marginBottom: 20 }}>
    <div>
      <Title
        level={2}
        style={{
          margin: 0,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 28,
        }}
      >
        {title}
      </Title>
      {subtitle && (
        <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
          {subtitle}
        </Paragraph>
      )}
    </div>
    {extra}
  </Flex>
);
