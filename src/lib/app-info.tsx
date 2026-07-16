"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api-client";

export type AppInfo = {
  demoMode: boolean;
  telephonyEnabled: boolean;
  hasHousehold: boolean;
};

const unavailableInfo: AppInfo = { demoMode: false, telephonyEnabled: false, hasHousehold: false };

const AppInfoContext = createContext<{
  info: AppInfo | null;
  /** Resolves only after the new flags have been read and stored. */
  refresh: () => Promise<AppInfo>;
}>({ info: null, refresh: async () => unavailableInfo });

export function AppInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);

  const refresh = useCallback(async (): Promise<AppInfo> => {
    try {
      const next = await apiGet<AppInfo>("/api/app-info");
      setInfo(next);
      return next;
    } catch {
      setInfo(unavailableInfo);
      return unavailableInfo;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AppInfoContext.Provider value={{ info, refresh }}>{children}</AppInfoContext.Provider>
  );
}

export function useAppInfo() {
  return useContext(AppInfoContext);
}
