import { NextRequest, NextResponse } from "next/server";
import { listRecords, createRecord } from "@/lib/airtable/client";
import type { Campaign } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
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
}

/**
 * Fetch metadata from a URL using Firecrawl scrape.
 * Returns the page title and og:image URL.
 */
async function fetchPageMetadata(url: string): Promise<{ title: string | null; imageUrl: string | null }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { title: null, imageUrl: null };

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

    if (!res.ok) return { title: null, imageUrl: null };

    const data = await res.json();
    const metadata = data?.data?.metadata;
    const title = metadata?.title || metadata?.ogTitle || metadata?.["og:title"] || null;
    const imageUrl = metadata?.ogImage || metadata?.["og:image"] || null;
    return { title, imageUrl };
  } catch {
    return { title: null, imageUrl: null };
  }
}

export async function GET() {
  try {
    const records = await listRecords<CampaignFields>("Campaigns", {
      sort: [{ field: "Created At", direction: "desc" }],
    });

    const campaigns: Campaign[] = records.map((r) => ({
      id: r.id,
      name: r.fields.Name || "",
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
    }));

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
    const body = await request.json();

    // Fetch page metadata (title + og:image) from the URL
    const metadata = await fetchPageMetadata(body.url);

    const record = await createRecord("Campaigns", {
      Name: body.name || metadata.title || body.url,
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
    });

    return NextResponse.json({ campaign: record }, { status: 201 });
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
