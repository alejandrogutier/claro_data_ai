import React from "react";
import { Tag } from "antd";

const SLA_CONFIG: Record<string, { color: string; label: string }> = {
  ok: { color: "green", label: "OK" },
  warning: { color: "gold", label: "Warning" },
  critical: { color: "orange", label: "Critico" },
  overdue: { color: "red", label: "Vencido" },
};

type Props = { status: string };

export const SlaTag: React.FC<Props> = ({ status }) => {
  const cfg = SLA_CONFIG[status.toLowerCase()] ?? { color: "default", label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
};
