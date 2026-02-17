import { Navigate, useLocation } from "react-router-dom";
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
    return <div className="screen-state">Validando sesion...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return (
      <div className="screen-state">
        <h2>Acceso restringido</h2>
        <p>Tu rol no tiene permisos para esta vista.</p>
      </div>
    );
  }

  return <>{children}</>;
};
