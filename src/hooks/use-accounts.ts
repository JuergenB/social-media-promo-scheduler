import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLate } from "./use-late";
import { useCurrentProfileId } from "./use-profiles";
import { useBrand } from "@/lib/brand-context";
import type { Platform } from "@/lib/late-api";

export const accountKeys = {
  all: (brandId?: string) => ["accounts", brandId ?? "default"] as const,
  list: (profileId: string, brandId?: string) => ["accounts", "list", profileId, brandId ?? "default"] as const,
  health: (profileId: string, brandId?: string) => ["accounts", "health", profileId, brandId ?? "default"] as const,
  detail: (accountId: string) => ["accounts", "detail", accountId] as const,
};

export interface Account {
  _id: string;
  platform: Platform;
  username: string;
  displayName?: string;
  isActive: boolean;
  profilePicture?: string;
  profileId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountHealth {
  accountId: string;
  isHealthy: boolean;
  error?: string;
}

/**
 * Hook to fetch all accounts for the current profile
 */
export function useAccounts(profileId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: accountKeys.list(targetProfileId || "", brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.accounts.listAccounts({
        query: { profileId: targetProfileId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to fetch account health status
 */
export function useAccountsHealth(profileId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: accountKeys.health(targetProfileId || "", brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.accounts.getAllAccountsHealth({
        query: { profileId: targetProfileId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to start OAuth connection flow
 */
export function useConnectAccount() {
  const late = useLate();
  const currentProfileId = useCurrentProfileId();

  return useMutation({
    mutationFn: async ({
      platform,
      profileId,
    }: {
      platform: Platform;
      profileId?: string;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const targetProfileId = profileId || currentProfileId;
      if (!targetProfileId) throw new Error("No profile selected");

      const redirectUrl = `${window.location.origin}/callback`;
      const { data, error } = await late.connect.getConnectUrl({
        path: { platform },
        query: {
          profileId: targetProfileId,
          redirect_url: redirectUrl,
          headless: true,
        },
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to delete/disconnect an account
 */
export function useDeleteAccount() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      if (!late) throw new Error("Not authenticated");
      const { error } = await late.accounts.deleteAccount({
        path: { accountId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

/**
 * Hook to get accounts grouped by platform
 */
export function useAccountsByPlatform(profileId?: string) {
  const { data, ...rest } = useAccounts(profileId);

  const accountsByPlatform = data?.accounts?.reduce(
    (acc: Record<Platform, Account[]>, account: Account) => {
      const platform = account.platform as Platform;
      if (!acc[platform]) acc[platform] = [];
      acc[platform].push(account);
      return acc;
    },
    {} as Record<Platform, Account[]>
  );

  return { data: accountsByPlatform, accounts: data?.accounts, ...rest };
}
