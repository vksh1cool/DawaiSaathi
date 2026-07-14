"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api-client";

export type AppInfo = {
  demoMode: boolean;
  telephonyEnabled: boolean;
  hasHousehold: boolean;
};

const AppInfoContext = createContext<{
  info: AppInfo | null;
  refresh: () => void;
}>({ info: null, refresh: () => {} });

export function AppInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);

  const refresh = useCallback(() => {
    apiGet<AppInfo>("/api/app-info")
      .then(setInfo)
      .catch(() => setInfo({ demoMode: false, telephonyEnabled: false, hasHousehold: false }));
  }, []);

  useEffect(() => refresh(), [refresh]);

  return (
    <AppInfoContext.Provider value={{ info, refresh }}>{children}</AppInfoContext.Provider>
  );
}

export function useAppInfo() {
  return useContext(AppInfoContext);
}
