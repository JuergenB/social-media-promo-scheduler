import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLate } from "./use-late";
import { useBrand } from "@/lib/brand-context";
import { useAppStore } from "@/stores";
import { useEffect } from "react";

export const profileKeys = {
  all: (brandId?: string) => ["profiles", brandId ?? "default"] as const,
  detail: (id: string) => ["profiles", "detail", id] as const,
};

/**
 * Hook to fetch all profiles
 */
export function useProfiles() {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const { defaultProfileId, setDefaultProfileId } = useAppStore();

  const query = useQuery({
    queryKey: profileKeys.all(brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.profiles.listProfiles();
      if (error) throw error;
      return data;
    },
    enabled: !!late,
  });

  // Auto-set default profile if not set
  useEffect(() => {
    if (query.data?.profiles?.length && !defaultProfileId) {
      setDefaultProfileId(query.data.profiles[0]._id);
    }
  }, [query.data, defaultProfileId, setDefaultProfileId]);

  return query;
}

/**
 * Hook to get the current profile ID (from store or first profile)
 */
export function useCurrentProfileId(): string | undefined {
  const { defaultProfileId } = useAppStore();
  const { data } = useProfiles();
  return defaultProfileId || data?.profiles?.[0]?._id;
}

/**
 * Hook to fetch a single profile
 */
export function useProfile(profileId: string) {
  const late = useLate();

  return useQuery({
    queryKey: profileKeys.detail(profileId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.profiles.getProfile({
        path: { profileId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!late && !!profileId,
  });
}

/**
 * Hook to create a profile
 */
export function useCreateProfile() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.profiles.createProfile({
        body: { name },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

/**
 * Hook to update a profile
 */
export function useUpdateProfile() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      name,
      timezone,
    }: {
      profileId: string;
      name?: string;
      timezone?: string;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.profiles.updateProfile({
        path: { profileId },
        body: { name, timezone },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { profileId }) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(profileId) });
    },
  });
}
