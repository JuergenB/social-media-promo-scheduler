"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { addDays, format, differenceInDays, isSameDay } from "date-fns";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_COLORS } from "@/lib/late-api/types";
import type { Post } from "@/lib/airtable/types";

interface CampaignTimelineProps {
  posts: Post[];
  campaignStartDate: Date;
  durationDays: number;
  campaignId: string;
  onSync?: () => void;
  isSyncing?: boolean;
}

/** Map Airtable platform names to Zernio platform IDs for color lookup */
const PLATFORM_KEY_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
  YouTube: "youtube",
};

export function CampaignTimeline({
  posts,
  campaignStartDate,
  durationDays,
  campaignId,
  onSync,
  isSyncing,
}: CampaignTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(600);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setTrackWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setTrackWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Filter to only posts with scheduled dates
  const scheduledPosts = useMemo(
    () => posts.filter((p) => p.scheduledDate && ["Queued", "Scheduled", "Published"].includes(p.status)),
    [posts]
  );

  // The visible timeline range encompasses the WHOLE campaign story:
  // - left edge = earliest of (campaign Start Date, earliest scheduled/published post)
  // - right edge = latest of (campaign Start + durationDays, latest scheduled post)
  // The campaign's planned window (Start → Start+durationDays) lives inside
  // this range. "Today" floats as a vertical marker wherever today actually
  // is — it's no longer conflated with the start.
  const { daySlots, activePlatforms, monthMarkers, effectiveStart, effectiveDays } = useMemo(() => {
    const plannedEnd = addDays(campaignStartDate, durationDays);
    const todayDate = new Date();

    // Find earliest/latest post anchors (use day-floor so we render whole days)
    const postTimes = scheduledPosts
      .map((p) => new Date(p.scheduledDate).getTime())
      .filter((t) => Number.isFinite(t));
    const earliestPost = postTimes.length > 0
      ? new Date(Math.min(...postTimes))
      : campaignStartDate;
    const latestPost = postTimes.length > 0
      ? new Date(Math.max(...postTimes))
      : plannedEnd;

    const dayFloor = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const startCandidate = earliestPost.getTime() < campaignStartDate.getTime()
      ? dayFloor(earliestPost) : dayFloor(campaignStartDate);
    const endCandidate = latestPost.getTime() > plannedEnd.getTime()
      ? dayFloor(latestPost) : dayFloor(plannedEnd);
    const span = Math.max(1, differenceInDays(endCandidate, startCandidate));

    const platforms = new Set<string>();
    const slots: Array<{
      dayOffset: number;
      date: Date;
      posts: Post[];
      platforms: Map<string, number>;
      isToday: boolean;
    }> = [];

    for (let d = 0; d <= span; d++) {
      const date = addDays(startCandidate, d);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayPosts = scheduledPosts.filter(
        (p) => p.scheduledDate.split("T")[0] === dateStr
      );
      const platMap = new Map<string, number>();
      for (const p of dayPosts) {
        const key = PLATFORM_KEY_MAP[p.platform] || p.platform.toLowerCase();
        platforms.add(key);
        platMap.set(key, (platMap.get(key) || 0) + 1);
      }
      if (dayPosts.length > 0) {
        slots.push({
          dayOffset: d,
          date,
          posts: dayPosts,
          platforms: platMap,
          isToday: isSameDay(date, todayDate),
        });
      }
    }

    const months: Array<{ label: string; position: number }> = [];
    let lastMonth = -1;
    for (let d = 0; d <= span; d++) {
      const date = addDays(startCandidate, d);
      const month = date.getMonth();
      if (month !== lastMonth) {
        months.push({
          label: d === 0 ? format(date, "MMM d") : format(date, "MMM"),
          position: span > 0 ? d / span : 0,
        });
        lastMonth = month;
      }
    }

    return {
      daySlots: slots,
      activePlatforms: [...platforms],
      monthMarkers: months,
      effectiveStart: startCandidate,
      effectiveDays: span,
    };
  }, [scheduledPosts, campaignStartDate, durationDays]);

  if (scheduledPosts.length === 0) return null;

  // Each day occupies a slot of width 1/(effectiveDays+1). Dots and the
  // today marker are positioned at the MIDPOINT of their day's slot so
  // they don't clip the card edges at days 0 or N.
  const slotCount = effectiveDays + 1;
  const today = new Date();
  const todayOffset = differenceInDays(today, effectiveStart);
  const todayPosition = slotCount > 0
    ? Math.max(0, Math.min(1, (todayOffset + 0.5) / slotCount))
    : 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Campaign Timeline
            </h4>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {(() => {
                const parts: React.ReactNode[] = [];
                const published = scheduledPosts.filter((p) => p.status === "Published").length;
                const scheduled = scheduledPosts.filter((p) => p.status === "Scheduled").length;
                const queued = scheduledPosts.filter((p) => p.status === "Queued").length;
                if (published > 0) {
                  parts.push(
                    <span key="published" className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {published} published
                    </span>,
                  );
                }
                if (scheduled > 0) {
                  parts.push(
                    <span key="scheduled" className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {scheduled} scheduled
                    </span>,
                  );
                }
                if (queued > 0) {
                  parts.push(
                    <span key="queued" className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {queued} queued
                    </span>,
                  );
                }
                parts.push(
                  <span key="duration">{durationDays} days</span>,
                );
                return parts.reduce<React.ReactNode[]>((acc, part, i) => {
                  if (i > 0) acc.push(<span key={`sep-${i}`} className="text-border">·</span>);
                  acc.push(part);
                  return acc;
                }, []);
              })()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onSync && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={onSync}
                disabled={isSyncing}
                title="Sync schedule dates from Zernio"
              >
                <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
              <Link href={`/dashboard/calendar?date=${scheduledPosts[0]?.scheduledDate?.split("T")[0] || ""}`}>
                <Calendar className="h-3 w-3 mr-1" />
                Calendar
              </Link>
            </Button>
          </div>
        </div>

        {/* Timeline track */}
        <div className="space-y-0">
          {/* Month labels with tick marks */}
          <div className="relative h-5" ref={trackRef}>
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute flex flex-col items-start"
                style={{ left: `${m.position * 100}%` }}
              >
                <span
                  className="text-[10px] text-muted-foreground whitespace-nowrap"
                  style={{ transform: i === 0 ? "none" : "translateX(-50%)" }}
                >
                  {m.label}
                </span>
              </div>
            ))}
            {/* End date label */}
            <span
              className="absolute right-0 text-[10px] text-muted-foreground"
            >
              {format(addDays(effectiveStart, effectiveDays), "MMM d")}
            </span>
          </div>

          {/* Tick marks row */}
          <div className="relative h-1.5">
            {monthMarkers.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 w-px h-1.5 bg-border"
                style={{ left: `${m.position * 100}%` }}
              />
            ))}
          </div>

          {/* Track with posts */}
          <div className="relative h-10 bg-muted/30 rounded-md border border-border/50">
            {/* Today marker */}
            {todayOffset >= 0 && todayOffset <= effectiveDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/50 z-10"
                style={{ left: `${todayPosition * 100}%` }}
              />
            )}

            {/* Post markers — uniform 8px dots, side-by-side, centered in
                the day's slot so they don't clip the card edges. */}
            {daySlots.map((slot, i) => {
              const position = slotCount > 0 ? (slot.dayOffset + 0.5) / slotCount : 0;
              const platformEntries = [...slot.platforms.entries()];

              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-1/2 flex items-center gap-0.5 cursor-pointer"
                      style={{ left: `${position * 100}%`, transform: `translate(-50%, -50%)` }}
                    >
                      {platformEntries.map(([platform, count], j) => (
                        <div
                          key={j}
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: PLATFORM_COLORS[platform as keyof typeof PLATFORM_COLORS] || "#6b7280",
                            opacity: 0.85,
                          }}
                        />
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-medium">{format(slot.date, "EEE, MMM d")}</p>
                    <div className="space-y-0.5 mt-0.5">
                      {platformEntries.map(([p, count]) => (
                        <div key={p} className="flex items-center gap-1.5">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: PLATFORM_COLORS[p as keyof typeof PLATFORM_COLORS] || "#6b7280" }}
                          />
                          <span className="capitalize">{p}{count > 1 ? ` ×${count}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Today label below the track */}
          {todayOffset >= 0 && todayOffset <= effectiveDays && (
            <div className="relative h-4">
              <span
                className="absolute text-[9px] text-primary font-medium"
                style={{ left: `${todayPosition * 100}%`, transform: "translateX(-50%)" }}
              >
                today
              </span>
            </div>
          )}
        </div>

        {/* Platform legend */}
        <div className="flex flex-wrap gap-3">
          {activePlatforms.sort().map((p) => (
            <div key={p} className="flex items-center gap-1">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: PLATFORM_COLORS[p as keyof typeof PLATFORM_COLORS] || "#6b7280" }}
              />
              <span className="text-[10px] text-muted-foreground capitalize">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
