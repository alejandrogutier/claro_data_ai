import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getPathWithoutStage, json } from "../core/http";
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
import { createCsvExport } from "../routes/v1/exports";
import { getMeta } from "../routes/v1/meta";

const routeKey = (event: APIGatewayProxyEventV2): string => {
  const path = getPathWithoutStage(event);
  return `${event.requestContext.http.method.toUpperCase()} ${path}`;
};

export const main = async (event: APIGatewayProxyEventV2) => {
  const key = routeKey(event);

  if (key === "GET /v1/health") return handleHealth();

  if (key === "GET /v1/terms") return listTerms();
  if (key === "POST /v1/terms") return createTerm(event);
  if (key.match(/^PATCH \/v1\/terms\/[^/]+$/)) return updateTerm(event);

  if (key === "POST /v1/ingestion/runs") return createIngestionRun(event);

  if (key === "GET /v1/content") return listContent();
  if (key.match(/^PATCH \/v1\/content\/[^/]+\/state$/)) return updateContentState(event);
  if (key === "POST /v1/content/bulk/state") return bulkUpdateContentState(event);
  if (key.match(/^PATCH \/v1\/content\/[^/]+\/classification$/)) return updateClassification(event);

  if (key === "POST /v1/analysis/runs") return createAnalysisRun(event);
  if (key === "GET /v1/analysis/history") return listAnalysisHistory();

  if (key === "POST /v1/exports/csv") return createCsvExport(event);
  if (key === "GET /v1/meta") return getMeta();

  return json(404, {
    error: "not_found",
    message: "Route not found",
    route: key
  });
};
