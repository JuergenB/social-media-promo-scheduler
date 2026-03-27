"use client";

import { useMemo, useState } from "react";
import { addDays, startOfWeek, format, differenceInCalendarWeeks, isSameDay } from "date-fns";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Calendar, ZoomIn, ZoomOut } from "lucide-react";
import { PLATFORM_COLORS } from "@/lib/late-api/types";
import type { Post } from "@/lib/airtable/types";

interface CampaignTimelineProps {
  posts: Post[];
  campaignStartDate: Date;
  durationDays: number;
  campaignId: string;
}

interface DayData {
  date: Date;
  posts: Post[];
  platforms: Map<string, number>;
  total: number;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

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
}: CampaignTimelineProps) {
  const [zoomLevel, setZoomLevel] = useState<"days" | "weeks">("days");

  // Filter to only posts with scheduled dates
  const scheduledPosts = useMemo(
    () => posts.filter((p) => p.scheduledDate && ["Queued", "Scheduled", "Published"].includes(p.status)),
    [posts]
  );

  // Build day-level data
  const { days, weeks, maxPostsPerDay, activePlatforms, monthLabels } = useMemo(() => {
    const endDate = addDays(campaignStartDate, durationDays);
    const weekStart = startOfWeek(campaignStartDate, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarWeeks(endDate, weekStart, { weekStartsOn: 1 }) + 1;

    const dayMap = new Map<string, DayData>();
    const platformSet = new Set<string>();
    let maxPosts = 0;

    // Initialize all days
    for (let d = 0; d < totalWeeks * 7; d++) {
      const date = addDays(weekStart, d);
      const key = format(date, "yyyy-MM-dd");
      dayMap.set(key, { date, posts: [], platforms: new Map(), total: 0 });
    }

    // Place posts into days
    for (const post of scheduledPosts) {
      const key = post.scheduledDate.split("T")[0];
      const day = dayMap.get(key);
      if (day) {
        day.posts.push(post);
        day.total++;
        const platKey = PLATFORM_KEY_MAP[post.platform] || post.platform.toLowerCase();
        platformSet.add(platKey);
        day.platforms.set(platKey, (day.platforms.get(platKey) || 0) + 1);
        if (day.total > maxPosts) maxPosts = day.total;
      }
    }

    // Build weeks array for week-zoom view
    const weekData: Array<{ weekStart: Date; posts: Post[]; total: number; platforms: Map<string, number> }> = [];
    for (let w = 0; w < totalWeeks; w++) {
      const ws = addDays(weekStart, w * 7);
      let total = 0;
      const platforms = new Map<string, number>();
      const weekPosts: Post[] = [];
      for (let d = 0; d < 7; d++) {
        const key = format(addDays(ws, d), "yyyy-MM-dd");
        const day = dayMap.get(key);
        if (day) {
          total += day.total;
          weekPosts.push(...day.posts);
          for (const [p, c] of day.platforms) {
            platforms.set(p, (platforms.get(p) || 0) + c);
          }
        }
      }
      weekData.push({ weekStart: ws, posts: weekPosts, total, platforms });
    }

    // Month labels with column positions
    const months: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;
    for (let w = 0; w < totalWeeks; w++) {
      const date = addDays(weekStart, w * 7);
      const month = date.getMonth();
      if (month !== lastMonth) {
        months.push({ label: format(date, "MMM"), col: w });
        lastMonth = month;
      }
    }

    return {
      days: [...dayMap.values()],
      weeks: weekData,
      maxPostsPerDay: maxPosts,
      activePlatforms: [...platformSet],
      monthLabels: months,
    };
  }, [scheduledPosts, campaignStartDate, durationDays]);

  if (scheduledPosts.length === 0) return null;

  const totalWeeks = weeks.length;
  const today = new Date();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Campaign Timeline
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {scheduledPosts.length} posts across {durationDays} days
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setZoomLevel(zoomLevel === "days" ? "weeks" : "days")}
            >
              {zoomLevel === "days" ? (
                <ZoomOut className="h-3.5 w-3.5" />
              ) : (
                <ZoomIn className="h-3.5 w-3.5" />
              )}
            </Button>
            {/* Calendar link */}
            <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
              <Link href={`/dashboard/calendar?date=${scheduledPosts[0]?.scheduledDate?.split("T")[0] || ""}`}>
                <Calendar className="h-3 w-3 mr-1" />
                Calendar
              </Link>
            </Button>
          </div>
        </div>

        {/* Month labels */}
        <div className="overflow-x-auto">
          {zoomLevel === "days" ? (
            /* Day-level heatmap */
            <div>
              {/* Month row */}
              <div className="flex gap-0 ml-5 mb-1">
                {monthLabels.map((m, i) => {
                  const nextCol = monthLabels[i + 1]?.col ?? totalWeeks;
                  const span = nextCol - m.col;
                  return (
                    <div
                      key={m.label + m.col}
                      className="text-[10px] text-muted-foreground"
                      style={{ width: `${span * 16}px` }}
                    >
                      {m.label}
                    </div>
                  );
                })}
              </div>

              {/* Grid: 7 rows x N columns */}
              <div className="flex gap-0">
                {/* Day labels */}
                <div className="flex flex-col gap-[2px] mr-1">
                  {DAY_LABELS.map((label, i) => (
                    <div key={i} className="h-[14px] w-4 text-[9px] text-muted-foreground flex items-center justify-end pr-0.5">
                      {i % 2 === 0 ? label : ""}
                    </div>
                  ))}
                </div>

                {/* Cells */}
                <div
                  className="grid gap-[2px]"
                  style={{
                    gridTemplateRows: "repeat(7, 14px)",
                    gridTemplateColumns: `repeat(${totalWeeks}, 14px)`,
                    gridAutoFlow: "column",
                  }}
                >
                  {days.map((day, i) => {
                    const isInRange = day.date >= campaignStartDate && day.date <= addDays(campaignStartDate, durationDays);
                    const isToday = isSameDay(day.date, today);
                    const dominantPlatform = day.total > 0
                      ? [...day.platforms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
                      : null;
                    const color = dominantPlatform
                      ? PLATFORM_COLORS[dominantPlatform as keyof typeof PLATFORM_COLORS] || "#6b7280"
                      : undefined;
                    const opacity = day.total === 0 ? 0 : Math.min(0.3 + (day.total / Math.max(maxPostsPerDay, 1)) * 0.7, 1);

                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-[14px] w-[14px] rounded-[2px] ${
                              !isInRange
                                ? "bg-transparent"
                                : day.total === 0
                                  ? "bg-muted/50"
                                  : ""
                            } ${isToday ? "ring-1 ring-primary" : ""}`}
                            style={
                              day.total > 0 && isInRange
                                ? { backgroundColor: color, opacity }
                                : undefined
                            }
                          />
                        </TooltipTrigger>
                        {isInRange && (
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">{format(day.date, "EEE, MMM d")}</p>
                            {day.total === 0 ? (
                              <p className="text-muted-foreground">No posts</p>
                            ) : (
                              <div className="space-y-0.5">
                                {[...day.platforms.entries()].map(([p, count]) => (
                                  <div key={p} className="flex items-center gap-1.5">
                                    <div
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: PLATFORM_COLORS[p as keyof typeof PLATFORM_COLORS] || "#6b7280" }}
                                    />
                                    <span>{p} × {count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Week-level compact view */
            <div className="flex gap-[2px] items-end">
              {weeks.map((week, i) => {
                const dominantPlatform = week.total > 0
                  ? [...week.platforms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
                  : null;
                const color = dominantPlatform
                  ? PLATFORM_COLORS[dominantPlatform as keyof typeof PLATFORM_COLORS] || "#6b7280"
                  : undefined;
                const maxWeekPosts = Math.max(...weeks.map((w) => w.total), 1);
                const height = week.total === 0 ? 4 : Math.max(8, (week.total / maxWeekPosts) * 48);

                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div
                        className="w-3 rounded-sm bg-muted/50"
                        style={{
                          height: `${height}px`,
                          backgroundColor: week.total > 0 ? color : undefined,
                          opacity: week.total > 0 ? 0.7 : 0.3,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">Week of {format(week.weekStart, "MMM d")}</p>
                      {week.total === 0 ? (
                        <p className="text-muted-foreground">No posts</p>
                      ) : (
                        <div className="space-y-0.5">
                          <p>{week.total} post{week.total !== 1 ? "s" : ""}</p>
                          {[...week.platforms.entries()].map(([p, count]) => (
                            <div key={p} className="flex items-center gap-1.5">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: PLATFORM_COLORS[p as keyof typeof PLATFORM_COLORS] || "#6b7280" }}
                              />
                              <span>{p} × {count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        {/* Platform legend */}
        <div className="flex flex-wrap gap-3">
          {activePlatforms.sort().map((p) => (
            <div key={p} className="flex items-center gap-1">
              <div
                className="h-2.5 w-2.5 rounded-sm"
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
