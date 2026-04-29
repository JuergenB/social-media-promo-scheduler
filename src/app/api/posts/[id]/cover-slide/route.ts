import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { parseMediaItems, serializeMediaItems, type MediaItem } from "@/lib/media-items";
import { fetchCoverSlideTemplate } from "@/lib/airtable/cover-slide-templates";
import { renderCoverSlide, deriveSchemeFromBackground, deriveCharBudgets } from "@/lib/cover-slide-renderer";
import { uploadImage, deleteImage, isBlobUrl } from "@/lib/blob-storage";
import { createBrandClient } from "@/lib/late-api/client";
import type { ColorScheme, CoverSlideContent, CoverSlideData } from "@/lib/cover-slide-types";

/** Slide dimensions per platform aspect ratio. */
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
};

interface PostFields {
  Content: string;
  Platform: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  "Cover Slide Data": string;
  "Original Media": string;
  subject: string;
}

interface CampaignFields {
  Name: string;
  Type: string;
  "Brand IDs": string[];
}

/**
 * POST /api/posts/[id]/cover-slide
 *
 * Preview or apply a cover slide to a post.
 *
 * Body:
 *   - apply: boolean — false = return base64 preview, true = upload + prepend to media
 *   - templateId: string — Airtable record ID of the template
 *   - fields: { campaignTypeLabel, headline, description, handle }
 *   - imageOffset: number (0-100) — vertical position of background image
 *   - backgroundColor: string (hex) — user-picked background color (eyedropper)
 *   - platform: string — for dimension selection
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const apply = body.apply === true;
    const templateId: string = body.templateId;
    const fields = body.fields as CoverSlideContent | undefined;
    const imageOffset: number = body.imageOffset ?? 30;
    const backgroundColor: string | undefined = body.backgroundColor;
    const fontSizeDeltas: Record<string, number> | undefined = body.fontSizeDeltas;
    const showLinkInBio: boolean = body.showLinkInBio === true;
    const platform: string = body.platform || "instagram";
    const sourceImageUrl: string | undefined = typeof body.sourceImageUrl === "string" ? body.sourceImageUrl : undefined;
    const overlayOpacity: number | undefined = typeof body.overlayOpacity === "number" ? body.overlayOpacity : undefined;
    const overlayTint: string | undefined = typeof body.overlayTint === "string" ? body.overlayTint : undefined;
    const keepOriginalColors: boolean = body.keepOriginalColors === true;
    const blurBackground: boolean = body.blurBackground === true;
    const insertPosition: "prepend" | "append" = body.insertPosition === "append" ? "append" : "prepend";

    if (!templateId) {
      return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    }

    // Fetch template
    const template = await fetchCoverSlideTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Fetch post
    const post = await getRecord<PostFields>("Posts", id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Two separate concerns:
    // 1. primaryImage: use the ORIGINAL raw photo for the cover background
    //    (not a rendered slide with frame/caption baked in)
    // 2. currentMediaItems: the post's CURRENT media (possibly rendered slides)
    //    — these stay untouched when we prepend the cover
    const currentMediaItems = parseMediaItems(post.fields);

    // Determine which image to use as the background.
    // If sourceImageUrl is provided, use that exact URL.
    // Otherwise, fall back to the first raw/original image.
    const rawItems: MediaItem[] = (() => {
      if (post.fields["Original Media"]) {
        try {
          const items: MediaItem[] = JSON.parse(post.fields["Original Media"]);
          if (items.length > 0) return items;
        } catch { /* fall through */ }
      }
      return currentMediaItems;
    })();

    let primaryImage: string | undefined;
    if (sourceImageUrl) {
      // Use the exact URL the client specified (avoids index mismatch issues)
      primaryImage = sourceImageUrl;
    } else {
      primaryImage = rawItems[0]?.url;
    }

    if (!primaryImage) {
      return NextResponse.json(
        { error: "Post has no images — cover slide needs at least one" },
        { status: 400 }
      );
    }

    // Resolve content
    const content: CoverSlideContent = {
      primaryImage,
      campaignTypeLabel: fields?.campaignTypeLabel || "",
      headline: fields?.headline || "",
      description: fields?.description || "",
      handle: fields?.handle || "",
      brandLogoUrl: fields?.brandLogoUrl || null,
    };

    // Resolve dimensions based on platform
    const aspectRatio = ["linkedin", "bluesky"].includes(platform.toLowerCase()) ? "1:1" : "4:5";
    const dims = DIMENSIONS[aspectRatio];

    // Color scheme: user-picked background overrides template defaults
    let colorSchemeOverrides: Partial<ColorScheme> | undefined;
    if (backgroundColor) {
      colorSchemeOverrides = deriveSchemeFromBackground(backgroundColor);
    }

    // Render
    const result = await renderCoverSlide({
      template,
      content,
      width: dims.width,
      height: dims.height,
      imageOffset,
      colorSchemeOverrides,
      fontSizeDeltas,
      showLinkInBio,
      overlayOpacity,
      overlayTint,
      keepOriginalColors,
      blurBackground,
    });

    if (!apply) {
      // Preview mode
      const dataUri = `data:image/jpeg;base64,${result.buffer.toString("base64")}`;
      return NextResponse.json({
        preview: {
          dataUri,
          dimensions: dims,
          colorScheme: result.colorScheme,
          charBudgets: result.charBudgets,
        },
      });
    }

    // Apply mode: upload and insert into media items
    const coverUrl = await uploadImage("posts", id, result.buffer, "image/jpeg");

    // Insert cover slide into media items (prepend for lead covers, append for additional cards)
    const newMediaItems: MediaItem[] = insertPosition === "append"
      ? [...currentMediaItems, { url: coverUrl, caption: "" }]
      : [{ url: coverUrl, caption: "" }, ...currentMediaItems];

    // Save to Airtable
    const serialized = serializeMediaItems(newMediaItems);

    // Build designed card URL list — preserve any existing ones and add the new one
    let existingDesignedUrls: string[] = [];
    if (post.fields["Cover Slide Data"]) {
      try {
        const existing: CoverSlideData = JSON.parse(post.fields["Cover Slide Data"]);
        existingDesignedUrls = existing.designedCardUrls || [];
        if (existing.appliedUrl && !existingDesignedUrls.includes(existing.appliedUrl)) {
          existingDesignedUrls.push(existing.appliedUrl);
        }
      } catch { /* ignore */ }
    }
    const designedCardUrls = [...new Set([...existingDesignedUrls, coverUrl])];

    // When appending a new card, preserve existing cover slide data (appliedUrl, fields, etc.)
    // Only update designedCardUrls. When prepending (default), overwrite everything.
    let coverSlideData: CoverSlideData;
    if (insertPosition === "append" && post.fields["Cover Slide Data"]) {
      try {
        const existing: CoverSlideData = JSON.parse(post.fields["Cover Slide Data"]);
        coverSlideData = { ...existing, designedCardUrls };
      } catch {
        coverSlideData = {
          templateId, fields: { campaignTypeLabel: content.campaignTypeLabel, headline: content.headline, description: content.description, handle: content.handle },
          imageOffset, fontSizeDeltas, showLinkInBio, appliedUrl: coverUrl, designedCardUrls,
        };
      }
    } else {
      coverSlideData = {
        templateId,
        fields: {
          campaignTypeLabel: content.campaignTypeLabel,
          headline: content.headline,
          description: content.description,
          handle: content.handle,
        },
        imageOffset, fontSizeDeltas, showLinkInBio,
        appliedUrl: coverUrl,
        designedCardUrls,
        overlayOpacity,
        overlayTint,
        keepOriginalColors,
        blurBackground,
        sourceImageUrl: primaryImage,
      };
    }

    await updateRecord("Posts", id, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
      "Cover Slide Data": JSON.stringify(coverSlideData),
    });

    const { markEdited } = await import("@/lib/post-apply");
    markEdited(id).catch(() => {});

    return NextResponse.json({
      applied: true,
      coverSlideUrl: coverUrl,
      mediaItems: newMediaItems,
    });
  } catch (err) {
    console.error("[cover-slide] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to render cover slide" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[id]/cover-slide
 *
 * Remove the cover slide from a post, restoring the original media order.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await getRecord<PostFields>("Posts", id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const coverDataStr = post.fields["Cover Slide Data"];
    if (!coverDataStr) {
      return NextResponse.json(
        { error: "No cover slide applied to this post" },
        { status: 400 }
      );
    }

    let coverData: CoverSlideData;
    try {
      coverData = JSON.parse(coverDataStr);
    } catch {
      return NextResponse.json(
        { error: "Invalid cover slide data" },
        { status: 500 }
      );
    }

    // Remove the cover slide (first item) from media items
    const mediaItems = parseMediaItems(post.fields);
    const restoredItems = mediaItems.slice(1); // Remove prepended cover slide

    // Update Airtable
    const serialized = serializeMediaItems(restoredItems);
    await updateRecord("Posts", id, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
      "Cover Slide Data": "",
    });

    const { markEdited } = await import("@/lib/post-apply");
    markEdited(id).catch(() => {});

    // Clean up cover slide blob
    if (coverData.appliedUrl && isBlobUrl(coverData.appliedUrl)) {
      deleteImage(coverData.appliedUrl).catch((err) =>
        console.warn("[cover-slide] Failed to delete blob:", coverData.appliedUrl, err)
      );
    }

    return NextResponse.json({
      removed: true,
      mediaItems: restoredItems,
    });
  } catch (err) {
    console.error("[cover-slide] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove cover slide" },
      { status: 500 }
    );
  }
}
