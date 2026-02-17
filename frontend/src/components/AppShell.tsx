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
          <NavLink to="/app/feed" className="nav-link">
            Feed Noticias
          </NavLink>
          <NavLink to="/app/terms" className="nav-link">
            Queries / Terminos
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
