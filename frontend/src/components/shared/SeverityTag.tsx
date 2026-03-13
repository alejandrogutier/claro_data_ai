import React from "react";
import { Tag } from "antd";

const SEVERITY_COLORS: Record<string, string> = {
  sev1: "#8c000f",
  sev2: "#d9480f",
  sev3: "#f59f00",
  sev4: "#2f9e44",
};

type Props = { severity: string };

export const SeverityTag: React.FC<Props> = ({ severity }) => {
  const color = SEVERITY_COLORS[severity.toLowerCase()] ?? "#6b7280";
  return (
    <Tag color={color} style={{ minWidth: 56, textAlign: "center" }}>
      {severity.toUpperCase()}
    </Tag>
  );
};
