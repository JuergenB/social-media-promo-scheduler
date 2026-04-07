import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRecord } from "@/lib/airtable/client";
import { resolveAnthropicConfig } from "@/lib/anthropic";
import { fetchCoverSlideTemplate } from "@/lib/airtable/cover-slide-templates";
import { deriveCharBudgets } from "@/lib/cover-slide-renderer";

interface PostFields {
  Content: string;
  Platform: string;
  subject: string;
  Campaign: string[];
}

interface CampaignFields {
  Name: string;
  Type: string;
  Description: string;
  "Editorial Direction": string;
  Brand: string[];
}

interface BrandFields {
  Name: string;
  "Voice Guidelines": string;
}

/**
 * POST /api/posts/[id]/cover-slide-content
 *
 * Generate AI-populated text fields for a cover slide.
 *
 * Body:
 *   - templateId: string — template to derive character budgets from
 *
 * Returns:
 *   - fields: { campaignTypeLabel, headline, description, handle }
 *   - charBudgets: { campaignTypeLabel: N, headline: N, description: N }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const templateId: string = body.templateId;

    if (!templateId) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }

    // Fetch template for character budgets
    const template = await fetchCoverSlideTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Derive character budgets from template bands (at 1080px width)
    const charBudgets = deriveCharBudgets(template.bands, 1080);

    // Fetch post
    const post = await getRecord<PostFields>("Posts", id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Fetch campaign for context
    const campaignId = post.fields.Campaign?.[0];
    let campaignName = "";
    let campaignType = "";
    let campaignDescription = "";
    let editorialDirection = "";
    let brandName = "";

    if (campaignId) {
      try {
        const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
        campaignName = campaign.fields.Name || "";
        campaignType = campaign.fields.Type || "";
        campaignDescription = campaign.fields.Description || "";
        editorialDirection = campaign.fields["Editorial Direction"] || "";

        // Fetch brand for handle context
        const brandId = campaign.fields.Brand?.[0];
        if (brandId) {
          try {
            const brand = await getRecord<BrandFields>("Brands", brandId);
            brandName = brand.fields.Name || "";
          } catch { /* brand fetch optional */ }
        }
      } catch { /* campaign fetch optional */ }
    }

    const postContent = post.fields.Content || "";
    const postSubject = post.fields.subject || "";
    const platform = post.fields.Platform || "instagram";

    // Determine template variant for prompt customization
    const isQuotable = (template.slug || "").includes("quotable");

    // Generate content with Claude
    const config = resolveAnthropicConfig();
    const client = new Anthropic({ apiKey: config.apiKey });

    const systemPrompt = isQuotable
      ? `<role>You are an editorial copywriter specializing in social media quote cards. You extract the most striking, shareable quote from article content and present it with clean attribution.</role>

<constraints>
- Every field MUST respect its character budget exactly — do not exceed the limit
- Write for ${platform} audience expectations
- Category labels should be specific to the content, not generic types. Use the campaign name for context (e.g., "THE INTERSECT NEWSLETTER", "Q+ART INTERVIEW", "LIMINAL LIGHT EXHIBITION")
- The headline field MUST be an actual quote extracted verbatim from the post content — a striking phrase someone said, enclosed in quotation marks
- Do NOT write an article headline — extract a real quote from the text
- The description field MUST be attribution only — just the person's name with an em dash prefix (e.g., "— Erin Keane")
- Do NOT write a sentence description — only the name of the person being quoted
- Do not fabricate quotes or attribute words to someone who did not say them
- If no direct quote exists in the content, extract the most quotable declarative statement
</constraints>`
      : `<role>You are an editorial copywriter specializing in social media cover cards for carousel posts. You write compelling, concise text that fits within strict character limits.</role>

<constraints>
- Every field MUST respect its character budget exactly — do not exceed the limit
- Write for ${platform} audience expectations
- Category labels should be specific to the content, not generic types. Use the campaign name for context (e.g., "THE INTERSECT NEWSLETTER", "Q+ART INTERVIEW", "LIMINAL LIGHT EXHIBITION")
- Headlines should be attention-grabbing, specific, and capture the essence of the content
- Descriptions should provide just enough context to entice the reader to swipe through
- Match the brand's editorial voice: professional yet approachable
- Do not fabricate facts, names, or details not present in the source content
</constraints>`;

    const instructionsBlock = isQuotable
      ? `<instructions>
Generate text fields for a quotable card. Return ONLY a JSON object with these fields:

1. "campaignTypeLabel" — A short category label (max ${charBudgets.campaignTypeLabel || 30} characters)
   Create a specific, meaningful label — NOT just the generic campaign type.
   Rules for the label:
   - Newsletter: Use the newsletter's actual name from the campaign name (e.g., "THE INTERSECT NEWSLETTER" or "INTERSECT ISSUE #12"), NOT just "NEWSLETTER"
   - Blog Post about an artist: Use "ARTIST PROFILE" or "Q+ART INTERVIEW" if the campaign name contains "Q+Art"
   - Exhibition: Use the exhibition name or "EXHIBITION PREVIEW"
   - Always derive from the campaign name "${campaignName}" and type "${campaignType}"
   - Make it specific to THIS content, not a generic category

2. "headline" — An actual QUOTE from the post content (max ${charBudgets.headline || 100} characters)
   Extract the most striking, shareable phrase someone said in the article. Enclose in quotation marks.
   This must be a real quote from the text, NOT a headline you wrote.

3. "description" — Attribution only (max ${charBudgets.description || 180} characters)
   Just the quoted person's name with an em dash prefix, e.g., "— Erin Keane". Nothing else.
</instructions>`
      : `<instructions>
Generate text fields for a cover slide card. Return ONLY a JSON object with these fields:

1. "campaignTypeLabel" — A short category label (max ${charBudgets.campaignTypeLabel || 30} characters)
   Create a specific, meaningful label — NOT just the generic campaign type.
   Rules for the label:
   - Newsletter: Use the newsletter's actual name from the campaign name (e.g., "THE INTERSECT NEWSLETTER" or "INTERSECT ISSUE #12"), NOT just "NEWSLETTER"
   - Blog Post about an artist: Use "ARTIST PROFILE" or "Q+ART INTERVIEW" if the campaign name contains "Q+Art"
   - Exhibition: Use the exhibition name or "EXHIBITION PREVIEW"
   - Always derive from the campaign name "${campaignName}" and type "${campaignType}"
   - Make it specific to THIS content, not a generic category

2. "headline" — An attention-grabbing headline (max ${charBudgets.headline || 100} characters)
   Should capture the essence of this specific post/article. Use the subject and campaign name for inspiration.

3. "description" — A brief teaser description (max ${charBudgets.description || 180} characters)
   Summarize what the reader will learn or see. One to two sentences max.
</instructions>`;

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1024,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `<context>
<brand>${brandName}</brand>
<campaign_type>${campaignType}</campaign_type>
<campaign_name>${campaignName}</campaign_name>
<campaign_description>${campaignDescription}</campaign_description>
${editorialDirection ? `<editorial_direction>${editorialDirection}</editorial_direction>` : ""}
<post_subject>${postSubject}</post_subject>
<post_content>${postContent.slice(0, 1500)}</post_content>
</context>

${instructionsBlock}

<output_format>
Return ONLY valid JSON, no markdown, no explanation:
{"campaignTypeLabel": "...", "headline": "...", "description": "..."}
</output_format>

<constraints>
CRITICAL: Respect character limits exactly. Count characters carefully.
- campaignTypeLabel: max ${charBudgets.campaignTypeLabel || 30} chars
- headline: max ${charBudgets.headline || 100} chars
- description: max ${charBudgets.description || 180} chars
</constraints>`,
        },
      ],
    });

    // Parse response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No text response from AI" }, { status: 500 });
    }

    let generatedFields;
    try {
      // Strip markdown code fences, leading/trailing text, and extract JSON object
      let cleaned = textContent.text
        .replace(/```(?:json)?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      // If Claude wrapped the JSON in explanation text, extract the JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      generatedFields = JSON.parse(cleaned);
    } catch {
      console.error("[cover-slide-content] Failed to parse AI response:", textContent.text);
      return NextResponse.json({ error: "Failed to parse AI response: " + textContent.text.slice(0, 200) }, { status: 500 });
    }

    return NextResponse.json({
      fields: {
        campaignTypeLabel: (generatedFields.campaignTypeLabel || campaignType || "").slice(0, charBudgets.campaignTypeLabel || 30),
        headline: (generatedFields.headline || campaignName || "").slice(0, charBudgets.headline || 100),
        description: (generatedFields.description || "").slice(0, charBudgets.description || 180),
        handle: "", // Populated by the frontend from brand data
      },
      charBudgets,
    });
  } catch (err) {
    console.error("[cover-slide-content] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate cover slide content" },
      { status: 500 }
    );
  }
}
