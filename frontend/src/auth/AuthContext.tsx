import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildStoredTokens, clearStoredTokens, loadStoredSession, storeTokens, type UserSession } from "./token";
import { buildLogoutUrl, exchangeCodeForTokens, redirectToLogin, setReturnPath } from "./cognito";

type AuthContextValue = {
  loading: boolean;
  session: UserSession | null;
  login: (returnTo?: string) => Promise<void>;
  logout: () => void;
  handleCallback: (code: string, state: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    setSession(loadStoredSession());
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      login: async (returnTo?: string) => {
        if (returnTo) setReturnPath(returnTo);
        await redirectToLogin();
      },
      logout: () => {
        const idToken = session?.idToken;
        clearStoredTokens();
        setSession(null);
        window.location.assign(buildLogoutUrl(idToken));
      },
      handleCallback: async (code: string, state: string) => {
        const tokens = await exchangeCodeForTokens(code, state);
        const stored = buildStoredTokens(tokens);
        storeTokens(stored);
        setSession(loadStoredSession());
      }
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
