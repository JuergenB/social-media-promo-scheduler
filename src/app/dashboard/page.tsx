"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Divider } from "@/components/catalyst/divider";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { useBrand } from "@/lib/brand-context";
import { useAccounts, useAccountsHealth } from "@/hooks";
import type { Platform } from "@/lib/late-api";
import type { CampaignType, PostStatus } from "@/lib/airtable/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Frame,
  Layers,
  Loader2,
  Megaphone,
  Plus,
  XCircle,
  FileText,
  Mail,
  CalendarDays,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface DashboardStats {
  campaigns: {
    total: number;
    byStatus: Record<string, number>;
    active: Array<{
      id: string;
      name: string;
      type: CampaignType;
      status: string;
      url: string;
      postCounts: {
        total: number;
        pending: number;
        approved: number;
        queued: number;
        scheduled: number;
        published: number;
        failed: number;
        dismissed: number;
      };
    }>;
  };
  posts: {
    byStatus: Record<string, number>;
    pendingReview: Array<{
      id: string;
      platform: string;
      content: string;
      scheduledDate: string;
      imageUrl: string;
      campaignId: string;
      campaignName: string;
    }>;
    failedPosts: Array<{
      id: string;
      platform: string;
      content: string;
      campaignName: string;
      zernioPostId: string;
    }>;
    scheduledThisWeek: number;
    publishedThisMonth: number;
  };
  timeline: Array<{
    date: string;
    platform: string;
    status: PostStatus;
  }>;
}

const CAMPAIGN_TYPE_ICONS: Record<string, typeof FileText> = {
  "Blog Post": FileText,
  Newsletter: Mail,
  Event: CalendarDays,
  Exhibition: Frame,
};

const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-amber-500",
  Modified: "bg-amber-500",
  Approved: "bg-blue-500",
  Queued: "bg-purple-500",
  Scheduled: "bg-indigo-500",
  Published: "bg-green-500",
  Failed: "bg-red-500",
  Dismissed: "bg-zinc-400",
};

/** Map Airtable platform names to Platform IDs for PlatformIcon */
const AIRTABLE_TO_PLATFORM: Record<string, Platform> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
};
function toPlatformId(val: string): Platform {
  return AIRTABLE_TO_PLATFORM[val] || val.toLowerCase() as Platform;
}

const CAMPAIGN_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Draft: "outline",
  Scraping: "secondary",
  Generating: "secondary",
  Review: "default",
  Active: "default",
  Completed: "secondary",
};

// ── Page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentBrand?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?brandId=${currentBrand!.id}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    enabled: !!currentBrand?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: healthData } = useAccountsHealth();
  const accountsNeedingAttention = (healthData?.accounts || []).filter(
    (a: { status: string }) => a.status === "needs_reconnect"
  ).length;

  // Approve post inline
  const approveMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved" }),
      });
      if (!res.ok) throw new Error("Failed to approve");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Post approved");
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Dismissed" }),
      });
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Post dismissed");
    },
  });

  if (!currentBrand) {
    return (
      <div className="flex items-center justify-center h-64">
        <Text>Select a brand to view the dashboard.</Text>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Text>Failed to load dashboard data.</Text>
      </div>
    );
  }

  const pendingCount = (data.posts.byStatus["Pending"] || 0) + (data.posts.byStatus["Modified"] || 0);
  const pipelineStatuses = ["Pending", "Approved", "Queued", "Scheduled", "Published"];
  const pipelineTotal = pipelineStatuses.reduce((sum, s) => sum + (data.posts.byStatus[s] || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      {/* Brand header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading>{currentBrand.name}</Heading>
          <Text>Campaign operations overview</Text>
        </div>
        <Button asChild>
          <Link href="/dashboard/campaigns/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New Campaign
          </Link>
        </Button>
      </div>

      {/* Account health warning */}
      {accountsNeedingAttention > 0 && (
        <Link
          href="/dashboard/accounts"
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {accountsNeedingAttention} {accountsNeedingAttention === 1 ? "account needs" : "accounts need"} reconnection
            </p>
          </div>
        </Link>
      )}

      {/* ── Stats Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Campaigns"
          value={data.campaigns.active.filter((c) => ["Draft", "Review", "Active", "Generating", "Scraping"].includes(c.status)).length}
          icon={<Megaphone className="h-4 w-4" />}
          href="/dashboard/campaigns"
        />
        <StatCard
          label="Pending Review"
          value={pendingCount}
          icon={<Eye className="h-4 w-4" />}
          accent={pendingCount > 0 ? "amber" : undefined}
        />
        <StatCard
          label="Scheduled This Week"
          value={data.posts.scheduledThisWeek}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Published This Month"
          value={data.posts.publishedThisMonth}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="green"
        />
      </div>

      {/* ── Main Content: 2 columns ──────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column (span 2) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Approval Queue */}
          <Card>
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <Subheading className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-amber-500" />
                  Needs Your Attention
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-medium">
                      {pendingCount}
                    </span>
                  )}
                </Subheading>
              </div>
            </div>
            <CardContent className="pt-0 space-y-2">
              {data.posts.pendingReview.length === 0 ? (
                <div className="flex items-center gap-3 py-6 justify-center text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <Text className="!text-green-600 dark:!text-green-400">All caught up</Text>
                </div>
              ) : (
                data.posts.pendingReview.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    {post.imageUrl && (
                      <img src={post.imageUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <PlatformIcon platform={toPlatformId(post.platform)} size="sm" />
                        <span className="text-xs text-muted-foreground truncate">{post.campaignName}</span>
                      </div>
                      <p className="text-sm truncate">{post.content}</p>
                      {post.scheduledDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(post.scheduledDate), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2 text-xs"
                        onClick={() => approveMutation.mutate(post.id)}
                        disabled={approveMutation.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => dismissMutation.mutate(post.id)}
                        disabled={dismissMutation.isPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Failed Posts Alert */}
          {data.posts.failedPosts.length > 0 && (
            <Card className="border-red-200 dark:border-red-900">
              <div className="px-5 pt-5 pb-3">
                <Subheading className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="h-4 w-4" />
                  Failed Posts
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
                    {data.posts.failedPosts.length}
                  </span>
                </Subheading>
              </div>
              <CardContent className="pt-0 space-y-2">
                {data.posts.failedPosts.map((post) => (
                  <div key={post.id} className="flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
                    <PlatformIcon platform={toPlatformId(post.platform)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.content}</p>
                      <p className="text-xs text-muted-foreground">{post.campaignName}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Publishing Pipeline */}
          <Card>
            <div className="px-5 pt-5 pb-3">
              <Subheading className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Publishing Pipeline
              </Subheading>
            </div>
            <CardContent className="pt-0">
              {pipelineTotal > 0 ? (
                <>
                  {/* Stacked bar */}
                  <div className="flex h-8 rounded-lg overflow-hidden mb-3">
                    {pipelineStatuses.map((status) => {
                      const count = data.posts.byStatus[status] || 0;
                      if (count === 0) return null;
                      const pct = (count / pipelineTotal) * 100;
                      return (
                        <div
                          key={status}
                          className={cn("flex items-center justify-center text-white text-xs font-medium transition-all", STATUS_COLORS[status])}
                          style={{ width: `${pct}%` }}
                          title={`${status}: ${count}`}
                        >
                          {pct > 8 && count}
                        </div>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {pipelineStatuses.map((status) => {
                      const count = data.posts.byStatus[status] || 0;
                      return (
                        <div key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLORS[status])} />
                          {status} <span className="font-medium text-foreground">{count}</span>
                        </div>
                      );
                    })}
                    {(data.posts.byStatus["Failed"] || 0) > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                        Failed <span className="font-medium">{data.posts.byStatus["Failed"]}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <Text>No posts in the pipeline yet.</Text>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Campaign Status Board */}
          <Card>
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <Subheading>Campaigns</Subheading>
                <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                  <Link href="/dashboard/campaigns">View all</Link>
                </Button>
              </div>
            </div>
            <CardContent className="pt-0 space-y-2">
              {data.campaigns.active.length === 0 ? (
                <div className="py-6 text-center">
                  <Text>No campaigns yet.</Text>
                  <Button variant="outline" size="sm" className="mt-2" asChild>
                    <Link href="/dashboard/campaigns/new">Create first campaign</Link>
                  </Button>
                </div>
              ) : (
                data.campaigns.active
                  .sort((a, b) => {
                    const order = ["Active", "Review", "Generating", "Scraping", "Draft", "Completed"];
                    return order.indexOf(a.status) - order.indexOf(b.status);
                  })
                  .slice(0, 8)
                  .map((campaign) => {
                    const TypeIcon = CAMPAIGN_TYPE_ICONS[campaign.type] || FileText;
                    const total = campaign.postCounts.total;
                    const published = campaign.postCounts.published;
                    const pct = total > 0 ? Math.round((published / total) * 100) : 0;

                    return (
                      <Link
                        key={campaign.id}
                        href={`/dashboard/campaigns/${campaign.id}`}
                        className="block rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium truncate flex-1">{campaign.name}</span>
                          <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status] || "outline"} className="text-[10px] h-5">
                            {campaign.status}
                          </Badge>
                        </div>
                        {total > 0 && (
                          <>
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-muted mb-1">
                              <div
                                className="bg-green-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{published}/{total} published</span>
                              {campaign.postCounts.pending > 0 && (
                                <span className="text-amber-600">{campaign.postCounts.pending} pending</span>
                              )}
                            </div>
                          </>
                        )}
                      </Link>
                    );
                  })
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <div className="px-5 pt-5 pb-3">
              <Subheading>Quick Actions</Subheading>
            </div>
            <CardContent className="pt-0 space-y-1">
              <QuickLink href="/dashboard/campaigns/new" icon={<Plus className="h-4 w-4" />} label="New Campaign" />
              <QuickLink href="/dashboard/calendar" icon={<Calendar className="h-4 w-4" />} label="Calendar" />
              <QuickLink href="/dashboard/queue" icon={<Clock className="h-4 w-4" />} label="Queue" />
              <QuickLink href="/dashboard/settings/brands" icon={<Megaphone className="h-4 w-4" />} label="Brand Settings" />
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ── Timeline Heatmap (full width) ────────────────────── */}
      {data.timeline.length > 0 && (
        <Card>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <Subheading className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Posting Activity
              </Subheading>
              <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                <Link href="/dashboard/calendar">Open Calendar</Link>
              </Button>
            </div>
          </div>
          <CardContent className="pt-0">
            <MiniHeatmap timeline={data.timeline} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "amber" | "green" | "red";
  href?: string;
}) {
  const accentClasses = accent === "amber"
    ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
    : accent === "green"
      ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
      : accent === "red"
        ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
        : "";

  const content = (
    <div className={cn("rounded-lg border border-border p-4 transition-colors", accentClasses, href && "hover:bg-muted/50 cursor-pointer")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

/**
 * Mini heatmap showing posting density across dates.
 * Each cell is a day, colored by number of posts.
 */
function MiniHeatmap({ timeline }: { timeline: Array<{ date: string; platform: string; status: string }> }) {
  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of timeline) {
      const date = entry.date?.split("T")[0];
      if (date) map.set(date, (map.get(date) || 0) + 1);
    }
    return map;
  }, [timeline]);

  // Build 90 days centered on today
  const today = new Date();
  const days: Array<{ date: string; count: number; isToday: boolean }> = [];
  for (let i = -45; i <= 45; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    days.push({
      date: dateStr,
      count: byDate.get(dateStr) || 0,
      isToday: i === 0,
    });
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="flex flex-wrap gap-[3px]">
      {days.map((day) => {
        const intensity = day.count / maxCount;
        const bg = day.count === 0
          ? "bg-muted"
          : intensity < 0.33
            ? "bg-green-200 dark:bg-green-900"
            : intensity < 0.66
              ? "bg-green-400 dark:bg-green-700"
              : "bg-green-600 dark:bg-green-500";

        return (
          <div
            key={day.date}
            className={cn(
              "h-3 w-3 rounded-sm transition-colors",
              bg,
              day.isToday && "ring-1 ring-foreground ring-offset-1 ring-offset-background"
            )}
            title={`${day.date}: ${day.count} post${day.count !== 1 ? "s" : ""}`}
          />
        );
      })}
    </div>
  );
}
