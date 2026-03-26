import { NextRequest, NextResponse } from "next/server";
import { listRecords, createRecord } from "@/lib/airtable/client";
import type { GenerationRule } from "@/lib/airtable/types";

interface GenerationRuleFields {
  Name: string;
  "Campaign Type": string[];
  Category: string;
  "Rule Text": string;
  "Prompt Fragment": string;
  Priority: string;
  Active: boolean;
  Source: string;
  "Created from Feedback": string[];
}

function mapFields(record: { id: string; fields: GenerationRuleFields }): GenerationRule {
  const f = record.fields;
  return {
    id: record.id,
    name: f.Name || "",
    campaignTypeIds: f["Campaign Type"] || [],
    category: (f.Category as GenerationRule["category"]) || "Structure",
    ruleText: f["Rule Text"] || "",
    promptFragment: f["Prompt Fragment"] || null,
    priority: (f.Priority as GenerationRule["priority"]) || "Nice-to-have",
    active: f.Active ?? true,
    source: (f.Source as GenerationRule["source"]) || "Manual",
    createdFromFeedbackIds: f["Created from Feedback"] || [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const campaignTypeId = req.nextUrl.searchParams.get("campaignTypeId");

    const options: Parameters<typeof listRecords>[1] = {
      sort: [{ field: "Priority", direction: "asc" }],
    };

    const records = await listRecords<GenerationRuleFields>("Generation Rules", options);
    let rules: GenerationRule[] = records.map(mapFields);

    // Filter by campaign type ID client-side (ARRAYJOIN on linked records
    // produces display names not IDs, so Airtable formula filtering doesn't work)
    if (campaignTypeId) {
      rules = rules.filter((r) => r.campaignTypeIds.includes(campaignTypeId));
    }

    // Sort by priority: Critical > Important > Nice-to-have
    const priorityOrder: Record<string, number> = {
      Critical: 0,
      Important: 1,
      "Nice-to-have": 2,
    };
    rules.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Failed to fetch generation rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch generation rules" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const airtableFields: Record<string, unknown> = {
      Name: body.name,
      "Campaign Type": body.campaignTypeIds || [],
      Category: body.category,
      "Rule Text": body.ruleText,
      Priority: body.priority || "Nice-to-have",
      Active: body.active ?? true,
      Source: body.source || "Manual",
    };

    if (body.promptFragment) {
      airtableFields["Prompt Fragment"] = body.promptFragment;
    }

    const record = await createRecord<GenerationRuleFields>("Generation Rules", airtableFields);
    return NextResponse.json({ rule: mapFields(record) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create generation rule:", error);
    return NextResponse.json(
      { error: "Failed to create generation rule" },
      { status: 500 }
    );
  }
}
