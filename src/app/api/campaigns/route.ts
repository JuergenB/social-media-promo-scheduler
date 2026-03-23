import { NextRequest, NextResponse } from "next/server";
import { listRecords, createRecord } from "@/lib/airtable/client";
import type { Campaign } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  URL: string;
  Type: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  "Editorial Direction": string;
  Status: string;
  "Created At": string;
  "Created By": string;
}

export async function GET() {
  try {
    const records = await listRecords<CampaignFields>("Campaigns", {
      sort: [{ field: "Created At", direction: "desc" }],
    });

    const campaigns: Campaign[] = records.map((r) => ({
      id: r.id,
      name: r.fields.Name || "",
      url: r.fields.URL || "",
      type: r.fields.Type as Campaign["type"],
      brandIds: r.fields.Brand || [],
      durationDays: r.fields["Duration Days"] || 0,
      distributionBias: r.fields["Distribution Bias"] as Campaign["distributionBias"],
      editorialDirection: r.fields["Editorial Direction"] || "",
      status: r.fields.Status as Campaign["status"],
      createdAt: r.fields["Created At"] || "",
      createdBy: r.fields["Created By"] || "",
    }));

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Campaign creation request:", body);

    const record = await createRecord("Campaigns", {
      Name: body.name || "",
      URL: body.url,
      Type: body.type,
      Brand: body.brandId ? [body.brandId] : [],
      "Duration Days": body.durationDays,
      "Distribution Bias": body.distributionBias || "Front-loaded",
      "Editorial Direction": body.editorialDirection || "",
      Status: "Draft",
      "Created At": new Date().toISOString(),
      "Created By": body.createdBy || "",
    });

    return NextResponse.json({ campaign: record }, { status: 201 });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
