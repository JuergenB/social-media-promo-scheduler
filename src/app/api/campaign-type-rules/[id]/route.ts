import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import type { CampaignTypeRule } from "@/lib/airtable/types";

interface CampaignTypeRuleFields {
  Name: string;
  Slug: string;
  Description: string;
  Icon: string;
  Status: "Active" | "Coming Soon" | "Disabled";
  "Scraper Strategy": string;
  "Scraper Config": string;
  "Content Structure": string;
  "URL Placeholder": string;
  "Sort Order": number;
}

function mapFields(record: { id: string; fields: CampaignTypeRuleFields }): CampaignTypeRule {
  const f = record.fields;
  return {
    id: record.id,
    name: f.Name || "",
    slug: f.Slug || "",
    description: f.Description || "",
    icon: f.Icon || "",
    status: f.Status || "Disabled",
    scraperStrategy: (f["Scraper Strategy"] as CampaignTypeRule["scraperStrategy"]) || "manual",
    scraperConfig: f["Scraper Config"] || null,
    contentStructure: f["Content Structure"] || null,
    urlPlaceholder: f["URL Placeholder"] || null,
    sortOrder: f["Sort Order"] ?? 999,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const record = await getRecord<CampaignTypeRuleFields>("Campaign Type Rules", id);
    return NextResponse.json({ rule: mapFields(record) });
  } catch (error) {
    console.error("Failed to fetch campaign type rule:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign type rule" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Map client field names to Airtable field names
    const airtableFields: Record<string, unknown> = {};
    if (body.description !== undefined) airtableFields["Description"] = body.description;
    if (body.contentStructure !== undefined) airtableFields["Content Structure"] = body.contentStructure;
    if (body.urlPlaceholder !== undefined) airtableFields["URL Placeholder"] = body.urlPlaceholder;
    if (body.status !== undefined) airtableFields["Status"] = body.status;
    if (body.icon !== undefined) airtableFields["Icon"] = body.icon;
    if (body.scraperStrategy !== undefined) airtableFields["Scraper Strategy"] = body.scraperStrategy;
    if (body.scraperConfig !== undefined) airtableFields["Scraper Config"] = body.scraperConfig;

    const record = await updateRecord<CampaignTypeRuleFields>(
      "Campaign Type Rules",
      id,
      airtableFields
    );

    return NextResponse.json({ rule: mapFields(record) });
  } catch (error) {
    console.error("Failed to update campaign type rule:", error);
    return NextResponse.json(
      { error: "Failed to update campaign type rule" },
      { status: 500 }
    );
  }
}
