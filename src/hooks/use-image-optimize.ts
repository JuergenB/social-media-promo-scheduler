"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MediaItem } from "@/lib/media-items";
import { getPostDirtyActions } from "@/hooks/use-post-dirty";

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

/** Delay between sequential outpaint API calls (ms) */
const BATCH_DELAY_MS = 2000;

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

  // Batch state
  const batchQueueRef = useRef<number[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const currentIndexRef = useRef<number>(0);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const optimizeMutation = useMutation({
    onMutate: () => getPostDirtyActions().markDirty(postId),
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
        // Move to next in batch if any
        processNextInBatch();
      } else {
        setOptimizePreview(data);
        // Preview dialog will call accept/reject which triggers next
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
      // Continue with remaining batch items despite the error
      processNextInBatch();
    },
  });

  const processNextInBatch = useCallback(() => {
    const queue = batchQueueRef.current;
    const nextIdx = currentIndexRef.current + 1;

    if (nextIdx >= queue.length) {
      // Batch complete
      setBatchProgress(null);
      batchQueueRef.current = [];
      currentIndexRef.current = 0;
      return;
    }

    currentIndexRef.current = nextIdx;
    setBatchProgress({ current: nextIdx + 1, total: queue.length });

    // Delay before next API call to avoid rate limits
    setTimeout(() => {
      optimizeMutation.mutate(queue[nextIdx]);
    }, BATCH_DELAY_MS);
  }, [optimizeMutation]);

  /** Start outpainting a batch of images by their media item indices. */
  const startBatchOptimize = useCallback((indices: number[]) => {
    if (indices.length === 0) return;
    batchQueueRef.current = indices;
    currentIndexRef.current = 0;
    setBatchProgress({ current: 1, total: indices.length });
    optimizeMutation.mutate(indices[0]);
  }, [optimizeMutation]);

  const acceptOptimization = useCallback(() => {
    if (!optimizePreview) return;
    const currentImageIndex = batchQueueRef.current[currentIndexRef.current] ?? 0;
    const next = [...mediaItems];
    next[currentImageIndex] = { ...next[currentImageIndex], url: optimizePreview.optimizedUrl };
    onMediaUpdate(next);
    invalidate();
    toast.success(`Optimized for ${platform} (${optimizePreview.dimensions})`);
    setOptimizePreview(null);
    processNextInBatch();
  }, [optimizePreview, mediaItems, platform, onMediaUpdate, processNextInBatch]);

  const rejectOptimization = useCallback(() => {
    if (optimizePreview?.originalUrl) {
      const currentImageIndex = batchQueueRef.current[currentIndexRef.current] ?? 0;
      const next = [...mediaItems];
      next[currentImageIndex] = { ...next[currentImageIndex], url: optimizePreview.originalUrl };
      onMediaUpdate(next);
      saveMutation.mutate(next);
    }
    setOptimizePreview(null);
    processNextInBatch();
  }, [optimizePreview, mediaItems, onMediaUpdate, saveMutation, processNextInBatch]);

  const retryCurrentOptimization = useCallback(() => {
    if (!optimizePreview?.originalUrl) return;
    const currentImageIndex = batchQueueRef.current[currentIndexRef.current] ?? 0;
    // Restore original before retrying
    const next = [...mediaItems];
    next[currentImageIndex] = { ...next[currentImageIndex], url: optimizePreview.originalUrl };
    onMediaUpdate(next);
    saveMutation.mutate(next);
    setOptimizePreview(null);
    optimizeMutation.mutate(currentImageIndex);
  }, [optimizePreview, mediaItems, onMediaUpdate, saveMutation, optimizeMutation]);

  return {
    optimizePreview,
    optimizeMutation,
    batchProgress,
    startBatchOptimize,
    acceptOptimization,
    rejectOptimization,
    retryCurrentOptimization,
  };
}
