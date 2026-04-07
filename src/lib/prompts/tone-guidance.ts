/**
 * Tone-of-voice guidance builder for campaign generation prompts.
 *
 * Maps a 0-100 voice intensity slider to 5 tiers with descriptive
 * prompt guidance. Calibrations derived from the Polymash Content
 * Audit app's voice slider research.
 *
 * Now also supports per-brand tone dimensions (8 sliders, 1-10 each)
 * that are scaled by the campaign's master intensity.
 *
 * @see https://github.com/JuergenB/social-media-promo-scheduler/issues/32
 */

import type { ToneDimensions } from "@/lib/airtable/types";
import { TONE_DIMENSION_DEFS } from "@/lib/airtable/types";

// ── Tier definitions ───────────────────────────────────────────────────

export interface ToneTier {
  label: string;
  min: number;
  max: number;
  description: string;
}

const TONE_TIERS: ToneTier[] = [
  {
    label: "Professional",
    min: 0,
    max: 10,
    description:
      "Straightforward, authoritative. No humor, no personality. Just the facts and clear CTAs. Think press release tone — clean, informative, zero flourishes.",
  },
  {
    label: "Hint of Wit",
    min: 11,
    max: 30,
    description:
      "Mostly professional but with occasional dry observations. One clever turn of phrase per post is enough. The voice peeks through but doesn't dominate — a raised eyebrow, not a wink.",
  },
  {
    label: "Balanced",
    min: 31,
    max: 60,
    description:
      "Equal parts information and personality. The brand voice is present throughout but doesn't overshadow the content. Natural, conversational, like a knowledgeable friend who genuinely cares about the subject.",
  },
  {
    label: "Bold",
    min: 61,
    max: 80,
    description:
      "Personality-forward. Most of the post carries the brand's signature voice. Strong opinions, distinctive framing, platform-appropriate humor. Even the CTA feels like it was written by a specific person, not a committee.",
  },
  {
    label: "Full Voice",
    min: 81,
    max: 100,
    description:
      "Maximum personality. The voice IS the content. Bold claims, sharp observations, the kind of post people screenshot and share. May sacrifice some information density for impact. Every sentence should feel authored.",
  },
];

// ── Dimension scaling ────────────────────────────────────────────────

/**
 * Scale a brand's tone dimension value by the campaign's master intensity.
 *
 * At intensity 50 (default), brand values pass through unchanged.
 * At intensity 20 (Professional), values pull toward the midpoint (5).
 * At intensity 80 (Wry), values push away from the midpoint.
 *
 * Formula: scaledValue = 5 + (brandValue - 5) * (intensity / 50)
 * Clamped to [1, 10].
 */
function scaleDimension(brandValue: number, intensity: number): number {
  const scaled = 5 + (brandValue - 5) * (intensity / 50);
  return Math.round(Math.max(1, Math.min(10, scaled)));
}

/**
 * Get a descriptive phrase for a dimension value.
 */
function describeDimension(def: typeof TONE_DIMENSION_DEFS[number], value: number): string {
  if (value <= 3) return `favor ${def.lowLabel.toLowerCase()} tone`;
  if (value >= 8) return `favor ${def.highLabel.toLowerCase().replace(/&/g, "and")} tone`;
  if (value <= 4) return `lean ${def.lowLabel.toLowerCase()}`;
  if (value >= 7) return `lean ${def.highLabel.toLowerCase().replace(/&/g, "and")}`;
  return "balanced";
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get the human-readable tier label for a given voice intensity value.
 */
export function getToneLabel(intensity: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(intensity)));
  const tier = TONE_TIERS.find((t) => clamped >= t.min && clamped <= t.max);
  return tier?.label ?? "Balanced";
}

/**
 * Get the full tier definition for a given voice intensity value.
 */
export function getToneTier(intensity: number): ToneTier {
  const clamped = Math.max(0, Math.min(100, Math.round(intensity)));
  return TONE_TIERS.find((t) => clamped >= t.min && clamped <= t.max) ?? TONE_TIERS[2];
}

/**
 * Get all tier definitions (for rendering tier labels in the UI).
 */
export function getAllToneTiers(): ToneTier[] {
  return TONE_TIERS;
}

/**
 * Build XML-formatted tone guidance for injection into generation prompts.
 *
 * When brand tone dimensions are provided, outputs per-dimension guidance
 * scaled by the campaign's master intensity. Falls back to generic tier
 * descriptions for backward compatibility.
 *
 * Returns an empty string if intensity is null/undefined (backward compatible —
 * campaigns created before the tone slider don't get tone guidance injected).
 */
export function buildToneGuidance(
  intensity: number | undefined | null,
  options?: {
    brandName?: string;
    toneDimensions?: ToneDimensions;
    toneNotes?: string;
  }
): string {
  if (intensity == null) return "";

  const tier = getToneTier(intensity);

  // If brand has tone dimensions, use per-dimension guidance
  if (options?.toneDimensions) {
    const dims = options.toneDimensions;
    const brandName = options.brandName || "Brand";
    const roundedIntensity = Math.round(intensity);

    const dimensionLines = TONE_DIMENSION_DEFS.map((def) => {
      const raw = dims[def.key];
      const scaled = scaleDimension(raw, roundedIntensity);
      const desc = describeDimension(def, scaled);
      return `${def.label}: ${scaled}/10 — ${desc}`;
    }).join("\n");

    const notesLine = options.toneNotes
      ? `\nAdditional notes: ${options.toneNotes}`
      : "";

    return `<tone_dimensions brand="${brandName}" intensity="${roundedIntensity}/100">
${dimensionLines}${notesLine}
Apply these tone dimensions consistently across all generated posts. They modify how you apply the brand voice — they do not replace it.
</tone_dimensions>`;
  }

  // Fallback: generic tier descriptions (backward compatible)
  return `<tone_setting>
Voice intensity: ${Math.round(intensity)}/100 (${tier.label})
${tier.description}
Apply this tone consistently across all generated posts. The tone setting modifies how you apply the brand voice — it does not replace it.
</tone_setting>`;
}
