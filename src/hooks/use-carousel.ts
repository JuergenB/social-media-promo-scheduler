"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MediaItem } from "@/lib/media-items";

export type SlideOption = {
  frameColor?: { r: number; g: number; b: number };
  removeColor?: { r: number; g: number; b: number };
  removeTolerance?: number;
};

export type CarouselPreview = {
  dataUri: string;
  caption: string;
  frameColor: { r: number; g: number; b: number };
};

interface UseCarouselOptions {
  postId: string;
  onMediaUpdate: (items: MediaItem[]) => void;
  invalidateKeys?: string[][];
}

export function useCarousel({ postId, onMediaUpdate, invalidateKeys = [["campaign"]] }: UseCarouselOptions) {
  const queryClient = useQueryClient();
  const [carouselPreviews, setCarouselPreviews] = useState<CarouselPreview[] | null>(null);
  const [perSlideOptions, setPerSlideOptions] = useState<(SlideOption | undefined)[]>([]);
  const [eyedropperMode, setEyedropperMode] = useState<{ slideIndex: number; mode: "frame" | "removeBg" } | null>(null);
  const [slidesLocalState, setSlidesLocalState] = useState<"applied" | "reset" | null>(null);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const previewMutation = useMutation({
    mutationFn: async (slideOpts?: (SlideOption | undefined)[]) => {
      const res = await fetch(`/api/posts/${postId}/carousel-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false, slideOptions: slideOpts }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate carousel preview");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCarouselPreviews(
        data.previews.map((p: CarouselPreview) => ({
          dataUri: p.dataUri,
          caption: p.caption,
          frameColor: p.frameColor,
        }))
      );
    },
    onError: (err) => toast.error(`Carousel preview failed: ${err.message}`),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}/carousel-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, slideOptions: perSlideOptions }),
      });
      if (!res.ok) throw new Error("Failed to apply carousel slides");
      return res.json();
    },
    onSuccess: (data) => {
      const newItems: MediaItem[] = data.mediaItems;
      onMediaUpdate(newItems);
      setCarouselPreviews(null);
      setPerSlideOptions([]);
      setEyedropperMode(null);
      setSlidesLocalState("applied");
      invalidate();
      toast.success(`${newItems.length} carousel slides applied`);
    },
    onError: (err) => toast.error(`Apply failed: ${err.message}`),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}/carousel-preview`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to reset slides");
      return res.json();
    },
    onSuccess: (data) => {
      const restoredItems: MediaItem[] = data.mediaItems;
      onMediaUpdate(restoredItems);
      setCarouselPreviews(null);
      setPerSlideOptions([]);
      setEyedropperMode(null);
      setSlidesLocalState("reset");
      invalidate();
      toast.success("Original images restored");
    },
    onError: (err) => toast.error(`Reset failed: ${err.message}`),
  });

  /** Get pixel color from a click on a rendered preview image */
  const getPixelColor = (e: React.MouseEvent<HTMLImageElement>): { r: number; g: number; b: number } | null => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
    const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2] };
  };

  const handleSlideClick = (e: React.MouseEvent<HTMLImageElement>, slideIndex: number) => {
    if (!eyedropperMode) return;
    e.stopPropagation();
    const color = getPixelColor(e);
    if (!color) return;

    const newOptions = [...perSlideOptions];
    const existing = newOptions[slideIndex] || {};

    if (eyedropperMode.mode === "frame") {
      newOptions[slideIndex] = { ...existing, frameColor: color };
    } else {
      newOptions[slideIndex] = { ...existing, removeColor: color, removeTolerance: 50 };
    }

    setPerSlideOptions(newOptions);
    setEyedropperMode(null);
    previewMutation.mutate(newOptions);
  };

  const generatePreview = (slideOpts?: (SlideOption | undefined)[]) => {
    setPerSlideOptions([]);
    previewMutation.mutate(slideOpts);
  };

  const closePreview = () => {
    setCarouselPreviews(null);
    setEyedropperMode(null);
    setPerSlideOptions([]);
  };

  const resetAllOptions = () => {
    setPerSlideOptions([]);
    previewMutation.mutate([]);
  };

  /** Reset local state (e.g. when navigating between posts) */
  const resetState = () => {
    setSlidesLocalState(null);
    setCarouselPreviews(null);
    setPerSlideOptions([]);
    setEyedropperMode(null);
  };

  return {
    carouselPreviews,
    perSlideOptions,
    eyedropperMode,
    slidesLocalState,
    setEyedropperMode,
    previewMutation,
    applyMutation,
    resetMutation,
    handleSlideClick,
    generatePreview,
    closePreview,
    resetAllOptions,
    resetState,
  };
}
