import { NextRequest, NextResponse } from "next/server";
import { updateRecord, deleteRecord } from "@/lib/airtable/client";
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const airtableFields: Record<string, unknown> = {};
    if (body.name !== undefined) airtableFields["Name"] = body.name;
    if (body.campaignTypeIds !== undefined) airtableFields["Campaign Type"] = body.campaignTypeIds;
    if (body.category !== undefined) airtableFields["Category"] = body.category;
    if (body.ruleText !== undefined) airtableFields["Rule Text"] = body.ruleText;
    if (body.promptFragment !== undefined) airtableFields["Prompt Fragment"] = body.promptFragment;
    if (body.priority !== undefined) airtableFields["Priority"] = body.priority;
    if (body.active !== undefined) airtableFields["Active"] = body.active;
    if (body.source !== undefined) airtableFields["Source"] = body.source;

    const record = await updateRecord<GenerationRuleFields>("Generation Rules", id, airtableFields);
    return NextResponse.json({ rule: mapFields(record) });
  } catch (error) {
    console.error("Failed to update generation rule:", error);
    return NextResponse.json(
      { error: "Failed to update generation rule" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteRecord("Generation Rules", id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete generation rule:", error);
    return NextResponse.json(
      { error: "Failed to delete generation rule" },
      { status: 500 }
    );
  }
}
