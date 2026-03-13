import { Navigate, useLocation } from "react-router-dom";
import { Spin, Result, Flex } from "antd";
import { useAuth } from "./AuthContext";
import type { UserRole } from "./token";

type RequireAuthProps = {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
};

export const RequireAuth = ({ children, allowedRoles }: RequireAuthProps) => {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
        <Spin size="large" tip="Validando sesion...">
          <div style={{ padding: 60 }} />
        </Spin>
      </Flex>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
        <Result
          status="403"
          title="Acceso restringido"
          subTitle="Tu rol no tiene permisos para esta vista."
        />
      </Flex>
    );
  }

  return <>{children}</>;
};
