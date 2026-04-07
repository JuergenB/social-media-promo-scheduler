/**
 * Dynamic prompt composer for campaign generation.
 *
 * Builds system and user prompts by combining hardcoded base rules
 * (banned words, JSON format, self-check, platform tone) with
 * type-specific Generation Rules fetched from Airtable.
 *
 * Falls back to the existing blog-post-generator.ts if no Airtable data.
 */

import type { GenerationRule, CampaignTypeRule, RuleCategory, RulePriority } from "@/lib/airtable/types";
import {
  SYSTEM_PROMPT as BASE_SYSTEM_PROMPT,
  buildUserPrompt as baseBuildUserPrompt,
  type UserPromptParams,
} from "./blog-post-generator";
import { buildToneGuidance } from "./tone-guidance";

// ── Priority ordering ───────────────────────────────────────────────────

const PRIORITY_ORDER: Record<RulePriority, number> = {
  Critical: 0,
  Important: 1,
  "Nice-to-have": 2,
};

// ── Category display order ──────────────────────────────────────────────

const CATEGORY_ORDER: Record<RuleCategory, number> = {
  "Content Pairing": 0,
  "Tone & Voice": 1,
  Structure: 2,
  "Image Handling": 3,
  "Link Handling": 4,
  Avoidance: 5,
  "Platform-Specific": 6,
};

// ── System Prompt Composer ──────────────────────────────────────────────

/**
 * Compose a system prompt by injecting type-specific Generation Rules
 * into the base system prompt as a `<campaign_type_rules>` XML section.
 *
 * If no rules are provided, returns the base system prompt unchanged.
 */
export function composeSystemPrompt(rules: GenerationRule[]): string {
  if (rules.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const rulesSection = formatRulesAsXml(rules);

  // Insert the campaign_type_rules section before the self_check section
  // so the model sees type-specific rules before the verification step.
  const selfCheckMarker = "<self_check>";
  const insertionPoint = BASE_SYSTEM_PROMPT.indexOf(selfCheckMarker);

  if (insertionPoint === -1) {
    // Fallback: append before the final CRITICAL line
    return `${BASE_SYSTEM_PROMPT}\n\n${rulesSection}`;
  }

  const before = BASE_SYSTEM_PROMPT.slice(0, insertionPoint);
  const after = BASE_SYSTEM_PROMPT.slice(insertionPoint);

  return `${before}${rulesSection}\n\n${after}`;
}

/**
 * Format Generation Rules as an XML section grouped by Category
 * and sorted by Priority within each group.
 */
function formatRulesAsXml(rules: GenerationRule[]): string {
  // Group rules by category
  const grouped = new Map<RuleCategory, GenerationRule[]>();
  for (const rule of rules) {
    const existing = grouped.get(rule.category) || [];
    existing.push(rule);
    grouped.set(rule.category, existing);
  }

  // Sort categories by display order
  const sortedCategories = [...grouped.entries()].sort(
    ([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
  );

  const sections: string[] = [];

  for (const [category, categoryRules] of sortedCategories) {
    // Sort rules within category by priority
    const sorted = [...categoryRules].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    );

    const ruleLines = sorted.map((r) => {
      const text = r.promptFragment || r.ruleText;
      const priorityTag = r.priority === "Critical" ? " [CRITICAL]" : "";
      return `- ${text}${priorityTag}`;
    });

    sections.push(`<category name="${category}">\n${ruleLines.join("\n")}\n</category>`);
  }

  return `<campaign_type_rules>\nThese rules are specific to this campaign type. Follow them in addition to the general rules above.\n\n${sections.join("\n\n")}\n</campaign_type_rules>`;
}

// ── User Prompt Composer ────────────────────────────────────────────────

export interface ComposeUserPromptParams extends UserPromptParams {
  /** Campaign Type Rule record from Airtable (optional — falls back if absent) */
  campaignTypeRule?: CampaignTypeRule | null;
  /** Event date or submission deadline (ISO date string) */
  eventDate?: string | null;
  /** User-supplied event details (location, tickets, RSVP, etc.) */
  eventDetails?: string | null;
  /** Content scraped from additional URLs */
  supplementalContent?: string | null;
  /** Structured event data from JSON extraction */
  eventData?: Record<string, string | null> | null;
  /** Voice intensity (0-100) for tone guidance injection */
  voiceIntensity?: number | null;
  /** Brand name (for tone dimension labels) */
  brandName?: string;
  /** Per-brand tone dimensions (8 sliders, 1-10 scale) */
  toneDimensions?: import("@/lib/airtable/types").ToneDimensions;
  /** Short additional tone notes */
  toneNotes?: string;
}

/**
 * Compose the user prompt, optionally injecting content structure
 * and type-specific guidance from the CampaignTypeRule record.
 *
 * Falls back to the base buildUserPrompt() if no campaignTypeRule is provided.
 */
export function composeUserPrompt(params: ComposeUserPromptParams): string {
  const { campaignTypeRule, eventDate, eventDetails, supplementalContent, eventData, voiceIntensity, brandName, toneDimensions, toneNotes, ...baseParams } = params;

  // Get the base user prompt
  const basePrompt = baseBuildUserPrompt(baseParams);

  // Build all context sections to inject
  const contextSections: string[] = [];

  // Tone guidance — injected before type context and editorial direction
  const toneBlock = buildToneGuidance(voiceIntensity, {
    brandName,
    toneDimensions,
    toneNotes,
  });
  if (toneBlock) contextSections.push(toneBlock);

  // Type-specific context from CampaignTypeRule
  const typeContext = campaignTypeRule ? buildTypeContext(campaignTypeRule) : null;
  if (typeContext) contextSections.push(typeContext);

  // Event/Open Call context
  if (eventDate || eventDetails || eventData) {
    const eventParts: string[] = [];

    if (eventData) {
      const fields = Object.entries(eventData)
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => `${k}: ${v}`);
      if (fields.length > 0) {
        eventParts.push(`<scraped_event_data>\n${fields.join("\n")}\n</scraped_event_data>`);
      }
    }

    if (eventDetails) {
      eventParts.push(`<user_supplied_event_details>\n${eventDetails}\n</user_supplied_event_details>`);
    }

    if (eventDate) {
      const daysUntil = Math.ceil((new Date(eventDate).getTime() - Date.now()) / 86400000);
      const phase = daysUntil > 28 ? "Announcement"
        : daysUntil > 14 ? "Awareness"
        : daysUntil > 3 ? "Urgency"
        : "Final Push";
      eventParts.push(`<campaign_timeline>\nEvent/deadline date: ${eventDate}\nDays remaining: ${daysUntil}\nCurrent phase: ${phase}\nGenerate posts appropriate for the ${phase} phase of the campaign arc.\n</campaign_timeline>`);
    }

    if (eventParts.length > 0) {
      contextSections.push(eventParts.join("\n\n"));
    }
  }

  // Supplemental content from additional URLs
  if (supplementalContent) {
    contextSections.push(`<supplemental_sources>\nAdditional context from related pages. Use this to enrich posts but prioritize the primary source.\n\n${supplementalContent}\n</supplemental_sources>`);
  }

  if (contextSections.length === 0) {
    return basePrompt;
  }

  const allContext = contextSections.join("\n\n");

  // Inject before the output_format section
  const outputFormatMarker = "<output_format>";
  const insertionPoint = basePrompt.indexOf(outputFormatMarker);

  if (insertionPoint === -1) {
    return `${allContext}\n\n${basePrompt}`;
  }

  const before = basePrompt.slice(0, insertionPoint);
  const after = basePrompt.slice(insertionPoint);

  return `${before}${allContext}\n\n${after}`;
}

/**
 * Build a `<content_type_context>` XML section from the CampaignTypeRule record.
 */
function buildTypeContext(rule: CampaignTypeRule): string | null {
  const parts: string[] = [];

  if (rule.description) {
    parts.push(`Content Type: ${rule.name}`);
    parts.push(`Description: ${rule.description}`);
  }

  if (rule.contentStructure) {
    parts.push(`\nContent Structure:\n${rule.contentStructure}`);
  }

  if (parts.length === 0) return null;

  return `<content_type_context>\n${parts.join("\n")}\n</content_type_context>`;
}
