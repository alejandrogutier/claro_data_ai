import React from "react";
import { Tag } from "antd";
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const SEVERITY_COLORS: Record<string, string> = {
  sev1: "#8c000f",
  sev2: "#d9480f",
  sev3: "#f59f00",
  sev4: "#2f9e44",
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  sev1: <ExclamationCircleOutlined />,
  sev2: <WarningOutlined />,
  sev3: <InfoCircleOutlined />,
  sev4: <CheckCircleOutlined />,
};

type Props = { severity: string };

export const SeverityTag: React.FC<Props> = ({ severity }) => {
  const key = severity.toLowerCase();
  const color = SEVERITY_COLORS[key] ?? "#6b7280";
  const icon = SEVERITY_ICONS[key];
  return (
    <Tag
      color={color}
      style={{ minWidth: 56, textAlign: "center", fontWeight: 600 }}
    >
      {icon && <span style={{ marginRight: 3 }}>{icon}</span>}
      {severity.toUpperCase()}
    </Tag>
  );
};
