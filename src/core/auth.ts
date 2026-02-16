import type { APIGatewayProxyEventV2 } from "aws-lambda";

export type UserRole = "Admin" | "Analyst" | "Viewer";

const rolePriority: Record<UserRole, number> = {
  Viewer: 1,
  Analyst: 2,
  Admin: 3
};

export const getRole = (event: APIGatewayProxyEventV2): UserRole => {
  const authorizer = (event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, string> } } }).authorizer;
  const groups = authorizer?.jwt?.claims?.["cognito:groups"] ?? "Viewer";

  if (groups.includes("Admin")) return "Admin";
  if (groups.includes("Analyst")) return "Analyst";
  return "Viewer";
};

export const hasRole = (actual: UserRole, required: UserRole): boolean => rolePriority[actual] >= rolePriority[required];
