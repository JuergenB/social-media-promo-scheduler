/**
 * Prompt templates for blog post campaign generation.
 *
 * Adapted from the proven n8n Post Generator 1.2 workflow.
 * Uses Claude Sonnet 4.6 with structured JSON output.
 */

import type { ScrapedBlogData, ContentSection } from "@/lib/firecrawl";
import { buildToneGuidance } from "./tone-guidance";

// ── System Prompt ──────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert social media content creator. Your task is to transform blog post content into engaging platform-specific social media posts while maintaining the brand's voice and guidelines.

<writing_style_requirements>

CRITICAL: You are writing social media posts for real humans. Write naturally and avoid ALL AI-generated clichés.

BANNED WORDS AND PHRASES (Never use ANY of these):
- "delve" / "dive into" / "deep dive"
- "unlock" / "unleash" / "unpack"
- "elevate" / "enhance" / "empower"
- "revolutionize" / "game-changer" / "disrupt"
- "navigate" / "embark" / "journey"
- "landscape" / "realm" / "sphere" / "arena"
- "beacon" / "resonate" / "testament"
- "ever-evolving" / "fast-paced" / "dynamic"
- "cutting-edge" / "state-of-the-art"
- "It's not just..." / "It's about more than..."
- "In today's [X] world/landscape..."
- "Let's face it..." / "At the end of the day..."
- "turbocharge" / "supercharge"

BANNED TRANSITIONS: moreover, furthermore, indeed

BANNED CONCEPTS:
- Don't replace "elevate" with "enhance" — both are clichés
- Don't replace "ever-changing landscape" with "fast-paced world" — still cliché
- Avoid transformation/journey/evolution metaphors
- Skip vague "empowerment" language
- Don't end posts with rhetorical questions

WRITE LIKE A REAL PERSON:
- Use simple, direct language
- Mix short and long sentences naturally
- Lead with specifics, not abstractions
- Use concrete examples over general concepts
- Sound conversational, not corporate
- Be opinionated when appropriate
- Use natural transitions

</writing_style_requirements>

<platform_tone_guidance>
- Instagram: Visual-first, casual, emoji-friendly, first 125 chars are visible
- Twitter/X: Punchy, direct, conversation-starter, under 280 chars
- LinkedIn: Professional but not stiff, insight-driven, 400-600 chars ideal
- Facebook: Casual, community-focused, can be longer
- Threads: Conversational, authentic, thread-worthy
- Bluesky: Authentic, less corporate, community-minded
- Pinterest: Inspirational, actionable, search-optimized with keywords
</platform_tone_guidance>

<self_check>
Before finalizing each post:
1. Would a real person actually say this?
2. Is this specific to the content or generic filler?
3. Did I avoid ALL banned words and concepts?
4. Does it sound authentic or like corporate jargon?
5. Is the post the right length for the platform?

If you use ANY banned phrase, rewrite that post completely.
</self_check>

CRITICAL: You MUST respond with valid JSON only. No markdown code blocks, no explanatory text, no preamble. Just the JSON object.`;

// ── Platform Settings Formatter ────────────────────────────────────────

export interface PlatformSetting {
  Platform_Post_Type: string;
  Max_Characters: number | null;
  Ideal_Length: string;
  URL_Recommendation: string;
  Tone: string[];
  Primary_Use_Case: string;
  Engagement_Notes: string;
  Hashtag_Limit: string;
  First_Comment_Strategy: string;
}

/** Map Zernio platform names to Airtable Platform_Post_Type values */
const PLATFORM_TO_POST_TYPE: Record<string, string> = {
  instagram: "Instagram - Feed Posts",
  twitter: "X/Twitter - Posts",
  linkedin: "LinkedIn - Posts",
  facebook: "Facebook - Page Posts",
  threads: "Threads - Posts",
  bluesky: "Bluesky - Posts",
  pinterest: "Pinterest - Pins",
};

export function formatPlatformSettings(
  settings: PlatformSetting[],
  platforms: string[]
): string {
  const lines: string[] = [];

  for (const platform of platforms) {
    const postType = PLATFORM_TO_POST_TYPE[platform];
    const setting = settings.find((s) => s.Platform_Post_Type === postType);
    if (!setting) continue;

    lines.push(`Platform: ${setting.Platform_Post_Type}`);
    lines.push(`  - Ideal Length: ${setting.Ideal_Length || setting.Max_Characters || "No limit"}`);
    lines.push(`  - URL Recommendation: ${setting.URL_Recommendation || "Include URL"}`);
    lines.push(`  - Tone: ${(setting.Tone || []).join(", ")}`);
    lines.push(`  - Use Case: ${setting.Primary_Use_Case || ""}`);
    lines.push(`  - Engagement Notes: ${setting.Engagement_Notes || ""}`);
    lines.push(`  - Hashtag Limit: ${setting.Hashtag_Limit || "No limit"}`);
    if (setting.First_Comment_Strategy) {
      lines.push(`  - First Comment Strategy: ${setting.First_Comment_Strategy}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Content Angles ─────────────────────────────────────────────────────

const CONTENT_ANGLES = [
  "Lead with the most surprising or counterintuitive point from the article",
  "Focus on a specific person, artist, or example mentioned — make it human",
  "Pull out a provocative quote or statistic that stops the scroll",
  "Frame it as a question or debate — invite the audience to weigh in",
  "Connect the topic to a broader trend or timely conversation",
];

// ── User Prompt Builder ────────────────────────────────────────────────

export interface UserPromptParams {
  blogData: ScrapedBlogData;
  brandVoice: {
    name: string;
    voiceGuidelines: string;
    websiteUrl: string;
  };
  editorialDirection: string;
  platformSettings: string; // pre-formatted text
  platforms: string[];
  postsPerPlatform: number;
  imageCount: number;
  /** Offset for variant numbering in batched generation (0-based).
   *  Batch 1: variantOffset=0, Batch 2: variantOffset=2, etc.
   *  Controls which sections are assigned to this batch. */
  variantOffset?: number;
  /** Voice intensity (0-100) for tone guidance injection. Omit to skip. */
  voiceIntensity?: number | null;
  /** Brand name (for tone dimension labels) */
  brandName?: string;
  /** Per-brand tone dimensions (8 sliders, 1-10 scale) */
  toneDimensions?: import("@/lib/airtable/types").ToneDimensions;
  /** Short additional tone notes */
  toneNotes?: string;
}

export function buildUserPrompt(params: UserPromptParams): string {
  const {
    blogData,
    brandVoice,
    editorialDirection,
    platformSettings,
    platforms,
    postsPerPlatform,
  } = params;

  const totalPosts = platforms.length * postsPerPlatform;
  const platformList = platforms
    .map((p) => PLATFORM_TO_POST_TYPE[p] || p)
    .join(", ");

  // Determine if this is a multi-section post (multiple artists/topics)
  const contentSections = blogData.sections?.filter((s) => !s.isPreamble) || [];
  const isMultiSection = contentSections.length > 1;

  // Build section-aware content and instructions
  let contentBlock: string;
  let angleInstructions: string;
  let imageInstructions: string;

  if (isMultiSection) {
    // ── Multi-section mode: structured XML sections ──────────────
    const preamble = blogData.sections?.find((s) => s.isPreamble);
    const sectionXml = contentSections
      .slice(0, 8) // Cap at 8 sections to avoid prompt bloat
      .map((s, i) => {
        const imgList = s.images.length > 0
          ? `\nAvailable images: ${s.images.map((img) => `[${img.alt || "image"}](${img.url})`).join(", ")}`
          : "";
        return `<section index="${i + 1}" heading="${s.heading}">
${s.content.slice(0, 1500)}${imgList}
</section>`;
      })
      .join("\n\n");

    contentBlock = `<blog_post_sections count="${contentSections.length}">
<article_info>
Title: ${blogData.title}
Description: ${blogData.description}
URL: ${blogData.url}
${blogData.author ? `Author: ${blogData.author}` : ""}
</article_info>

${preamble?.content ? `<hero_content>\n${preamble.content.slice(0, 800)}\n</hero_content>\n\n` : ""}${sectionXml}
</blog_post_sections>`;

    // Build explicit variant→section assignments to guarantee full coverage.
    // variantOffset shifts the starting variant number for batched generation
    // so each batch covers different sections.
    const offset = params.variantOffset || 0;
    const sectionAssignments: string[] = [];
    for (let v = 1; v <= postsPerPlatform; v++) {
      const globalVariant = offset + v;
      const sectionIdx = ((globalVariant - 1) % contentSections.length) + 1;
      const heading = contentSections[sectionIdx - 1]?.heading?.replace(/\*\*/g, "").replace(/\u200B/g, "").trim() || `Section ${sectionIdx}`;
      sectionAssignments.push(`  Variant ${v} → Section ${sectionIdx}: ${heading}`);
    }

    angleInstructions = `This article has ${contentSections.length} distinct sections, each about a DIFFERENT artist/topic/event. Generate ${postsPerPlatform} variant${postsPerPlatform > 1 ? "s" : ""} per platform.

MANDATORY VARIANT-TO-SECTION ASSIGNMENTS (follow exactly):
${sectionAssignments.join("\n")}

Each variant MUST write about its assigned section. Set "sectionIndex" in the JSON output to the section number shown above. The image for each post is determined by sectionIndex — a mismatch means the wrong image appears with the wrong text.

The sections are:
${contentSections.slice(0, 12).map((s, i) => `  Section ${i + 1}: ${s.heading}`).join("\n")}`;

    // Build numbered image catalog from sections — use section heading as
    // description when alt text is empty, generic, or duplicated across images
    // (common on Ghost, WordPress, StoryChief where og:description is used as alt)
    const heroUrl = blogData.heroImage?.url || blogData.ogImage || "";

    // Detect duplicate alt text: if >50% of images share the same alt, treat alt as unreliable
    const allSectionImages = contentSections.flatMap((s) => s.images);
    const altCounts = new Map<string, number>();
    for (const img of allSectionImages) {
      if (img.alt) altCounts.set(img.alt, (altCounts.get(img.alt) || 0) + 1);
    }
    const mostCommonAltCount = Math.max(...altCounts.values(), 0);
    const altIsUnreliable = allSectionImages.length > 1 && mostCommonAltCount > allSectionImages.length * 0.5;

    const sectionCatalogImages: { url: string; label: string }[] = [];
    for (const s of contentSections.slice(0, 12)) {
      for (const img of s.images) {
        // Use section heading when alt is missing, generic, or unreliable (duplicated)
        const altUsable = img.alt && img.alt !== "image" && img.alt !== "untitled" && !altIsUnreliable;
        // Strip markdown bold markers and zero-width spaces from heading
        const cleanHeading = s.heading.replace(/\*\*/g, "").replace(/\u200B/g, "").trim();
        const label = altUsable
          ? img.alt
          : `Image from section: ${cleanHeading}`;
        sectionCatalogImages.push({ url: img.url, label });
      }
    }

    const imageCatalog = sectionCatalogImages
      .map((img, i) => `Image ${i + 1}: "${img.label}"`)
      .join("\n");

    imageInstructions = `<available_images>
Image 0: Article hero/general image (use when post is about the article as a whole)
${imageCatalog}
</available_images>

IMAGE SELECTION RULES:
- Set "imageIndex" to the image number from the catalog above that matches your post content.
- Set imageIndex to 0 for posts about the article/event as a whole.
- Match the image to what the post text discusses. Wrong image = wrong person shown.
- If you CANNOT confidently match an image, set imageIndex to 0 and write about the overall topic.
- A mix of person-specific posts and general topic posts is ideal.`;

  } else {
    // ── Single-section mode: flat content (original behavior) ────
    contentBlock = `<blog_post_content>
Title: ${blogData.title}
Description: ${blogData.description}
URL: ${blogData.url}
${blogData.author ? `Author: ${blogData.author}` : ""}

Content:
${blogData.content}
</blog_post_content>`;

    angleInstructions = postsPerPlatform > 1
      ? `For each platform, generate ${postsPerPlatform} unique variants. Each variant MUST focus on a DIFFERENT angle. Spread your focus across the entire article.\n\nIMPORTANT: At least one variant per platform MUST be about the event/topic as a whole — a general promotional post with a call to action (RSVP, attend, visit, learn more). Use imageIndex 0 (the hero image) for this variant. The remaining variants can highlight specific people, works, or details from the content.\n\nSuggested approach:\n  Variant 1: General event/topic promotion — dates, venue, what to expect, CTA\n${CONTENT_ANGLES.slice(0, postsPerPlatform - 1).map((a, i) => `  Variant ${i + 2}: ${a}`).join("\n")}`
      : "Generate 1 post per platform, each optimized for that platform's format and audience.";

    // Build numbered image catalog for Claude to pick from.
    // Exclude the hero/og image — it's already Image 0 (general/event image).
    const heroUrl = blogData.heroImage?.url || blogData.ogImage || "";
    const catalogImages = blogData.images.filter((img) => img.url !== heroUrl).slice(0, 20);

    // Detect duplicate alt text (CMS often uses og:description for all images)
    const singleAltCounts = new Map<string, number>();
    for (const img of catalogImages) {
      if (img.alt) singleAltCounts.set(img.alt, (singleAltCounts.get(img.alt) || 0) + 1);
    }
    const singleMostCommonAlt = Math.max(...singleAltCounts.values(), 0);
    const singleAltUnreliable = catalogImages.length > 1 && singleMostCommonAlt > catalogImages.length * 0.5;

    const imageCatalog = catalogImages
      .map((img, i) => {
        if (singleAltUnreliable || !img.alt || img.alt === "image" || img.alt === "untitled") {
          // Fall back to filename-derived label
          const filenameMatch = img.url.match(/\/([^/?]+?)(?:_[a-f0-9]{10,})?(?:_\d+)?\.\w+(?:\?|$)/);
          const filename = filenameMatch
            ? filenameMatch[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
            : "untitled";
          return `Image ${i + 1}: "${filename}"`;
        }
        return `Image ${i + 1}: "${img.alt}"`;
      })
      .join("\n");

    imageInstructions = `<available_images>
Image 0: Event hero/general image (use when post is about the event as a whole, not a specific person or work)
${imageCatalog}
</available_images>

IMAGE SELECTION RULES:
- You MUST select an image for each post by setting "imageIndex" to the image number from the catalog above.
- MATCH the image to the post content. If your post discusses a specific person or work, pick the image whose description matches that person or work.
- Set imageIndex to 0 for posts about the event/topic as a whole.
- If you CANNOT confidently determine which image belongs to the person or work you're writing about, set imageIndex to 0 and write about the event/topic generically instead. Do NOT guess.
- Each variant should use a DIFFERENT image where possible — spread across the available images.
- A mix of person-specific posts (with matched images) and general event posts (imageIndex 0) is ideal.

Focus on writing content that covers DIFFERENT angles — some highlighting specific people with their matched images, others promoting the event/topic itself with CTAs, questions, and engagement hooks. Set sectionIndex to 0.`;
  }

  return `Generate ${totalPosts} social media posts (${postsPerPlatform} per platform) for the following blog post content.

Target platforms: ${platformList}

${angleInstructions}

<platform_best_practices>
${platformSettings}
</platform_best_practices>

<brand_voice_guidelines>
Brand: ${brandVoice.name}
Website: ${brandVoice.websiteUrl}

${brandVoice.voiceGuidelines}
</brand_voice_guidelines>

${editorialDirection ? `<editorial_direction>\n${editorialDirection}\n</editorial_direction>\n\n<constraint_priority>\nThe editorial direction above is a stylistic guide for tone and focus. It does NOT override the Image-Text Integrity Rule. You may mention a person by name ONLY if the scraped content explicitly associates them with specific work. If the editorial direction asks you to highlight or name people but you cannot confidently identify them from the content, write about the event/topic instead.\n</constraint_priority>` : ""}

${buildToneGuidance(params.voiceIntensity, {
  brandName: params.brandName,
  toneDimensions: params.toneDimensions,
  toneNotes: params.toneNotes,
})}

${contentBlock}

${imageInstructions}

<post_length_guidance>
Follow the Ideal Length from <platform_best_practices> above for each platform. These are target ranges, not hard limits.
- Instagram Feed: Write LONG captions (800-1500 chars). Use multiple paragraphs with hook → story → question → CTA. Use emojis as visual breaks. Do NOT put hashtags in the caption — they go in firstComment.
- LinkedIn: Write thought-leadership content (1000-1500 chars). Heavy line breaks. Bold opening, 2-3 insight paragraphs, closing question.
- Facebook: Either short + punchy (200-500 chars) OR long storytelling (1500-2500 chars). Mid-length underperforms.
- Threads: Conversational, 200-300 chars.
- Bluesky: Concise, 200-275 chars (hard limit 300).
- X/Twitter: Use full 280 chars.
- Pinterest: Search-optimized keywords, 200-300 chars.
Quality over quantity. Every word must earn its place. Sound like a real person, not a marketing bot.
</post_length_guidance>

<link_instructions>
Include the blog post URL (${blogData.url}) naturally in each post. The URL will be replaced with a shortened tracking link after generation. For platforms where URLs aren't clickable in captions (Instagram), mention "link in bio" instead.
</link_instructions>

<output_format>
Respond with ONLY this JSON structure — no markdown, no explanation, no preamble:
{
  "posts": [
    {
      "platform": "instagram|twitter|linkedin|facebook|threads|bluesky|pinterest",
      "variant": 1,
      "sectionIndex": 0,
      "imageIndex": 0,
      "subject": "",
      "postText": "The full post text — NO hashtags for Instagram (put them in firstComment instead)",
      "firstComment": "For Instagram ONLY: a brief engagement summary + 10-20 relevant hashtags. Leave empty string for other platforms.",
      "imageUrl": "",
      "linkUrl": "${blogData.url}"
    }
  ]
}

sectionIndex: Set to the section number (1-based) that this variant is about. Set to 0 if the post is about the article as a whole.
imageIndex: The image number from the available_images catalog that matches this post's content. Set to 0 for the event hero/general image. THIS IS THE PRIMARY IMAGE SELECTION MECHANISM.
subject: The name of the person/entity this post focuses on, or "" if generic.
firstComment: For Instagram posts ONLY — write a brief 1-sentence engagement hook followed by 10-20 relevant hashtags. Example: "The future of mobile photography could be modular — and we're here for it. #TechInnovation #MobilePhotography #CreativeTech". For all other platforms, set to "".
</output_format>

CRITICAL REMINDERS (read these before generating):
- MANDATORY: variant 1 for each platform MUST be a general event/topic promotional post with imageIndex 0 (hero image). This is NOT optional — do not skip it regardless of editorial direction.
- Do NOT use any banned words or phrases from the system instructions
- Each post MUST be unique and optimized for its specific platform
- Sound like a real person, not a marketing bot
- Incorporate the brand voice naturally — don't force it
- Include the link naturally where the platform supports it
- imageIndex MUST match the post content — pick the image whose description matches what you're writing about
- NEVER guess a person's name — if unsure, set imageIndex to 0 and write about the event/topic generically
- Editorial direction is a stylistic guide, NOT permission to guess names or override image matching rules
- Return valid JSON only

Generate ALL ${totalPosts} posts now.`;
}
