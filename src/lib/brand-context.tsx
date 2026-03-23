"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { Brand } from "@/lib/airtable/types";

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

  const { data, isLoading } = useQuery<{ brands: Brand[] }>({
    queryKey: ["brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands");
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const brands = data?.brands ?? [];

  // Auto-select brand: prefer one with a Zernio profile (The Intersect), else first
  useEffect(() => {
    if (!selectedBrandId && brands.length > 0) {
      const withProfile = brands.find((b) => b.zernioProfileId);
      setSelectedBrandId(withProfile?.id ?? brands[0].id);
    }
  }, [brands, selectedBrandId]);

  const currentBrand =
    brands.find((b) => b.id === selectedBrandId) ?? brands[0] ?? null;

  const switchBrand = (brandId: string) => {
    setSelectedBrandId(brandId);
  };

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
