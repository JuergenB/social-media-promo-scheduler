/**
 * Airtable fetch functions for Campaign Type Rules and Generation Rules tables.
 *
 * These power the dynamic prompt composition pipeline (Phase 2 of Issue #39).
 */

import { listRecords } from "./client";
import type { CampaignTypeRule, GenerationRule } from "./types";

// ── Airtable field shapes ────────────────────────────────────────────────

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

// ── Mappers ──────────────────────────────────────────────────────────────

function mapCampaignTypeRule(record: { id: string; fields: CampaignTypeRuleFields }): CampaignTypeRule {
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

function mapGenerationRule(record: { id: string; fields: GenerationRuleFields }): GenerationRule {
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

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetch a single Campaign Type Rules record by its Name field.
 * Returns null if not found.
 */
export async function getCampaignTypeRule(typeName: string): Promise<CampaignTypeRule | null> {
  const records = await listRecords<CampaignTypeRuleFields>("Campaign Type Rules", {
    filterByFormula: `{Name} = "${typeName}"`,
  });

  if (records.length === 0) return null;
  return mapCampaignTypeRule(records[0]);
}

/**
 * Fetch all active Generation Rules for a given Campaign Type record ID.
 * Returns rules sorted by priority: Critical > Important > Nice-to-have.
 */
export async function getGenerationRules(campaignTypeId: string): Promise<GenerationRule[]> {
  // Fetch all active rules and filter by campaign type ID client-side.
  // ARRAYJOIN on linked records produces display names not IDs,
  // so Airtable formula filtering doesn't work for linked record ID matching.
  const records = await listRecords<GenerationRuleFields>("Generation Rules", {
    filterByFormula: `{Active} = TRUE()`,
  });

  const rules = records
    .map(mapGenerationRule)
    .filter((r) => r.campaignTypeIds.includes(campaignTypeId));

  // Sort by priority: Critical first, then Important, then Nice-to-have
  const priorityOrder: Record<string, number> = {
    Critical: 0,
    Important: 1,
    "Nice-to-have": 2,
  };

  return rules.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
}

/**
 * Fetch all Campaign Type Rules, sorted by Sort Order.
 * Used by the campaign creation page to show available types.
 */
export async function getAllCampaignTypeRules(): Promise<CampaignTypeRule[]> {
  const records = await listRecords<CampaignTypeRuleFields>("Campaign Type Rules", {
    sort: [{ field: "Sort Order", direction: "asc" }],
  });

  return records.map(mapCampaignTypeRule);
}
