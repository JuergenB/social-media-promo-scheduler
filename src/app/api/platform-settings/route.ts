import { NextResponse } from "next/server";
import { listRecords } from "@/lib/airtable/client";
import type { PlatformSetting } from "@/lib/airtable/types";

interface PlatformSettingFields {
  Platform_Post_Type: string;
  Max_Characters: number;
  Ideal_Length: string;
  URL_Handling: string;
  URL_Recommendation: string;
  Content_Type: string[];
  Tone: string[];
  Primary_Use_Case: string;
  Engagement_Notes: string;
  Hashtag_Limit: string;
  Video_Length: string;
  First_Comment_Strategy: string;
}

export async function GET() {
  try {
    const records = await listRecords<PlatformSettingFields>(
      "Platform Settings",
      {
        sort: [{ field: "Platform_Post_Type", direction: "asc" }],
      }
    );

    const settings: PlatformSetting[] = records.map((r) => ({
      id: r.id,
      platformPostType: r.fields.Platform_Post_Type || "",
      maxCharacters: r.fields.Max_Characters ?? null,
      idealLength: r.fields.Ideal_Length || "",
      urlHandling: r.fields.URL_Handling || "",
      urlRecommendation: r.fields.URL_Recommendation || "",
      contentType: r.fields.Content_Type || [],
      tone: r.fields.Tone || [],
      primaryUseCase: r.fields.Primary_Use_Case || "",
      engagementNotes: r.fields.Engagement_Notes || "",
      hashtagLimit: r.fields.Hashtag_Limit || "",
      videoLength: r.fields.Video_Length || "",
      firstCommentStrategy: r.fields.First_Comment_Strategy || "",
    }));

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Failed to fetch platform settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform settings" },
      { status: 500 }
    );
  }
}
