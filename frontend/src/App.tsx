import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { ConfigStubPage } from "./pages/ConfigStubPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitorFeedPage } from "./pages/MonitorFeedPage";
import { MonitorOverviewPage } from "./pages/MonitorOverviewPage";
import { TermsPage } from "./pages/TermsPage";

export const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/monitor/feed-claro" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth allowedRoles={["Admin", "Analyst", "Viewer"]}>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="monitor/feed-claro" replace />} />

        <Route path="feed" element={<Navigate to="/app/monitor/feed-claro" replace />} />
        <Route path="terms" element={<Navigate to="/app/config/queries" replace />} />

        <Route path="monitor/overview" element={<MonitorOverviewPage />} />
        <Route
          path="monitor/feed-claro"
          element={
            <MonitorFeedPage
              scope="claro"
              title="Feed Principal Claro"
              subtitle="Triage operativo de menciones y noticias de marca. Maximo 2 noticias por query."
            />
          }
        />
        <Route
          path="monitor/feed-competencia"
          element={
            <MonitorFeedPage
              scope="competencia"
              title="Feed Competencia"
              subtitle="Seguimiento dedicado de terminos de competencia para comparativo de mercado."
            />
          }
        />

        <Route
          path="config/connectors"
          element={
            <ConfigStubPage
              title="Configuracion de Conectores"
              objective="Gestion de salud de conectores Hootsuite, Awario y fuentes de noticias."
              blockedBy={["CLARO-037 Integracion de conectores", "CLARO-038 Catalogos Admin"]}
            />
          }
        />
        <Route
          path="config/accounts"
          element={
            <ConfigStubPage
              title="Cuentas Propias"
              objective="Administracion de cuentas oficiales de Claro para monitoreo social."
              blockedBy={["CLARO-038 Catalogos Admin", "CLARO-042 Go-live readiness"]}
            />
          }
        />
        <Route
          path="config/competitors"
          element={
            <ConfigStubPage
              title="Competidores"
              objective="Definicion del set oficial de competidores para SOV."
              blockedBy={["CLARO-038 Catalogos Admin", "CLARO-042 Go-live readiness"]}
            />
          }
        />
        <Route path="config/queries" element={<TermsPage />} />
        <Route
          path="config/taxonomy"
          element={
            <ConfigStubPage
              title="Taxonomias"
              objective="Catalogos de negocio, regiones y campanas para filtros y reportes."
              blockedBy={["CLARO-038 Catalogos Admin"]}
            />
          }
        />
        <Route
          path="config/alerts"
          element={
            <ConfigStubPage
              title="Reglas de Alertas"
              objective="Configuracion de umbrales de severidad, ventanas y destinatarios."
              blockedBy={["CLARO-033 Motor KPI", "CLARO-036 Alertas e incidentes"]}
            />
          }
        />
        <Route
          path="config/report-templates"
          element={
            <ConfigStubPage
              title="Plantillas de Reporte"
              objective="Configuracion base de plantillas y audiencia de reportes automáticos."
              blockedBy={["CLARO-035 Modulo reportes", "CLARO-039 Gobernanza de exportes"]}
            />
          }
        />
        <Route
          path="config/audit"
          element={
            <ConfigStubPage
              title="Auditoria de Configuracion"
              objective="Trazabilidad de cambios de configuracion con filtros y export controlado."
              blockedBy={["CLARO-039 Gobernanza de datos/exportes"]}
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/app/monitor/feed-claro" replace />} />
    </Routes>
  );
};
