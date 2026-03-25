import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UsageStats {
  planName: string;
  limits: {
    uploads: number;
    profiles: number;
  };
  usage: {
    uploads: number;
    profiles: number;
  };
}

interface AuthState {
  apiKey: string | null;
  usageStats: UsageStats | null;
  isValidating: boolean;
  error: string | null;
  hasHydrated: boolean;
  setApiKey: (key: string | null) => void;
  setUsageStats: (stats: UsageStats | null) => void;
  setIsValidating: (validating: boolean) => void;
  setError: (error: string | null) => void;
  setHasHydrated: (hydrated: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      apiKey: null,
      usageStats: null,
      isValidating: false,
      error: null,
      hasHydrated: false,
      setApiKey: (key) => set({ apiKey: key, error: null }),
      setUsageStats: (stats) => set({ usageStats: stats }),
      setIsValidating: (validating) => set({ isValidating: validating }),
      setError: (error) => set({ error }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      logout: () =>
        set({
          apiKey: null,
          usageStats: null,
          error: null,
        }),
    }),
    {
      name: "polywiz-auth",
      partialize: (state) => ({
        apiKey: state.apiKey,
        usageStats: state.usageStats,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
