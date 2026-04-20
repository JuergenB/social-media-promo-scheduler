"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { Logo } from "@/components/shared";
import { useBrand } from "@/lib/brand-context";
import { useAccountsHealth } from "@/hooks";
import type { Platform } from "@/lib/late-api";
import type { CampaignType, PostStatus } from "@/lib/airtable/types";
import { POST_STATUS_CONFIG } from "@/lib/platform-constants";
import { cn } from "@/lib/utils";
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
  Sparkles,
  Send,
  CalendarOff,
  Pencil,
  Wrench,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface AttentionPost {
  id: string;
  platform: string;
  content: string;
  scheduledDate: string;
  imageUrl: string;
  campaignId: string;
  campaignName: string;
  status: PostStatus;
  createdTime: string;
}

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
      campaignId: string;
      campaignName: string;
      zernioPostId: string;
    }>;
    approvedUnscheduled: AttentionPost[];
    modified: AttentionPost[];
    richAssetInFlight: AttentionPost[];
    failed: AttentionPost[];
    attentionCounts: {
      approvedUnscheduled: number;
      failed: number;
      modified: number;
      richAssetInFlight: number;
    };
    scheduledThisWeek: number;
    publishedThisMonth: number;
  };
  timeline: Array<{
    date: string;
    platform: string;
    status: PostStatus;
  }>;
  summary: {
    totalPosts: number;
    totalPublished: number;
    totalCampaigns: number;
    platformsUsed: number;
    platformCounts: Record<string, number>;
  };
  upcoming: Array<{
    id: string;
    platform: string;
    content: string;
    scheduledDate: string;
    imageUrl: string;
    campaignName: string;
  }>;
  postDates: Record<string, { scheduled: number; published: number; pending: number }>;
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
  const router = useRouter();
  const { currentBrand, isLoading: isBrandLoading } = useBrand();
  const [pipelineWindow, setPipelineWindow] = useState<"30d" | "90d" | "ytd" | "all">("90d");

  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", currentBrand?.id, pipelineWindow],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?brandId=${currentBrand!.id}&pipelineWindow=${pipelineWindow}`);
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

  // Analytics summary (Zernio engagement)
  const { data: analyticsData } = useQuery<{
    engagement: {
      totalImpressions: number;
      totalLikes: number;
      totalComments: number;
      totalClicks: number;
      postsTracked: number;
    };
  }>({
    queryKey: ["analytics-summary", currentBrand?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/analytics?brandId=${currentBrand!.id}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    enabled: !!currentBrand?.id,
    staleTime: 5 * 60 * 1000,
  });

  // All hooks must be called unconditionally (before early returns)
  const postDateEntries = data?.postDates || {};
  const datesWithPosts = useMemo(() => {
    const dates: Date[] = [];
    for (const dateStr of Object.keys(postDateEntries)) {
      dates.push(parseISO(dateStr));
    }
    return dates;
  }, [postDateEntries]);

  const platformDistribution = useMemo(() => {
    const counts = data?.summary?.platformCounts || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [data?.summary]);

  // Early returns (after all hooks)
  if (isBrandLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <Text className="text-muted-foreground">Loading brands...</Text>
      </div>
    );
  }

  if (!currentBrand) {
    return (
      <div className="flex items-center justify-center h-64">
        <Text>No brands available. Check your account settings.</Text>
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
  const totalPlatformPosts = platformDistribution.reduce((sum, [, c]) => sum + c, 0);

  const PLATFORM_COLORS: Record<string, string> = {
    Instagram: "bg-pink-500",
    "X/Twitter": "bg-zinc-800 dark:bg-zinc-300",
    LinkedIn: "bg-blue-700",
    Facebook: "bg-blue-600",
    Threads: "bg-zinc-700 dark:bg-zinc-400",
    Bluesky: "bg-sky-500",
    Pinterest: "bg-red-600",
    TikTok: "bg-zinc-900 dark:bg-zinc-200",
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">

      {/* ── Hero Section ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-primary/10 px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Logo size="sm" showText={true} />
            <span className="text-muted-foreground/60 text-sm">·</span>
            <h1 className="text-base font-medium text-muted-foreground">
              {currentBrand.name}
            </h1>
          </div>
          <Button asChild className="shrink-0 ml-6">
            <Link href="/dashboard/campaigns/new">
              <Plus className="h-4 w-4 mr-1.5" />
              New Campaign
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Turn any URL into a multi-platform social media campaign — automated, scheduled, ready to publish.
        </p>
        {data.summary && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-green-500" />
              <span className="font-semibold">{data.summary.totalPublished}</span>
              <span className="text-muted-foreground">published</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{data.summary.totalPosts}</span>
              <span className="text-muted-foreground">total posts</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{data.summary.totalCampaigns}</span>
              <span className="text-muted-foreground">{data.summary.totalCampaigns === 1 ? "campaign" : "campaigns"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">{data.summary.platformsUsed}</span>
              <span className="text-muted-foreground">{data.summary.platformsUsed === 1 ? "platform" : "platforms"}</span>
            </span>
          </div>
        )}
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

      {/* ── Publishing Pipeline (full width) ────────────────── */}
      <Card>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <Subheading className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Publishing Pipeline
            </Subheading>
            <select
              value={pipelineWindow}
              onChange={(e) => setPipelineWindow(e.target.value as "30d" | "90d" | "ytd" | "all")}
              className="text-xs h-7 rounded-md border border-border bg-background px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="ytd">Year to date</option>
              <option value="all">All time</option>
            </select>
          </div>
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

      {/* ── Main Content: 2 columns ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column (span 2) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Needs Your Attention — consolidated tabbed panel (#146) */}
          <NeedsAttentionPanel posts={data.posts} />

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

        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* ── Mini Calendar ──────────────────────────────────── */}
          <Card>
            <div className="px-5 pt-5 pb-1">
              <div className="flex items-center justify-between">
                <Subheading className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedule
                </Subheading>
                <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                  <Link href="/dashboard/calendar">Full Calendar</Link>
                </Button>
              </div>
            </div>
            <CardContent className="pt-0 flex justify-center">
              <CalendarWidget
                mode="single"
                modifiers={{ hasPost: datesWithPosts }}
                modifiersClassNames={{
                  hasPost: "relative after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                }}
                onDayClick={(day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  router.push(`/dashboard/calendar?date=${dateStr}`);
                }}
                className="p-0"
              />
            </CardContent>
          </Card>

          {/* ── Next Up ────────────────────────────────────────── */}
          {data.upcoming && data.upcoming.length > 0 && (
            <Card>
              <div className="px-5 pt-5 pb-3">
                <Subheading className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Next Up
                </Subheading>
              </div>
              <CardContent className="pt-0 space-y-2">
                {data.upcoming.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <PlatformIcon platform={toPlatformId(post.platform)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{post.content}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {post.scheduledDate && format(parseISO(post.scheduledDate), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Engagement Summary ──────────────────────────────── */}
          {analyticsData?.engagement && (
            <Card>
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between">
                  <Subheading className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Engagement
                  </Subheading>
                  <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                    <Link href="/dashboard/analytics">Details</Link>
                  </Button>
                </div>
              </div>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-semibold">{analyticsData.engagement.totalImpressions.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Impressions</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-semibold">{analyticsData.engagement.totalLikes.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Likes</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-semibold">{analyticsData.engagement.totalComments.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Comments</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-semibold">{analyticsData.engagement.totalClicks.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Clicks</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  {analyticsData.engagement.postsTracked} posts tracked
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Platform Distribution ──────────────────────────── */}
          {platformDistribution.length > 0 && (
            <Card>
              <div className="px-5 pt-5 pb-3">
                <Subheading>Platforms</Subheading>
              </div>
              <CardContent className="pt-0 space-y-2">
                {platformDistribution.map(([platform, count]) => {
                  const pct = totalPlatformPosts > 0 ? Math.round((count / totalPlatformPosts) * 100) : 0;
                  return (
                    <div key={platform} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={toPlatformId(platform)} size="sm" />
                          <span>{platform}</span>
                        </div>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                        <div
                          className={cn("rounded-full transition-all", PLATFORM_COLORS[platform] || "bg-primary")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions (compact) */}
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

// ── Needs Attention Panel (#146) ──────────────────────────────────
//
// Tabbed triage hub. Information-only — clicking a row opens the existing
// post detail modal at /dashboard/campaigns/{campaignId}?postId={id}.
//
// Tab order (priority): Approved-unscheduled, Failed, Modified, Rich-asset.
// Default-selected tab is the highest-priority tab with a non-zero count.

type AttentionTabId = "approvedUnscheduled" | "failed" | "modified" | "richAssetInFlight";

const RICH_ASSETS_BADGE_CLASS =
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";

const ATTENTION_TABS: Array<{
  id: AttentionTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyText: string;
  /** Tailwind class applied to the count badge when count > 0. Falls back to muted when count === 0. */
  activeBadgeClass: string;
  /** When true, badge uses Badge variant="destructive" instead of activeBadgeClass. */
  destructive?: boolean;
}> = [
  {
    id: "approvedUnscheduled",
    label: "Approved",
    icon: CalendarOff,
    emptyText: "No posts here — nice.",
    activeBadgeClass: POST_STATUS_CONFIG.Approved.className!,
  },
  {
    id: "richAssetInFlight",
    label: "Rich assets",
    icon: Wrench,
    emptyText: "No posts here — nice.",
    activeBadgeClass: RICH_ASSETS_BADGE_CLASS,
  },
  {
    id: "failed",
    label: "Failed",
    icon: XCircle,
    emptyText: "No posts here — nice.",
    activeBadgeClass: "",
    destructive: true,
  },
  {
    id: "modified",
    label: "Modified",
    icon: Pencil,
    emptyText: "No posts here — nice.",
    activeBadgeClass: POST_STATUS_CONFIG.Modified.className!,
  },
];

function groupByCampaign(rows: AttentionPost[]): Array<{ campaignId: string; campaignName: string; posts: AttentionPost[] }> {
  const map = new Map<string, { campaignId: string; campaignName: string; posts: AttentionPost[] }>();
  for (const row of rows) {
    const existing = map.get(row.campaignId);
    if (existing) existing.posts.push(row);
    else map.set(row.campaignId, { campaignId: row.campaignId, campaignName: row.campaignName || "Uncategorised", posts: [row] });
  }
  return Array.from(map.values());
}

function NeedsAttentionPanel({ posts }: { posts: DashboardStats["posts"] }) {
  const counts = posts.attentionCounts || { approvedUnscheduled: 0, failed: 0, modified: 0, richAssetInFlight: 0 };

  // Default tab = first non-zero in priority order, else first tab
  const defaultTab: AttentionTabId =
    (ATTENTION_TABS.find((t) => counts[t.id] > 0)?.id) || "approvedUnscheduled";

  const tabRows: Record<AttentionTabId, AttentionPost[]> = {
    approvedUnscheduled: posts.approvedUnscheduled || [],
    failed: posts.failed || [],
    modified: posts.modified || [],
    richAssetInFlight: posts.richAssetInFlight || [],
  };

  return (
    <Card>
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <Subheading className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            Needs Your Attention
          </Subheading>
        </div>
      </div>
      <CardContent className="pt-0">
        <Tabs defaultValue={defaultTab} className="gap-3">
          <TabsList className="mb-4 h-auto w-full p-1">
            {ATTENTION_TABS.map((tab) => {
              const Icon = tab.icon;
              const count = counts[tab.id];
              const badgeClass =
                count === 0
                  ? "bg-muted/60 text-muted-foreground"
                  : tab.destructive
                    ? "bg-destructive text-destructive-foreground"
                    : tab.activeBadgeClass;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span
                    className={cn(
                      "ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-medium",
                      badgeClass
                    )}
                  >
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {ATTENTION_TABS.map((tab) => {
            const rows = tabRows[tab.id];
            return (
              <TabsContent key={tab.id} value={tab.id} className="space-y-4">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 justify-center text-muted-foreground">
                    <CheckCircle2 className="h-6 w-6 text-green-500/70" />
                    <Text className="!text-muted-foreground text-sm">{tab.emptyText}</Text>
                  </div>
                ) : (
                  groupByCampaign(rows).map((group) => (
                    <div key={group.campaignId} className="space-y-2">
                      <div className="flex items-baseline gap-2 px-1">
                        <Link
                          href={`/dashboard/campaigns/${group.campaignId}`}
                          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors truncate"
                        >
                          {group.campaignName}
                        </Link>
                        <span className="text-[10px] text-muted-foreground/60">· {group.posts.length}</span>
                      </div>
                      {group.posts.map((row) => (
                        <AttentionPostRow key={row.id} row={row} tabId={tab.id} />
                      ))}
                    </div>
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AttentionPostRow({ row, tabId }: { row: AttentionPost; tabId: AttentionTabId }) {
  const isFailed = tabId === "failed";
  return (
    <Link
      href={`/dashboard/campaigns/${row.campaignId}?postId=${row.id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
        isFailed
          ? "border-red-200 bg-red-50/50 hover:bg-red-100 hover:border-red-300 dark:border-red-900 dark:bg-red-950/20 dark:hover:bg-red-950/40"
          : "border-border hover:bg-muted hover:border-muted-foreground/20"
      )}
    >
      {row.imageUrl ? (
        <img src={row.imageUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <PlatformIcon platform={toPlatformId(row.platform)} size="sm" />
          {/* Plain-text campaign tag for now — Badge styling lands in #148 */}
          <span className="text-xs text-muted-foreground truncate">{row.campaignName}</span>
        </div>
        <p className="text-sm truncate">{row.content}</p>
        {row.scheduledDate && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(parseISO(row.scheduledDate), "MMM d, h:mm a")}
          </p>
        )}
      </div>
      <ArrowRight className={cn("h-4 w-4 shrink-0 mt-1", isFailed ? "text-red-400" : "text-muted-foreground")} />
    </Link>
  );
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
