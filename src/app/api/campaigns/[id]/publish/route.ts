import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { createBrandClient } from "@/lib/late-api/client";

interface CampaignFields {
  Name: string;
  Brand: string[];
  Status: string;
}

interface BrandFields {
  "Zernio API Key Label": string;
  "Zernio Profile ID": string;
}

interface PostFields {
  Campaign: string[];
  Platform: string;
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Scheduled Date": string;
  "Short URL": string;
  "Link URL": string;
  Status: string;
  "Zernio Post ID": string;
}

/** Map Airtable platform names to Zernio platform IDs */
const PLATFORM_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
  YouTube: "youtube",
};

/**
 * POST /api/campaigns/[id]/publish
 *
 * Push all scheduled posts to Zernio for actual publishing.
 * Posts must be in "Scheduled" status with assigned dates.
 *
 * This is the final step — after approval and scheduling.
 * Creates Zernio posts and stores the zernioPostId on each record.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    // Check brand access
    const access = await getUserBrandAccess();
    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);

    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    // Get brand info for Zernio client
    const brandId = campaign.fields.Brand?.[0];
    if (!brandId) {
      return NextResponse.json(
        { error: "Campaign has no brand assigned" },
        { status: 400 }
      );
    }

    const brandRecord = await getRecord<BrandFields>("Brands", brandId);
    const client = createBrandClient({
      zernioApiKeyLabel: brandRecord.fields["Zernio API Key Label"] || null,
    });
    const profileId = brandRecord.fields["Zernio Profile ID"] || "";

    if (!profileId) {
      return NextResponse.json(
        { error: "Brand has no Zernio Profile ID configured" },
        { status: 400 }
      );
    }

    // Get connected accounts to find account IDs per platform
    const { data: accountsData } = await client.accounts.listAccounts({
      query: { profileId },
    });
    const accounts = accountsData?.accounts || [];

    // Fetch scheduled posts for this campaign
    const allPosts = await listRecords<PostFields>("Posts", {});
    const scheduledPosts = allPosts.filter(
      (p) =>
        p.fields.Campaign?.includes(campaignId) &&
        p.fields.Status === "Scheduled" &&
        !p.fields["Zernio Post ID"] // Skip already-pushed posts
    );

    if (scheduledPosts.length === 0) {
      return NextResponse.json(
        { error: "No scheduled posts to publish" },
        { status: 400 }
      );
    }

    const results: Array<{ postId: string; platform: string; success: boolean; zernioPostId?: string; error?: string }> = [];

    for (const post of scheduledPosts) {
      const platform = PLATFORM_MAP[post.fields.Platform] || post.fields.Platform.toLowerCase();

      // Find matching account
      const account = accounts.find(
        (a: { platform: string; isActive: boolean }) =>
          a.platform === platform && a.isActive
      );

      if (!account) {
        results.push({
          postId: post.id,
          platform,
          success: false,
          error: `No active ${platform} account found`,
        });
        continue;
      }

      try {
        // Build media items
        const mediaItems: Array<{ type: "image"; url: string }> = [];
        if (post.fields["Image URL"]) {
          mediaItems.push({ type: "image", url: post.fields["Image URL"] });
        }
        // Add additional carousel images from Media URLs
        if (post.fields["Media URLs"]) {
          for (const url of post.fields["Media URLs"].split("\n")) {
            const trimmed = url.trim();
            if (trimmed && !mediaItems.some((m) => m.url === trimmed)) {
              mediaItems.push({ type: "image", url: trimmed });
            }
          }
        }

        // Create post on Zernio
        const { data: zernioPost, error: zernioError } = await client.posts.createPost({
          body: {
            content: post.fields.Content || "",
            mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
            platforms: [{
              platform: platform as "instagram" | "twitter" | "linkedin" | "facebook" | "threads" | "bluesky" | "pinterest",
              accountId: (account as { _id: string })._id,
            }],
            scheduledFor: post.fields["Scheduled Date"],
            timezone: "America/New_York",
          },
        });

        if (zernioError) {
          console.error(`[publish] Zernio error for ${platform}:`, JSON.stringify(zernioError));
          results.push({
            postId: post.id,
            platform,
            success: false,
            error: typeof zernioError === "object" ? JSON.stringify(zernioError) : String(zernioError),
          });
          continue;
        }

        // Store the Zernio post ID and update status to Published
        const zernioPostId = (zernioPost as { _id?: string })?._id || "";
        await updateRecord("Posts", post.id, {
          "Zernio Post ID": zernioPostId,
          Status: "Published",
        });

        results.push({
          postId: post.id,
          platform,
          success: true,
          zernioPostId,
        });
      } catch (err) {
        results.push({
          postId: post.id,
          platform,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failCount === 0,
      published: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Failed to publish campaign:", error);
    return NextResponse.json(
      { error: "Failed to publish campaign" },
      { status: 500 }
    );
  }
}
