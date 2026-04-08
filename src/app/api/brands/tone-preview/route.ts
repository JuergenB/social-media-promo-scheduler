import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicConfig } from "@/lib/anthropic";
import { buildToneGuidance } from "@/lib/prompts/tone-guidance";
import type { ToneDimensions } from "@/lib/airtable/types";

/**
 * POST /api/brands/tone-preview
 *
 * Generate a short preview text demonstrating the brand's tone at the given
 * dimension settings. Uses the brand's own Anthropic API key.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      brandName,
      toneDimensions,
      toneNotes,
      voiceGuidelines,
      anthropicApiKeyLabel,
      voiceIntensity,
    } = body as {
      brandName: string;
      toneDimensions: ToneDimensions;
      toneNotes?: string;
      voiceGuidelines?: string;
      anthropicApiKeyLabel?: string | null;
      voiceIntensity?: number;
    };

    if (!brandName || !toneDimensions) {
      return NextResponse.json(
        { error: "brandName and toneDimensions are required" },
        { status: 400 }
      );
    }

    const config = resolveAnthropicConfig({ anthropicApiKeyLabel });
    const client = new Anthropic({ apiKey: config.apiKey });

    // Build tone guidance at the requested intensity (defaults to 50)
    const intensity = typeof voiceIntensity === "number" ? voiceIntensity : 50;
    const toneBlock = buildToneGuidance(intensity, {
      brandName,
      toneDimensions,
      toneNotes,
    });

    const systemPrompt = `You are a social media copywriter. Generate an Instagram-length post (200-300 words) that introduces the brand "${brandName}", written in the exact tone specified by the dimensions below. Do not mention the dimensions themselves — just write in the voice they describe. Output only the post text, no labels or formatting. Include relevant hashtags at the end.`;

    const userPrompt = `${toneBlock}

${voiceGuidelines ? `<brand_voice_guidelines>\n${voiceGuidelines.slice(0, 2000)}\n</brand_voice_guidelines>` : ""}

Write an Instagram-length social media post (200-300 words) introducing ${brandName} to a new follower. Demonstrate the brand's unique voice and personality. The post should feel like a real Instagram post — engaging opening hook, storytelling or value-driven body, a call to action, and relevant hashtags.`;

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 800,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const preview = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    return NextResponse.json({ preview });
  } catch (error) {
    console.error("Tone preview generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    );
  }
}
