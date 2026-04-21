import { getRecord, deleteRecord, listRecords } from "@/lib/airtable/client";
import { deleteShortLinks } from "@/lib/short-io";
import { deleteLnkBioEntry, resolveCredentials as resolveLnkBioCredentials } from "@/lib/lnk-bio";
import { createBrandClient } from "@/lib/late-api/client";
import type { PostStatus } from "@/lib/airtable/types";

interface CampaignFields {
  Brand: string[];
}

interface PostFields {
  Campaign: string[];
  Status: string;
  "Short URL": string;
  "Zernio Post ID": string;
  "Lnk.Bio Entry ID": string;
}

interface BrandFields {
  "Short Domain": string;
  "Short API Key Label": string;
  "Zernio API Key Label": string;
  "Lnk.Bio Enabled": boolean;
  "Lnk.Bio Client ID Label": string;
  "Lnk.Bio Client Secret Label": string;
}

export interface CampaignPostCleanupResult {
  deletedPosts: number;
  deletedShortLinks: number;
  deletedLnkBioEntries: number;
  deletedZernioPosts: number;
}

/**
 * Delete a subset of a campaign's posts, cascading Short.io / lnk.bio / Zernio cleanup.
 * If `statuses` is omitted, deletes all linked posts. Returns per-resource counts.
 */
export async function cleanupCampaignPosts(
  campaignId: string,
  options?: { statuses?: PostStatus[]; logLabel?: string }
): Promise<CampaignPostCleanupResult> {
  const label = options?.logLabel ?? "cleanup";
  const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);

  let brand: { shortDomain?: string | null; shortApiKeyLabel?: string | null } | undefined;
  let lnkBioCreds: ReturnType<typeof resolveLnkBioCredentials> = null;
  let zernioApiKeyLabel: string | null = null;
  const brandId = campaign.fields.Brand?.[0];
  if (brandId) {
    try {
      const brandRecord = await getRecord<BrandFields>("Brands", brandId);
      brand = {
        shortDomain: brandRecord.fields["Short Domain"] || null,
        shortApiKeyLabel: brandRecord.fields["Short API Key Label"] || null,
      };
      lnkBioCreds = resolveLnkBioCredentials({
        lnkBioEnabled: brandRecord.fields["Lnk.Bio Enabled"],
        lnkBioClientIdLabel: brandRecord.fields["Lnk.Bio Client ID Label"] || null,
        lnkBioClientSecretLabel: brandRecord.fields["Lnk.Bio Client Secret Label"] || null,
      });
      zernioApiKeyLabel = brandRecord.fields["Zernio API Key Label"] || null;
    } catch {
      /* fall through to global config */
    }
  }

  const allPosts = await listRecords<PostFields>("Posts", {});
  let targetPosts = allPosts.filter(
    (r) => r.fields.Campaign && r.fields.Campaign.includes(campaignId)
  );
  if (options?.statuses && options.statuses.length > 0) {
    const allowed = new Set<string>(options.statuses);
    targetPosts = targetPosts.filter((r) => allowed.has(r.fields.Status || "Pending"));
  }

  const shortUrls = targetPosts.map((p) => p.fields["Short URL"]).filter(Boolean);
  let deletedShortLinks = 0;
  if (shortUrls.length > 0) {
    deletedShortLinks = await deleteShortLinks(shortUrls, brand);
    console.log(`[${label}] Deleted ${deletedShortLinks}/${shortUrls.length} Short.io links`);
  }

  let deletedLnkBioEntries = 0;
  if (lnkBioCreds) {
    const postsWithEntries = targetPosts.filter((p) => p.fields["Lnk.Bio Entry ID"]);
    for (const post of postsWithEntries) {
      const entryId = post.fields["Lnk.Bio Entry ID"];
      try {
        const ok = await deleteLnkBioEntry(lnkBioCreds, entryId);
        if (ok) deletedLnkBioEntries++;
      } catch (err) {
        console.warn(`[${label}] Failed to delete lnk.bio entry ${entryId}:`, err);
      }
    }
    if (postsWithEntries.length > 0) {
      console.log(`[${label}] Deleted ${deletedLnkBioEntries}/${postsWithEntries.length} lnk.bio entries`);
    }
  }

  const zernioPostIds = targetPosts.map((p) => p.fields["Zernio Post ID"]).filter(Boolean);
  let deletedZernioPosts = 0;
  if (zernioPostIds.length > 0) {
    const late = createBrandClient({ zernioApiKeyLabel });
    for (const zpid of zernioPostIds) {
      try {
        await late.posts.deletePost({ path: { postId: zpid } });
        deletedZernioPosts++;
      } catch (err) {
        console.warn(`[${label}] Failed to delete Zernio post ${zpid}:`, err);
      }
    }
    console.log(`[${label}] Deleted ${deletedZernioPosts}/${zernioPostIds.length} Zernio posts`);
  }

  for (const post of targetPosts) {
    await deleteRecord("Posts", post.id);
  }

  return {
    deletedPosts: targetPosts.length,
    deletedShortLinks,
    deletedLnkBioEntries,
    deletedZernioPosts,
  };
}

/** Post statuses considered "unapproved / drafts" — safe to delete on cleanup. */
export const CLEANUP_POST_STATUSES: PostStatus[] = ["Pending", "Dismissed"];
