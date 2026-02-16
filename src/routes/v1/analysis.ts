import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { notImplemented } from "../../lib/placeholders";
import { getRole, hasRole } from "../../core/auth";
import { json } from "../../core/http";

export const createAnalysisRun = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("POST /v1/analysis/runs");
};

export const listAnalysisHistory = () => notImplemented("GET /v1/analysis/history");
