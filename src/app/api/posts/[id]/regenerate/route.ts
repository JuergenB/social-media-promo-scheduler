import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import { generatePosts, resolveAnthropicConfig } from "@/lib/anthropic";
import {
  SYSTEM_PROMPT,
  formatPlatformSettings,
  type PlatformSetting,
} from "@/lib/prompts/blog-post-generator";

interface PostFields {
  Campaign: string[];
  Platform: string;
  Content: string;
  "Image URL": string;
  "Content Variant": string;
  Status: string;
  "Short URL": string;
  "Link URL": string;
}

interface CampaignFields {
  Name: string;
  URL: string;
  Type: string;
  Brand: string[];
  "Editorial Direction": string;
  "Scraped Content": string;
}

interface BrandFields {
  Name: string;
  "Voice Guidelines": string;
  "Website URL": string;
  "Anthropic API Key Label": string;
}

const PLATFORM_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
};

/**
 * POST /api/posts/[id]/regenerate
 *
 * Regenerate a single post with optional user guidance.
 * Preserves post ID, platform, images, variant number.
 * Replaces content and firstComment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const body = await request.json().catch(() => ({}));
    const guidance = (body.guidance as string) || "";

    // Load post
    const post = await getRecord<PostFields>("Posts", postId);
    if (!["Pending", "Approved"].includes(post.fields.Status)) {
      return NextResponse.json(
        { error: `Post is "${post.fields.Status}" — can only regenerate Pending or Approved posts` },
        { status: 400 }
      );
    }

    // Load campaign
    const campaignId = post.fields.Campaign?.[0];
    if (!campaignId) {
      return NextResponse.json({ error: "Post has no campaign" }, { status: 400 });
    }
    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);

    // Load brand
    const brandId = campaign.fields.Brand?.[0];
    let brandVoice = { name: "Default", voiceGuidelines: "", websiteUrl: "" };
    let anthropicConfig = resolveAnthropicConfig();

    if (brandId) {
      const brand = await getRecord<BrandFields>("Brands", brandId);
      brandVoice = {
        name: brand.fields.Name || "Default",
        voiceGuidelines: brand.fields["Voice Guidelines"] || "",
        websiteUrl: brand.fields["Website URL"] || "",
      };
      anthropicConfig = resolveAnthropicConfig({
        anthropicApiKeyLabel: brand.fields["Anthropic API Key Label"] || null,
      });
    }

    // Load platform settings for this post's platform
    const platformKey = PLATFORM_MAP[post.fields.Platform] || post.fields.Platform.toLowerCase();
    const platformRecords = await listRecords<Record<string, unknown>>("Platform Settings", {});
    const platformSettings = platformRecords.map((r) => r.fields as unknown as PlatformSetting);
    const formattedSettings = formatPlatformSettings(platformSettings, [platformKey]);

    // Build a focused prompt for single-post regeneration
    const scrapedContent = campaign.fields["Scraped Content"] || "";
    const editorialDirection = campaign.fields["Editorial Direction"] || "";

    const userPrompt = `Regenerate 1 social media post for ${post.fields.Platform}.

<platform_best_practices>
${formattedSettings}
</platform_best_practices>

<brand_voice_guidelines>
Brand: ${brandVoice.name}
Website: ${brandVoice.websiteUrl}

${brandVoice.voiceGuidelines}
</brand_voice_guidelines>

${editorialDirection ? `<editorial_direction>\n${editorialDirection}\n</editorial_direction>` : ""}

<current_post>
${post.fields.Content}
</current_post>

${guidance ? `<user_guidance>\nThe user wants this specific change: ${guidance}\nUse the current post as a starting point — adjust it based on the guidance rather than writing from scratch. Preserve what works and change what the user asked for.\n</user_guidance>` : "<user_guidance>\nGenerate a completely fresh take — different angle, different opening, different structure.\n</user_guidance>"}

<source_content>
Campaign: ${campaign.fields.Name}
Source URL: ${campaign.fields.URL}

${scrapedContent ? scrapedContent.slice(0, 4000) : "No scraped content available — generate based on the campaign name and URL."}
</source_content>

<post_length_guidance>
Follow the Ideal Length from <platform_best_practices> above. Write at the FULL recommended length.
- Instagram Feed: Write LONG captions (800-1500 chars). Multiple paragraphs with hook → story → question → CTA. No hashtags in postText — put them in firstComment.
- LinkedIn: Thought-leadership (1000-1500 chars). Heavy line breaks. Bold opening, insight paragraphs, closing question.
- Facebook: Either short + punchy (200-500 chars) OR long storytelling (1500-2500 chars).
- Threads: Conversational, 200-300 chars.
- Bluesky: Concise, 200-275 chars.
- Pinterest: Search-optimized, 200-300 chars.
</post_length_guidance>

<link_instructions>
Include the source URL (${campaign.fields.URL}) naturally. For Instagram, say "link in bio" instead.
</link_instructions>

<output_format>
Respond with ONLY this JSON — no markdown, no explanation:
{
  "posts": [
    {
      "platform": "${platformKey}",
      "postText": "The full post text",
      "firstComment": "For Instagram ONLY: engagement hook + 10-20 hashtags. Empty string for other platforms."
    }
  ]
}
</output_format>`;

    const result = await generatePosts(SYSTEM_PROMPT, userPrompt, anthropicConfig);

    if (!result.posts || result.posts.length === 0) {
      return NextResponse.json({ error: "No post generated" }, { status: 500 });
    }

    const newPost = result.posts[0];

    // Update the existing Airtable record
    const updates: Record<string, unknown> = {
      Content: newPost.postText,
      Status: "Pending",
    };
    if (newPost.firstComment) {
      updates["First Comment"] = newPost.firstComment;
    }

    await updateRecord("Posts", postId, updates);

    return NextResponse.json({
      success: true,
      content: newPost.postText,
      firstComment: newPost.firstComment || "",
    });
  } catch (error) {
    console.error("Failed to regenerate post:", error);
    return NextResponse.json(
      { error: "Failed to regenerate post" },
      { status: 500 }
    );
  }
}
