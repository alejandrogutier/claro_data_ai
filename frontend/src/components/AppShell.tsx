import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export const AppShell = () => {
  const { session, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <p className="brand-kicker">Claro Data AI</p>
          <h1>Monitoreo de Marca</h1>
          <p className="brand-subtitle">Noticias + Social-ready</p>
        </div>

        <nav className="app-nav" aria-label="Navegacion principal">
          <p className="nav-group-title">Monitoreo</p>
          <NavLink to="/app/monitor/overview" className="nav-link">
            Overview
          </NavLink>
          <NavLink to="/app/monitor/feed-claro" className="nav-link">
            Feed Claro
          </NavLink>
          <NavLink to="/app/monitor/feed-competencia" className="nav-link">
            Feed Competencia
          </NavLink>
          <NavLink to="/app/monitor/incidents" className="nav-link">
            Incidentes
          </NavLink>

          <p className="nav-group-title">Analisis</p>
          <NavLink to="/app/analyze/overview" className="nav-link">
            Overview Marca
          </NavLink>
          <NavLink to="/app/analyze/channel" className="nav-link">
            Por Canal
          </NavLink>
          <NavLink to="/app/analyze/competitors" className="nav-link">
            Benchmark Competencia
          </NavLink>
          <NavLink to="/app/analyze/runs" className="nav-link">
            Runs Async
          </NavLink>

          <p className="nav-group-title">Reportes</p>
          <NavLink to="/app/reports/center" className="nav-link">
            Centro de Reportes
          </NavLink>
          <NavLink to="/app/reports/templates" className="nav-link">
            Plantillas
          </NavLink>
          <NavLink to="/app/reports/schedules" className="nav-link">
            Programacion
          </NavLink>

          <p className="nav-group-title">Configuracion</p>
          <NavLink to="/app/config/connectors" className="nav-link">
            Conectores
          </NavLink>
          <NavLink to="/app/config/accounts" className="nav-link">
            Cuentas
          </NavLink>
          <NavLink to="/app/config/competitors" className="nav-link">
            Competidores
          </NavLink>
          <NavLink to="/app/config/queries" className="nav-link">
            Queries
          </NavLink>
          <NavLink to="/app/config/taxonomy" className="nav-link">
            Taxonomias
          </NavLink>
          <NavLink to="/app/config/source-scoring" className="nav-link">
            Source Scoring
          </NavLink>
          <NavLink to="/app/config/audit" className="nav-link">
            Auditoria
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <p className="user-name">{session?.name}</p>
          <p className="user-role">Rol: {session?.role}</p>
          <button className="btn btn-outline" onClick={logout} type="button">
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};
