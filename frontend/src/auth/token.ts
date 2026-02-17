export type UserRole = "Admin" | "Analyst" | "Viewer";

type JwtClaims = {
  sub?: string;
  email?: string;
  name?: string;
  "cognito:username"?: string;
  "cognito:groups"?: string[] | string;
  groups?: string[] | string;
  exp?: number;
};

type StoredTokens = {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type UserSession = {
  sub: string;
  email: string | null;
  name: string;
  role: UserRole;
  groups: string[];
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

const STORAGE_KEY = "claro.auth.tokens";

const parseGroups = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean);
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
};

const inferRole = (groups: string[]): UserRole => {
  if (groups.includes("Admin")) return "Admin";
  if (groups.includes("Analyst")) return "Analyst";
  return "Viewer";
};

const decodeJwtPayload = (token: string): JwtClaims => {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Invalid JWT format");

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const decoded = atob(padded);
  return JSON.parse(decoded) as JwtClaims;
};

export const clearStoredTokens = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const storeTokens = (tokens: StoredTokens): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
};

export const toUserSession = (tokens: StoredTokens): UserSession => {
  const claims = decodeJwtPayload(tokens.idToken);
  const groups = [
    ...parseGroups(claims["cognito:groups"]),
    ...parseGroups(claims.groups)
  ];
  const role = inferRole(groups);

  return {
    sub: claims.sub ?? "",
    email: claims.email ?? null,
    name: claims.name ?? claims["cognito:username"] ?? claims.email ?? "Usuario Claro",
    role,
    groups,
    idToken: tokens.idToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt
  };
};

export const loadStoredSession = (): UserSession | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredTokens;
    if (!parsed.idToken || !parsed.accessToken || !parsed.expiresAt) {
      clearStoredTokens();
      return null;
    }

    if (Date.now() >= parsed.expiresAt) {
      clearStoredTokens();
      return null;
    }

    const session = toUserSession(parsed);
    if (!session.sub) {
      clearStoredTokens();
      return null;
    }

    return session;
  } catch {
    clearStoredTokens();
    return null;
  }
};

export const buildStoredTokens = (payload: {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}): StoredTokens => ({
  idToken: payload.idToken,
  accessToken: payload.accessToken,
  refreshToken: payload.refreshToken,
  expiresAt: Date.now() + Math.max(1, payload.expiresIn - 30) * 1000
});
