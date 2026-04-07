import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { parseMediaItems, serializeMediaItems, type MediaItem } from "@/lib/media-items";
import { renderCarouselSlides, type SlideOptions, type RGB } from "@/lib/image-caption";
import { uploadImage, deleteImage, isBlobUrl } from "@/lib/blob-storage";

interface PostFields {
  Content: string;
  Platform: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  "Original Media": string;
  "Cover Slide Data": string;
}

/**
 * POST /api/posts/[id]/carousel-preview
 *
 * Render carousel slides with adaptive frame color and captions.
 *
 * Body:
 *   - apply: boolean — false = return base64 previews, true = upload to Blob + update post
 *   - slideOptions: SlideOptions[] — optional per-slide options:
 *       { frameColor?: {r,g,b}, removeColor?: {r,g,b}, removeTolerance?: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const apply = body.apply === true;
    const slideOptions: (SlideOptions | undefined)[] | undefined = body.slideOptions;
    const platform: string | undefined = body.platform;

    const post = await getRecord<PostFields>("Posts", id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Use platform from request body, fall back to post's platform
    const resolvedPlatform = platform || (post.fields.Platform || "instagram").toLowerCase();

    let mediaItems = parseMediaItems(post.fields);

    // Exclude all designed cards (covers, quote cards) from carousel slide generation.
    // Designed cards are tracked by URL in coverSlideData.designedCardUrls so
    // reordering images doesn't break the exclusion.
    if (post.fields["Cover Slide Data"]) {
      try {
        const coverData = JSON.parse(post.fields["Cover Slide Data"]);
        const designedUrls = new Set<string>(coverData.designedCardUrls || []);
        // Also include the legacy appliedUrl for backward compatibility
        if (coverData.appliedUrl) designedUrls.add(coverData.appliedUrl);
        if (designedUrls.size > 0) {
          mediaItems = mediaItems.filter((item) => !designedUrls.has(item.url));
        }
      } catch { /* ignore parse errors */ }
    }

    if (mediaItems.length < 1) {
      return NextResponse.json(
        { error: "No images available to render as carousel slides" },
        { status: 400 }
      );
    }

    // Render all slides with platform-specific dimensions
    const slideResults = await renderCarouselSlides(mediaItems, slideOptions, resolvedPlatform);

    if (!apply) {
      // Preview mode: return base64 data URIs + frame colors used
      const previews = slideResults.map((result, i) => ({
        index: i,
        dataUri: `data:image/jpeg;base64,${result.buffer.toString("base64")}`,
        caption: mediaItems[i]?.caption || "",
        frameColor: result.frameColor,
      }));

      return NextResponse.json({ previews });
    }

    // Apply mode: save originals (if not already saved), upload rendered slides, update post

    // Back up original media before overwriting (only on first apply)
    if (!post.fields["Original Media"]) {
      const originalBackup = JSON.stringify(mediaItems);
      // Write backup immediately so it's available even if subsequent steps fail
      await updateRecord("Posts", id, {
        "Original Media": originalBackup,
      });
    }

    // Upload rendered slides to Vercel Blob
    const renderedSlides: MediaItem[] = [];
    for (let i = 0; i < slideResults.length; i++) {
      const url = await uploadImage("posts", id, slideResults[i].buffer, "image/jpeg");
      renderedSlides.push({
        url,
        caption: mediaItems[i]?.caption || "",
      });
    }

    // Re-insert designed cards (covers, quote cards) at their original positions.
    // This preserves user-arranged order of designed cards among the rendered slides.
    const allItems = parseMediaItems(post.fields);
    let designedUrls = new Set<string>();
    if (post.fields["Cover Slide Data"]) {
      try {
        const coverData = JSON.parse(post.fields["Cover Slide Data"]);
        (coverData.designedCardUrls || []).forEach((u: string) => designedUrls.add(u));
        if (coverData.appliedUrl) designedUrls.add(coverData.appliedUrl);
      } catch { /* ignore */ }
    }

    // Rebuild the full list: walk through original order, replacing raw images
    // with rendered slides while keeping designed cards in place
    const newMediaItems: MediaItem[] = [];
    let slideIdx = 0;
    for (const item of allItems) {
      if (designedUrls.has(item.url)) {
        // Keep designed card as-is in its current position
        newMediaItems.push(item);
      } else if (slideIdx < renderedSlides.length) {
        // Replace raw image with rendered slide
        newMediaItems.push(renderedSlides[slideIdx]);
        slideIdx++;
      }
    }
    // Append any remaining slides (shouldn't happen, but safety)
    while (slideIdx < renderedSlides.length) {
      newMediaItems.push(renderedSlides[slideIdx++]);
    }
    const serialized = serializeMediaItems(newMediaItems);
    await updateRecord("Posts", id, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
    });

    return NextResponse.json({
      applied: true,
      mediaItems: newMediaItems,
    });
  } catch (err) {
    console.error("[carousel-preview] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to render carousel slides" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[id]/carousel-preview
 *
 * Reset slides: restore original images from backup, clean up slide blobs.
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

    const originalMedia = post.fields["Original Media"];
    if (!originalMedia) {
      return NextResponse.json(
        { error: "No original media backup found — slides were not applied" },
        { status: 400 }
      );
    }

    // Parse original media backup
    let originalItems: MediaItem[];
    try {
      originalItems = JSON.parse(originalMedia);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse original media backup" },
        { status: 500 }
      );
    }

    // Collect current slide blob URLs for cleanup
    const currentItems = parseMediaItems(post.fields);
    const blobUrlsToDelete = currentItems
      .map((item) => item.url)
      .filter((url) => isBlobUrl(url));

    // If a cover slide exists, preserve it as the first item
    let coverItem: MediaItem | null = null;
    if (post.fields["Cover Slide Data"]) {
      try {
        const coverData = JSON.parse(post.fields["Cover Slide Data"]);
        const allItems = parseMediaItems(post.fields);
        if (coverData.appliedUrl && allItems[0]?.url === coverData.appliedUrl) {
          coverItem = allItems[0];
        }
      } catch { /* ignore */ }
    }

    const restoredItems = coverItem ? [coverItem, ...originalItems] : originalItems;
    const serialized = serializeMediaItems(restoredItems);
    await updateRecord("Posts", id, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
      "Original Media": "",
    });

    // Fire-and-forget: clean up orphaned slide blobs (but NOT the cover slide blob)
    const coverUrl = coverItem?.url;
    for (const url of blobUrlsToDelete) {
      if (url === coverUrl) continue; // Don't delete the cover slide
      deleteImage(url).catch((err) =>
        console.warn("[carousel-reset] Failed to delete blob:", url, err)
      );
    }

    return NextResponse.json({
      reset: true,
      mediaItems: restoredItems,
    });
  } catch (err) {
    console.error("[carousel-reset] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset slides" },
      { status: 500 }
    );
  }
}
