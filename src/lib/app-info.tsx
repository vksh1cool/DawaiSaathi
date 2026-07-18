"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api-client";

export type AppInfo = {
  demoMode: boolean;
  telephonyEnabled: boolean;
  hasHousehold: boolean;
  authMode?: "access_gate" | "supabase";
  signedIn?: boolean;
  tenantRuntimeReady?: boolean;
  phoneAuthEnabled?: boolean;
};

const AppInfoContext = createContext<{
  info: AppInfo | null;
  unavailable: boolean;
  /** Resolves only after the new flags have been read and stored. */
  refresh: () => Promise<AppInfo | null>;
}>({ info: null, unavailable: false, refresh: async () => null });

export function AppInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async (): Promise<AppInfo | null> => {
    try {
      const next = await apiGet<AppInfo>("/api/app-info");
      setInfo(next);
      setUnavailable(false);
      return next;
    } catch {
      // Network/server failure is unknown, not proof that onboarding is
      // incomplete. Preserve any last good flags and never redirect a user to
      // onboarding based on a failed bootstrap request.
      setUnavailable(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AppInfoContext.Provider value={{ info, unavailable, refresh }}>{children}</AppInfoContext.Provider>
  );
}

export function useAppInfo() {
  return useContext(AppInfoContext);
}
