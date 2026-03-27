"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
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

  const { data: session } = useSession();
  const allowedBrandIds = session?.user?.allowedBrandIds as string[] | undefined;
  const defaultBrandId = session?.user?.defaultBrandId as string | null | undefined;
  const isSuperAdmin = session?.user?.role === "super-admin";

  const { data, isLoading } = useQuery<{ brands: Brand[] }>({
    queryKey: ["brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands");
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  const queryClient = useQueryClient();
  const { setDefaultProfileId } = useAppStore();

  const switchBrand = useCallback((brandId: string) => {
    setSelectedBrandId(brandId);
    setBrandCookie(brandId);
    // Clear cached Zernio profile ID — new brand has different profiles
    setDefaultProfileId(null);
    // Invalidate all Zernio-related queries so they re-fetch with the new API key
    queryClient.invalidateQueries({ queryKey: ["server-api-key"] });
    queryClient.invalidateQueries({ queryKey: ["profiles"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["queue"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  }, [queryClient, setDefaultProfileId]);

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
