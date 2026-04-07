"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MediaItem } from "@/lib/media-items";

export interface OptimizePreview {
  optimizedUrl: string;
  originalUrl: string;
  dimensions: string;
  duration: number;
}

interface UseImageOptimizeOptions {
  postId: string;
  platform: string;
  onMediaUpdate: (items: MediaItem[]) => void;
  mediaItems: MediaItem[];
  saveMutation: { mutate: (items: MediaItem[]) => void };
  invalidateKeys?: string[][];
}

export function useImageOptimize({
  postId,
  platform,
  onMediaUpdate,
  mediaItems,
  saveMutation,
  invalidateKeys = [["campaign"]],
}: UseImageOptimizeOptions) {
  const queryClient = useQueryClient();
  const [optimizePreview, setOptimizePreview] = useState<OptimizePreview | null>(null);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const optimizeMutation = useMutation({
    mutationFn: async (imageIndex: number) => {
      const res = await fetch(`/api/posts/${postId}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to optimize");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info(data.reason || "Image already optimal");
      } else {
        setOptimizePreview(data);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const acceptOptimization = () => {
    if (!optimizePreview) return;
    const next = [...mediaItems];
    next[0] = { ...next[0], url: optimizePreview.optimizedUrl };
    onMediaUpdate(next);
    invalidate();
    toast.success(`Optimized for ${platform} (${optimizePreview.dimensions})`);
    setOptimizePreview(null);
  };

  const rejectOptimization = () => {
    if (optimizePreview?.originalUrl) {
      const next = [...mediaItems];
      next[0] = { ...next[0], url: optimizePreview.originalUrl };
      onMediaUpdate(next);
      saveMutation.mutate(next);
    }
    setOptimizePreview(null);
  };

  return {
    optimizePreview,
    optimizeMutation,
    acceptOptimization,
    rejectOptimization,
  };
}
