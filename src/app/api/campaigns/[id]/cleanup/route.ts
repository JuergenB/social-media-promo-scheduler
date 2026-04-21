import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { cleanupCampaignPosts, CLEANUP_POST_STATUSES } from "@/lib/campaign-post-cleanup";

interface CampaignFields {
  Brand: string[];
}

/**
 * POST /api/campaigns/[id]/cleanup
 *
 * Deletes Pending + Dismissed posts from a campaign (keeps Approved/Scheduled/Published/Failed).
 * Cascades Short.io, lnk.bio, and Zernio cleanup on the deleted posts.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getUserBrandAccess();

    const campaign = await getRecord<CampaignFields>("Campaigns", id);
    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await cleanupCampaignPosts(id, {
      statuses: CLEANUP_POST_STATUSES,
      logLabel: "cleanup",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Failed to clean up campaign posts:", error);
    return NextResponse.json({ error: "Failed to clean up campaign posts" }, { status: 500 });
  }
}
