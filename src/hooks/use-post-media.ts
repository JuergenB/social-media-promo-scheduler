"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseMediaItems, serializeMediaItems, type MediaItem } from "@/lib/media-items";
import { compressImage, validateImage } from "@/lib/image-compression";
import { toast } from "sonner";
import type { Post } from "@/lib/airtable/types";

/** Build MediaItem array from an Airtable Post record */
export function buildMediaItems(post: Post): MediaItem[] {
  return parseMediaItems({
    "Image URL": post.imageUrl,
    "Media URLs": post.mediaUrls,
    "Media Captions": post.mediaCaptions,
  });
}

interface UsePostMediaOptions {
  postId: string;
  initialItems: MediaItem[];
  /** Query keys to invalidate on success */
  invalidateKeys?: string[][];
}

export function usePostMedia({ postId, initialItems, invalidateKeys = [["campaign"]] }: UsePostMediaOptions) {
  const queryClient = useQueryClient();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialItems);
  const mediaImages = mediaItems.map((i) => i.url);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // Save images + captions to Airtable
  const saveImagesMutation = useMutation({
    mutationFn: async (items: MediaItem[]) => {
      const serialized = serializeMediaItems(items);
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: serialized["Image URL"],
          mediaUrls: serialized["Media URLs"],
          mediaCaptions: serialized["Media Captions"],
        }),
      });
      if (!res.ok) throw new Error("Failed to save images");
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to save images"),
  });

  // Upload an image file
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const validation = validateImage(file);
      if (!validation.valid) throw new Error(validation.error);
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch(`/api/posts/${postId}/image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload image");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.imageUrl) {
        const next = [...mediaItems, { url: data.imageUrl, caption: "" }];
        setMediaItems(next);
        saveImagesMutation.mutate(next);
        toast.success(next.length > 1 ? `${next.length} images — carousel ready` : "Image uploaded");
      }
    },
    onError: () => toast.error("Failed to upload image"),
  });

  const addImageUrl = (url: string, caption?: string) => {
    const next = [...mediaItems, { url, caption: caption || "" }];
    setMediaItems(next);
    saveImagesMutation.mutate(next);
    toast.success(mediaItems.length === 0 ? "Image added" : `${next.length} images — carousel ready`);
  };

  const removeImage = (index: number) => {
    const next = mediaItems.filter((_, i) => i !== index);
    setMediaItems(next);
    saveImagesMutation.mutate(next);
    toast.success("Image removed");
  };

  const reorderImages = (fromIndex: number, toIndex: number) => {
    const next = [...mediaItems];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    setMediaItems(next);
    saveImagesMutation.mutate(next);
  };

  const updateCaption = (index: number, caption: string) => {
    const next = [...mediaItems];
    next[index] = { ...next[index], caption };
    setMediaItems(next);
  };

  const saveCaption = () => {
    saveImagesMutation.mutate(mediaItems);
  };

  /** Reset media items (e.g. when navigating between posts) */
  const resetItems = (items: MediaItem[]) => {
    setMediaItems(items);
  };

  return {
    mediaItems,
    mediaImages,
    setMediaItems,
    resetItems,
    addImageUrl,
    removeImage,
    reorderImages,
    updateCaption,
    saveCaption,
    saveImagesMutation,
    uploadImageMutation,
  };
}
