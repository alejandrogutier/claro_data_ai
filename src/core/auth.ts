import type { APIGatewayProxyEventV2 } from "aws-lambda";

export type UserRole = "Admin" | "Analyst" | "Viewer";
export type AuthPrincipal = {
  sub: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  groups: string[];
  claims: Record<string, unknown>;
};

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
  const claims = getJwtClaims(event);
  const groups = collectGroups(claims);

  if (groups.includes("Admin")) return "Admin";
  if (groups.includes("Analyst")) return "Analyst";
  return "Viewer";
};

const getJwtClaims = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
  const authorizer = (event.requestContext as {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  }).authorizer;
  return authorizer?.jwt?.claims ?? {};
};

const collectGroups = (claims: Record<string, unknown>): string[] => [
  ...parseGroups(claims["cognito:groups"]),
  ...parseGroups(claims.groups),
  ...parseGroups(claims.roles),
  ...parseGroups(claims.role),
  ...parseGroups(claims["custom:role"])
];

const claimString = (claims: Record<string, unknown>, key: string): string | null => {
  const value = claims[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const hasRole = (actual: UserRole, required: UserRole): boolean => rolePriority[actual] >= rolePriority[required];

export const getAuthPrincipal = (event: APIGatewayProxyEventV2): AuthPrincipal => {
  const claims = getJwtClaims(event);
  const groups = collectGroups(claims);
  const role = getRole(event);

  return {
    sub: claimString(claims, "sub"),
    email: claimString(claims, "email"),
    name: claimString(claims, "name") ?? claimString(claims, "cognito:username"),
    role,
    groups,
    claims
  };
};
