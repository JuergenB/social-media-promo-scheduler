"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Campaign } from "@/lib/airtable/types";

interface Props {
  campaign: Campaign;
  pendingCount: number;
  keptCounts: { approved: number; scheduled: number; published: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}

export function ArchiveCampaignDialog({
  campaign,
  pendingCount,
  keptCounts,
  open,
  onOpenChange,
  onArchived,
}: Props) {
  const queryClient = useQueryClient();
  const [cleanupDrafts, setCleanupDrafts] = useState(pendingCount > 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setCleanupDrafts(pendingCount > 0);
  }, [open, pendingCount]);

  async function handleConfirm() {
    setBusy(true);
    const didCleanup = cleanupDrafts && pendingCount > 0;
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanupDrafts: didCleanup }),
      });
      if (!res.ok) throw new Error("Archive failed");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      onOpenChange(false);
      toast.success(
        didCleanup
          ? `Campaign archived — ${pendingCount} pending post${pendingCount === 1 ? "" : "s"} deleted`
          : "Campaign archived"
      );
      onArchived?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to archive campaign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const keptSummary = [
    keptCounts.approved ? `${keptCounts.approved} approved` : null,
    keptCounts.scheduled ? `${keptCounts.scheduled} scheduled` : null,
    keptCounts.published ? `${keptCounts.published} published` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &ldquo;{campaign.name || "this campaign"}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This campaign will be hidden from your main view. You can unarchive it anytime.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pendingCount > 0 && (
          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm cursor-pointer">
            <Checkbox
              checked={cleanupDrafts}
              onCheckedChange={(v) => setCleanupDrafts(v === true)}
              className="mt-0.5"
            />
            <span className="flex-1">
              Also delete <strong>{pendingCount}</strong> pending post{pendingCount === 1 ? "" : "s"}
              {keptSummary ? (
                <span className="text-muted-foreground"> (keeps {keptSummary})</span>
              ) : null}
            </span>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
