import { NextResponse } from "next/server";
import { listRecords } from "@/lib/airtable/client";
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

export async function GET() {
  try {
    const records = await listRecords<CampaignTypeRuleFields>(
      "Campaign Type Rules",
      { sort: [{ field: "Sort Order", direction: "asc" }] }
    );

    const rules: CampaignTypeRule[] = records.map(mapFields);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Failed to fetch campaign type rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign type rules" },
      { status: 500 }
    );
  }
}
