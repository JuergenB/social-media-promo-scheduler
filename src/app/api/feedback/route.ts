import { NextRequest, NextResponse } from "next/server";
import { listRecords, createRecord } from "@/lib/airtable/client";
import type { FeedbackLogEntry } from "@/lib/airtable/types";

interface FeedbackLogFields {
  Summary: string;
  Campaign: string[];
  Post: string[];
  "Campaign Type": string[];
  "Issue Category": string[];
  Description: string;
  Severity: string;
  Resolution: string;
  "Resolved By Rule": string[];
  "Created Time"?: string;
}

function mapFields(record: { id: string; createdTime: string; fields: FeedbackLogFields }): FeedbackLogEntry & { createdAt: string } {
  const f = record.fields;
  return {
    id: record.id,
    summary: f.Summary || "",
    campaignIds: f.Campaign || [],
    postIds: f.Post || [],
    campaignTypeIds: f["Campaign Type"] || [],
    issueCategories: (f["Issue Category"] || []) as FeedbackLogEntry["issueCategories"],
    description: f.Description || "",
    severity: (f.Severity as FeedbackLogEntry["severity"]) || "Minor",
    resolution: (f.Resolution as FeedbackLogEntry["resolution"]) || "Pending",
    resolvedByRuleIds: f["Resolved By Rule"] || [],
    createdAt: record.createdTime,
  };
}

export async function GET(req: NextRequest) {
  try {
    const campaignTypeId = req.nextUrl.searchParams.get("campaignTypeId");

    // Build filter: last 90 days + optional campaign type filter
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split("T")[0];

    const records = await listRecords<FeedbackLogFields>("Feedback Log", {
      filterByFormula: `IS_AFTER(CREATED_TIME(), "${dateStr}")`,
      sort: [{ field: "Created Time", direction: "desc" }],
    });

    // Filter by campaign type ID client-side (ARRAYJOIN on linked records
    // produces display names not IDs, so formula filtering doesn't work)
    let entries = records.map(mapFields);
    if (campaignTypeId) {
      entries = entries.filter((e) => e.campaignTypeIds.includes(campaignTypeId));
    }
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Failed to fetch feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const airtableFields: Record<string, unknown> = {
      Summary: body.summary,
      "Issue Category": body.issueCategories || [],
      Description: body.description || "",
      Severity: body.severity || "Minor",
      Resolution: "Pending",
    };

    if (body.campaignIds?.length) {
      airtableFields["Campaign"] = body.campaignIds;
    }
    if (body.postIds?.length) {
      airtableFields["Post"] = body.postIds;
    }
    if (body.campaignTypeIds?.length) {
      airtableFields["Campaign Type"] = body.campaignTypeIds;
    }

    const record = await createRecord<FeedbackLogFields>("Feedback Log", airtableFields);
    return NextResponse.json({ entry: mapFields(record) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create feedback:", error);
    return NextResponse.json(
      { error: "Failed to create feedback" },
      { status: 500 }
    );
  }
}
