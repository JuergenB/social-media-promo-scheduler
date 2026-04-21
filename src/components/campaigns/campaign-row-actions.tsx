"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchiveCampaignDialog } from "./archive-campaign-dialog";
import { MoreHorizontal, Archive, ArchiveRestore, Eraser, Loader2 } from "lucide-react";
import type { Campaign, Post } from "@/lib/airtable/types";

interface Props {
  campaign: Campaign;
}

function stopPropagation(e: React.SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function CampaignRowActions({ campaign }: Props) {
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"unarchive" | "cleanup" | null>(null);

  const isArchived = Boolean(campaign.archivedAt);

  // Only fetch post counts when the menu opens (avoids N+1 at list load)
  const { data: postsData } = useQuery<{ posts: Post[] }>({
    queryKey: ["campaign", campaign.id, "posts-for-actions"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaign.id}`);
      if (!res.ok) throw new Error("Failed to fetch campaign posts");
      return res.json();
    },
    enabled: menuOpen || archiveOpen,
    staleTime: 10_000,
  });

  const counts = countPostsByBucket(postsData?.posts ?? []);

  async function handleUnarchive(e: React.MouseEvent) {
    stopPropagation(e);
    setBusy("unarchive");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/unarchive`, { method: "POST" });
      if (!res.ok) throw new Error("Unarchive failed");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err) {
      console.error(err);
      alert("Failed to unarchive.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCleanup(e: React.MouseEvent) {
    stopPropagation(e);
    if (counts.pending === 0) {
      alert("No pending posts to clean up.");
      return;
    }
    if (!confirm(`Delete ${counts.pending} pending post${counts.pending === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }
    setBusy("cleanup");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/cleanup`, { method: "POST" });
      if (!res.ok) throw new Error("Cleanup failed");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
    } catch (err) {
      console.error(err);
      alert("Failed to clean up posts.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
            onClick={stopPropagation}
            aria-label="Campaign actions"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stopPropagation}>
          {isArchived ? (
            <DropdownMenuItem onClick={handleUnarchive}>
              <ArchiveRestore className="h-4 w-4 mr-2" /> Unarchive
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={handleCleanup}
                disabled={counts.pending === 0}
              >
                <Eraser className="h-4 w-4 mr-2" /> Clean up drafts
                {counts.pending > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">{counts.pending}</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  stopPropagation(e);
                  setArchiveOpen(true);
                }}
              >
                <Archive className="h-4 w-4 mr-2" /> Archive
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              stopPropagation(e);
              // Pass tab=settings so the detail page auto-opens the Settings
              // tab where the delete section lives, then scrolls to it.
              window.location.href = `/dashboard/campaigns/${campaign.id}?tab=settings#delete-campaign-section`;
            }}
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchiveCampaignDialog
        campaign={campaign}
        pendingCount={counts.pending}
        keptCounts={{
          approved: counts.approved,
          scheduled: counts.scheduled,
          published: counts.published,
        }}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </>
  );
}

export function countPostsByBucket(posts: Post[]) {
  let pending = 0;
  let approved = 0;
  let scheduled = 0;
  let published = 0;
  for (const p of posts) {
    switch (p.status) {
      case "Pending":
      case "Dismissed":
        pending++;
        break;
      case "Approved":
      case "Modified":
        approved++;
        break;
      case "Queued":
      case "Scheduled":
        scheduled++;
        break;
      case "Published":
        published++;
        break;
    }
  }
  return { pending, approved, scheduled, published };
}
