"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlatformIcon, PlatformBadge } from "@/components/shared/platform-icon";
import { FrequencyPreview } from "@/components/campaigns/frequency-preview";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/late-api";
import { useAccounts } from "@/hooks/use-accounts";
import { useBrand } from "@/lib/brand-context";
import {
  CAMPAIGN_TYPES,
  DISTRIBUTION_BIASES,
  DURATION_PRESETS,
  FEEDBACK_CATEGORIES,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
  type DistributionBias,
  type FeedbackCategory,
  type FeedbackSeverity,
  type Post,
  type PostStatus,
} from "@/lib/airtable/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  FileText,
  Frame,
  User,
  Mic,
  CalendarDays,
  Landmark,
  Film,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Archive,
  Save,
  Trash2,
  X,
  Link2,
  Maximize2,
  RotateCcw,
  Flag,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface ProgressEvent {
  step: number;
  totalSteps: number;
  status: "running" | "success" | "error";
  message: string;
  detail?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Map Airtable platform select values to Zernio platform IDs used by PlatformIcon */
const AIRTABLE_TO_PLATFORM: Record<string, Platform> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
  YouTube: "youtube",
  Reddit: "reddit",
  Telegram: "telegram",
  Snapchat: "snapchat",
  "Google Business": "googlebusiness",
};

function toPlatformId(airtableValue: string): Platform {
  return AIRTABLE_TO_PLATFORM[airtableValue] || airtableValue.toLowerCase() as Platform;
}

// ── Constants ──────────────────────────────────────────────────────────

const CAMPAIGN_TYPE_ICONS: Record<CampaignType, React.ElementType> = {
  Newsletter: Mail,
  "Blog Post": FileText,
  Exhibition: Frame,
  "Artist Profile": User,
  "Podcast Episode": Mic,
  Event: CalendarDays,
  "Public Art": Landmark,
  "Video/Film": Film,
  Institutional: Building2,
  Custom: Sparkles,
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Draft: "secondary",
  Scraping: "outline",
  Generating: "outline",
  Review: "default",
  Active: "default",
  Completed: "secondary",
  Archived: "secondary",
  Failed: "destructive",
};

const POST_STATUS_CONFIG: Record<
  PostStatus,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  Pending: { variant: "outline" },
  Approved: {
    variant: "secondary",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  Modified: {
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  Dismissed: { variant: "secondary", className: "opacity-50" },
  Scheduled: {
    variant: "secondary",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  Published: {
    variant: "secondary",
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  Failed: { variant: "destructive" },
};

// ── Main Page ──────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;

  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [showGenOptions, setShowGenOptions] = useState(true);
  const [genPlatforms, setGenPlatforms] = useState<Set<string>>(new Set());
  const [genPlatformsInitialized, setGenPlatformsInitialized] = useState(false);
  const [genMaxPerPlatform, setGenMaxPerPlatform] = useState<number | null>(null); // null = auto
  const queryClient = useQueryClient();

  // Fetch connected accounts for the current brand
  const { currentBrand } = useBrand();
  const { data: accountsData } = useAccounts();
  const connectedAccounts = accountsData?.accounts ?? [];

  // Derive unique connected platform IDs
  const connectedPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    for (const account of connectedAccounts) {
      if (account.isActive) {
        platforms.add(account.platform);
      }
    }
    return platforms;
  }, [connectedAccounts]);

  // Initialize genPlatforms from connected accounts (once loaded)
  useEffect(() => {
    if (connectedPlatforms.size > 0 && !genPlatformsInitialized) {
      setGenPlatforms(new Set(connectedPlatforms));
      setGenPlatformsInitialized(true);
    }
  }, [connectedPlatforms, genPlatformsInitialized]);

  const { data, isLoading, error } = useQuery<{ campaign: Campaign; posts: Post[] }>({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const campaign = data?.campaign;
  const posts = data?.posts ?? [];

  // All unique platforms across posts
  const allPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    posts.forEach((p) => {
      if (p.platform) platforms.add(p.platform);
    });
    return Array.from(platforms).sort();
  }, [posts]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    if (platformFilter.size === 0) return posts;
    return posts.filter((p) => platformFilter.has(p.platform));
  }, [posts, platformFilter]);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const groups: Record<string, Post[]> = {};
    filteredPosts.forEach((p) => {
      const dateKey = p.scheduledDate
        ? format(parseISO(p.scheduledDate), "yyyy-MM-dd")
        : "unscheduled";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(p);
    });
    return groups;
  }, [filteredPosts]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(postsByDate).sort((a, b) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [postsByDate]);

  // Post counts by status
  const reviewCount = posts.filter((p) => p.status === "Pending").length;
  const approvedCount = posts.filter(
    (p) => p.status === "Approved" || p.status === "Modified"
  ).length;

  // ── Generate posts handler (SSE) ─────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgressLog([]);

    try {
      const genParams = new URLSearchParams();
      if (genPlatforms.size > 0) {
        genParams.set("platforms", Array.from(genPlatforms).join(","));
      }
      if (genMaxPerPlatform !== null) {
        genParams.set("maxPerPlatform", String(genMaxPerPlatform));
      }
      const qs = genParams.toString();
      const res = await fetch(`/api/campaigns/${campaignId}/generate${qs ? `?${qs}` : ""}`, {
        method: "POST",
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as ProgressEvent;
              setProgressLog((prev) => {
                // Replace same step or append
                const existing = prev.findIndex((e) => e.step === event.step);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = event;
                  return updated;
                }
                return [...prev, event];
              });
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setProgressLog((prev) => [
        ...prev,
        {
          step: 0,
          totalSteps: 7,
          status: "error" as const,
          message: "Connection failed",
          detail: err instanceof Error ? err.message : "Unknown error",
        },
      ]);
    }

    setIsGenerating(false);
    // Refresh campaign data to show generated posts
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
  };

  const togglePlatformFilter = (platform: string) => {
    setPlatformFilter((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  // ── Loading / Error states ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/dashboard/campaigns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="h-6 w-48 rounded bg-muted animate-pulse" />
        </div>
        <Card className="animate-pulse">
          <div className="h-40 bg-muted" />
          <CardContent className="pt-4 space-y-3">
            <div className="h-5 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/dashboard/campaigns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Campaign not found</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>This campaign could not be loaded. It may have been deleted.</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/campaigns">Back to Campaigns</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TypeIcon = CAMPAIGN_TYPE_ICONS[campaign.type] || Sparkles;
  const displayName =
    campaign.name ||
    campaign.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button + page title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold truncate">{displayName}</h1>
      </div>

      {/* Header card */}
      <Card className="overflow-hidden !py-0 !gap-0">
        {/* Banner image */}
        {campaign.imageUrl ? (
          <div className="h-44 overflow-hidden bg-muted">
            <img
              src={campaign.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="h-24 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
            <TypeIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{displayName}</h2>
              <a
                href={campaign.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 truncate max-w-full"
              >
                {campaign.url.replace(/^https?:\/\//, "").slice(0, 80)}
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            </div>
            <Badge
              variant={STATUS_VARIANTS[campaign.status] || "secondary"}
              className="shrink-0"
            >
              {campaign.status}
            </Badge>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <TypeIcon className="h-3.5 w-3.5" />
              {campaign.type}
            </span>
            <span className="text-border">|</span>
            <span>{campaign.durationDays} days</span>
            {campaign.distributionBias && (
              <>
                <span className="text-border">|</span>
                <span>{campaign.distributionBias}</span>
              </>
            )}
            {campaign.createdAt && (
              <>
                <span className="text-border">|</span>
                <span>
                  Created{" "}
                  {format(parseISO(campaign.createdAt), "MMM d, yyyy")}
                </span>
              </>
            )}
          </div>

          {/* Editorial direction */}
          {campaign.editorialDirection && (
            <p className="text-sm text-muted-foreground italic">
              &ldquo;{campaign.editorialDirection}&rdquo;
            </p>
          )}

          {/* Action button + generation options toggle */}
          <div className="pt-1 flex items-center gap-3">
            <CampaignActionButton
              status={isGenerating ? "Generating" : campaign.status}
              campaignId={campaign.id}
              reviewCount={reviewCount}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />
            {campaign.status === "Draft" && !isGenerating && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGenOptions((v) => !v)}
                className="text-xs text-muted-foreground"
              >
                {showGenOptions ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                Options
              </Button>
            )}
          </div>

          {/* Generation options — platform selection + test mode */}
          {showGenOptions && campaign.status === "Draft" && !isGenerating && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Platforms to generate
                </Label>
                <div className="flex flex-wrap gap-3">
                  {connectedPlatforms.size === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No connected accounts for {currentBrand?.name || "this brand"}.
                      Connect accounts in the Accounts page first.
                    </p>
                  ) : (
                    [...connectedPlatforms].sort().map((p) => {
                      const PLATFORM_LABELS: Record<string, string> = {
                        twitter: "X/Twitter",
                        googlebusiness: "Google Business",
                      };
                      const label = PLATFORM_LABELS[p] || p.charAt(0).toUpperCase() + p.slice(1);
                      return (
                        <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={genPlatforms.has(p)}
                            onCheckedChange={(checked) => {
                              setGenPlatforms((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(p); else next.delete(p);
                                return next;
                              });
                            }}
                            className="scale-75"
                          />
                          <PlatformIcon platform={p as Platform} size="xs" showColor />
                          <span className="text-xs">{label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Max variants per platform
                </Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5, null].map((val) => (
                    <Button
                      key={val ?? "auto"}
                      variant={genMaxPerPlatform === val ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setGenMaxPerPlatform(val)}
                    >
                      {val === null ? "Auto" : val}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {genMaxPerPlatform
                    ? `Test mode: ${genMaxPerPlatform} variant${genMaxPerPlatform > 1 ? "s" : ""} per platform × ${genPlatforms.size} platform${genPlatforms.size !== 1 ? "s" : ""} = ~${genMaxPerPlatform * genPlatforms.size} posts`
                    : `Auto: variant count based on content sections and campaign duration`}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Progress log during generation */}
      {progressLog.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {progressLog.map((event, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    event.status === "error" && "text-destructive"
                  )}
                >
                  {event.status === "running" ? (
                    <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-primary shrink-0" />
                  ) : event.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                  ) : (
                    <span className="h-4 w-4 mt-0.5 text-destructive shrink-0">✗</span>
                  )}
                  <div>
                    <span className="text-muted-foreground mr-1.5">
                      [{event.step}/{event.totalSteps}]
                    </span>
                    <span className={event.status === "success" ? "text-foreground" : ""}>
                      {event.message}
                    </span>
                    {event.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Posts / Settings */}
      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">
            Posts
            {posts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {posts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ── Posts Tab ─────────────────────────────────────────────── */}
        <TabsContent value="posts">
          {posts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  No posts have been generated for this campaign yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Bulk actions bar */}
              {campaign.status === "Review" && (
                <div className="flex flex-wrap items-center gap-2">
                  {reviewCount > 0 && (
                    <Button variant="outline" size="sm" disabled>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Approve All Remaining ({reviewCount})
                    </Button>
                  )}
                  {approvedCount > 0 && (
                    <Button size="sm" disabled>
                      <Calendar className="mr-1.5 h-3.5 w-3.5" />
                      Schedule {approvedCount} Approved Posts
                    </Button>
                  )}
                </div>
              )}

              {/* Platform filter bar */}
              {allPlatforms.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground mr-1">
                    Filter:
                  </span>
                  {allPlatforms.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => togglePlatformFilter(platform)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        platformFilter.has(platform)
                          ? "border-primary bg-primary/10 text-primary"
                          : platformFilter.size === 0
                            ? "border-border bg-background text-foreground hover:bg-accent"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <PlatformIcon
                        platform={toPlatformId(platform)}
                        size="xs"
                        showColor
                      />
                      <span>{platform}</span>
                    </button>
                  ))}
                  {platformFilter.size > 0 && (
                    <button
                      onClick={() => setPlatformFilter(new Set())}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Posts grouped by date */}
              <div className="space-y-1">
                {sortedDateKeys.map((dateKey) => (
                  <div key={dateKey}>
                    {/* Date header */}
                    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {dateKey === "unscheduled"
                          ? "Unscheduled"
                          : format(parseISO(dateKey), "EEEE, MMMM d, yyyy")}
                      </h3>
                    </div>

                    {/* Posts for this date */}
                    <div className="divide-y divide-border">
                      {postsByDate[dateKey].map((post) => (
                        <CampaignPostRow
                          key={post.id}
                          post={post}
                          campaignStatus={campaign.status}
                          onClick={() => setSelectedPost(post)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Settings Tab ──────────────────────────────────────────── */}
        <TabsContent value="settings">
          {campaign.status === "Draft" ? (
            <CampaignSettingsEditable
              campaign={campaign}
              campaignId={campaignId}
            />
          ) : (
            <CampaignSettingsReadOnly campaign={campaign} />
          )}

          {/* Reset to Draft — for Review/Failed/Generating/Scraping campaigns */}
          {["Review", "Failed", "Generating", "Scraping"].includes(campaign.status) && (
            <ResetCampaignSection
              campaignId={campaignId}
              campaignName={campaign.name}
              postCount={posts.length}
            />
          )}

          {/* Delete campaign — only for non-Active campaigns */}
          {campaign.status !== "Active" && (
            <DeleteCampaignSection
              campaignId={campaignId}
              campaignName={campaign.name}
              status={campaign.status}
              postCount={posts.length}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Post detail dialog */}
      <Dialog
        open={!!selectedPost}
        onOpenChange={(open) => !open && setSelectedPost(null)}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Post Detail</DialogTitle>
          {selectedPost && (
            <PostDetailView
              post={selectedPost}
              posts={filteredPosts}
              campaign={campaign}
              onClose={() => setSelectedPost(null)}
              onNavigate={(p) => setSelectedPost(p)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function CampaignActionButton({
  status,
  campaignId,
  reviewCount,
  onGenerate,
  isGenerating,
}: {
  status: CampaignStatus;
  campaignId: string;
  reviewCount: number;
  onGenerate?: () => void;
  isGenerating?: boolean;
}) {
  switch (status) {
    case "Draft":
      return (
        <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Generate Posts
        </Button>
      );
    case "Scraping":
    case "Generating":
      return (
        <Button size="sm" disabled>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Generating...
        </Button>
      );
    case "Review":
      return (
        <Button size="sm" variant="default">
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Review {reviewCount} Posts
        </Button>
      );
    case "Active":
      return (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/dashboard/calendar?campaign=${campaignId}`}>
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            View in Calendar
          </Link>
        </Button>
      );
    case "Completed":
      return (
        <Button size="sm" variant="outline">
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          View Results
        </Button>
      );
    case "Archived":
      return (
        <Button size="sm" variant="ghost" disabled>
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          Archived
        </Button>
      );
    default:
      return null;
  }
}

function CampaignPostRow({
  post,
  campaignStatus,
  onClick,
}: {
  post: Post;
  campaignStatus: CampaignStatus;
  onClick: () => void;
}) {
  const [thumbLightbox, setThumbLightbox] = useState(false);
  const statusConfig = POST_STATUS_CONFIG[post.status] || { variant: "outline" as const };
  const platformLower = toPlatformId(post.platform);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full text-left hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Image thumbnail — click to preview full image */}
        {post.imageUrl ? (
          <div
            className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-muted relative group cursor-zoom-in"
            onClick={(e) => { e.stopPropagation(); setThumbLightbox(true); }}
          >
            <img
              src={post.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Maximize2 className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
            </div>
          </div>
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-muted flex items-center justify-center">
            <PlatformIcon platform={platformLower} size="md" showColor />
          </div>
        )}

        {/* Thumbnail lightbox */}
        {post.imageUrl && thumbLightbox && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setThumbLightbox(false); }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setThumbLightbox(false); }}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-[101]"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={post.imageUrl}
              alt=""
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-pointer"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PlatformIcon platform={platformLower} size="xs" showColor />
            <span className="text-xs font-medium">{post.platform}</span>
            {post.scheduledDate && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(parseISO(post.scheduledDate), "h:mm a")}
              </span>
            )}
            <Badge
              variant={statusConfig.variant}
              className={cn("text-[10px] px-1.5 py-0", statusConfig.className)}
            >
              {post.status}
            </Badge>
          </div>
          <p className="text-sm line-clamp-2">{post.content || "(No content)"}</p>
        </div>

        {/* Review actions */}
        {campaignStatus === "Review" && post.status === "Pending" && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Approve
            </span>
            <span className="inline-flex items-center px-2.5 py-1 text-xs text-muted-foreground/50">
              Dismiss
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PostDetailView({
  post,
  posts,
  campaign,
  onClose,
  onNavigate,
}: {
  post: Post;
  posts: Post[];
  campaign: Campaign;
  onClose: () => void;
  onNavigate: (post: Post) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const platformLower = toPlatformId(post.platform);
  const statusConfig = POST_STATUS_CONFIG[post.status] || { variant: "outline" as const };
  const charCount = post.content?.length || 0;

  // The URL to the source article — prefer shortUrl, fall back to linkUrl
  const articleUrl = post.shortUrl || post.linkUrl;

  // Navigation
  const currentIndex = posts.findIndex((p) => p.id === post.id);
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  return (
    <div className="flex flex-col max-h-[90vh]">
      {/* Navigation header — pinned, with right padding to avoid close button */}
      <div className="flex items-center justify-between border-b border-border pl-6 pr-14 py-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          disabled={!prevPost}
          onClick={() => prevPost && onNavigate(prevPost)}
          className="h-8"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} of {posts.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!nextPost}
          onClick={() => nextPost && onNavigate(nextPost)}
          className="h-8"
        >
          Next
          <ArrowLeft className="h-3.5 w-3.5 ml-1 rotate-180" />
        </Button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Platform header */}
        <div className="flex items-center gap-3 px-6 pt-4 pb-3">
          <PlatformBadge platform={platformLower} className="h-10 w-10" />
          <div className="flex-1">
            <h3 className="font-semibold text-base">{post.platform} Post</h3>
            {post.scheduledDate && (
              <p className="text-sm text-muted-foreground">
                {format(parseISO(post.scheduledDate), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
          <Badge
            variant={statusConfig.variant}
            className={cn("text-xs", statusConfig.className)}
          >
            {post.status}
          </Badge>
        </div>

        {/* Image — clickable to open full-size lightbox */}
        {post.imageUrl && (
          <div className="px-6 pb-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setLightboxOpen(true)}
              onKeyDown={(e) => e.key === "Enter" && setLightboxOpen(true)}
              className="rounded-lg overflow-hidden bg-muted relative group cursor-pointer"
            >
              <img
                src={post.imageUrl}
                alt=""
                className="w-full max-h-64 object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
              </div>
            </div>
          </div>
        )}

        {/* Image lightbox overlay */}
        {post.imageUrl && lightboxOpen && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-[101]"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={post.imageUrl}
              alt=""
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-pointer"
            />
          </div>
        )}

        {/* Full content */}
        <div className="px-6 pb-3">
          <p className="text-sm whitespace-pre-wrap">
            {post.content || "(No content)"}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {charCount} characters
          </p>
        </div>

        {/* Article link — launch the source URL in browser */}
        {articleUrl && (
          <div className="px-6 pb-3">
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Link2 className="h-3 w-3" />
              Open source article
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Short link (display only, separate from launch hint) */}
        {post.shortUrl && (
          <div className="px-6 pb-3">
            <span className="text-xs text-muted-foreground">{post.shortUrl}</span>
          </div>
        )}

        {/* Metadata */}
        <div className="px-6 pb-4 space-y-1 text-xs text-muted-foreground">
          {post.contentVariant && (
            <div><span className="font-medium">Variant:</span> {post.contentVariant}</div>
          )}
          {post.notes && (
            <div><span className="font-medium">Notes:</span> {post.notes}</div>
          )}
        </div>
      </div>

      {/* Footer actions — pinned */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-2">
          {post.status === "Pending" && (
            <>
              <Button variant="default" size="sm" disabled>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Approve
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" disabled>
                Dismiss
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setFlagDialogOpen(true)}
          >
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            Flag Issue
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* Flag Issue Dialog */}
      <FlagIssueDialog
        open={flagDialogOpen}
        onOpenChange={setFlagDialogOpen}
        post={post}
        campaign={campaign}
      />
    </div>
  );
}

/** Editable settings for Draft campaigns — reuses creation form components */
function CampaignSettingsEditable({
  campaign,
  campaignId,
}: {
  campaign: Campaign;
  campaignId: string;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(campaign.url);
  const [type, setType] = useState<CampaignType>(campaign.type);
  const [durationDays, setDurationDays] = useState(campaign.durationDays);
  const [distributionBias, setDistributionBias] = useState<DistributionBias>(
    campaign.distributionBias || "Front-loaded"
  );
  const [editorialDirection, setEditorialDirection] = useState(
    campaign.editorialDirection || ""
  );
  const [customDuration, setCustomDuration] = useState(
    !DURATION_PRESETS.some((p) => p.days === campaign.durationDays)
  );

  const hasChanges =
    url !== campaign.url ||
    type !== campaign.type ||
    durationDays !== campaign.durationDays ||
    distributionBias !== (campaign.distributionBias || "Front-loaded") ||
    editorialDirection !== (campaign.editorialDirection || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          type,
          durationDays,
          distributionBias,
          editorialDirection,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Campaign settings saved");
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  return (
    <div className="space-y-6">
      {/* Source URL */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Source URL
          </Label>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="text-base"
          />
        </CardContent>
      </Card>

      {/* Editorial Direction */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Editorial Direction
          </Label>
          <Textarea
            placeholder="What should we emphasize? Which pieces stood out?"
            value={editorialDirection}
            onChange={(e) => setEditorialDirection(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Optional — this guidance shapes every post that gets generated.
          </p>
        </CardContent>
      </Card>

      {/* Campaign Type */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Campaign Type
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CAMPAIGN_TYPES.map((t) => {
              const Icon = CAMPAIGN_TYPE_ICONS[t];
              const isSelected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center leading-tight">{t}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Duration & Distribution */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Duration presets */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Campaign Length
            </Label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant={
                    !customDuration && durationDays === preset.days
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setDurationDays(preset.days);
                    setDistributionBias(preset.defaultBias);
                    setCustomDuration(false);
                  }}
                >
                  {preset.label}{" "}
                  <span className="ml-1 text-xs opacity-70">
                    {preset.description}
                  </span>
                </Button>
              ))}
              <Button
                type="button"
                variant={customDuration ? "default" : "outline"}
                size="sm"
                onClick={() => setCustomDuration(true)}
              >
                Custom
              </Button>
            </div>
            {customDuration && (
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="custom-days" className="text-sm whitespace-nowrap">
                  Days:
                </Label>
                <Input
                  id="custom-days"
                  type="number"
                  min={7}
                  max={730}
                  value={durationDays}
                  onChange={(e) =>
                    setDurationDays(parseInt(e.target.value) || 0)
                  }
                  className="w-24"
                />
              </div>
            )}
          </div>

          {/* Distribution bias */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Posting Intensity
            </Label>
            <div className="flex gap-2">
              {DISTRIBUTION_BIASES.map((bias) => (
                <Button
                  key={bias}
                  type="button"
                  variant={distributionBias === bias ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setDistributionBias(bias)}
                >
                  {bias}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {distributionBias === "Front-loaded"
                ? "Heavy promotion early, tapering off over time. Best for launches and events."
                : distributionBias === "Back-loaded"
                  ? "Builds momentum toward a deadline. Good for countdowns and upcoming events."
                  : "Steady presence throughout. Works well for evergreen content."}
            </p>
          </div>

          {/* Frequency preview chart */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Frequency Preview
            </Label>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <FrequencyPreview
                durationDays={durationDays}
                bias={distributionBias}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      {hasChanges && (
        <div className="flex justify-end pb-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}

/** Read-only settings for campaigns with generated posts */
function CampaignSettingsReadOnly({ campaign }: { campaign: Campaign }) {
  const TypeIcon = CAMPAIGN_TYPE_ICONS[campaign.type] || Sparkles;

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          Settings are locked because posts have been generated. To change settings, regenerate the campaign.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SettingsField label="Source URL">
            <a
              href={campaign.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
            >
              {campaign.url}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </SettingsField>
          <SettingsField label="Campaign Type">
            <span className="flex items-center gap-1.5 text-sm">
              <TypeIcon className="h-4 w-4 text-muted-foreground" />
              {campaign.type}
            </span>
          </SettingsField>
          <SettingsField label="Duration">
            <span className="text-sm">{campaign.durationDays} days</span>
          </SettingsField>
          <SettingsField label="Distribution Bias">
            <span className="text-sm">
              {campaign.distributionBias || "Not set"}
            </span>
          </SettingsField>
          <SettingsField label="Status">
            <Badge variant={STATUS_VARIANTS[campaign.status] || "secondary"}>
              {campaign.status}
            </Badge>
          </SettingsField>
          {campaign.createdAt && (
            <SettingsField label="Created">
              <span className="text-sm">
                {format(parseISO(campaign.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </SettingsField>
          )}
        </div>

        {campaign.editorialDirection && (
          <>
            <Separator />
            <SettingsField label="Editorial Direction">
              <p className="text-sm italic">
                &ldquo;{campaign.editorialDirection}&rdquo;
              </p>
            </SettingsField>
          </>
        )}

        {campaign.durationDays && campaign.distributionBias && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-medium mb-3">Distribution Curve</h3>
              <FrequencyPreview
                durationDays={campaign.durationDays}
                bias={campaign.distributionBias}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Reset campaign to Draft — deletes all posts, reverts status */
function ResetCampaignSection({
  campaignId,
  campaignName,
  postCount,
}: {
  campaignId: string;
  campaignName: string;
  postCount: number;
}) {
  const [isResetting, setIsResetting] = useState(false);
  const queryClient = useQueryClient();

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reset`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to reset campaign");
        setIsResetting(false);
        return;
      }
      const data = await res.json();
      toast.success(`Campaign reset to Draft — ${data.deletedPosts} posts deleted`);
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {
      toast.error("Failed to reset campaign");
    }
    setIsResetting(false);
  };

  return (
    <Card className="mt-6 border-amber-500/30">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-amber-600 dark:text-amber-400">Reset to Draft</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Delete {postCount > 0 ? `all ${postCount} generated posts and reset` : "reset"} this campaign to Draft status so you can regenerate with different settings.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isResetting} className="border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Campaign to Draft</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset &ldquo;{campaignName}&rdquo; to Draft status.
                  {postCount > 0 && (
                    <> All {postCount} generated posts will be permanently deleted.</>
                  )}
                  {" "}You can then adjust settings and regenerate.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleReset}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  {isResetting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Reset to Draft
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/** Delete campaign with confirmation dialog */
function DeleteCampaignSection({
  campaignId,
  campaignName,
  status,
  postCount,
}: {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  postCount: number;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete campaign");
        setIsDeleting(false);
        return;
      }
      toast.success("Campaign deleted");
      router.push("/dashboard/campaigns");
    } catch {
      toast.error("Failed to delete campaign");
      setIsDeleting(false);
    }
  };

  return (
    <Card className="mt-6 border-destructive/30">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-destructive">Delete Campaign</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently delete this campaign
              {postCount > 0 ? ` and its ${postCount} generated posts` : ""}.
              This action cannot be undone.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &ldquo;{campaignName}&rdquo;?
                  {postCount > 0 && (
                    <> This will also delete {postCount} generated posts.</>
                  )}
                  {" "}This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Campaign
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

// ── Flag Issue Dialog ───────────────────────────────────────────────────

const SEVERITY_OPTIONS: FeedbackSeverity[] = ["Minor", "Moderate", "Critical"];

function FlagIssueDialog({
  open,
  onOpenChange,
  post,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
  campaign: Campaign;
}) {
  const [selectedCategories, setSelectedCategories] = useState<Set<FeedbackCategory>>(
    new Set()
  );
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity>("Minor");
  const [submitting, setSubmitting] = useState(false);

  const toggleCategory = (cat: FeedbackCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedCategories.size === 0) {
      toast.error("Please select at least one issue category");
      return;
    }

    setSubmitting(true);
    try {
      const categories = Array.from(selectedCategories);
      const summary = categories.length === 1
        ? categories[0] + " — " + post.platform
        : categories.length + " issues — " + post.platform;

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          campaignIds: [campaign.id],
          postIds: [post.id],
          campaignTypeIds: [],
          issueCategories: categories,
          description,
          severity,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit feedback");

      toast.success("Feedback submitted");
      onOpenChange(false);
      // Reset form
      setSelectedCategories(new Set());
      setDescription("");
      setSeverity("Minor");
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flag Issue</DialogTitle>
          <DialogDescription>
            Report a problem with this {post.platform} post. This feedback helps
            improve future content generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Issue categories */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Issue Category
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={selectedCategories.has(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Description (optional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue in more detail..."
              className="text-sm"
            />
          </div>

          {/* Severity */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Severity
            </Label>
            <div className="flex gap-3">
              {SEVERITY_OPTIONS.map((sev) => (
                <label
                  key={sev}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="severity"
                    value={sev}
                    checked={severity === sev}
                    onChange={() => setSeverity(sev)}
                    className="accent-primary"
                  />
                  {sev}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedCategories.size === 0}
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
