import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { isBlobUrl } from "@/lib/blob-storage";

// Carousel PDF override for LinkedIn document carousel posts.
//
//   POST   — token gen for @vercel/blob/client `upload()`. Returns a one-shot
//            upload token scoped to application/pdf, ≤25MB. The actual file
//            stream goes direct to Vercel Blob, bypassing the ~4.5MB function
//            payload cap.
//   PATCH  — finalize after upload completes: store the Blob URL on the
//            post's Carousel PDF URL field, fire downstream sync. Called by
//            the client because the Blob `onUploadCompleted` webhook doesn't
//            reach localhost during dev. On prod, the webhook also calls our
//            handler — both paths write the same URL idempotently.
//   DELETE — clear the field + delete the Blob.
//
// LinkedIn-only is enforced server-side: PATCH/POST reject if the post's
// platform isn't LinkedIn.

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB hard limit

interface PostFields {
  Platform?: string;
  "Carousel PDF URL"?: string;
}

async function getPostOrThrow(id: string) {
  const rec = await getRecord<PostFields>("Posts", id);
  return rec;
}

function ensureLinkedIn(platform: string | undefined) {
  if ((platform || "").toLowerCase() !== "linkedin") {
    return NextResponse.json(
      { error: "Carousel PDF override is LinkedIn-only" },
      { status: 400 },
    );
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const post = await getPostOrThrow(id);
  const guard = ensureLinkedIn(post.fields.Platform);
  if (guard) return guard;

  try {
    const body = (await req.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: MAX_PDF_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ postId: id }),
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Production-only path: Blob calls back to confirm the upload landed.
        // We mirror what PATCH does so the field is set even if the client
        // disconnects between upload + finalize.
        try {
          const payload = tokenPayload
            ? (JSON.parse(tokenPayload) as { postId?: string })
            : {};
          if (!payload.postId) return;
          await persistPdfUrl(payload.postId, blob.url);
        } catch (e) {
          console.warn(
            `[carousel-pdf] onUploadCompleted persist failed:`,
            (e as Error).message,
          );
        }
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const post = await getPostOrThrow(id);
  const guard = ensureLinkedIn(post.fields.Platform);
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url : "";
  if (!url || !isBlobUrl(url)) {
    return NextResponse.json(
      { error: "Body must be { url: <Vercel Blob URL> }" },
      { status: 400 },
    );
  }

  await persistPdfUrl(id, url);
  return NextResponse.json({ success: true, carouselPdfUrl: url });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const post = await getPostOrThrow(id);
  // No platform guard on DELETE — let users clear stale data even if the
  // post's platform was changed away from LinkedIn after attaching.
  const prev = post.fields["Carousel PDF URL"];
  if (prev && isBlobUrl(prev)) {
    await del(prev).catch(() => {});
  }
  await updateRecord("Posts", id, { "Carousel PDF URL": "" });
  const { markEdited } = await import("@/lib/post-apply");
  await markEdited(id);
  return NextResponse.json({ success: true });
}

async function persistPdfUrl(postId: string, newUrl: string) {
  // If overwriting an existing PDF, delete the old Blob.
  const existing = await getRecord<PostFields>("Posts", postId);
  const prev = existing.fields["Carousel PDF URL"];
  if (prev && prev !== newUrl && isBlobUrl(prev)) {
    await del(prev).catch(() => {});
  }
  await updateRecord("Posts", postId, { "Carousel PDF URL": newUrl });
  const { markEdited } = await import("@/lib/post-apply");
  await markEdited(postId);
}
