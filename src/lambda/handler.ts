import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getPathWithoutStage, json } from "../core/http";
import { getRole, hasRole, type UserRole } from "../core/auth";
import { handleHealth } from "../routes/v1/health";
import { listTerms, createTerm, updateTerm } from "../routes/v1/terms";
import { createIngestionRun } from "../routes/v1/ingestion";
import {
  bulkUpdateContentState,
  listContent,
  updateClassification,
  updateContentState
} from "../routes/v1/content";
import { createAnalysisRun, getAnalysisRun, listAnalysisHistory } from "../routes/v1/analysis";
import { getAnalyzeChannel, getAnalyzeCompetitors, getAnalyzeOverview } from "../routes/v1/analyze";
import { createCsvExport, getCsvExport } from "../routes/v1/exports";
import {
  createReportRun,
  createReportSchedule,
  createReportTemplate,
  getReportRun,
  listReportsCenter,
  listReportSchedules,
  listReportTemplates,
  patchReportSchedule,
  patchReportTemplate,
  triggerReportScheduleRun
} from "../routes/v1/reports";
import { getMeta } from "../routes/v1/meta";
import { getNewsFeed } from "../routes/v1/feed";
import {
  createMonitorIncidentNote,
  evaluateMonitorIncidents,
  getMonitorIncidentNotes,
  getMonitorOverview,
  listMonitorIncidents,
  patchMonitorIncident
} from "../routes/v1/monitor";
import {
  createMonitorSocialRun,
  getMonitorSocialErBreakdown,
  getMonitorSocialErTargets,
  getMonitorSocialAccounts,
  getMonitorSocialFacets,
  getMonitorSocialEtlQuality,
  getMonitorSocialExportXlsx,
  getMonitorSocialHeatmap,
  getMonitorSocialOverview,
  getMonitorSocialRisk,
  getMonitorSocialScatter,
  getMonitorSocialSettings,
  listMonitorSocialPosts,
  listMonitorSocialPostComments,
  listMonitorSocialRuns,
  postMonitorSocialHashtagBackfill,
  patchMonitorSocialComment,
  patchMonitorSocialErTargets,
  patchMonitorSocialSettings
} from "../routes/v1/monitorSocial";
import {
  createAwarioBinding,
  createAwarioProfile,
  createConfigAccount,
  createConfigCompetitor,
  createNotificationRecipient,
  createTaxonomy,
  exportConfigAudit,
  listConfigAccounts,
  listAwarioBindings,
  listAwarioProfiles,
  listConfigAudit,
  listConfigCompetitors,
  getNotificationStatus,
  listNotificationRecipients,
  listSourceScoringWeights,
  listConnectors,
  listConnectorRuns,
  listTaxonomies,
  patchConfigAccount,
  patchAwarioBinding,
  patchAwarioProfile,
  patchConfigCompetitor,
  patchNotificationRecipient,
  patchSourceScoringWeight,
  patchConnector,
  patchTaxonomy,
  createSourceScoringWeight,
  triggerConnectorSync
} from "../routes/v1/config";
import {
  createConfigQuery,
  deleteConfigQuery,
  dryRunConfigQuery,
  getConfigQuery,
  listConfigQueries,
  listConfigQueryRevisions,
  patchConfigQuery,
  previewConfigQuery,
  rollbackConfigQuery
} from "../routes/v1/configQueries";

type RoleRule = {
  pattern: RegExp;
  requiredRole: UserRole;
};

const roleRules: RoleRule[] = [
  { pattern: /^GET \/v1\/terms$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/terms$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/terms\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^POST \/v1\/ingestion\/runs$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/content$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/content\/[^/]+\/state$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/content\/bulk\/state$/, requiredRole: "Analyst" },
  { pattern: /^PATCH \/v1\/content\/[^/]+\/classification$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/analyze\/overview$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/analyze\/channel$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/analyze\/competitors$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/analysis\/runs$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/analysis\/history$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/analysis\/runs\/[^/]+$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/exports\/csv$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/exports\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/reports\/center$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/reports\/runs\/[^/]+$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/reports\/runs$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/reports\/templates$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/reports\/templates$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/reports\/templates\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/reports\/schedules$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/reports\/schedules$/, requiredRole: "Analyst" },
  { pattern: /^PATCH \/v1\/reports\/schedules\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/reports\/schedules\/[^/]+\/run$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/feed\/news$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/monitor\/overview$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/monitor\/social\/overview$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/facets$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/accounts$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/posts$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/posts\/[^/]+\/comments$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^PATCH \/v1\/monitor\/social\/comments\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/monitor\/social\/risk$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/charts\/heatmap$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/charts\/scatter$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/charts\/er-breakdown$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/targets\/er$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^PATCH \/v1\/monitor\/social\/targets\/er$/, requiredRole: "Admin" },
  { pattern: /^POST \/v1\/monitor\/social\/hashtags\/backfill$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/monitor\/social\/etl-quality$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/export\\.xlsx$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/monitor\/social\/runs$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/monitor\/social\/runs$/, requiredRole: "SocialOverviewViewer" },
  { pattern: /^GET \/v1\/monitor\/social\/settings$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/monitor\/social\/settings$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/monitor\/incidents$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/monitor\/incidents\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/monitor\/incidents\/[^/]+\/notes$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/monitor\/incidents\/[^/]+\/notes$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/monitor\/incidents\/evaluate$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/meta$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/connectors$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/connectors\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/connectors\/[^/]+\/sync$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/connectors\/[^/]+\/runs$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/config\/accounts$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/accounts$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/accounts\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/queries$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/queries$/, requiredRole: "Admin" },
  { pattern: /^POST \/v1\/config\/queries\/preview$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/config\/queries\/[^/]+$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/config\/queries\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^DELETE \/v1\/config\/queries\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/queries\/[^/]+\/revisions$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/queries\/[^/]+\/rollback$/, requiredRole: "Admin" },
  { pattern: /^POST \/v1\/config\/queries\/[^/]+\/dry-run$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/awario\/profiles$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/awario\/profiles$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/awario\/profiles\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/awario\/bindings$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/awario\/bindings$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/awario\/bindings\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/competitors$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/competitors$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/competitors\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/taxonomies\/[^/]+$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/taxonomies\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/taxonomies\/[^/]+\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/audit$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/audit\/export$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/config\/notifications\/recipients$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/config\/notifications\/recipients$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/notifications\/recipients\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/notifications\/status$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/config\/source-scoring\/weights$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/source-scoring\/weights$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/source-scoring\/weights\/[^/]+$/, requiredRole: "Admin" }
];

const publicRoutes = new Set<string>(["GET /v1/health"]);

const routeKey = (event: APIGatewayProxyEventV2): string => {
  const path = getPathWithoutStage(event);
  return `${event.requestContext.http.method.toUpperCase()} ${path}`;
};

const resolveRequiredRole = (route: string): UserRole | null => {
  const rule = roleRules.find((entry) => entry.pattern.test(route));
  return rule?.requiredRole ?? null;
};

const ensureAuthorized = (event: APIGatewayProxyEventV2, route: string) => {
  if (publicRoutes.has(route)) return null;

  const requiredRole = resolveRequiredRole(route);
  if (!requiredRole) return null;

  const hasJwt = Boolean((event.requestContext as { authorizer?: { jwt?: unknown } }).authorizer?.jwt);
  if (!hasJwt) {
    return json(401, { error: "unauthorized", message: "Missing or invalid JWT token" });
  }

  const role = getRole(event);
  if (!hasRole(role, requiredRole)) {
    return json(403, {
      error: "forbidden",
      message: `Role ${requiredRole} required for ${route}`,
      role
    });
  }

  return null;
};

export const main = async (event: APIGatewayProxyEventV2) => {
  const key = routeKey(event);

  const authError = ensureAuthorized(event, key);
  if (authError) return authError;

  if (key === "GET /v1/health") return handleHealth();

  if (key === "GET /v1/terms") return listTerms(event);
  if (key === "POST /v1/terms") return createTerm(event);
  if (key.match(/^PATCH \/v1\/terms\/[^/]+$/)) return updateTerm(event);

  if (key === "POST /v1/ingestion/runs") return createIngestionRun(event);

  if (key === "GET /v1/content") return listContent(event);
  if (key.match(/^PATCH \/v1\/content\/[^/]+\/state$/)) return updateContentState(event);
  if (key === "POST /v1/content/bulk/state") return bulkUpdateContentState(event);
  if (key.match(/^PATCH \/v1\/content\/[^/]+\/classification$/)) return updateClassification(event);

  if (key === "GET /v1/analyze/overview") return getAnalyzeOverview();
  if (key === "GET /v1/analyze/channel") return getAnalyzeChannel(event);
  if (key === "GET /v1/analyze/competitors") return getAnalyzeCompetitors(event);

  if (key === "POST /v1/analysis/runs") return createAnalysisRun(event);
  if (key === "GET /v1/analysis/history") return listAnalysisHistory(event);
  if (key.match(/^GET \/v1\/analysis\/runs\/[^/]+$/)) return getAnalysisRun(event);

  if (key === "POST /v1/exports/csv") return createCsvExport(event);
  if (key.match(/^GET \/v1\/exports\/[^/]+$/)) return getCsvExport(event);
  if (key === "GET /v1/reports/center") return listReportsCenter(event);
  if (key.match(/^GET \/v1\/reports\/runs\/[^/]+$/)) return getReportRun(event);
  if (key === "POST /v1/reports/runs") return createReportRun(event);
  if (key === "GET /v1/reports/templates") return listReportTemplates(event);
  if (key === "POST /v1/reports/templates") return createReportTemplate(event);
  if (key.match(/^PATCH \/v1\/reports\/templates\/[^/]+$/)) return patchReportTemplate(event);
  if (key === "GET /v1/reports/schedules") return listReportSchedules(event);
  if (key === "POST /v1/reports/schedules") return createReportSchedule(event);
  if (key.match(/^PATCH \/v1\/reports\/schedules\/[^/]+$/)) return patchReportSchedule(event);
  if (key.match(/^POST \/v1\/reports\/schedules\/[^/]+\/run$/)) return triggerReportScheduleRun(event);
  if (key === "GET /v1/feed/news") return getNewsFeed(event);
  if (key === "GET /v1/monitor/overview") return getMonitorOverview();
  if (key === "GET /v1/monitor/social/overview") return getMonitorSocialOverview(event);
  if (key === "GET /v1/monitor/social/facets") return getMonitorSocialFacets(event);
  if (key === "GET /v1/monitor/social/accounts") return getMonitorSocialAccounts(event);
  if (key === "GET /v1/monitor/social/posts") return listMonitorSocialPosts(event);
  if (key.match(/^GET \/v1\/monitor\/social\/posts\/[^/]+\/comments$/)) return listMonitorSocialPostComments(event);
  if (key.match(/^PATCH \/v1\/monitor\/social\/comments\/[^/]+$/)) return patchMonitorSocialComment(event);
  if (key === "GET /v1/monitor/social/risk") return getMonitorSocialRisk(event);
  if (key === "GET /v1/monitor/social/charts/heatmap") return getMonitorSocialHeatmap(event);
  if (key === "GET /v1/monitor/social/charts/scatter") return getMonitorSocialScatter(event);
  if (key === "GET /v1/monitor/social/charts/er-breakdown") return getMonitorSocialErBreakdown(event);
  if (key === "GET /v1/monitor/social/targets/er") return getMonitorSocialErTargets(event);
  if (key === "PATCH /v1/monitor/social/targets/er") return patchMonitorSocialErTargets(event);
  if (key === "POST /v1/monitor/social/hashtags/backfill") return postMonitorSocialHashtagBackfill(event);
  if (key === "GET /v1/monitor/social/etl-quality") return getMonitorSocialEtlQuality(event);
  if (key === "GET /v1/monitor/social/export.xlsx") return getMonitorSocialExportXlsx(event);
  if (key === "POST /v1/monitor/social/runs") return createMonitorSocialRun(event);
  if (key === "GET /v1/monitor/social/runs") return listMonitorSocialRuns(event);
  if (key === "GET /v1/monitor/social/settings") return getMonitorSocialSettings();
  if (key === "PATCH /v1/monitor/social/settings") return patchMonitorSocialSettings(event);
  if (key === "GET /v1/monitor/incidents") return listMonitorIncidents(event);
  if (key === "POST /v1/monitor/incidents/evaluate") return evaluateMonitorIncidents(event);
  if (key.match(/^PATCH \/v1\/monitor\/incidents\/[^/]+$/)) return patchMonitorIncident(event);
  if (key.match(/^GET \/v1\/monitor\/incidents\/[^/]+\/notes$/)) return getMonitorIncidentNotes(event);
  if (key.match(/^POST \/v1\/monitor\/incidents\/[^/]+\/notes$/)) return createMonitorIncidentNote(event);
  if (key === "GET /v1/meta") return getMeta();
  if (key === "GET /v1/connectors") return listConnectors(event);
  if (key.match(/^PATCH \/v1\/connectors\/[^/]+$/)) return patchConnector(event);
  if (key.match(/^POST \/v1\/connectors\/[^/]+\/sync$/)) return triggerConnectorSync(event);
  if (key.match(/^GET \/v1\/connectors\/[^/]+\/runs$/)) return listConnectorRuns(event);
  if (key === "GET /v1/config/accounts") return listConfigAccounts(event);
  if (key === "POST /v1/config/accounts") return createConfigAccount(event);
  if (key.match(/^PATCH \/v1\/config\/accounts\/[^/]+$/)) return patchConfigAccount(event);
  if (key === "GET /v1/config/queries") return listConfigQueries(event);
  if (key === "POST /v1/config/queries") return createConfigQuery(event);
  if (key === "POST /v1/config/queries/preview") return previewConfigQuery(event);
  if (key.match(/^GET \/v1\/config\/queries\/[^/]+\/revisions$/)) return listConfigQueryRevisions(event);
  if (key.match(/^POST \/v1\/config\/queries\/[^/]+\/rollback$/)) return rollbackConfigQuery(event);
  if (key.match(/^POST \/v1\/config\/queries\/[^/]+\/dry-run$/)) return dryRunConfigQuery(event);
  if (key.match(/^GET \/v1\/config\/queries\/[^/]+$/)) return getConfigQuery(event);
  if (key.match(/^PATCH \/v1\/config\/queries\/[^/]+$/)) return patchConfigQuery(event);
  if (key.match(/^DELETE \/v1\/config\/queries\/[^/]+$/)) return deleteConfigQuery(event);
  if (key === "GET /v1/config/awario/profiles") return listAwarioProfiles(event);
  if (key === "POST /v1/config/awario/profiles") return createAwarioProfile(event);
  if (key.match(/^PATCH \/v1\/config\/awario\/profiles\/[^/]+$/)) return patchAwarioProfile(event);
  if (key === "GET /v1/config/awario/bindings") return listAwarioBindings(event);
  if (key === "POST /v1/config/awario/bindings") return createAwarioBinding(event);
  if (key.match(/^PATCH \/v1\/config\/awario\/bindings\/[^/]+$/)) return patchAwarioBinding(event);
  if (key === "GET /v1/config/competitors") return listConfigCompetitors(event);
  if (key === "POST /v1/config/competitors") return createConfigCompetitor(event);
  if (key.match(/^PATCH \/v1\/config\/competitors\/[^/]+$/)) return patchConfigCompetitor(event);
  if (key.match(/^GET \/v1\/config\/taxonomies\/[^/]+$/)) return listTaxonomies(event);
  if (key.match(/^POST \/v1\/config\/taxonomies\/[^/]+$/)) return createTaxonomy(event);
  if (key.match(/^PATCH \/v1\/config\/taxonomies\/[^/]+\/[^/]+$/)) return patchTaxonomy(event);
  if (key === "GET /v1/config/audit") return listConfigAudit(event);
  if (key === "POST /v1/config/audit/export") return exportConfigAudit(event);
  if (key === "GET /v1/config/notifications/recipients") return listNotificationRecipients(event);
  if (key === "POST /v1/config/notifications/recipients") return createNotificationRecipient(event);
  if (key.match(/^PATCH \/v1\/config\/notifications\/recipients\/[^/]+$/)) return patchNotificationRecipient(event);
  if (key === "GET /v1/config/notifications/status") return getNotificationStatus(event);
  if (key === "GET /v1/config/source-scoring/weights") return listSourceScoringWeights(event);
  if (key === "POST /v1/config/source-scoring/weights") return createSourceScoringWeight(event);
  if (key.match(/^PATCH \/v1\/config\/source-scoring\/weights\/[^/]+$/)) return patchSourceScoringWeight(event);

  return json(404, {
    error: "not_found",
    message: "Route not found",
    route: key
  });
};
