import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 0 = Sunday, 1 = Monday (matches date-fns weekStartsOn) */
export type WeekStartDay = 0 | 1;

interface AppState {
  // User preferences
  timezone: string;
  defaultProfileId: string | null;
  weekStartsOn: WeekStartDay;

  // UI state
  sidebarOpen: boolean;

  // Actions
  setTimezone: (timezone: string) => void;
  setDefaultProfileId: (profileId: string | null) => void;
  setWeekStartsOn: (day: WeekStartDay) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      defaultProfileId: null,
      weekStartsOn: 0 as WeekStartDay,
      sidebarOpen: true,

      setTimezone: (timezone) => set({ timezone }),
      setDefaultProfileId: (profileId) => set({ defaultProfileId: profileId }),
      setWeekStartsOn: (day) => set({ weekStartsOn: day }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: "polywiz-app",
      partialize: (state) => ({
        timezone: state.timezone,
        defaultProfileId: state.defaultProfileId,
        weekStartsOn: state.weekStartsOn,
      }),
    }
  )
);
