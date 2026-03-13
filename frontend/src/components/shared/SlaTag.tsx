import React from "react";
import { Tag } from "antd";
import {
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";

const SLA_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  ok: { color: "green", label: "OK", icon: <CheckCircleOutlined /> },
  warning: { color: "gold", label: "Warning", icon: <WarningOutlined /> },
  critical: { color: "orange", label: "Critico", icon: <ExclamationCircleOutlined /> },
  overdue: { color: "red", label: "Vencido", icon: <CloseCircleOutlined /> },
};

type Props = { status: string };

export const SlaTag: React.FC<Props> = ({ status }) => {
  const cfg = SLA_CONFIG[status.toLowerCase()] ?? {
    color: "default",
    label: status,
    icon: null,
  };
  return (
    <Tag color={cfg.color} style={{ fontWeight: 600 }}>
      {cfg.icon && <span style={{ marginRight: 3 }}>{cfg.icon}</span>}
      {cfg.label}
    </Tag>
  );
};
