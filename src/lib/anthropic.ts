/**
 * Anthropic Claude client — post generation with structured output
 *
 * Uses Claude Sonnet 4.6 by default. Supports per-brand API key resolution
 * (same pattern as Short.io).
 */

import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

/**
 * Resolve Anthropic config for a brand.
 * Brand-specific key label → env var → global fallback.
 */
export function resolveAnthropicConfig(brand?: {
  anthropicApiKeyLabel?: string | null;
}): AnthropicConfig {
  const apiKey = brand?.anthropicApiKeyLabel
    ? process.env[brand.anthropicApiKeyLabel] || process.env.ANTHROPIC_API_KEY
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("Anthropic API key not configured (set ANTHROPIC_API_KEY or brand-specific key)");
  }

  return {
    apiKey,
    model: "claude-sonnet-4-6",
  };
}

/**
 * Generate social media posts for a single platform using Claude.
 */
export async function generatePosts(
  systemPrompt: string,
  userPrompt: string,
  config: AnthropicConfig
): Promise<{ posts: GeneratedPost[] }> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 4096,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt + '\n\nIMPORTANT: Respond with ONLY valid JSON. Escape all quotes inside strings with backslash. Do not use curly quotes. Start your response with {"posts":[',
      },
    ],
  });

  // Extract text content
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON — response continues from the prefill '{"posts":['
  let jsonText = textBlock.text.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Handle case where response doesn't start with {
  if (!jsonText.startsWith("{")) {
    // Try to find the JSON start
    const jsonStart = jsonText.indexOf("{");
    if (jsonStart >= 0) {
      jsonText = jsonText.slice(jsonStart);
    }
  }

  // Try to extract JSON object if there's surrounding text
  const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    jsonText = jsonObjectMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    // Try to fix common JSON issues: trailing commas, unescaped quotes
    const cleaned = jsonText
      .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
      .replace(/[\u201C\u201D]/g, '"') // Replace smart quotes
      .replace(/[\u2018\u2019]/g, "'"); // Replace smart apostrophes
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Claude response:", jsonText.slice(0, 500));
      throw new Error(`JSON parse error: ${(parseError as Error).message}. Response started with: ${jsonText.slice(0, 100)}`);
    }
  }

  if (!parsed.posts || !Array.isArray(parsed.posts)) {
    throw new Error("Invalid response structure — expected { posts: [...] }");
  }

  return parsed as { posts: GeneratedPost[] };
}

export interface GeneratedPost {
  platform: string;
  variant: number;
  postText: string;
  imageUrl: string;
  hashtags?: string[];
  linkUrl: string;
  /** Newsletter story anchor fragment (e.g., "VSObpak") */
  anchor?: string;
  /** Section index (1-based) for multi-section blog posts. 0 = whole article. */
  sectionIndex?: number;
  /** The specific artist, person, or subject this post is about (for image matching) */
  subject?: string;
  /** Index into the available_images catalog (1-based). 0 = hero/general image. */
  imageIndex?: number;
}
