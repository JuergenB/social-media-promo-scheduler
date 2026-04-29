import { NextRequest, NextResponse } from "next/server";
import { listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess } from "@/lib/brand-access";
import type { Brand, PlatformCadenceConfig, ToneDimensions } from "@/lib/airtable/types";

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small?: { url: string };
    large?: { url: string };
    full?: { url: string };
  };
}

interface BrandFields {
  Name: string;
  "Website URL": string;
  "Zernio API Key Label": string;
  "Zernio Profile ID": string;
  "Voice Guidelines": string;
  "Newsletter URL": string;
  Logo: AirtableAttachment[];
  "Short Domain": string;
  "Short API Key Label": string;
  "Anthropic API Key Label": string;
  Timezone: string;
  "Platform Cadence": string;
  "Instagram Handle": string;
  "Logo Transparent Light": string;
  "Logo Transparent Dark": string;
  "Logo Rectangular Light": string;
  "Logo Rectangular Dark": string;
  "Logo Color Square": string;
  "Logo Color Rectangular": string;
  "Tone Dimensions": string;
  "Tone Notes": string;
  "Default Voice Intensity": number;
  "Lnk.Bio Enabled": boolean;
  "Lnk.Bio Group ID": string;
  "Lnk.Bio Username": string;
  "Lnk.Bio Client ID Label": string;
  "Lnk.Bio Client Secret Label": string;
  "Subscribe URL": string;
  Status: "Active" | "Inactive";
}

function parseCadenceJson(raw: string | undefined | null): PlatformCadenceConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformCadenceConfig;
  } catch {
    return null;
  }
}

function parseToneDimensions(raw: string | undefined | null): ToneDimensions | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ToneDimensions;
  } catch {
    return undefined;
  }
}

function mapBrand(r: { id: string; fields: BrandFields }): Brand {
  const logo = r.fields.Logo?.[0];
  return {
    id: r.id,
    name: r.fields.Name || "",
    websiteUrl: r.fields["Website URL"] || "",
    zernioApiKeyLabel: r.fields["Zernio API Key Label"] || "",
    zernioProfileId: r.fields["Zernio Profile ID"] || "",
    voiceGuidelines: r.fields["Voice Guidelines"] || "",
    newsletterUrl: r.fields["Newsletter URL"] || "",
    logoUrl: logo?.thumbnails?.large?.url || logo?.url || null,
    shortDomain: r.fields["Short Domain"] || null,
    shortApiKeyLabel: r.fields["Short API Key Label"] || null,
    anthropicApiKeyLabel: r.fields["Anthropic API Key Label"] || null,
    timezone: r.fields.Timezone || null,
    platformCadence: parseCadenceJson(r.fields["Platform Cadence"]),
    instagramHandle: r.fields["Instagram Handle"] || null,
    logoTransparentLight: r.fields["Logo Transparent Light"] || null,
    logoTransparentDark: r.fields["Logo Transparent Dark"] || null,
    logoRectangularLight: r.fields["Logo Rectangular Light"] || null,
    logoRectangularDark: r.fields["Logo Rectangular Dark"] || null,
    logoColorSquare: r.fields["Logo Color Square"] || null,
    logoColorRect: r.fields["Logo Color Rectangular"] || null,
    toneDimensions: parseToneDimensions(r.fields["Tone Dimensions"]),
    toneNotes: r.fields["Tone Notes"] || undefined,
    defaultVoiceIntensity: r.fields["Default Voice Intensity"] ?? undefined,
    lnkBioEnabled: r.fields["Lnk.Bio Enabled"] || false,
    lnkBioGroupId: r.fields["Lnk.Bio Group ID"] || null,
    lnkBioUsername: r.fields["Lnk.Bio Username"] || null,
    lnkBioClientIdLabel: r.fields["Lnk.Bio Client ID Label"] || null,
    lnkBioClientSecretLabel: r.fields["Lnk.Bio Client Secret Label"] || null,
    subscribeUrl: r.fields["Subscribe URL"] || "",
    status: r.fields.Status || "Active",
  };
}

export async function GET() {
  try {
    const access = await getUserBrandAccess();

    const records = await listRecords<BrandFields>("Brands", {
      filterByFormula: '{Status} = "Active"',
      sort: [{ field: "Name", direction: "asc" }],
    });

    let brands: Brand[] = records.map((r) =>
      mapBrand(r as { id: string; fields: BrandFields })
    );

    // Filter by user's allowed brands (unrestricted users see all)
    if (access && !access.isSuperAdmin && access.brandIds.length > 0) {
      brands = brands.filter((b) => access.brandIds.includes(b.id));
    }

    return NextResponse.json({ brands });
  } catch (error) {
    console.error("Failed to fetch brands:", error);
    return NextResponse.json(
      { error: "Failed to fetch brands" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Brand ID required" }, { status: 400 });
    }

    // Map camelCase fields to Airtable field names
    const fieldMap: Record<string, string> = {
      name: "Name",
      websiteUrl: "Website URL",
      newsletterUrl: "Newsletter URL",
      voiceGuidelines: "Voice Guidelines",
      zernioProfileId: "Zernio Profile ID",
      zernioApiKeyLabel: "Zernio API Key Label",
      timezone: "Timezone",
      platformCadence: "Platform Cadence",
      toneDimensions: "Tone Dimensions",
      toneNotes: "Tone Notes",
      defaultVoiceIntensity: "Default Voice Intensity",
      lnkBioEnabled: "Lnk.Bio Enabled",
      lnkBioGroupId: "Lnk.Bio Group ID",
      lnkBioUsername: "Lnk.Bio Username",
      lnkBioClientIdLabel: "Lnk.Bio Client ID Label",
      lnkBioClientSecretLabel: "Lnk.Bio Client Secret Label",
      logoTransparentLight: "Logo Transparent Light",
      logoTransparentDark: "Logo Transparent Dark",
      logoRectangularLight: "Logo Rectangular Light",
      logoRectangularDark: "Logo Rectangular Dark",
      logoColorSquare: "Logo Color Square",
      logoColorRect: "Logo Color Rectangular",
      subscribeUrl: "Subscribe URL",
      status: "Status",
    };

    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      const airtableField = fieldMap[key];
      if (airtableField) {
        // Serialize objects to JSON for long-text fields
        fields[airtableField] = (key === "platformCadence" || key === "toneDimensions") && typeof value === "object"
          ? JSON.stringify(value)
          : value;
      }
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Brands/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const error = await res.json();
      throw new Error(JSON.stringify(error));
    }

    const record = await res.json();
    return NextResponse.json({
      brand: mapBrand(record as { id: string; fields: BrandFields }),
    });
  } catch (error) {
    console.error("Failed to update brand:", error);
    return NextResponse.json(
      { error: "Failed to update brand" },
      { status: 500 }
    );
  }
}
