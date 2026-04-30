"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarRange, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CampaignTimeline } from "./campaign-timeline";
import type { Campaign, Post, PostStatus, DistributionBias } from "@/lib/airtable/types";

interface MappingEntry {
  postId: string;
  platform: string;
  oldDate: string | null;
  newDate: string;
  status: string;
}

interface PreviewResponse {
  preview: true;
  campaignId: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  distributionBias: DistributionBias;
  participantCount: number;
  externalCollisionCount: number;
  reservationCount: number;
  mapping: MappingEntry[];
}

interface ApplyResponse {
  applied: true;
  summary: {
    total: number;
    airtableOk: number;
    downstreamOk: number;
    downstreamSkipped: number;
    failures: number;
  };
  results: Array<{
    postId: string;
    platform: string;
    airtable: "ok" | "error";
    downstream: "ok" | "skipped" | "error";
    error?: string;
  }>;
}

interface Props {
  campaign: Campaign;
  posts: Post[]; // existing campaign posts (for the "current" timeline)
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BIAS_OPTIONS: Array<{ value: DistributionBias; label: string; description: string }> = [
  { value: "Front-loaded", label: "Front-loaded", description: "Heavy at the start, tapering" },
  { value: "Balanced", label: "Balanced", description: "Even distribution" },
  { value: "Back-loaded", label: "Back-loaded", description: "Light at the start, building" },
];

function ymd(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy-MM-dd");
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function RedistributeDialog({ campaign, posts, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  // Default new window: today → today + current durationDays. User adjusts.
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [startDate, setStartDate] = useState<string>(ymd(today));
  const [endDate, setEndDate] = useState<string>(
    ymd(addDays(today, Math.max(1, campaign.durationDays - 1))),
  );
  const [bias, setBias] = useState<DistributionBias>(
    (campaign.distributionBias as DistributionBias) || "Front-loaded",
  );

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset preview when inputs change — forces user to re-preview before applying.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [startDate, endDate, bias]);

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewError(null);
      setPreviewing(false);
      setApplying(false);
    }
  }, [open]);

  const participantCount = posts.filter(
    (p) => p.status === "Approved" || p.status === "Scheduled",
  ).length;

  async function handlePreview() {
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/redistribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          distributionBias: bias,
          apply: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data?.error || "Preview failed");
        return;
      }
      setPreview(data as PreviewResponse);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/redistribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          distributionBias: bias,
          apply: true,
        }),
      });
      const data = (await res.json()) as ApplyResponse | { error?: string };
      if (!res.ok || !("summary" in data)) {
        toast.error(("error" in data && data.error) || "Redistribute failed");
        return;
      }
      const { summary } = data as ApplyResponse;
      if (summary.failures === 0) {
        toast.success(
          `Redistributed ${summary.total} post${summary.total === 1 ? "" : "s"} — ${summary.downstreamOk} synced downstream`,
        );
      } else {
        toast.warning(
          `Redistributed ${summary.airtableOk}/${summary.total} (${summary.failures} downstream failure${summary.failures === 1 ? "" : "s"} — refresh and retry)`,
        );
      }
      // Per memory rule (feedback_reload_over_invalidation): overlay-mutating
      // Airtable actions need a hard page reload, not just queryClient
      // invalidate — we've hit stale-state bugs in this codebase before.
      // Brief delay so the toast registers before the reload swaps the page.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Redistribute failed");
      setApplying(false);
    }
    // Note: no finally block clearing applying — on success we're about to
    // reload, so we keep the spinner visible during the 800ms toast window.
  }

  // Build synthetic Post[] from preview mapping for the proposed timeline.
  const previewPosts: Post[] = useMemo(() => {
    if (!preview) return [];
    return preview.mapping.map((m) => ({
      id: m.postId,
      title: "",
      campaignIds: [campaign.id],
      // CampaignTimeline maps lowercase platform via fallback → same color
      platform: m.platform,
      content: "",
      mediaUrls: "",
      mediaCaptions: "",
      imageUrl: "",
      shortUrl: "",
      linkUrl: "",
      scheduledDate: m.newDate,
      status: "Scheduled" as PostStatus,
      contentVariant: "",
      approvedBy: "",
      approvedAt: "",
      zernioPostId: "",
      notes: "",
      originalMedia: "",
      coverSlideData: "",
      firstComment: "",
      sortOrder: null,
      platformPostUrl: "",
      collaborators: "",
      userTags: "",
      lnkBioSyncPending: false,
      lnkBioEntryId: "",
      carouselPdfUrl: "",
      subject: "",
      imageIndex: null,
    } as unknown as Post));
  }, [preview, campaign.id]);

  const newWindowStart = preview
    ? new Date(preview.startDate + "T00:00:00")
    : new Date(startDate + "T00:00:00");

  const datesValid = (() => {
    if (!startDate || !endDate) return false;
    return new Date(endDate) > new Date(startDate);
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Redistribute campaign schedule
          </DialogTitle>
          <DialogDescription>
            Re-spread {participantCount} post{participantCount === 1 ? "" : "s"} (Approved + Scheduled) across a new window.
            Brand-wide collisions and platform cadence are respected. Published posts are not moved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="redistribute-start">Start date</Label>
              <Input
                id="redistribute-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={ymd(today)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="redistribute-end">End date</Label>
              <Input
                id="redistribute-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redistribute-bias">Distribution bias</Label>
            <Select value={bias} onValueChange={(v) => setBias(v as DistributionBias)}>
              <SelectTrigger id="redistribute-bias">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BIAS_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    <span className="font-medium">{b.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{b.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {previewError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {previewError}
            </div>
          )}

          {preview && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{preview.participantCount}</strong> posts to re-place
                </span>
                <span>
                  <strong className="text-foreground">{preview.externalCollisionCount}</strong> brand-wide collisions respected
                </span>
                {preview.reservationCount > 0 && (
                  <span>
                    <strong className="text-foreground">{preview.reservationCount}</strong> Pending reservations
                  </span>
                )}
                <span>
                  <strong className="text-foreground">{preview.durationDays}</strong> days · {preview.distributionBias}
                </span>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  Proposed timeline
                </div>
                <CampaignTimeline
                  posts={previewPosts}
                  campaignStartDate={newWindowStart}
                  durationDays={preview.durationDays}
                  campaignId={campaign.id}
                />
              </div>
            </div>
          )}
        </div>

        {applying && preview && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Applying to {preview.mapping.length} post{preview.mapping.length === 1 ? "" : "s"}…
            </div>
            <div className="mt-1 ml-5.5 leading-relaxed">
              Updating Airtable, then syncing each scheduled post to Zernio + lnk.bio. Throttled to stay under API rate limits — expect ~{Math.max(15, Math.ceil(preview.mapping.length * 1.5))}s. The page will refresh automatically when done.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          {!preview ? (
            <Button
              onClick={handlePreview}
              disabled={!datesValid || previewing || participantCount === 0}
            >
              {previewing ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Computing…</>
              ) : (
                "Preview"
              )}
            </Button>
          ) : (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Applying…</>
              ) : (
                `Confirm — apply to ${preview.mapping.length} post${preview.mapping.length === 1 ? "" : "s"}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
