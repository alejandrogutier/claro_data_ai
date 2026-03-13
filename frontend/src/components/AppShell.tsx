import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Menu, Typography, Button, Flex } from "antd";
import type { MenuProps } from "antd";
import {
  DashboardOutlined,
  BarChartOutlined,
  FileSearchOutlined,
  TeamOutlined,
  AlertOutlined,
  FundOutlined,
  NodeIndexOutlined,
  StockOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  SnippetsOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  UserOutlined,
  SearchOutlined,
  AppstoreOutlined,
  AimOutlined,
  BellOutlined,
  MessageOutlined,
  AuditOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth/AuthContext";

const { Sider, Content } = Layout;
const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

const fullMenuItems: MenuItem[] = [
  {
    type: "group",
    label: "MONITOREO",
    children: [
      { key: "/app/monitor/overview", label: "Overview", icon: <DashboardOutlined /> },
      { key: "/app/monitor/social-overview", label: "Social Overview", icon: <BarChartOutlined /> },
      { key: "/app/monitor/feed-claro", label: "Feed Claro", icon: <FileSearchOutlined /> },
      { key: "/app/monitor/feed-competencia", label: "Feed Competencia", icon: <TeamOutlined /> },
      { key: "/app/monitor/incidents", label: "Incidentes", icon: <AlertOutlined /> },
    ],
  },
  {
    type: "group",
    label: "ANALISIS",
    children: [
      { key: "/app/analyze/overview", label: "Overview Marca", icon: <FundOutlined /> },
      { key: "/app/analyze/channel", label: "Por Canal", icon: <NodeIndexOutlined /> },
      { key: "/app/analyze/competitors", label: "Benchmark Competencia", icon: <StockOutlined /> },
      { key: "/app/analyze/runs", label: "Runs Async", icon: <ThunderboltOutlined /> },
    ],
  },
  {
    type: "group",
    label: "REPORTES",
    children: [
      { key: "/app/reports/center", label: "Centro de Reportes", icon: <FileTextOutlined /> },
      { key: "/app/reports/templates", label: "Plantillas", icon: <SnippetsOutlined /> },
      { key: "/app/reports/schedules", label: "Programacion", icon: <ClockCircleOutlined /> },
    ],
  },
  {
    type: "group",
    label: "CONFIGURACION",
    children: [
      { key: "/app/config/connectors", label: "Conectores", icon: <LinkOutlined /> },
      { key: "/app/config/accounts", label: "Cuentas", icon: <UserOutlined /> },
      { key: "/app/config/competitors", label: "Competidores", icon: <TeamOutlined /> },
      { key: "/app/config/queries", label: "Queries", icon: <SearchOutlined /> },
      { key: "/app/config/taxonomy", label: "Taxonomias", icon: <AppstoreOutlined /> },
      { key: "/app/config/source-scoring", label: "Source Scoring", icon: <AimOutlined /> },
      { key: "/app/config/alerts", label: "Notificaciones", icon: <BellOutlined /> },
      { key: "/app/config/social", label: "Social", icon: <MessageOutlined /> },
      { key: "/app/config/audit", label: "Auditoria", icon: <AuditOutlined /> },
    ],
  },
];

const restrictedMenuItems: MenuItem[] = [
  {
    type: "group",
    label: "MONITOREO",
    children: [
      { key: "/app/monitor/social-overview", label: "Social Overview", icon: <BarChartOutlined /> },
    ],
  },
];

export const AppShell = () => {
  const { session, logout } = useAuth();
  const role = session?.role ?? "Viewer";
  const isSocialOverviewOnly = role === "SocialOverviewViewer";
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = useMemo(
    () => (isSocialOverviewOnly ? restrictedMenuItems : fullMenuItems),
    [isSocialOverviewOnly],
  );

  useEffect(() => {
    if (!isSocialOverviewOnly) return;
    if (location.pathname === "/app/monitor/social-overview") return;
    navigate("/app/monitor/social-overview", { replace: true });
  }, [isSocialOverviewOnly, location.pathname, navigate]);

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={280}
        breakpoint="lg"
        collapsedWidth={0}
        style={{
          borderRight: "1px solid #e7e9ed",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "28px 24px 20px",
            borderBottom: "1px solid #e7e9ed",
          }}
        >
          <Text
            strong
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              color: "#e30613",
            }}
          >
            Claro Data AI
          </Text>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#1b1f24",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            Monitoreo de Marca
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Noticias + Social-ready
          </Text>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            onClick={onMenuClick}
            items={menuItems}
            style={{ border: "none" }}
          />
        </div>

        <Flex
          vertical
          gap={4}
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e7e9ed",
          }}
        >
          <Text strong style={{ fontSize: 14 }}>{session?.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Rol: {session?.role}
          </Text>
          <Button
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ marginTop: 8 }}
            block
          >
            Cerrar sesion
          </Button>
        </Flex>
      </Sider>

      <Content
        style={{
          marginLeft: 280,
          padding: "32px 40px",
          minHeight: "100vh",
        }}
      >
        <Outlet />
      </Content>
    </Layout>
  );
};
