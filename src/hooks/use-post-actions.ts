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
      // 1. Update Airtable Scheduled Date.
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: scheduledFor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reschedule");
      }
      // 2. Push the new state to Zernio + lnk.bio. Reschedule is the user's
      //    intent to commit; chain Apply so they don't have to click twice.
      const applyRes = await fetch(`/api/posts/${post.id}/apply`, { method: "POST" });
      if (!applyRes.ok) {
        const data = await applyRes.json().catch(() => ({}));
        throw new Error(data.error || "Rescheduled in Airtable but downstream sync failed — click Apply Changes to retry");
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

  // Apply Changes — pushes the current Airtable state of a scheduled post to
  // Zernio + lnk.bio. The only mutation path for downstream services on
  // already-scheduled posts; per-edit auto-sync was removed in #205 because
  // it produced concurrent-mutation races.
  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/apply`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Apply failed");
      return data;
    },
    onSuccess: (data: { zernio?: string; lnkBio?: string }) => {
      invalidate();
      const parts: string[] = [];
      if (data.zernio === "ok") parts.push("Zernio");
      if (data.lnkBio === "ok") parts.push("lnk.bio");
      toast.success(parts.length > 0 ? `Synced ${parts.join(" + ")}` : "Up to date");
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
    applyMutation,
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
