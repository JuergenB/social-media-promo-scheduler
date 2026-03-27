import { auth } from "@/auth";
import type { UserRole } from "@/lib/airtable/types";

export interface BrandAccess {
  brandIds: string[];
  isSuperAdmin: boolean;
  role: UserRole;
}

/**
 * Get the current user's brand access from the session.
 * Returns null if not authenticated.
 */
export async function getUserBrandAccess(): Promise<BrandAccess | null> {
  const session = await auth();
  if (!session?.user) return null;

  const role = (session.user.role as UserRole) || "viewer";
  return {
    brandIds: session.user.allowedBrandIds || [],
    isSuperAdmin: role === "super-admin",
    role,
  };
}

/**
 * Whether this user has unrestricted brand access.
 * True for super-admins and users with no brand restrictions
 * (empty brandIds = session predates Users table or user not mapped).
 */
export function hasUnrestrictedAccess(access: BrandAccess): boolean {
  return access.isSuperAdmin || access.brandIds.length === 0;
}

/**
 * Check if a user has access to a specific brand.
 * Super-admins and users with empty brandIds (unmapped) have access to all.
 */
export function hasBrandAccess(access: BrandAccess, brandId: string): boolean {
  return hasUnrestrictedAccess(access) || access.brandIds.includes(brandId);
}

/**
 * Check if a user has access to a campaign's brand.
 * Campaigns have a Brand field which is an array of linked record IDs.
 */
export function hasCampaignAccess(access: BrandAccess, campaignBrandIds: string[]): boolean {
  if (hasUnrestrictedAccess(access)) return true;
  return campaignBrandIds.some((id) => access.brandIds.includes(id));
}
