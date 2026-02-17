import type { APIGatewayProxyEventV2 } from "aws-lambda";

export type UserRole = "Admin" | "Analyst" | "Viewer";

const rolePriority: Record<UserRole, number> = {
  Viewer: 1,
  Analyst: 2,
  Admin: 3
};

const parseGroups = (raw: unknown): string[] => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((value) => String(value)).filter(Boolean);
  }

  if (typeof raw !== "string") {
    return [];
  }

  // Cognito can emit groups as "Admin,Analyst" or '["Admin","Analyst"]'
  const normalized = raw.trim();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    const unwrapped = normalized.slice(1, -1).trim();
    if (!unwrapped) return [];

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (Array.isArray(parsed)) return parsed.map((group) => String(group));
    } catch {
      // API Gateway often forwards cognito:groups as "[Admin,Analyst]" (not valid JSON)
      return unwrapped.split(",").map((value) => value.trim()).filter(Boolean);
    }

    return [];
  }

  return normalized.split(",").map((value) => value.trim()).filter(Boolean);
};

export const getRole = (event: APIGatewayProxyEventV2): UserRole => {
  const authorizer = (event.requestContext as {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  }).authorizer;
  const claims = authorizer?.jwt?.claims ?? {};
  const groups = [
    ...parseGroups(claims["cognito:groups"]),
    ...parseGroups(claims.groups),
    ...parseGroups(claims.roles),
    ...parseGroups(claims.role),
    ...parseGroups(claims["custom:role"])
  ];

  if (groups.includes("Admin")) return "Admin";
  if (groups.includes("Analyst")) return "Analyst";
  return "Viewer";
};

export const hasRole = (actual: UserRole, required: UserRole): boolean => rolePriority[actual] >= rolePriority[required];
