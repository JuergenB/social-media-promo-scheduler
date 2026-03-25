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
        content: userPrompt,
      },
    ],
  });

  // Extract text content
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON from response — Claude may wrap in markdown code blocks
  let jsonText = textBlock.text.trim();
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonText);

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
}
