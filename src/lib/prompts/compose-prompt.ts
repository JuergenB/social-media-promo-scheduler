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
}

/**
 * Compose the user prompt, optionally injecting content structure
 * and type-specific guidance from the CampaignTypeRule record.
 *
 * Falls back to the base buildUserPrompt() if no campaignTypeRule is provided.
 */
export function composeUserPrompt(params: ComposeUserPromptParams): string {
  const { campaignTypeRule, ...baseParams } = params;

  // Get the base user prompt
  const basePrompt = baseBuildUserPrompt(baseParams);

  // If no campaign type rule, return as-is
  if (!campaignTypeRule) {
    return basePrompt;
  }

  // Build type-specific context to inject
  const typeContext = buildTypeContext(campaignTypeRule);
  if (!typeContext) {
    return basePrompt;
  }

  // Inject type context before the output_format section
  const outputFormatMarker = "<output_format>";
  const insertionPoint = basePrompt.indexOf(outputFormatMarker);

  if (insertionPoint === -1) {
    // Fallback: prepend to the prompt
    return `${typeContext}\n\n${basePrompt}`;
  }

  const before = basePrompt.slice(0, insertionPoint);
  const after = basePrompt.slice(insertionPoint);

  return `${before}${typeContext}\n\n${after}`;
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
