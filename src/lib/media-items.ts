/**
 * Shared media items helper — parse/serialize carousel images with optional captions.
 *
 * Airtable storage:
 *   - "Image URL": primary image URL (string)
 *   - "Media URLs": additional image URLs (newline-separated string)
 *   - "Media Captions": JSON array of {url, caption} for all images including primary
 *
 * When "Media Captions" exists, it is the source of truth (preserves captions + ordering).
 * When absent, falls back to Image URL + Media URLs with empty captions.
 */

export interface MediaItem {
  url: string;
  caption: string;
}

/**
 * Parse media items from Airtable fields.
 * Prefers "Media Captions" JSON when available, falls back to URL fields.
 */
export function parseMediaItems(fields: {
  "Image URL"?: string;
  "Media URLs"?: string;
  "Media Captions"?: string;
}): MediaItem[] {
  // Try JSON source of truth first
  if (fields["Media Captions"]) {
    try {
      const parsed = JSON.parse(fields["Media Captions"]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: { url?: string; caption?: string }) => ({
          url: item.url || "",
          caption: item.caption || "",
        }));
      }
    } catch {
      // Fall through to URL-based parsing
    }
  }

  // Fallback: build from URL fields with empty captions
  const items: MediaItem[] = [];
  if (fields["Image URL"]) {
    items.push({ url: fields["Image URL"], caption: "" });
  }
  if (fields["Media URLs"]) {
    for (const line of fields["Media URLs"].split("\n")) {
      const url = line.trim();
      if (url && !items.some((i) => i.url === url)) {
        items.push({ url, caption: "" });
      }
    }
  }
  return items;
}

/**
 * Serialize media items to Airtable fields.
 * Writes all three fields for backward compatibility.
 */
export function serializeMediaItems(items: MediaItem[]): {
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
} {
  return {
    "Image URL": items[0]?.url || "",
    "Media URLs": items.slice(1).map((i) => i.url).join("\n"),
    "Media Captions": JSON.stringify(items),
  };
}
