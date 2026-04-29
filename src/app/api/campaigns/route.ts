import { NextRequest, NextResponse } from "next/server";
import { listRecords, createRecord, updateRecord, getRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess, hasBrandAccess } from "@/lib/brand-access";
import { mirrorRemoteImageToBlob } from "@/lib/blob-storage";
import type { Campaign, PlatformCadenceConfig } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  Description: string;
  URL: string;
  Type: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  "Editorial Direction": string;
  "Image URL": string;
  Status: string;
  "Created At": string;
  "Created By": string;
  "Event Date": string;
  "Event Details": string;
  "Additional URLs": string;
  "Start Date": string;
  "Target Platforms": string;
  "Max Variants Per Platform": number;
  "Platform Cadence": string;
  Tone: number;
  "Artist Handle": string;
  "Archived At": string;
}

function parseCadenceJson(raw: string | undefined | null): PlatformCadenceConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformCadenceConfig;
  } catch {
    return null;
  }
}

/**
 * Fetch metadata from a URL using Firecrawl scrape.
 * Returns the page title and og:image URL.
 */
async function fetchPageMetadata(url: string): Promise<{ title: string | null; description: string | null; imageUrl: string | null }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { title: null, description: null, imageUrl: null };

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
      }),
    });

    if (!res.ok) return { title: null, description: null, imageUrl: null };

    const data = await res.json();
    const metadata = data?.data?.metadata;
    const title = metadata?.title || metadata?.ogTitle || metadata?.["og:title"] || null;
    const description = metadata?.description || metadata?.ogDescription || metadata?.["og:description"] || null;
    let imageUrl = metadata?.ogImage || metadata?.["og:image"] || null;

    // Fallback: extract first content image from markdown if no og:image
    if (!imageUrl && data?.data?.markdown) {
      const imgMatch = data.data.markdown.match(/!\[[^\]]*\]\((https?:\/\/[^)]+\.(?:jpg|jpeg|png|webp|gif)[^)]*)\)/i);
      if (imgMatch) {
        // Skip tiny tracking pixels and icons
        const candidateUrl = imgMatch[1];
        if (!candidateUrl.includes("cleardot") && !candidateUrl.includes("1x1")) {
          imageUrl = candidateUrl;
        }
      }
    }

    return { title, description, imageUrl };
  } catch {
    return { title: null, description: null, imageUrl: null };
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await getUserBrandAccess();
    const statusFilter = request.nextUrl.searchParams.get("status") ?? "active";

    const records = await listRecords<CampaignFields>("Campaigns", {
      sort: [{ field: "Created At", direction: "desc" }],
    });

    let campaigns: Campaign[] = records.map((r) => ({
      id: r.id,
      name: r.fields.Name || "",
      description: r.fields.Description || "",
      url: r.fields.URL || "",
      type: r.fields.Type as Campaign["type"],
      brandIds: r.fields.Brand || [],
      durationDays: r.fields["Duration Days"] || 0,
      distributionBias: r.fields["Distribution Bias"] as Campaign["distributionBias"],
      editorialDirection: r.fields["Editorial Direction"] || "",
      imageUrl: r.fields["Image URL"] || "",
      status: r.fields.Status as Campaign["status"],
      createdAt: r.fields["Created At"] || "",
      createdBy: r.fields["Created By"] || "",
      eventDate: r.fields["Event Date"] || undefined,
      eventDetails: r.fields["Event Details"] || undefined,
      additionalUrls: r.fields["Additional URLs"] || undefined,
      startDate: r.fields["Start Date"] || undefined,
      targetPlatforms: r.fields["Target Platforms"] ? r.fields["Target Platforms"].split(",") : undefined,
      maxVariantsPerPlatform: r.fields["Max Variants Per Platform"] ?? undefined,
      platformCadence: parseCadenceJson(r.fields["Platform Cadence"]),
      voiceIntensity: r.fields.Tone ?? undefined,
      artistHandle: r.fields["Artist Handle"] || undefined,
      archivedAt: r.fields["Archived At"] || undefined,
    }));

    // Filter by user's allowed brands
    if (access && !access.isSuperAdmin) {
      campaigns = campaigns.filter((c) => hasCampaignAccess(access, c.brandIds));
    }

    if (statusFilter === "active") {
      campaigns = campaigns.filter((c) => !c.archivedAt);
    } else if (statusFilter === "archived") {
      campaigns = campaigns.filter((c) => !!c.archivedAt);
    }
    // "all" returns everything

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getUserBrandAccess();
    const body = await request.json();

    // Validate brand access
    if (body.brandId && access && !hasBrandAccess(access, body.brandId)) {
      return NextResponse.json(
        { error: "You do not have access to this brand" },
        { status: 403 }
      );
    }

    // Fetch page metadata (title + og:image) from the URL
    const metadata = await fetchPageMetadata(body.url);

    // Determine campaign cadence: prefer body override, fall back to brand cadence
    let cadenceJson: string | undefined;
    if (body.platformCadence && typeof body.platformCadence === "object") {
      // Client sent a modified cadence (e.g. user toggled platforms off)
      cadenceJson = JSON.stringify(body.platformCadence);
    } else if (body.brandId) {
      // Copy brand's cadence as the campaign's initial cadence
      try {
        const brandRecord = await getRecord<{ "Platform Cadence": string }>(
          "Brands",
          body.brandId
        );
        if (brandRecord.fields["Platform Cadence"]) {
          cadenceJson = brandRecord.fields["Platform Cadence"];
        }
      } catch {
        // Fall through — campaign will use brand cadence at schedule time
      }
    }

    const record = await createRecord("Campaigns", {
      Name: body.name || metadata.title || body.url,
      Description: metadata.description || "",
      URL: body.url,
      Type: body.type,
      Brand: body.brandId ? [body.brandId] : [],
      "Duration Days": body.durationDays,
      "Distribution Bias": body.distributionBias || "Front-loaded",
      "Editorial Direction": body.editorialDirection || "",
      "Image URL": metadata.imageUrl || "",
      Status: "Draft",
      "Created At": new Date().toISOString(),
      "Created By": body.createdBy || "",
      ...(body.eventDate ? { "Event Date": body.eventDate } : {}),
      ...(body.eventDetails ? { "Event Details": body.eventDetails } : {}),
      ...(body.additionalUrls ? { "Additional URLs": body.additionalUrls } : {}),
      ...(body.startDate ? { "Start Date": body.startDate } : {}),
      ...(body.targetPlatforms ? { "Target Platforms": body.targetPlatforms } : {}),
      ...(body.maxVariantsPerPlatform != null ? { "Max Variants Per Platform": body.maxVariantsPerPlatform } : {}),
      ...(cadenceJson ? { "Platform Cadence": cadenceJson } : {}),
      ...(body.voiceIntensity != null ? { Tone: body.voiceIntensity } : {}),
    });

    // Mirror the scraped og:image into Vercel Blob so the campaign's
    // Image URL is permanent. Some CMS-served URLs (Substack, Airtable-
    // backed sites) expire or rotate; saving the raw scrape URL leaves
    // the thumbnail and downstream "use as social media campaign hero"
    // fragile. Done after createRecord so the entityId for the Blob
    // path matches the new campaign. Fire-and-forget — the response
    // doesn't wait on it; the row gets patched once the mirror finishes.
    if (metadata.imageUrl) {
      mirrorRemoteImageToBlob(metadata.imageUrl, "campaigns", record.id)
        .then((mirrored) => {
          if (mirrored) {
            return updateRecord("Campaigns", record.id, {
              "Image URL": mirrored,
            });
          }
        })
        .catch((e) =>
          console.warn(
            `[campaigns POST] mirror failed for ${record.id}:`,
            (e as Error).message,
          ),
        );
    }

    return NextResponse.json({ campaign: record }, { status: 201 });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
