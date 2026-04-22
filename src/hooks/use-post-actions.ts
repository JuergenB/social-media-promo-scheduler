"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { format } from "date-fns/format";
import { toast } from "sonner";
import type { Post } from "@/lib/airtable/types";

interface UsePostActionsOptions {
  post: Post;
  onClose: () => void;
  onNavigateNext?: () => void;
  invalidateKeys?: string[][];
}

export function usePostActions({ post, onClose, onNavigateNext, invalidateKeys = [["campaign"]] }: UsePostActionsOptions) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [regenGuidance, setRegenGuidance] = useState("");

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    queryClient.invalidateQueries({
      predicate: (q) => {
        const root = q.queryKey[0];
        return typeof root === "string" && (
          root === "campaigns" ||
          root === "campaign-posts" ||
          root === "post-lookup" ||
          root === "calendar" ||
          root === "dashboard-stats"
        );
      },
    });
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Approved",
          approvedBy: session?.user?.name || session?.user?.email || "",
        }),
      });
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Post approved");
      onNavigateNext?.();
    },
    onError: () => toast.error("Failed to approve post"),
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Dismissed",
          shortUrl: post.shortUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Post dismissed");
      onNavigateNext?.();
    },
    onError: () => toast.error("Failed to dismiss post"),
  });

  const publishNowMutation = useMutation({
    mutationFn: async (scheduledFor?: string) => {
      const res = await fetch(`/api/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: scheduledFor || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish");
      }
      return res.json();
    },
    onSuccess: (_data, scheduledFor) => {
      invalidate();
      toast.success(scheduledFor
        ? `Scheduled ${post.platform} for ${format(new Date(scheduledFor), "MMM d, h:mm a")}`
        : `Published to ${post.platform} — scheduled in ~2 min`);
      setShowSchedulePicker(false);
      setScheduleDateTime("");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (scheduledFor: string) => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: scheduledFor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reschedule");
      }
    },
    onSuccess: (_data, scheduledFor) => {
      invalidate();
      toast.success(`Rescheduled ${post.platform} for ${format(new Date(scheduledFor), "MMM d, h:mm a")}`);
      setShowSchedulePicker(false);
      setScheduleDateTime("");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (guidance: string) => {
      const res = await fetch(`/api/posts/${post.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidance }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to regenerate");
      }
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Post regenerated");
      setRegenDialogOpen(false);
      setRegenGuidance("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatus = async (status: string, extras?: Record<string, unknown>) => {
    const res = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extras }),
    });
    if (!res.ok) throw new Error(`Failed to update status to ${status}`);
    invalidate();
  };

  const deletePost = async () => {
    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    invalidate();
    toast.success("Post deleted");
    onClose();
  };

  return {
    // Mutations
    approveMutation,
    dismissMutation,
    publishNowMutation,
    rescheduleMutation,
    regenerateMutation,
    updateStatus,
    deletePost,
    // Schedule picker
    showSchedulePicker,
    setShowSchedulePicker,
    scheduleDateTime,
    setScheduleDateTime,
    // Regenerate dialog
    regenDialogOpen,
    setRegenDialogOpen,
    regenGuidance,
    setRegenGuidance,
    // Session
    session,
  };
}
