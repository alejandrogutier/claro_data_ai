import React from "react";
import { Tag } from "antd";

const STATUS_COLORS: Record<string, string> = {
  active: "green",
  activo: "green",
  completed: "green",
  completado: "green",
  success: "green",
  running: "blue",
  ejecutando: "blue",
  pending: "gold",
  pendiente: "gold",
  queued: "gold",
  idle: "default",
  inactive: "default",
  inactivo: "default",
  paused: "default",
  pausado: "default",
  failed: "red",
  error: "red",
  cancelled: "default",
  cancelado: "default",
};

type Props = {
  status: string;
  color?: string;
};

export const StatusTag: React.FC<Props> = ({ status, color }) => (
  <Tag color={color ?? STATUS_COLORS[status.toLowerCase()] ?? "default"}>
    {status}
  </Tag>
);
