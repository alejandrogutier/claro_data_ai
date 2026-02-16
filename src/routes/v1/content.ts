import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { notImplemented } from "../../lib/placeholders";
import { getRole, hasRole } from "../../core/auth";
import { json } from "../../core/http";

export const listContent = () => notImplemented("GET /v1/content");

export const updateContentState = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("PATCH /v1/content/{id}/state");
};

export const bulkUpdateContentState = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("POST /v1/content/bulk/state");
};

export const updateClassification = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Analyst")) {
    return json(403, { error: "forbidden", message: "Se requiere rol Analyst o Admin" });
  }
  return notImplemented("PATCH /v1/content/{id}/classification");
};
