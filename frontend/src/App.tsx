import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AccountsPage } from "./pages/AccountsPage";
import { AnalyzeChannelPage } from "./pages/AnalyzeChannelPage";
import { AnalyzeCompetitorsPage } from "./pages/AnalyzeCompetitorsPage";
import { AnalyzeOverviewPage } from "./pages/AnalyzeOverviewPage";
import { AuditPage } from "./pages/AuditPage";
import { CompetitorsPage } from "./pages/CompetitorsPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitorFeedPage } from "./pages/MonitorFeedPage";
import { MonitorOverviewPage } from "./pages/MonitorOverviewPage";
import { ReportTemplatesPage } from "./pages/ReportTemplatesPage";
import { TaxonomyPage } from "./pages/TaxonomyPage";
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
        <Route path="monitor/incidents" element={<IncidentsPage />} />

        <Route path="analyze" element={<Navigate to="/app/analyze/overview" replace />} />
        <Route path="analyze/overview" element={<AnalyzeOverviewPage />} />
        <Route path="analyze/channel" element={<AnalyzeChannelPage />} />
        <Route path="analyze/competitors" element={<AnalyzeCompetitorsPage />} />

        <Route path="config/connectors" element={<ConnectorsPage />} />
        <Route path="config/accounts" element={<AccountsPage />} />
        <Route path="config/competitors" element={<CompetitorsPage />} />
        <Route path="config/queries" element={<TermsPage />} />
        <Route path="config/taxonomy" element={<TaxonomyPage />} />
        <Route path="config/alerts" element={<Navigate to="/app/monitor/incidents" replace />} />
        <Route path="config/report-templates" element={<ReportTemplatesPage />} />
        <Route path="config/audit" element={<AuditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/app/monitor/feed-claro" replace />} />
    </Routes>
  );
};
