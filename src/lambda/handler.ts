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
import { createAnalysisRun, listAnalysisHistory } from "../routes/v1/analysis";
import { createCsvExport, getCsvExport } from "../routes/v1/exports";
import { getMeta } from "../routes/v1/meta";
import { getNewsFeed } from "../routes/v1/feed";
import {
  createConfigAccount,
  createConfigCompetitor,
  createTaxonomy,
  exportConfigAudit,
  listConfigAccounts,
  listConfigAudit,
  listConfigCompetitors,
  listConnectors,
  listConnectorRuns,
  listTaxonomies,
  patchConfigAccount,
  patchConfigCompetitor,
  patchConnector,
  patchTaxonomy,
  triggerConnectorSync
} from "../routes/v1/config";

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
  { pattern: /^POST \/v1\/analysis\/runs$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/analysis\/history$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/exports\/csv$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/exports\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/feed\/news$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/meta$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/connectors$/, requiredRole: "Viewer" },
  { pattern: /^PATCH \/v1\/connectors\/[^/]+$/, requiredRole: "Analyst" },
  { pattern: /^POST \/v1\/connectors\/[^/]+\/sync$/, requiredRole: "Analyst" },
  { pattern: /^GET \/v1\/connectors\/[^/]+\/runs$/, requiredRole: "Viewer" },
  { pattern: /^GET \/v1\/config\/accounts$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/accounts$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/accounts\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/competitors$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/competitors$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/competitors\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/taxonomies\/[^/]+$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/taxonomies\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^PATCH \/v1\/config\/taxonomies\/[^/]+\/[^/]+$/, requiredRole: "Admin" },
  { pattern: /^GET \/v1\/config\/audit$/, requiredRole: "Viewer" },
  { pattern: /^POST \/v1\/config\/audit\/export$/, requiredRole: "Analyst" }
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

  if (key === "POST /v1/analysis/runs") return createAnalysisRun(event);
  if (key === "GET /v1/analysis/history") return listAnalysisHistory();

  if (key === "POST /v1/exports/csv") return createCsvExport(event);
  if (key.match(/^GET \/v1\/exports\/[^/]+$/)) return getCsvExport(event);
  if (key === "GET /v1/feed/news") return getNewsFeed(event);
  if (key === "GET /v1/meta") return getMeta();
  if (key === "GET /v1/connectors") return listConnectors(event);
  if (key.match(/^PATCH \/v1\/connectors\/[^/]+$/)) return patchConnector(event);
  if (key.match(/^POST \/v1\/connectors\/[^/]+\/sync$/)) return triggerConnectorSync(event);
  if (key.match(/^GET \/v1\/connectors\/[^/]+\/runs$/)) return listConnectorRuns(event);
  if (key === "GET /v1/config/accounts") return listConfigAccounts(event);
  if (key === "POST /v1/config/accounts") return createConfigAccount(event);
  if (key.match(/^PATCH \/v1\/config\/accounts\/[^/]+$/)) return patchConfigAccount(event);
  if (key === "GET /v1/config/competitors") return listConfigCompetitors(event);
  if (key === "POST /v1/config/competitors") return createConfigCompetitor(event);
  if (key.match(/^PATCH \/v1\/config\/competitors\/[^/]+$/)) return patchConfigCompetitor(event);
  if (key.match(/^GET \/v1\/config\/taxonomies\/[^/]+$/)) return listTaxonomies(event);
  if (key.match(/^POST \/v1\/config\/taxonomies\/[^/]+$/)) return createTaxonomy(event);
  if (key.match(/^PATCH \/v1\/config\/taxonomies\/[^/]+\/[^/]+$/)) return patchTaxonomy(event);
  if (key === "GET /v1/config/audit") return listConfigAudit(event);
  if (key === "POST /v1/config/audit/export") return exportConfigAudit(event);

  return json(404, {
    error: "not_found",
    message: "Route not found",
    route: key
  });
};
