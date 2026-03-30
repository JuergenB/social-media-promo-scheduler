import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { createBrandClient } from "@/lib/late-api/client";
import { assembleCarouselPDF } from "@/lib/pdf-carousel";
import { ensureAspectRatio } from "@/lib/image-crop";

interface PostFields {
  Campaign: string[];
  Platform: string;
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Short URL": string;
  "Link URL": string;
  "First Comment": string;
  Status: string;
  "Zernio Post ID": string;
}

interface CampaignFields {
  Name: string;
  Brand: string[];
}

interface BrandFields {
  "Zernio API Key Label": string;
  "Zernio Profile ID": string;
}

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
 * POST /api/posts/[id]/publish
 *
 * Publish a single post to Zernio immediately.
 * Post must be in "Approved" status. Sets scheduledFor to now.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // Fetch post
    const post = await getRecord<PostFields>("Posts", postId);
    const status = post.fields.Status;

    if (status !== "Approved" && status !== "Queued") {
      return NextResponse.json(
        { error: `Post is "${status}" — must be Approved or Queued to publish` },
        { status: 400 }
      );
    }

    if (post.fields["Zernio Post ID"]) {
      return NextResponse.json(
        { error: "Post already published to Zernio" },
        { status: 400 }
      );
    }

    // Resolve brand from campaign
    const campaignId = post.fields.Campaign?.[0];
    if (!campaignId) {
      return NextResponse.json(
        { error: "Post has no campaign linked" },
        { status: 400 }
      );
    }

    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
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

    // Get connected accounts
    const { data: accountsData } = await client.accounts.listAccounts({
      query: { profileId },
    });
    const accounts = accountsData?.accounts || [];

    const platform = PLATFORM_MAP[post.fields.Platform] || post.fields.Platform.toLowerCase();

    const account = accounts.find(
      (a: { platform: string; isActive: boolean }) =>
        a.platform === platform && a.isActive
    );

    if (!account) {
      return NextResponse.json(
        { error: `No active ${post.fields.Platform} account found on Zernio` },
        { status: 400 }
      );
    }

    // Build media items — collect all image URLs first
    const imageUrls: string[] = [];
    if (post.fields["Image URL"]) {
      imageUrls.push(post.fields["Image URL"]);
    }
    if (post.fields["Media URLs"]) {
      for (const url of post.fields["Media URLs"].split("\n")) {
        const trimmed = url.trim();
        if (trimmed && !imageUrls.includes(trimmed)) {
          imageUrls.push(trimmed);
        }
      }
    }

    // Ensure images meet platform aspect ratio requirements (e.g., Instagram max 1.91:1)
    for (let i = 0; i < imageUrls.length; i++) {
      imageUrls[i] = await ensureAspectRatio(imageUrls[i], platform, postId);
    }

    // LinkedIn carousel: multiple images → assemble PDF document
    let mediaItems: Array<{ type: "image" | "document"; url: string }>;
    if (platform === "linkedin" && imageUrls.length > 1) {
      console.log(`[publish-now] LinkedIn carousel: assembling ${imageUrls.length} images into PDF`);
      const pdfBuffer = await assembleCarouselPDF(imageUrls);
      console.log(`[publish-now] PDF assembled: ${(pdfBuffer.length / 1024).toFixed(0)}KB`);

      // Upload PDF via Zernio presign
      const { data: presignData, error: presignError } = await client.media.getMediaPresignedUrl({
        body: {
          filename: `${(campaign.fields.Name || "carousel").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 60)}.pdf`,
          contentType: "application/pdf",
          size: pdfBuffer.length,
        },
      });

      if (presignError || !presignData?.uploadUrl) {
        console.error("[publish-now] Presign error:", presignError);
        return NextResponse.json(
          { error: "Failed to get presigned URL for PDF upload" },
          { status: 502 }
        );
      }

      // PUT the PDF to the presigned URL
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        body: new Uint8Array(pdfBuffer),
        headers: { "Content-Type": "application/pdf" },
      });

      if (!uploadRes.ok) {
        console.error("[publish-now] PDF upload failed:", uploadRes.status);
        return NextResponse.json(
          { error: "Failed to upload PDF to Zernio storage" },
          { status: 502 }
        );
      }

      console.log(`[publish-now] PDF uploaded to: ${presignData.publicUrl}`);
      mediaItems = [{ type: "document", url: presignData.publicUrl! }];
    } else {
      mediaItems = imageUrls.map((url) => ({ type: "image" as const, url }));
    }

    // Publish to Zernio with scheduledFor = 2 minutes from now
    // (Zernio requires a future date; 2 min gives buffer for processing)
    const publishAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const createBody: Record<string, unknown> = {
      content: post.fields.Content || "",
      mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
      platforms: [{
        platform: platform as "instagram" | "twitter" | "linkedin" | "facebook" | "threads" | "bluesky" | "pinterest",
        accountId: (account as { _id: string })._id,
      }],
      scheduledFor: publishAt,
      timezone: "America/New_York",
    };

    // Add first comment for Instagram (hashtags + engagement hook)
    if (post.fields["First Comment"]) {
      createBody.firstComment = post.fields["First Comment"];
    }

    const { data: zernioPost, error: zernioError } = await client.posts.createPost({
      body: createBody as Parameters<typeof client.posts.createPost>[0]["body"],
    });

    if (zernioError) {
      console.error(`[publish-now] Zernio error for ${platform}:`, JSON.stringify(zernioError));
      return NextResponse.json(
        { error: `Zernio error: ${typeof zernioError === "object" ? JSON.stringify(zernioError) : String(zernioError)}` },
        { status: 502 }
      );
    }

    // Update Airtable
    console.log("[publish-now] Zernio response:", JSON.stringify(zernioPost));
    const zp = zernioPost as Record<string, unknown>;
    const zernioPostId = (zp?._id || zp?.id || zp?.postId || (zp?.post as Record<string, unknown>)?._id || (zp?.post as Record<string, unknown>)?.id || "") as string;
    const airtableUpdates: Record<string, unknown> = {
      "Zernio Post ID": zernioPostId,
      "Scheduled Date": publishAt,
      Status: "Scheduled",
    };

    // lnk.bio integration for Instagram (The Intersect only, for now)
    if (platform === "instagram" && post.fields["Short URL"]) {
      try {
        const { createLnkBioEntry } = await import("@/lib/lnk-bio");
        const entryId = await createLnkBioEntry({
          title: (post.fields.Content || "").split("\n")[0].slice(0, 100) || "Link",
          link: post.fields["Short URL"],
          image: post.fields["Image URL"] || "",
          scheduledDate: publishAt,
        });
        if (entryId) {
          airtableUpdates["Lnk.Bio Entry ID"] = entryId;
        }
        console.log(`[publish-now] lnk.bio entry created: ${entryId}`);
      } catch (err) {
        // Non-blocking — Instagram post succeeds even if lnk.bio fails
        console.warn("[publish-now] lnk.bio creation failed:", err);
      }
    }

    await updateRecord("Posts", postId, airtableUpdates);

    return NextResponse.json({
      success: true,
      platform: post.fields.Platform,
      zernioPostId,
      scheduledFor: publishAt,
    });
  } catch (error) {
    console.error("Failed to publish post:", error);
    return NextResponse.json(
      { error: "Failed to publish post" },
      { status: 500 }
    );
  }
}
