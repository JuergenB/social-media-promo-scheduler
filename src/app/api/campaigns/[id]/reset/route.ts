import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord, listRecords } from "@/lib/airtable/client";
import { deleteShortLinks } from "@/lib/short-io";

interface CampaignFields {
  Status: string;
  Brand: string[];
}

interface PostFields {
  Campaign: string[];
  "Short URL": string;
}

interface BrandFields {
  "Short Domain": string;
  "Short API Key Label": string;
}

/**
 * POST /api/campaigns/[id]/reset
 *
 * Reset a campaign to Draft status by deleting all generated posts
 * (and their Short.io links) and reverting the status.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const campaign = await getRecord<CampaignFields>("Campaigns", id);
    const status = campaign.fields.Status;

    // Only allow reset from Review, Generating, Scraping, or Failed
    const resettableStatuses = ["Review", "Generating", "Scraping", "Failed"];
    if (!resettableStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Cannot reset a campaign in "${status}" status. Only Review, Generating, Scraping, or Failed campaigns can be reset.` },
        { status: 400 }
      );
    }

    // Resolve brand for Short.io key
    let brand: { shortDomain?: string | null; shortApiKeyLabel?: string | null } | undefined;
    const brandId = campaign.fields.Brand?.[0];
    if (brandId) {
      try {
        const brandRecord = await getRecord<BrandFields>("Brands", brandId);
        brand = {
          shortDomain: brandRecord.fields["Short Domain"] || null,
          shortApiKeyLabel: brandRecord.fields["Short API Key Label"] || null,
        };
      } catch { /* fall back to global Short.io config */ }
    }

    // Delete all linked posts
    const allPosts = await listRecords<PostFields>("Posts", {});
    const linkedPosts = allPosts.filter(
      (r) => r.fields.Campaign && r.fields.Campaign.includes(id)
    );

    // Collect short URLs for cleanup
    const shortUrls = linkedPosts
      .map((p) => p.fields["Short URL"])
      .filter(Boolean);

    // Delete Short.io links
    if (shortUrls.length > 0) {
      const deleted = await deleteShortLinks(shortUrls, brand);
      console.log(`[reset] Deleted ${deleted}/${shortUrls.length} Short.io links`);
    }

    // Delete Airtable post records
    for (const post of linkedPosts) {
      await deleteRecord("Posts", post.id);
    }

    // Reset campaign status to Draft
    await updateRecord("Campaigns", id, { Status: "Draft" });

    return NextResponse.json({
      success: true,
      deletedPosts: linkedPosts.length,
      deletedShortLinks: shortUrls.length,
    });
  } catch (error) {
    console.error("Failed to reset campaign:", error);
    return NextResponse.json(
      { error: "Failed to reset campaign" },
      { status: 500 }
    );
  }
}
