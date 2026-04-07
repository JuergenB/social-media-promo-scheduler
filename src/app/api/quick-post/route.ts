import { NextRequest, NextResponse } from "next/server";
import { createRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasBrandAccess } from "@/lib/brand-access";
import { format } from "date-fns/format";

/** Map Zernio platform IDs to Airtable single-select display names */
const PLATFORM_TO_AIRTABLE: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  tiktok: "TikTok",
};

/**
 * POST /api/quick-post
 *
 * Creates a "phantom" campaign + empty post for single-post Quick Post flow.
 * The campaign provides the Post -> Campaign -> Brand chain needed by all
 * existing endpoints (generate, publish, etc.).
 */
export async function POST(request: NextRequest) {
  try {
    const access = await getUserBrandAccess();
    const body = await request.json();
    const { brandId, platform, url, editorialDirection, voiceIntensity } = body as {
      brandId: string;
      platform: string;
      url?: string;
      editorialDirection?: string;
      voiceIntensity?: number;
    };

    if (!brandId || !platform) {
      return NextResponse.json(
        { error: "brandId and platform are required" },
        { status: 400 }
      );
    }

    // Validate brand access
    if (access && !hasBrandAccess(access, brandId)) {
      return NextResponse.json(
        { error: "You do not have access to this brand" },
        { status: 403 }
      );
    }

    // Determine Airtable platform display name
    const airtablePlatform = PLATFORM_TO_AIRTABLE[platform.toLowerCase()] || platform;

    // Determine campaign type based on whether a URL is provided
    const campaignType = url?.trim() ? "Blog Post" : "Custom";

    // Create phantom campaign
    const datePart = format(new Date(), "MMM d, yyyy");
    const campaignRecord = await createRecord("Campaigns", {
      Name: `Quick Post: ${datePart}`,
      URL: url?.trim() || "",
      Type: campaignType,
      Brand: [brandId],
      Status: "Draft",
      "Duration Days": 1,
      "Distribution Bias": "Balanced",
      "Editorial Direction": editorialDirection?.trim() || "",
      Tone: voiceIntensity ?? 50,
      "Target Platforms": platform.toLowerCase(),
      "Max Variants Per Platform": 1,
      "Created At": new Date().toISOString(),
    });

    const campaignId = campaignRecord.id;

    // Create empty post
    const postRecord = await createRecord("Posts", {
      Campaign: [campaignId],
      Platform: airtablePlatform,
      Content: "",
      Status: "Pending",
    });

    // Shape response to match Campaign and Post types
    const campaign = {
      id: campaignRecord.id,
      name: (campaignRecord.fields as Record<string, unknown>).Name || "",
      type: campaignType,
      brandIds: [brandId],
      url: url?.trim() || "",
      status: "Draft",
      durationDays: 1,
      distributionBias: "Balanced",
      editorialDirection: editorialDirection?.trim() || "",
      voiceIntensity: voiceIntensity ?? 50,
      targetPlatforms: [platform.toLowerCase()],
      maxVariantsPerPlatform: 1,
    };

    const post = {
      id: postRecord.id,
      campaignIds: [campaignId],
      platform: airtablePlatform,
      content: "",
      status: "Pending",
      title: "",
      mediaUrls: "",
      mediaCaptions: "",
      imageUrl: "",
      shortUrl: "",
      linkUrl: "",
      scheduledDate: "",
      contentVariant: "",
      approvedBy: "",
      approvedAt: "",
      zernioPostId: "",
      notes: "",
      originalMedia: "",
      coverSlideData: "",
    };

    return NextResponse.json({ campaign, post }, { status: 201 });
  } catch (error) {
    console.error("Failed to create quick post:", error);
    return NextResponse.json(
      { error: "Failed to create quick post" },
      { status: 500 }
    );
  }
}
