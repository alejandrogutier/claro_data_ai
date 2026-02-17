import { appConfig } from "../config";

const PKCE_VERIFIER_KEY = "claro.auth.pkce.verifier";
const PKCE_STATE_KEY = "claro.auth.pkce.state";
const RETURN_TO_KEY = "claro.auth.return_to";

const randomString = (length: number): string => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let output = "";
  for (const byte of bytes) {
    output += charset[byte % charset.length];
  }
  return output;
};

const base64UrlEncode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sha256 = async (value: string): Promise<Uint8Array> => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
};

const buildAuthorizeUrl = async (): Promise<string> => {
  const verifier = randomString(96);
  const state = randomString(32);
  const challenge = base64UrlEncode(await sha256(verifier));

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: appConfig.cognitoClientId,
    redirect_uri: appConfig.cognitoRedirectUri,
    scope: appConfig.cognitoScope,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  return `${appConfig.cognitoDomain}/oauth2/authorize?${params.toString()}`;
};

export const setReturnPath = (path: string): void => {
  if (!path.startsWith("/")) return;
  sessionStorage.setItem(RETURN_TO_KEY, path);
};

export const consumeReturnPath = (): string => {
  const value = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  if (!value || !value.startsWith("/")) return "/app/feed";
  return value;
};

export const redirectToLogin = async (): Promise<void> => {
  const authorizeUrl = await buildAuthorizeUrl();
  window.location.assign(authorizeUrl);
};

export const exchangeCodeForTokens = async (code: string, state: string): Promise<{
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> => {
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

  if (!expectedState || !verifier || expectedState !== state) {
    throw new Error("Invalid OAuth state");
  }

  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: appConfig.cognitoClientId,
    code,
    redirect_uri: appConfig.cognitoRedirectUri,
    code_verifier: verifier
  });

  const response = await fetch(`${appConfig.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const data = (await response.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!response.ok || !data.id_token || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? "Token exchange failed");
  }

  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  };
};

export const buildLogoutUrl = (idToken?: string): string => {
  const params = new URLSearchParams({
    client_id: appConfig.cognitoClientId,
    logout_uri: appConfig.cognitoLogoutUri
  });

  if (idToken) {
    params.set("id_token_hint", idToken);
  }

  return `${appConfig.cognitoDomain}/logout?${params.toString()}`;
};
