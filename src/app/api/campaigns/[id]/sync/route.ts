import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import { createBrandClient } from "@/lib/late-api/client";

interface PostFields {
  Campaign: string[];
  Platform: string;
  Status: string;
  "Scheduled Date": string;
  "Zernio Post ID": string;
}

interface CampaignFields {
  Name: string;
  Brand: string[];
}

interface BrandFields {
  "Zernio API Key Label": string;
}

/**
 * POST /api/campaigns/[id]/sync
 *
 * Sync scheduled dates and statuses from Zernio back to Airtable.
 * For each post with a Zernio Post ID, fetches the current state from Zernio
 * and updates Airtable if the scheduled date or status has changed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
    const brandId = campaign.fields.Brand?.[0];
    if (!brandId) {
      return NextResponse.json({ error: "Campaign has no brand assigned" }, { status: 400 });
    }

    const brandRecord = await getRecord<BrandFields>("Brands", brandId);
    const client = createBrandClient({
      zernioApiKeyLabel: brandRecord.fields["Zernio API Key Label"] || null,
    });

    // Fetch all posts for this campaign that have a Zernio Post ID
    const allPosts = await listRecords<PostFields>("Posts", {});
    const campaignPosts = allPosts.filter(
      (p) => p.fields.Campaign?.includes(campaignId) && p.fields["Zernio Post ID"]
    );

    if (campaignPosts.length === 0) {
      return NextResponse.json({ synced: 0, updated: 0, message: "No posts with Zernio IDs to sync" });
    }

    const ZERNIO_STATUS_MAP: Record<string, string> = {
      scheduled: "Scheduled",
      published: "Published",
      failed: "Failed",
      draft: "Draft",
      partial: "Published",
    };

    let updated = 0;
    let errors = 0;
    const changes: Array<{ postId: string; field: string; from: string; to: string }> = [];

    for (const post of campaignPosts) {
      const zernioId = post.fields["Zernio Post ID"];
      try {
        const { data: zernioPost, error: zernioError } = await client.posts.getPost({
          path: { postId: zernioId },
        });

        if (zernioError || !zernioPost) {
          console.warn(`[sync] Failed to fetch Zernio post ${zernioId}:`, zernioError);
          errors++;
          continue;
        }

        // Zernio wraps the post in a `post` property
        const zernioResponse = zernioPost as Record<string, unknown>;
        const zp = ((zernioResponse.post || zernioResponse) as Record<string, unknown>);
        const updates: Record<string, unknown> = {};

        // Sync scheduled date
        const zernioDate = (zp.scheduledFor || zp.scheduledAt || "") as string;
        if (zernioDate && zernioDate !== post.fields["Scheduled Date"]) {
          updates["Scheduled Date"] = zernioDate;
          changes.push({
            postId: post.id,
            field: "Scheduled Date",
            from: post.fields["Scheduled Date"] || "(none)",
            to: zernioDate,
          });
        }

        // Sync status
        const zernioStatus = (zp.status || "") as string;
        const mappedStatus = ZERNIO_STATUS_MAP[zernioStatus.toLowerCase()] || null;
        if (mappedStatus && mappedStatus !== post.fields.Status) {
          updates["Status"] = mappedStatus;
          changes.push({
            postId: post.id,
            field: "Status",
            from: post.fields.Status,
            to: mappedStatus,
          });
        }

        if (Object.keys(updates).length > 0) {
          await updateRecord("Posts", post.id, updates);
          updated++;
        }
      } catch (err) {
        console.error(`[sync] Error syncing post ${post.id} (Zernio: ${zernioId}):`, err);
        errors++;
      }
    }

    console.log(`[sync] Campaign ${campaignId}: synced ${campaignPosts.length} posts, ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      synced: campaignPosts.length,
      updated,
      errors,
      changes,
    });
  } catch (error) {
    console.error("Failed to sync campaign:", error);
    return NextResponse.json(
      { error: "Failed to sync with Zernio" },
      { status: 500 }
    );
  }
}
