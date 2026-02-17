import { useMemo } from "react";
import { ApiClient } from "./client";
import { appConfig } from "../config";
import { useAuth } from "../auth/AuthContext";

export const useApiClient = () => {
  const { session } = useAuth();

  return useMemo(
    () =>
      new ApiClient(appConfig.apiBaseUrl, () => {
        return session?.idToken ?? null;
      }),
    [session?.idToken]
  );
};
