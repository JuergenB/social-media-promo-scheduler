"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UsePostContentOptions {
  postId: string;
  initialContent: string;
  invalidateKeys?: string[][];
}

export function usePostContent({ postId, initialContent, invalidateKeys = [["campaign"]] }: UsePostContentOptions) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(initialContent);

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const saveContentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save content");
    },
    onSuccess: () => {
      setIsEditing(false);
      invalidate();
      toast.success("Content saved");
    },
    onError: () => toast.error("Failed to save content"),
  });

  const startEditing = () => {
    setEditedContent(initialContent);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditedContent(initialContent);
    setIsEditing(false);
  };

  const saveContent = () => {
    saveContentMutation.mutate(editedContent);
  };

  /** Reset state (e.g. when navigating between posts) */
  const reset = (content: string) => {
    setIsEditing(false);
    setEditedContent(content);
  };

  return {
    isEditing,
    editedContent,
    setEditedContent,
    startEditing,
    cancelEditing,
    saveContent,
    saveContentMutation,
    reset,
  };
}
