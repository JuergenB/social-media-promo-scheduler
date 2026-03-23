import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Late from "@getlatedev/node";

/**
 * Fetch the server-side API key (set via LATE_API_KEY env var).
 * Cached by TanStack Query — fetched once per session.
 */
function useServerApiKey() {
  return useQuery({
    queryKey: ["server-api-key"],
    queryFn: async () => {
      const res = await fetch("/api/auto-auth");
      const data = await res.json();
      return data.apiKey as string | null;
    },
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Hook to get a Late client instance using the server-side API key.
 * Returns null if no API key is available.
 */
export function useLate(): Late | null {
  const { data: apiKey } = useServerApiKey();

  const client = useMemo(() => {
    if (!apiKey) return null;
    return new Late({ apiKey });
  }, [apiKey]);

  return client;
}

/**
 * Hook that throws if no Late client is available.
 * Use this in authenticated pages where you expect the API key to exist.
 */
export function useLateClient(): Late {
  const client = useLate();
  if (!client) {
    throw new Error("Late client not available. Check LATE_API_KEY env var.");
  }
  return client;
}
