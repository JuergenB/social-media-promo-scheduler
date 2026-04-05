"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { Brand } from "@/lib/airtable/types";
import { useAppStore } from "@/stores";

const BRAND_COOKIE_NAME = "polywiz-brand";

function getBrandFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${BRAND_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setBrandCookie(brandId: string) {
  // 90-day expiry, SameSite=Lax for SSR compatibility
  const maxAge = 90 * 24 * 60 * 60;
  document.cookie = `${BRAND_COOKIE_NAME}=${encodeURIComponent(brandId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

interface BrandContextValue {
  currentBrand: Brand | null;
  brands: Brand[];
  isLoading: boolean;
  switchBrand: (brandId: string) => void;
}

const BrandContext = createContext<BrandContextValue>({
  currentBrand: null,
  brands: [],
  isLoading: true,
  switchBrand: () => {},
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: session, status: sessionStatus } = useSession();
  const isSessionReady = sessionStatus === "authenticated";
  const allowedBrandIds = session?.user?.allowedBrandIds as string[] | undefined;
  const defaultBrandId = session?.user?.defaultBrandId as string | null | undefined;
  const isSuperAdmin = session?.user?.role === "super-admin";

  // Only fetch brands once the session is authenticated — the /api/brands
  // endpoint requires a valid session cookie, which isn't available on the
  // first render after login.  Without this gate the query fires before the
  // cookie is set, gets an empty/error response, and the dashboard shows
  // "Select a brand" for up to a minute until a window refocus triggers a
  // refetch.
  const { data, isLoading: isBrandsLoading } = useQuery<{ brands: Brand[] }>({
    queryKey: ["brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands");
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: isSessionReady,
  });

  const allBrands = data?.brands ?? [];

  // Filter brands by user's allowed brands (server already filters, but belt-and-suspenders)
  const brands = isSuperAdmin || !allowedBrandIds?.length
    ? allBrands
    : allBrands.filter((b) => allowedBrandIds.includes(b.id));

  // Initialize brand selection: cookie → session default → first allowed brand
  useEffect(() => {
    if (initialized || brands.length === 0) return;

    const cookieBrandId = getBrandFromCookie();

    // Priority: cookie (if valid) → session default → first brand with profile → first brand
    if (cookieBrandId && brands.some((b) => b.id === cookieBrandId)) {
      setSelectedBrandId(cookieBrandId);
    } else if (defaultBrandId && brands.some((b) => b.id === defaultBrandId)) {
      setSelectedBrandId(defaultBrandId);
      setBrandCookie(defaultBrandId);
    } else {
      const withProfile = brands.find((b) => b.zernioProfileId);
      const fallback = withProfile?.id ?? brands[0].id;
      setSelectedBrandId(fallback);
      setBrandCookie(fallback);
    }

    setInitialized(true);
  }, [brands, defaultBrandId, initialized]);

  const currentBrand =
    brands.find((b) => b.id === selectedBrandId) ?? brands[0] ?? null;

  // isLoading = true while session is loading OR brands are being fetched for
  // the first time.  This prevents consumers from rendering "no brand" states
  // while the data is still in flight.
  const isLoading = sessionStatus === "loading" || (isSessionReady && isBrandsLoading);

  const queryClient = useQueryClient();
  const { setDefaultProfileId } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();

  const switchBrand = useCallback((brandId: string) => {
    setSelectedBrandId(brandId);
    setBrandCookie(brandId);
    // Clear cached Zernio profile ID — new brand has different profiles
    setDefaultProfileId(null);
    // Invalidate ALL brand-specific queries so they re-fetch for the new brand
    queryClient.invalidateQueries({ queryKey: ["server-api-key"] });
    queryClient.invalidateQueries({ queryKey: ["profiles"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["queue"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["campaign"] });
    queryClient.invalidateQueries({ queryKey: ["feedback"] });

    // Navigate to campaigns list if on a brand-specific page (campaign detail, new campaign, compose)
    // This prevents stale data from the previous brand being shown
    const brandSpecificPaths = ["/dashboard/campaigns/", "/dashboard/compose"];
    const isOnBrandSpecificPage = brandSpecificPaths.some((p) =>
      pathname.startsWith(p)
    );
    if (isOnBrandSpecificPage) {
      router.push("/dashboard/campaigns");
    }
  }, [queryClient, setDefaultProfileId, router, pathname]);

  return (
    <BrandContext.Provider
      value={{ currentBrand, brands, isLoading, switchBrand }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error("useBrand must be used within a BrandProvider");
  }
  return context;
}
