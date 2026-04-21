import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { cleanupCampaignPosts, CLEANUP_POST_STATUSES } from "@/lib/campaign-post-cleanup";

interface CampaignFields {
  Brand: string[];
  "Archived At": string;
}

/**
 * POST /api/campaigns/[id]/archive
 *
 * Hides a campaign from the default list by setting `Archived At` to now.
 * Body: { cleanupDrafts?: boolean } — when true, also deletes Pending/Dismissed posts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getUserBrandAccess();

    const campaign = await getRecord<CampaignFields>("Campaigns", id);
    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const cleanupDrafts = Boolean(body?.cleanupDrafts);

    const cleanup = cleanupDrafts
      ? await cleanupCampaignPosts(id, { statuses: CLEANUP_POST_STATUSES, logLabel: "archive" })
      : null;

    await updateRecord("Campaigns", id, { "Archived At": new Date().toISOString() });

    return NextResponse.json({ success: true, cleanup });
  } catch (error) {
    console.error("Failed to archive campaign:", error);
    return NextResponse.json({ error: "Failed to archive campaign" }, { status: 500 });
  }
}
