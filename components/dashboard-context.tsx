"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { organizations, users } from "@/db/schema";

export type DashboardContextValue = {
  user: typeof users.$inferSelect;
  organization: typeof organizations.$inferSelect;
  role: string;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: ReactNode;
}) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const context = useContext(DashboardContext);

  if (!context) {
    throw new Error(
      "useDashboardContext must be used within a DashboardProvider",
    );
  }

  return context;
}
