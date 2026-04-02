import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { schedulePostsAlgorithm, previewSchedule } from "@/lib/scheduling";
import { createBrandClient } from "@/lib/late-api/client";
import { assembleCarouselPDF } from "@/lib/pdf-carousel";
import { ensureAspectRatio } from "@/lib/image-crop";
import { parseMediaItems } from "@/lib/media-items";
import type { DistributionBias, PlatformCadenceConfig } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  Status: string;
  "Event Date": string;
  "Start Date": string;
  "Platform Cadence": string;
}

interface PostFields {
  Campaign: string[];
  Platform: string;
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  Status: string;
  "Scheduled Date": string;
  "Short URL": string;
  "Link URL": string;
  "First Comment": string;
  "Zernio Post ID": string;
}

interface BrandFields {
  "Zernio API Key Label": string;
  "Zernio Profile ID": string;
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
  Reddit: "reddit",
};

/**
 * POST /api/campaigns/[id]/schedule
 *
 * Schedule approved posts: assigns dates AND pushes to Zernio in one step.
 *
 * Query params:
 *   ?preview=true — return the schedule preview without applying
 *
 * Without preview: assigns dates, pushes each post to Zernio, updates
 * status to "Scheduled" only after Zernio confirms. This is the single
 * step that takes posts from Approved → actually scheduled on Zernio.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const isPreview = request.nextUrl.searchParams.get("preview") === "true";
    const postIdsParam = request.nextUrl.searchParams.get("postIds");
    const scopedPostIds = postIdsParam ? new Set(postIdsParam.split(",")) : null;

    // Check brand access
    const access = await getUserBrandAccess();
    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);

    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    const durationDays = campaign.fields["Duration Days"] || 90;
    const bias = (campaign.fields["Distribution Bias"] || "Front-loaded") as DistributionBias;

    // Resolve cadence: campaign-level first, then brand-level, then global defaults
    let cadence: PlatformCadenceConfig | null = null;
    if (campaign.fields["Platform Cadence"]) {
      try {
        cadence = JSON.parse(campaign.fields["Platform Cadence"]) as PlatformCadenceConfig;
      } catch { /* fall through */ }
    }
    if (!cadence) {
      const brandIds = campaign.fields.Brand || [];
      if (brandIds.length > 0) {
        try {
          const brandRecord = await getRecord<{ "Platform Cadence": string }>(
            "Brands",
            brandIds[0]
          );
          const raw = brandRecord.fields["Platform Cadence"];
          if (raw) {
            cadence = JSON.parse(raw) as PlatformCadenceConfig;
          }
        } catch {
          // Fall through to global defaults
        }
      }
    }

    // Start date: use campaign's Start Date if set, otherwise today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    if (campaign.fields["Start Date"]) {
      const campaignStart = new Date(campaign.fields["Start Date"] + "T00:00:00");
      startDate = campaignStart > today ? campaignStart : today;
    } else {
      startDate = today;
    }

    // Fetch all posts for this campaign
    const allPosts = await listRecords<PostFields>("Posts", {});
    const campaignPosts = allPosts.filter(
      (p) => p.fields.Campaign?.includes(campaignId)
    );

    let approvedPosts = campaignPosts.filter((p) => p.fields.Status === "Approved");

    // If specific post IDs were requested, scope to those
    if (scopedPostIds) {
      approvedPosts = approvedPosts.filter((p) => scopedPostIds.has(p.id));
      console.log(`[schedule] Scoped to ${approvedPosts.length} of ${campaignPosts.filter(p => p.fields.Status === "Approved").length} approved posts (${scopedPostIds.size} IDs requested)`);
    }

    if (approvedPosts.length === 0) {
      return NextResponse.json(
        { error: scopedPostIds ? "No approved posts matching the selected filter" : "No approved posts to schedule" },
        { status: 400 }
      );
    }

    // Find already-scheduled dates to avoid collisions
    const alreadyScheduledDates = new Map<string, Set<string>>();
    for (const p of campaignPosts) {
      if ((p.fields.Status === "Scheduled" || p.fields.Status === "Published") && p.fields["Scheduled Date"]) {
        const plat = PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase();
        const dateStr = p.fields["Scheduled Date"].split("T")[0];
        if (!alreadyScheduledDates.has(plat)) alreadyScheduledDates.set(plat, new Set());
        alreadyScheduledDates.get(plat)!.add(dateStr);
      }
    }

    const posts = approvedPosts.map((p) => ({
      id: p.id,
      platform: PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase(),
    }));

    // Generate the schedule
    const slots = schedulePostsAlgorithm({
      posts,
      startDate,
      durationDays,
      bias,
      cadence,
      excludedDates: alreadyScheduledDates,
    });

    if (isPreview) {
      // Preview mode: return schedule summary without applying
      const platformCounts: Record<string, number> = {};
      for (const post of posts) {
        platformCounts[post.platform] = (platformCounts[post.platform] || 0) + 1;
      }

      const preview = previewSchedule({
        platformCounts,
        startDate,
        durationDays,
        bias,
        cadence,
      });

      return NextResponse.json({
        preview: true,
        totalPosts: posts.length,
        durationDays,
        bias,
        weekSummary: preview,
        slots: slots.map((s) => ({
          postId: s.postId,
          platform: s.platform,
          scheduledDate: s.scheduledDate,
        })),
      });
    }

    // ── Apply mode: assign dates + push to Zernio ──────────────

    // Get brand info for Zernio client
    const brandId = campaign.fields.Brand?.[0];
    if (!brandId) {
      return NextResponse.json({ error: "Campaign has no brand assigned" }, { status: 400 });
    }

    const brandRecord = await getRecord<BrandFields>("Brands", brandId);
    const client = createBrandClient({
      zernioApiKeyLabel: brandRecord.fields["Zernio API Key Label"] || null,
    });
    const profileId = brandRecord.fields["Zernio Profile ID"] || "";

    if (!profileId) {
      return NextResponse.json({ error: "Brand has no Zernio Profile ID configured" }, { status: 400 });
    }

    // Get connected accounts
    const { data: accountsData } = await client.accounts.listAccounts({
      query: { profileId },
    });
    const accounts = accountsData?.accounts || [];

    // Build a map from postId → scheduled date
    const slotMap = new Map<string, string>();
    for (const slot of slots) {
      slotMap.set(slot.postId, slot.scheduledDate);
    }

    const results: Array<{ postId: string; platform: string; success: boolean; scheduledDate: string; zernioPostId?: string; error?: string }> = [];

    for (const post of approvedPosts) {
      const scheduledDate = slotMap.get(post.id);
      if (!scheduledDate) continue;

      const platform = PLATFORM_MAP[post.fields.Platform] || post.fields.Platform.toLowerCase();

      // Find matching Zernio account
      const account = accounts.find(
        (a: { platform: string; isActive: boolean }) =>
          a.platform === platform && a.isActive
      );

      if (!account) {
        // No account — still assign the date but mark as failed
        await updateRecord("Posts", post.id, {
          "Scheduled Date": scheduledDate,
        });
        results.push({
          postId: post.id,
          platform,
          scheduledDate,
          success: false,
          error: `No active ${platform} account found`,
        });
        continue;
      }

      try {
        // Build media items
        const postMediaItems = parseMediaItems(post.fields);
        const imageUrls = postMediaItems.map((i) => i.url);

        // Ensure aspect ratios
        for (let i = 0; i < imageUrls.length; i++) {
          const cropped = await ensureAspectRatio(imageUrls[i], platform, post.id);
          if (cropped !== imageUrls[i]) {
            postMediaItems[i] = { ...postMediaItems[i], url: cropped };
            imageUrls[i] = cropped;
          }
        }

        // LinkedIn carousel: multiple images → PDF
        let mediaItems: Array<{ type: "image" | "document"; url: string; filename?: string }>;
        if (platform === "linkedin" && imageUrls.length > 1) {
          const pdfBuffer = await assembleCarouselPDF(postMediaItems);
          const { data: presignData } = await client.media.getMediaPresignedUrl({
            body: {
              filename: `${(campaign.fields.Name || "Carousel").slice(0, 60)}.pdf`,
              contentType: "application/pdf",
              size: pdfBuffer.length,
            },
          });
          if (presignData?.uploadUrl) {
            await fetch(presignData.uploadUrl, {
              method: "PUT",
              body: new Uint8Array(pdfBuffer),
              headers: { "Content-Type": "application/pdf" },
            });
            mediaItems = [{ type: "document", url: presignData.publicUrl!, filename: `${(campaign.fields.Name || "Carousel").slice(0, 60)}.pdf` }];
          } else {
            mediaItems = imageUrls.map((url) => ({ type: "image" as const, url }));
          }
        } else {
          mediaItems = imageUrls.map((url) => ({ type: "image" as const, url }));
        }

        // Create post on Zernio
        const createBody: Record<string, unknown> = {
          content: post.fields.Content || "",
          mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
          platforms: [{
            platform: platform as "instagram" | "twitter" | "linkedin" | "facebook" | "threads" | "bluesky" | "pinterest",
            accountId: (account as { _id: string })._id,
          }],
          scheduledFor: scheduledDate,
          timezone: "America/New_York",
        };

        if (post.fields["First Comment"]) {
          createBody.firstComment = post.fields["First Comment"];
        }

        console.log(`[schedule] Creating Zernio post for ${platform} | airtableId=${post.id} | date=${scheduledDate}`);
        const { data: zernioPost, error: zernioError } = await client.posts.createPost({
          body: createBody as Parameters<typeof client.posts.createPost>[0]["body"],
        });

        if (zernioError) {
          console.error(`[schedule] Zernio error for ${platform}:`, JSON.stringify(zernioError));
          await updateRecord("Posts", post.id, {
            "Scheduled Date": scheduledDate,
          });
          results.push({
            postId: post.id,
            platform,
            scheduledDate,
            success: false,
            error: typeof zernioError === "object" ? JSON.stringify(zernioError) : String(zernioError),
          });
          continue;
        }

        // Success — extract Zernio Post ID with defensive logging
        // Zernio wraps the post in a `post` property: { post: { _id, ... }, message: "..." }
        const zernioResponse = zernioPost as Record<string, unknown>;
        const innerPost = (zernioResponse?.post || zernioResponse) as Record<string, unknown>;
        const zernioPostId = (innerPost?._id || innerPost?.id || zernioResponse?._id || zernioResponse?.id || "") as string;

        console.log(`[schedule] Zernio response for ${platform} post ${post.id}:`, JSON.stringify({
          hasData: !!zernioPost,
          responseKeys: zernioResponse ? Object.keys(zernioResponse) : [],
          innerPostKeys: innerPost ? Object.keys(innerPost) : [],
          extractedId: zernioPostId || "(empty)",
        }));

        if (!zernioPostId) {
          console.error(`[schedule] WARNING: Zernio returned success but no post ID for ${platform} post ${post.id}. Full response:`, JSON.stringify(zernioPost));
        }

        await updateRecord("Posts", post.id, {
          "Scheduled Date": scheduledDate,
          "Zernio Post ID": zernioPostId,
          Status: zernioPostId ? "Scheduled" : "Approved", // Don't mark Scheduled without an ID
        });

        results.push({
          postId: post.id,
          platform,
          scheduledDate,
          success: !!zernioPostId,
          zernioPostId: zernioPostId || undefined,
          error: zernioPostId ? undefined : "Zernio returned no post ID",
        });
      } catch (err) {
        await updateRecord("Posts", post.id, {
          "Scheduled Date": scheduledDate,
        });
        results.push({
          postId: post.id,
          platform,
          scheduledDate,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const missingIds = results.filter((r) => r.success && !r.zernioPostId);

    console.log(`[schedule] Campaign ${campaignId} complete: ${successCount} succeeded, ${failCount} failed, ${missingIds.length} missing Zernio IDs`);
    if (missingIds.length > 0) {
      console.error(`[schedule] CRITICAL: ${missingIds.length} posts marked success but have no Zernio Post ID:`, missingIds.map(r => r.postId));
    }

    // Update campaign status to Active only if we have successes
    if (successCount > 0) {
      await updateRecord("Campaigns", campaignId, { Status: "Active" });
    }

    return NextResponse.json({
      success: failCount === 0,
      scheduledPosts: successCount,
      failedPosts: failCount,
      results,
    });
  } catch (error) {
    console.error("Failed to schedule campaign:", error);
    const message = error instanceof Error ? error.message : "Failed to schedule campaign";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
