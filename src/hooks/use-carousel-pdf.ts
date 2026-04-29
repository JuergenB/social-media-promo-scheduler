"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { getPostDirtyActions } from "@/hooks/use-post-dirty";

interface UseCarouselPdfOptions {
  postId: string;
  /** Initial Carousel PDF URL from the Post record (empty string if none). */
  initialUrl: string;
  /** Query keys to invalidate after upload/remove. */
  invalidateKeys?: string[][];
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Manage the LinkedIn carousel PDF override for a single post.
 *
 * Upload uses `@vercel/blob/client`'s `upload()` to stream the file directly
 * to Vercel Blob (bypassing the ~4.5MB serverless function payload cap), then
 * PATCHes our endpoint to persist the resulting URL on the Post record.
 */
export function useCarouselPdf({
  postId,
  initialUrl,
  invalidateKeys = [["campaign"]],
}: UseCarouselPdfOptions) {
  const queryClient = useQueryClient();
  const [carouselPdfUrl, setCarouselPdfUrl] = useState<string>(initialUrl);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const uploadPdfMutation = useMutation({
    onMutate: () => getPostDirtyActions().markDirty(postId),
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf") {
        throw new Error("File must be a PDF");
      }
      if (file.size > MAX_PDF_BYTES) {
        throw new Error(
          `PDF exceeds 25 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        );
      }
      // Phase 1: client streams direct to Blob using a token from our endpoint.
      const blob = await upload(`carousel-pdfs/${postId}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: `/api/posts/${postId}/carousel-pdf`,
        contentType: "application/pdf",
      });
      // Phase 2: tell our server to persist the URL. In production the Blob
      // `onUploadCompleted` webhook also calls our endpoint and would set the
      // same URL, but we don't rely on that — webhooks don't reach localhost
      // and we want the UI to update on dev too.
      const res = await fetch(`/api/posts/${postId}/carousel-pdf`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save PDF URL");
      }
      return blob.url;
    },
    onSuccess: (url) => {
      setCarouselPdfUrl(url);
      invalidate();
      toast.success("PDF carousel attached — will publish as a single document");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removePdfMutation = useMutation({
    onMutate: () => getPostDirtyActions().markDirty(postId),
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}/carousel-pdf`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove PDF");
    },
    onSuccess: () => {
      setCarouselPdfUrl("");
      invalidate();
      toast.success("PDF detached");
    },
    onError: () => toast.error("Failed to remove PDF"),
  });

  return {
    carouselPdfUrl,
    setCarouselPdfUrl,
    uploadPdfMutation,
    removePdfMutation,
    hasPdf: carouselPdfUrl.length > 0,
  };
}
