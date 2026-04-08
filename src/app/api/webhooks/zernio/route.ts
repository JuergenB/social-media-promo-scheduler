import { NextRequest, NextResponse } from "next/server";
import { listRecords, getRecord, updateRecord } from "@/lib/airtable/client";

interface PostFields {
  "Zernio Post ID": string;
  Status: string;
  Campaign?: string[]; // linked record IDs
}

interface CampaignFields {
  Name?: string;
  Brand?: string[]; // linked record IDs
}

interface BrandFields {
  Name?: string;
}

const WEBHOOK_SECRET = process.env.ZERNIO_WEBHOOK_SECRET;

interface WebhookPlatformResult {
  platform?: string;
  status?: string;
  publishedUrl?: string;
  error?: string;
}

interface WebhookPayload {
  event?: string;
  post?: {
    id?: string;
    status?: string;
    publishedAt?: string;
    platforms?: WebhookPlatformResult[];
  };
  timestamp?: string;
}

/**
 * POST /api/webhooks/zernio
 *
 * Receives webhook events from Zernio when post status changes.
 * Updates the corresponding Airtable Post record.
 *
 * Events handled:
 *   post.published — post went live on all platforms
 *   post.failed    — post failed on all platforms
 *   post.partial   — mixed results (some succeeded, some failed)
 */
export async function POST(request: NextRequest) {
  try {
    // ── Webhook authentication ───────────────────────────────────────────
    const sourceIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const signature = request.headers.get("x-signature") || request.headers.get("x-webhook-signature");

    if (WEBHOOK_SECRET) {
      // Check signature header first, then query param fallback
      const providedSecret = signature || request.nextUrl.searchParams.get("secret");
      if (providedSecret !== WEBHOOK_SECRET) {
        console.warn(`[webhook] Rejected: invalid secret from IP ${sourceIp}`);
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    } else {
      console.warn("[webhook] ZERNIO_WEBHOOK_SECRET not set — accepting all requests. Set this env var in production.");
    }

    if (signature) {
      console.log(`[webhook] Request from IP ${sourceIp} with signature header`);
    } else {
      console.log(`[webhook] Request from IP ${sourceIp} (no signature header)`);
    }

    const payload: WebhookPayload = await request.json();

    const event = payload.event;
    const zernioPostId = payload.post?.id;

    if (!event || !zernioPostId) {
      return NextResponse.json({ received: true, skipped: "missing event or post id" });
    }

    // Only handle post lifecycle events
    if (!event.startsWith("post.")) {
      return NextResponse.json({ received: true, skipped: `unhandled event: ${event}` });
    }

    console.log(`[webhook] ${event} for zernio post ${zernioPostId}`);

    // Find the Airtable post by Zernio Post ID
    const posts = await listRecords<PostFields>("Posts", {
      filterByFormula: `{Zernio Post ID} = '${zernioPostId}'`,
      fields: ["Zernio Post ID", "Status", "Campaign"],
    });

    if (posts.length === 0) {
      console.warn(`[webhook] No Airtable post found for Zernio ID: ${zernioPostId}`);
      return NextResponse.json({ received: true, skipped: "post not found in Airtable" });
    }

    const airtablePost = posts[0];

    // ── Brand verification ─────────────────────────────────────────────
    let brandName = "unknown";
    const campaignIds = (airtablePost.fields as PostFields).Campaign;
    if (campaignIds && campaignIds.length > 0) {
      try {
        const campaign = await getRecord<CampaignFields>("Campaigns", campaignIds[0]);
        const brandIds = campaign.fields.Brand;
        if (brandIds && brandIds.length > 0) {
          const brand = await getRecord<BrandFields>("Brands", brandIds[0]);
          brandName = brand.fields.Name || brandIds[0];
        } else {
          console.warn(`[webhook] Campaign ${campaignIds[0]} has no brand linked`);
        }
      } catch (err) {
        console.warn(`[webhook] Failed to resolve brand for campaign ${campaignIds[0]}:`, err);
      }
    } else {
      console.warn(`[webhook] Post ${airtablePost.id} has no campaign linked`);
    }
    console.log(`[webhook] Brand: ${brandName} | Post: ${airtablePost.id} | Event: ${event}`);

    const updates: Record<string, unknown> = {};

    // Map Zernio event to Airtable status
    switch (event) {
      case "post.published":
        updates.Status = "Published";
        break;

      case "post.failed": {
        updates.Status = "Failed";
        // Collect error messages from platforms
        const errors = payload.post?.platforms
          ?.filter((p) => p.error)
          .map((p) => `${p.platform}: ${p.error}`)
          .join("; ");
        if (errors) {
          console.error(`[webhook] Post ${airtablePost.id} failed: ${errors}`);
        }
        break;
      }

      case "post.partial": {
        // Some platforms succeeded, some failed — mark as Published with note
        const failed = payload.post?.platforms?.filter((p) => p.status === "failed" || p.error);
        if (failed && failed.length > 0) {
          updates.Status = "Failed";
          console.warn(
            `[webhook] Post ${airtablePost.id} partial failure:`,
            failed.map((p) => `${p.platform}: ${p.error}`).join("; ")
          );
        } else {
          updates.Status = "Published";
        }
        break;
      }

      case "post.scheduled":
        // Already handled during publish — no action needed
        return NextResponse.json({ received: true, skipped: "already scheduled" });

      default:
        return NextResponse.json({ received: true, skipped: `unhandled event: ${event}` });
    }

    if (Object.keys(updates).length > 0) {
      await updateRecord("Posts", airtablePost.id, updates);
      console.log(`[webhook] Updated post ${airtablePost.id}: ${JSON.stringify(updates)}`);
    }

    return NextResponse.json({ received: true, event, postId: airtablePost.id, updates });
  } catch (error) {
    console.error("[webhook] Error processing Zernio webhook:", error);
    // Return 200 anyway to prevent Zernio from retrying
    return NextResponse.json({ received: true, error: "internal processing error" });
  }
}
