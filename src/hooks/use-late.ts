import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Late from "@getlatedev/node";
import { useBrand } from "@/lib/brand-context";

/**
 * Fetch the Zernio API key for the current brand.
 * Passes brandId to the auto-auth endpoint for per-brand key resolution.
 * Re-fetches when the brand changes.
 */
function useServerApiKey() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id ?? null;

  return useQuery({
    queryKey: ["server-api-key", brandId],
    queryFn: async () => {
      const params = brandId ? `?brandId=${brandId}` : "";
      const res = await fetch(`/api/auto-auth${params}`);
      const data = await res.json();
      return data.apiKey as string | null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — re-validate after brand data may change
    retry: false,
  });
}

/**
 * Hook to get a Late client instance using the current brand's API key.
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
