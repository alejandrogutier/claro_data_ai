import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { notImplemented } from "../../lib/placeholders";
import { getRole, hasRole } from "../../core/auth";
import { json } from "../../core/http";

export const listTerms = () => notImplemented("GET /v1/terms");

export const createTerm = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede crear terminos" });
  }
  return notImplemented("POST /v1/terms");
};

export const updateTerm = (event: APIGatewayProxyEventV2) => {
  const role = getRole(event);
  if (!hasRole(role, "Admin")) {
    return json(403, { error: "forbidden", message: "Solo Admin puede editar terminos" });
  }
  return notImplemented("PATCH /v1/terms/{id}");
};
