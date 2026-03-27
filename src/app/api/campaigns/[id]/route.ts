import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord, listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { deleteShortLinks } from "@/lib/short-io";
import type { Campaign, Post } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  Description: string;
  URL: string;
  Type: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  "Editorial Direction": string;
  "Image URL": string;
  Status: string;
  "Created At": string;
  "Created By": string;
  "Event Date": string;
  "Event Details": string;
  "Additional URLs": string;
  "Target Platforms": string;
  "Max Variants Per Platform": number;
}

interface PostFields {
  Title: string;
  Campaign: string[];
  Platform: string;
  Content: string;
  "Media URLs": string;
  "Image URL": string;
  "Short URL": string;
  "Link URL": string;
  "Scheduled Date": string;
  Status: string;
  "Content Variant": string;
  "Approved By": string;
  "Approved At": string;
  "Zernio Post ID": string;
  Notes: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getUserBrandAccess();

    // Fetch the campaign record
    const record = await getRecord<CampaignFields>("Campaigns", id);

    // Check brand access
    if (access && !hasCampaignAccess(access, record.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    const campaign: Campaign = {
      id: record.id,
      name: record.fields.Name || "",
      description: record.fields.Description || "",
      url: record.fields.URL || "",
      type: record.fields.Type as Campaign["type"],
      brandIds: record.fields.Brand || [],
      durationDays: record.fields["Duration Days"] || 0,
      distributionBias: record.fields["Distribution Bias"] as Campaign["distributionBias"],
      editorialDirection: record.fields["Editorial Direction"] || "",
      imageUrl: record.fields["Image URL"] || "",
      status: record.fields.Status as Campaign["status"],
      createdAt: record.fields["Created At"] || "",
      createdBy: record.fields["Created By"] || "",
      eventDate: record.fields["Event Date"] || undefined,
      eventDetails: record.fields["Event Details"] || undefined,
      additionalUrls: record.fields["Additional URLs"] || undefined,
      targetPlatforms: record.fields["Target Platforms"] ? record.fields["Target Platforms"].split(",") : undefined,
      maxVariantsPerPlatform: record.fields["Max Variants Per Platform"] ?? undefined,
    };

    // Fetch posts linked to this campaign
    // Note: Airtable linked record fields can't be filtered by record ID in formulas,
    // so we fetch all posts and filter in code. For large datasets, use a Lookup field.
    const allPostRecords = await listRecords<PostFields>("Posts", {});
    const postRecords = allPostRecords.filter(
      (r) => r.fields.Campaign && r.fields.Campaign.includes(id)
    );

    const posts: Post[] = postRecords.map((r) => ({
      id: r.id,
      title: r.fields.Title || "",
      campaignIds: r.fields.Campaign || [],
      platform: r.fields.Platform || "",
      content: r.fields.Content || "",
      mediaUrls: r.fields["Media URLs"] || "",
      imageUrl: r.fields["Image URL"] || "",
      shortUrl: r.fields["Short URL"] || "",
      linkUrl: r.fields["Link URL"] || "",
      scheduledDate: r.fields["Scheduled Date"] || "",
      status: (r.fields.Status as Post["status"]) || "Pending",
      contentVariant: r.fields["Content Variant"] || "",
      approvedBy: r.fields["Approved By"] || "",
      approvedAt: r.fields["Approved At"] || "",
      zernioPostId: r.fields["Zernio Post ID"] || "",
      notes: r.fields.Notes || "",
    }));

    return NextResponse.json({ campaign, posts });
  } catch (error) {
    console.error("Failed to fetch campaign:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getUserBrandAccess();

    // Check brand access
    const record = await getRecord<CampaignFields>("Campaigns", id);
    if (access && !hasCampaignAccess(access, record.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Only allow updates to editable fields
    const allowedFields: Record<string, string> = {
      url: "URL",
      type: "Type",
      durationDays: "Duration Days",
      distributionBias: "Distribution Bias",
      editorialDirection: "Editorial Direction",
      eventDate: "Event Date",
      eventDetails: "Event Details",
      additionalUrls: "Additional URLs",
      targetPlatforms: "Target Platforms",
      maxVariantsPerPlatform: "Max Variants Per Platform",
    };

    const fields: Record<string, unknown> = {};
    for (const [key, airtableField] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        fields[airtableField] = body[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await updateRecord("Campaigns", id, fields);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getUserBrandAccess();

    // Check campaign status — only allow delete if not Active/Scheduled
    const campaign = await getRecord<CampaignFields>("Campaigns", id);

    // Check brand access
    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    if (campaign.fields.Status === "Active") {
      return NextResponse.json(
        { error: "Cannot delete an active campaign with scheduled posts. Archive it instead." },
        { status: 400 }
      );
    }

    // Resolve brand for Short.io key
    let brand: { shortDomain?: string | null; shortApiKeyLabel?: string | null } | undefined;
    const brandId = campaign.fields.Brand?.[0];
    if (brandId) {
      try {
        const brandRecord = await getRecord<{ "Short Domain": string; "Short API Key Label": string }>("Brands", brandId);
        brand = {
          shortDomain: brandRecord.fields["Short Domain"] || null,
          shortApiKeyLabel: brandRecord.fields["Short API Key Label"] || null,
        };
      } catch { /* fall back to global Short.io config */ }
    }

    // Delete all linked posts first
    const allPosts = await listRecords<{ Campaign: string[]; "Short URL": string }>("Posts", {});
    const linkedPosts = allPosts.filter(
      (r) => r.fields.Campaign && r.fields.Campaign.includes(id)
    );

    // Clean up Short.io links
    const shortUrls = linkedPosts
      .map((p) => p.fields["Short URL"])
      .filter(Boolean);
    if (shortUrls.length > 0) {
      const deleted = await deleteShortLinks(shortUrls, brand);
      console.log(`[delete] Deleted ${deleted}/${shortUrls.length} Short.io links`);
    }

    for (const post of linkedPosts) {
      await deleteRecord("Posts", post.id);
    }

    // Delete the campaign
    await deleteRecord("Campaigns", id);

    return NextResponse.json({
      success: true,
      deletedPosts: linkedPosts.length,
    });
  } catch (error) {
    console.error("Failed to delete campaign:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
