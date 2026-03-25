/**
 * Prompt templates for blog post campaign generation.
 *
 * Adapted from the proven n8n Post Generator 1.2 workflow.
 * Uses Claude Sonnet 4.6 with structured JSON output.
 */

import type { ScrapedBlogData } from "@/lib/firecrawl";

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
}

export function buildUserPrompt(params: UserPromptParams): string {
  const {
    blogData,
    brandVoice,
    editorialDirection,
    platformSettings,
    platforms,
    postsPerPlatform,
    imageCount,
  } = params;

  const totalPosts = platforms.length * postsPerPlatform;
  const platformList = platforms
    .map((p) => PLATFORM_TO_POST_TYPE[p] || p)
    .join(", ");

  const angleInstructions = postsPerPlatform > 1
    ? `For each platform, generate ${postsPerPlatform} unique variants. Use different content angles for each variant. Suggested angles:\n${CONTENT_ANGLES.slice(0, postsPerPlatform).map((a, i) => `  Variant ${i + 1}: ${a}`).join("\n")}`
    : "Generate 1 post per platform, each optimized for that platform's format and audience.";

  const imageInstructions = imageCount > 0
    ? `There are ${imageCount} images available. Cycle through them: variant 1 uses image index 0, variant 2 uses image index 1, etc. (modulo ${imageCount}). Return the imageUrl field with the URL of the assigned image.`
    : "No images were found. Set imageUrl to an empty string.";

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

${editorialDirection ? `<editorial_direction>\n${editorialDirection}\n</editorial_direction>` : ""}

<blog_post_content>
Title: ${blogData.title}
Description: ${blogData.description}
URL: ${blogData.url}
${blogData.author ? `Author: ${blogData.author}` : ""}

Content:
${blogData.content}
</blog_post_content>

<available_images>
${blogData.images.length > 0
    ? blogData.images.map((img, i) => `Image ${i}: ${img.url}${img.alt ? ` (${img.alt})` : ""}`).join("\n")
    : "No images available."
  }
</available_images>

${imageInstructions}

<token_budgets>
- Instagram: under 300 characters (first 125 visible in feed)
- Twitter/X: under 280 characters
- LinkedIn: 400-600 characters
- Facebook: 300-500 characters
- Threads: 200-400 characters
- Bluesky: under 300 characters
- Pinterest: 200-400 characters with keywords for search
Quality over quantity. Every word must earn its place.
</token_budgets>

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
      "postText": "The full post text including any hashtags",
      "imageUrl": "URL of the assigned image or empty string",
      "linkUrl": "${blogData.url}"
    }
  ]
}
</output_format>

CRITICAL REMINDERS (read these before generating):
- Do NOT use any banned words or phrases from the system instructions
- Each post MUST be unique and optimized for its specific platform
- Sound like a real person, not a marketing bot
- Incorporate the brand voice naturally — don't force it
- Include the link naturally where the platform supports it
- Return valid JSON only

Generate ALL ${totalPosts} posts now.`;
}
