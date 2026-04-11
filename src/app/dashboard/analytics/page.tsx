"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { useBrand } from "@/lib/brand-context";
import type { Platform } from "@/lib/late-api";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Share2,
  TrendingUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface AnalyticsData {
  engagement: {
    totalImpressions: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalViews: number;
    totalClicks: number;
    postsTracked: number;
    byPlatform: Record<
      string,
      {
        impressions: number;
        likes: number;
        comments: number;
        shares: number;
        views: number;
        posts: number;
      }
    >;
    topPosts: Array<{
      content: string;
      platform: string;
      impressions: number;
      likes: number;
      comments: number;
      engagementRate: number;
      publishedAt: string;
    }>;
  };
  lastUpdated: string;
}

const AIRTABLE_TO_PLATFORM: Record<string, Platform> = {
  instagram: "instagram",
  threads: "threads",
  bluesky: "bluesky",
  linkedin: "linkedin",
  facebook: "facebook",
  pinterest: "pinterest",
  twitter: "twitter",
};
function toPlatformId(val: string): Platform {
  return (
    AIRTABLE_TO_PLATFORM[val.toLowerCase()] ||
    ((val.toLowerCase() as Platform))
  );
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  threads: "#000000",
  bluesky: "#0085FF",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  pinterest: "#E60023",
  twitter: "#1DA1F2",
};

// ── Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { currentBrand, isLoading: isBrandLoading } = useBrand();

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["analytics", currentBrand?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/analytics?brandId=${currentBrand!.id}`
      );
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    enabled: !!currentBrand?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isBrandLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Text>Failed to load analytics data.</Text>
      </div>
    );
  }

  const { engagement } = data;

  // Platform bar chart data
  const platformChartData = Object.entries(engagement.byPlatform)
    .map(([platform, stats]) => ({
      name: platform.charAt(0).toUpperCase() + platform.slice(1),
      platform,
      impressions: stats.impressions,
      likes: stats.likes,
      comments: stats.comments,
      posts: stats.posts,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  // Pie chart data for engagement distribution
  const pieData = Object.entries(engagement.byPlatform)
    .filter(([, stats]) => stats.impressions > 0 || stats.likes > 0)
    .map(([platform, stats]) => ({
      name: platform.charAt(0).toUpperCase() + platform.slice(1),
      value: stats.impressions + stats.likes * 10 + stats.comments * 20,
      color: PLATFORM_COLORS[platform] || "#94a3b8",
    }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Post engagement across all connected platforms
          </p>
        </div>
      </div>

      {/* ── Summary Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          label="Impressions"
          value={engagement.totalImpressions}
          icon={<Eye className="h-4 w-4" />}
        />
        <MetricCard
          label="Likes"
          value={engagement.totalLikes}
          icon={<Heart className="h-4 w-4" />}
          accent="pink"
        />
        <MetricCard
          label="Comments"
          value={engagement.totalComments}
          icon={<MessageCircle className="h-4 w-4" />}
          accent="blue"
        />
        <MetricCard
          label="Shares"
          value={engagement.totalShares}
          icon={<Share2 className="h-4 w-4" />}
          accent="green"
        />
        <MetricCard
          label="Clicks"
          value={engagement.totalClicks}
          icon={<MousePointerClick className="h-4 w-4" />}
          accent="purple"
        />
      </div>

      {/* ── Charts Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Platform impressions bar chart */}
        <Card className="lg:col-span-2">
          <div className="px-5 pt-5 pb-3">
            <Subheading className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Impressions by Platform
            </Subheading>
          </div>
          <CardContent className="pt-0">
            {platformChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={platformChartData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e4e4e7",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Bar
                    dataKey="impressions"
                    fill="#0399FE"
                    radius={[4, 4, 0, 0]}
                    name="impressions"
                  />
                  <Bar
                    dataKey="likes"
                    fill="#EC4899"
                    radius={[4, 4, 0, 0]}
                    name="likes"
                  />
                  <Bar
                    dataKey="comments"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                    name="comments"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60">
                <Text>No engagement data yet.</Text>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Engagement distribution pie */}
        <Card>
          <div className="px-5 pt-5 pb-3">
            <Subheading>Engagement Share</Subheading>
          </div>
          <CardContent className="pt-0">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e4e4e7",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-60">
                <Text>No data yet.</Text>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Detail Cards Row ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Platform breakdown table */}
        <Card>
          <div className="px-5 pt-5 pb-3">
            <Subheading>Platform Breakdown</Subheading>
          </div>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {Object.entries(engagement.byPlatform)
                .sort(
                  (a, b) =>
                    b[1].impressions +
                    b[1].likes * 10 -
                    (a[1].impressions + a[1].likes * 10)
                )
                .map(([platform, stats]) => (
                  <div
                    key={platform}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <PlatformIcon
                      platform={toPlatformId(platform)}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">
                        {platform}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stats.posts} posts
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span title="Impressions">
                        <Eye className="h-3 w-3 inline mr-0.5" />
                        {stats.impressions.toLocaleString()}
                      </span>
                      <span title="Likes">
                        <Heart className="h-3 w-3 inline mr-0.5" />
                        {stats.likes}
                      </span>
                      <span title="Comments">
                        <MessageCircle className="h-3 w-3 inline mr-0.5" />
                        {stats.comments}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Top performing posts */}
        <Card>
          <div className="px-5 pt-5 pb-3">
            <Subheading>Top Posts by Impressions</Subheading>
          </div>
          <CardContent className="pt-0">
            {engagement.topPosts.length === 0 ? (
              <div className="py-6 text-center">
                <Text>No impression data yet.</Text>
              </div>
            ) : (
              <div className="space-y-3">
                {engagement.topPosts.map((post, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <PlatformIcon
                      platform={toPlatformId(post.platform)}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.content}</p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>
                          <Eye className="h-3 w-3 inline mr-0.5" />
                          {post.impressions.toLocaleString()}
                        </span>
                        <span>
                          <Heart className="h-3 w-3 inline mr-0.5" />
                          {post.likes}
                        </span>
                        <span>
                          <MessageCircle className="h-3 w-3 inline mr-0.5" />
                          {post.comments}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        Last updated:{" "}
        {new Date(data.lastUpdated).toLocaleString("en-US", {
          timeZone: "America/New_York",
        })}
        {" · "}Data cached for 5 minutes
      </p>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "pink" | "blue" | "green" | "purple";
}) {
  const accentClasses =
    accent === "pink"
      ? "border-pink-200 bg-pink-50/50 dark:border-pink-900 dark:bg-pink-950/20"
      : accent === "blue"
        ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20"
        : accent === "green"
          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
          : accent === "purple"
            ? "border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
            : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4 transition-colors",
        accentClasses
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
