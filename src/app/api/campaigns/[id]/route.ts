import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import type { Campaign, Post } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
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
}

interface PostFields {
  Title: string;
  Campaign: string[];
  Platform: string;
  Content: string;
  "Media URLs": string;
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

    // Fetch the campaign record
    const record = await getRecord<CampaignFields>("Campaigns", id);

    const campaign: Campaign = {
      id: record.id,
      name: record.fields.Name || "",
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
    };

    // Fetch posts linked to this campaign
    const postRecords = await listRecords<PostFields>("Posts", {
      filterByFormula: `FIND("${id}", ARRAYJOIN({Campaign}, ","))`,
      sort: [{ field: "Scheduled Date", direction: "asc" }],
    });

    const posts: Post[] = postRecords.map((r) => ({
      id: r.id,
      title: r.fields.Title || "",
      campaignIds: r.fields.Campaign || [],
      platform: r.fields.Platform || "",
      content: r.fields.Content || "",
      mediaUrls: r.fields["Media URLs"] || "",
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
    const body = await request.json();

    // Only allow updates to editable fields
    const allowedFields: Record<string, string> = {
      url: "URL",
      type: "Type",
      durationDays: "Duration Days",
      distributionBias: "Distribution Bias",
      editorialDirection: "Editorial Direction",
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
