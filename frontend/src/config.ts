const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const readEnv = (name: string, fallback = ""): string => {
  const value = (import.meta.env[name] as string | undefined) ?? fallback;
  return value.trim();
};

export const appConfig = {
  apiBaseUrl: normalizeBaseUrl(readEnv("VITE_API_BASE_URL")),
  cognitoDomain: normalizeBaseUrl(readEnv("VITE_COGNITO_DOMAIN")),
  cognitoClientId: readEnv("VITE_COGNITO_CLIENT_ID"),
  cognitoRedirectUri: readEnv("VITE_COGNITO_REDIRECT_URI", "http://localhost:5173/auth/callback"),
  cognitoLogoutUri: readEnv("VITE_COGNITO_LOGOUT_URI", "http://localhost:5173"),
  cognitoScope: readEnv("VITE_COGNITO_SCOPE", "openid email profile")
};

export const hasFrontendConfig = (): boolean =>
  Boolean(appConfig.apiBaseUrl && appConfig.cognitoDomain && appConfig.cognitoClientId && appConfig.cognitoRedirectUri);
