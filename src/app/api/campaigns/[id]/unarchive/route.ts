import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";

interface CampaignFields {
  Brand: string[];
}

/**
 * POST /api/campaigns/[id]/unarchive
 * Clears `Archived At` so the campaign returns to the default list.
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

    await updateRecord("Campaigns", id, { "Archived At": null });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to unarchive campaign:", error);
    return NextResponse.json({ error: "Failed to unarchive campaign" }, { status: 500 });
  }
}
