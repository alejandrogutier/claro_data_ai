import React from "react";
import { Tag } from "antd";
import {
  CheckCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";

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

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircleOutlined />,
  activo: <CheckCircleOutlined />,
  completed: <CheckCircleOutlined />,
  completado: <CheckCircleOutlined />,
  success: <CheckCircleOutlined />,
  running: <SyncOutlined spin />,
  ejecutando: <SyncOutlined spin />,
  pending: <ClockCircleOutlined />,
  pendiente: <ClockCircleOutlined />,
  queued: <ClockCircleOutlined />,
  failed: <CloseCircleOutlined />,
  error: <CloseCircleOutlined />,
  paused: <PauseCircleOutlined />,
  pausado: <PauseCircleOutlined />,
  cancelled: <StopOutlined />,
  cancelado: <StopOutlined />,
};

type Props = {
  status: string;
  color?: string;
};

export const StatusTag: React.FC<Props> = ({ status, color }) => {
  const key = status.toLowerCase();
  const icon = STATUS_ICONS[key];
  return (
    <Tag color={color ?? STATUS_COLORS[key] ?? "default"}>
      {icon && <span style={{ marginRight: 3 }}>{icon}</span>}
      {status}
    </Tag>
  );
};
