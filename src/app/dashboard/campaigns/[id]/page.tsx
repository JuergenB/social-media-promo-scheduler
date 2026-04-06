"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { CampaignTimeline } from "@/components/campaigns/campaign-timeline";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/late-api";
import { useAccounts } from "@/hooks/use-accounts";
import { useBrand } from "@/lib/brand-context";
import {
  CAMPAIGN_TYPES,
  ENABLED_CAMPAIGN_TYPES,
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
import { compressImage, validateImage } from "@/lib/image-compression";
import { parseMediaItems, serializeMediaItems, type MediaItem } from "@/lib/media-items";
import { CoverSlideDesigner } from "@/components/posts/cover-slide-designer";
import type { CoverSlideData } from "@/lib/cover-slide-types";
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
  Megaphone,
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
  Plus,
  RotateCcw,
  Flag,
  Upload,
  ImageOff,
  Pencil,
  ArrowLeftRight,
  Layers,
  Link2Off,
  RefreshCw,
  Send,
  Pipette,
  Eraser,
  CalendarX2,
  LayoutTemplate,
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
  "Open Call": Megaphone,
  "Public Art": Landmark,
  "Video/Film": Film,
  Institutional: Building2,
  Custom: Sparkles,
};

const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  Newsletter: "Promote a newsletter issue across social media. Each story becomes its own post with a link that scrolls directly to that story. Great for curated newsletters with multiple features.",
  "Blog Post": "Turn a blog post or article into a series of social media posts. Images and key quotes are extracted and cycled through, with each post highlighting a different aspect of the article.",
  Exhibition: "Promote an art exhibition by featuring individual artists and artworks. Scrapes exhibition pages and artist profiles to build a months-long drip campaign. (Coming soon)",
  "Artist Profile": "Spotlight an artist with posts featuring their work and story. Uses artwork images and artist bio to generate posts that celebrate the artist across platforms. (Coming soon)",
  "Podcast Episode": "Promote a podcast episode using show notes, guest highlights, and key quotes. Can incorporate transcripts for deeper content extraction. (Coming soon)",
  Event: "Promote physical or virtual events — gallery openings, anniversary celebrations, studio tours, art fairs. Date-driven campaigns that build intensity toward the event date with RSVP/ticket CTAs.",
  "Open Call": "Promote open calls for artist submissions. Deadline-driven campaigns that build toward a submission deadline with apply/submit CTAs. (Coming soon)",
  "Public Art": "Promote public art installations, murals, and outdoor exhibitions with location-specific content and visual storytelling. (Coming soon)",
  "Video/Film": "Promote video content, short films, or video art with platform-optimized teasers and behind-the-scenes posts. (Coming soon)",
  Institutional: "Promote organizational news, grants, residencies, and institutional announcements across social platforms. (Coming soon)",
  Custom: "Create a custom campaign with manual configuration for content types not covered by other presets. (Coming soon)",
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Scraping: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Generating: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Completed: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
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
  Queued: {
    variant: "secondary",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
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
  const searchParams = useSearchParams();
  const autoOpenPostId = searchParams.get("postId");
  const generateMore = searchParams.get("generate") === "more";
  const { data: pageSession } = useSession();

  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);
  const [showGenOptions, setShowGenOptions] = useState(true);
  const [genPlatforms, setGenPlatforms] = useState<Set<string>>(new Set());
  const [genPlatformsInitialized, setGenPlatformsInitialized] = useState(false);
  const [genMaxPerPlatform, setGenMaxPerPlatform] = useState<number | null>(null); // null = auto
  const [settingsUnsaved, setSettingsUnsaved] = useState(false);
  const [activeTab, setActiveTab] = useState("posts");
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

  // Auto-open a specific post if ?postId= is in the URL (e.g., from dashboard approval queue)
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpenPostId && posts.length > 0 && !autoOpened) {
      const post = posts.find((p) => p.id === autoOpenPostId);
      if (post) {
        setSelectedPost(post);
        setAutoOpened(true);
      }
    }
  }, [autoOpenPostId, posts, autoOpened]);

  // Auto-open generate panel when ?generate=more is in the URL
  useEffect(() => {
    if (generateMore && campaign && (campaign.status === "Active" || campaign.status === "Review")) {
      setShowGenOptions(true);
      setActiveTab("posts");
    }
  }, [generateMore, campaign]);

  // Keep selectedPost in sync with fresh query data (e.g., after regeneration)
  useEffect(() => {
    if (selectedPost && posts.length > 0) {
      const fresh = posts.find((p) => p.id === selectedPost.id);
      if (fresh && fresh.content !== selectedPost.content) {
        setSelectedPost(fresh);
      }
    }
  }, [posts, selectedPost]);

  // Initialize genPlatforms: prefer saved campaign values, fall back to connected accounts.
  // Wait for campaign data to load before falling back, to avoid a race condition
  // where connected accounts load first and override saved platform selections.
  useEffect(() => {
    if (genPlatformsInitialized) return;
    if (!campaign) return; // Wait for campaign data to load

    // Try campaign's saved target platforms first
    if (campaign.targetPlatforms && campaign.targetPlatforms.length > 0) {
      setGenPlatforms(new Set(campaign.targetPlatforms));
      setGenPlatformsInitialized(true);
      return;
    }

    // Campaign loaded but has no saved platforms — fall back to connected accounts
    if (connectedPlatforms.size > 0) {
      setGenPlatforms(new Set(connectedPlatforms));
      setGenPlatformsInitialized(true);
    }
  }, [connectedPlatforms, genPlatformsInitialized, campaign]);

  // Initialize genMaxPerPlatform from campaign's saved value
  const [genMaxInitialized, setGenMaxInitialized] = useState(false);
  useEffect(() => {
    if (!genMaxInitialized && campaign?.maxVariantsPerPlatform != null) {
      setGenMaxPerPlatform(campaign.maxVariantsPerPlatform);
      setGenMaxInitialized(true);
    }
  }, [campaign?.maxVariantsPerPlatform, genMaxInitialized]);

  // Track whether generation options have unsaved changes
  const genOptionsChanged = useMemo(() => {
    if (!campaign) return false;
    const savedPlatforms = campaign.targetPlatforms || [];
    const currentPlatforms = Array.from(genPlatforms).sort();
    const platformsMatch = savedPlatforms.sort().join(",") === currentPlatforms.join(",");
    const maxMatch = (campaign.maxVariantsPerPlatform ?? null) === genMaxPerPlatform;
    return !platformsMatch || !maxMatch;
  }, [campaign, genPlatforms, genMaxPerPlatform]);

  const [savingGenOptions, setSavingGenOptions] = useState(false);
  const saveGenOptions = async () => {
    if (!campaignId) return;
    setSavingGenOptions(true);
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlatforms: Array.from(genPlatforms).join(","),
          maxVariantsPerPlatform: genMaxPerPlatform,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {
      // Non-critical
    } finally {
      setSavingGenOptions(false);
    }
  };

  // Hero image upload / paste URL
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroUrlInput, setHeroUrlInput] = useState("");
  const [showHeroUrlInput, setShowHeroUrlInput] = useState(false);

  const setHeroImageUrl = async (url: string) => {
    if (!campaignId || !url.trim()) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url.trim() }),
      });
      if (!res.ok) throw new Error("Failed to set hero image URL");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      setHeroUrlInput("");
      setShowHeroUrlInput(false);
      toast.success("Hero image updated");
    } catch {
      toast.error("Failed to set hero image URL");
    }
  };

  const uploadHeroImage = async (file: File) => {
    if (!campaignId) return;
    const validation = validateImage(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    setHeroUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch(`/api/campaigns/${campaignId}/image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload hero image");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Hero image updated");
    } catch {
      toast.error("Failed to upload hero image");
    } finally {
      setHeroUploading(false);
    }
  };

  const removeHeroImage = async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/image`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove hero image");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Hero image removed");
    } catch {
      toast.error("Failed to remove hero image");
    }
  };

  // All unique platforms across posts
  const allPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    posts.forEach((p) => {
      if (p.platform) platforms.add(p.platform);
    });
    return Array.from(platforms).sort();
  }, [posts]);

  // (postsByDate and sortedDateKeys moved after filteredPosts definition below)

  // Post counts by status
  const reviewCount = posts.filter((p) => p.status === "Pending").length;
  const approvedCount = posts.filter(
    (p) => p.status === "Approved" || p.status === "Modified"
  ).length;
  const queuedCount = posts.filter(
    (p) => p.status === "Queued"
  ).length;
  const scheduledCount = posts.filter((p) => p.status === "Scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "Published").length;
  const failedCount = posts.filter((p) => p.status === "Failed").length;
  const dismissedCount = posts.filter((p) => p.status === "Dismissed").length;
  const outOfViewCount = queuedCount + scheduledCount + publishedCount;

  // Queue-focused view: only show actionable posts (not scheduled/published/queued)
  const ACTIONABLE_STATUSES = new Set(["Pending", "Approved", "Modified", "Failed", "Scheduled"]);
  const actionablePosts = useMemo(() => {
    return posts.filter((p) => ACTIONABLE_STATUSES.has(p.status));
  }, [posts]);
  const dismissedPosts = useMemo(() => {
    return posts.filter((p) => p.status === "Dismissed");
  }, [posts]);

  // Post counts by platform (for additive generation UI)
  const postCountsByPlatform = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      const key = p.platform?.toLowerCase().replace("x/twitter", "twitter") || "";
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [posts]);

  // Filtered posts (actionable statuses, optionally filtered by platform + status)
  const filteredPosts = useMemo(() => {
    let result = actionablePosts;
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (platformFilter.size > 0) result = result.filter((p) => platformFilter.has(p.platform));
    return result;
  }, [actionablePosts, platformFilter, statusFilter]);

  // Filter-aware approved posts for scheduling
  const hasActiveFilter = platformFilter.size > 0 || statusFilter !== null;
  const filteredApprovedPosts = useMemo(() => {
    return filteredPosts.filter((p) => p.status === "Approved" || p.status === "Modified");
  }, [filteredPosts]);
  const scheduleCount = hasActiveFilter ? filteredApprovedPosts.length : approvedCount;
  const schedulePostIds = hasActiveFilter ? filteredApprovedPosts.map((p) => p.id) : null;

  // Group filtered posts by date
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

  // ── Quick approve/dismiss from list view ─────────────────────────────
  const quickApprove = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Approved",
          approvedBy: pageSession?.user?.name || pageSession?.user?.email || "",
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {}
  };

  const quickDismiss = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Dismissed" }),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {}
  };

  const quickUnapprove = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Pending" }),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {}
  };

  const quickRetry = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved", clearZernioState: true }),
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {}
  };

  const quickUnschedule = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved", clearZernioState: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to unschedule");
      }
      await queryClient.refetchQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Post unscheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unschedule post");
    }
  };

  const quickDelete = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    } catch {}
  };

  const syncWithZernio = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      await queryClient.refetchQueries({ queryKey: ["campaign", campaignId] });
      if (data.updated > 0) {
        toast.success(`Synced ${data.updated} post${data.updated === 1 ? "" : "s"} with Zernio`);
      } else {
        toast.success("All posts are in sync with Zernio");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Generate posts handler (SSE) ─────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgressLog([]);

    try {
      const genParams = new URLSearchParams();
      if (campaign && (campaign.status === "Active" || campaign.status === "Review")) {
        genParams.set("mode", "additive");
      }
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
    // Switch to Posts tab and refresh to show generated posts
    setActiveTab("posts");
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
        {/* Banner image with upload overlay */}
        <div className="relative group">
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
          {/* Upload / paste URL overlay */}
          {showHeroUrlInput ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-8">
              <div className="flex w-full max-w-md gap-2" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="url"
                  placeholder="Paste image URL..."
                  value={heroUrlInput}
                  onChange={(e) => setHeroUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setHeroImageUrl(heroUrlInput);
                    if (e.key === "Escape") { setShowHeroUrlInput(false); setHeroUrlInput(""); }
                  }}
                  className="bg-white text-zinc-900 text-sm h-8"
                  autoFocus
                />
                <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => setHeroImageUrl(heroUrlInput)} disabled={!heroUrlInput.trim()}>
                  Set
                </Button>
                <Button size="sm" variant="ghost" className="h-8 shrink-0 text-white hover:text-white hover:bg-white/20" onClick={() => { setShowHeroUrlInput(false); setHeroUrlInput(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/40 transition-colors">
              <label className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={heroUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadHeroImage(file);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white transition-colors">
                  {heroUploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> {campaign.imageUrl ? "Change" : "Upload"}</>
                  )}
                </span>
              </label>
              {!heroUploading && (
                <button
                  onClick={() => setShowHeroUrlInput(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white"
                >
                  <Link2 className="h-3.5 w-3.5" /> Paste URL
                </button>
              )}
              {campaign.imageUrl && !heroUploading && (
                <button
                  onClick={removeHeroImage}
                  className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
          )}
        </div>

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
              variant="outline"
              className={`shrink-0 border-transparent ${STATUS_STYLES[campaign.status] || "bg-zinc-100 text-zinc-600"}`}
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

          {/* Unsaved settings warning */}
          {settingsUnsaved && campaign.status === "Draft" && (
            <div className="pt-1 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              You have unsaved changes in the Settings tab. Save them before generating, or they won&apos;t take effect.
            </div>
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
            {(campaign.status === "Draft" || campaign.status === "Active" || campaign.status === "Review") && !isGenerating && (
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
          {showGenOptions && (campaign.status === "Draft" || campaign.status === "Active" || campaign.status === "Review") && !isGenerating && (
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
                          {postCountsByPlatform[p] > 0 && (
                            <span className="text-[10px] text-muted-foreground">({postCountsByPlatform[p]})</span>
                          )}
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
                  {[1, 2, 3, 5, 8, 10, null].map((val) => (
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

              {genOptionsChanged && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">
                    Unsaved changes
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={saveGenOptions}
                    disabled={savingGenOptions}
                  >
                    {savingGenOptions ? "Saving..." : "Save Options"}
                  </Button>
                </div>
              )}

              {/* Generate More button — for Active/Review campaigns */}
              {campaign && (campaign.status === "Active" || campaign.status === "Review") && (
                <div className="pt-2 border-t border-border/50">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || genPlatforms.size === 0}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Generate More Posts
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Compact progress bar during generation */}
      {progressLog.length > 0 && (() => {
        const latest = progressLog[progressLog.length - 1];
        const pct = latest.totalSteps > 0
          ? Math.round((latest.step / latest.totalSteps) * 100)
          : 0;
        const isComplete = latest.status === "success" && latest.step === latest.totalSteps;
        const isError = latest.status === "error";

        return (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-2">
              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isError ? "bg-destructive" : isComplete ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {/* Single status line */}
              <div className="flex items-center gap-2 text-sm">
                {latest.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                ) : isError ? (
                  <span className="h-3.5 w-3.5 text-destructive shrink-0">✗</span>
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                )}
                <span className={cn(
                  "truncate",
                  isError ? "text-destructive" : "text-muted-foreground"
                )}>
                  Step {latest.step}/{latest.totalSteps}: {latest.message}
                </span>
              </div>
              {latest.detail && (
                <p className="text-xs text-muted-foreground truncate pl-5.5">
                  {latest.detail}
                </p>
              )}
              {/* Expandable full log */}
              {progressLog.length > 1 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">
                    Show all steps
                  </summary>
                  <div className="mt-2 space-y-1 pl-1">
                    {progressLog.map((event, i) => (
                      <div key={i} className={cn(
                        "flex items-center gap-1.5",
                        event.status === "error" && "text-destructive"
                      )}>
                        {event.status === "success" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        ) : event.status === "running" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                        ) : (
                          <span className="h-3 w-3 text-destructive shrink-0">✗</span>
                        )}
                        <span className="truncate">[{event.step}/{event.totalSteps}] {event.message}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Tabs: Posts / Settings */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              {(campaign.status === "Review" || campaign.status === "Active") && (
                <div className="flex flex-wrap items-center gap-2">
                  {reviewCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const pendingIds = posts
                          .filter((p) => p.status === "Pending")
                          .map((p) => p.id);
                        const res = await fetch("/api/posts/bulk", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            postIds: pendingIds,
                            status: "Approved",
                            approvedBy: pageSession?.user?.name || pageSession?.user?.email || "",
                          }),
                        });
                        if (res.ok) {
                          queryClient.invalidateQueries({ queryKey: ["campaign"] });
                          toast.success(`${pendingIds.length} posts approved`);
                        } else {
                          toast.error("Failed to approve posts");
                        }
                      }}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Approve All Remaining ({reviewCount})
                    </Button>
                  )}
                  {scheduleCount > 0 && (
                    <Button
                      size="sm"
                      disabled={isScheduling}
                      onClick={async () => {
                        // Build query string with optional post ID filter
                        const qs = new URLSearchParams({ preview: "true" });
                        if (schedulePostIds) qs.set("postIds", schedulePostIds.join(","));

                        // Preview the schedule first
                        setIsScheduling(true);
                        const res = await fetch(
                          `/api/campaigns/${campaignId}/schedule?${qs}`,
                          { method: "POST" }
                        );
                        if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          toast.error(`Schedule preview failed: ${errData.error || res.statusText}`);
                          setIsScheduling(false);
                          return;
                        }
                        const data = await res.json();
                        const summary = data.weekSummary
                          ?.map((w: { week: number; platforms: Record<string, number> }) =>
                            `Week ${w.week + 1}: ${Object.entries(w.platforms).map(([p, n]) => `${p}×${n}`).join(", ")}`
                          )
                          .join("\n");

                        const filterNote = hasActiveFilter ? " (filtered)" : "";
                        const confirmed = window.confirm(
                          `Schedule ${scheduleCount} posts${filterNote} over ${campaign.durationDays} days (${campaign.distributionBias})?\n\n${summary}\n\nThis will assign dates and push posts to Zernio for publishing.`
                        );
                        if (!confirmed) { setIsScheduling(false); return; }

                        // Apply the schedule with same filter
                        const applyQs = new URLSearchParams();
                        if (schedulePostIds) applyQs.set("postIds", schedulePostIds.join(","));
                        const applyRes = await fetch(
                          `/api/campaigns/${campaignId}/schedule${applyQs.toString() ? `?${applyQs}` : ""}`,
                          { method: "POST" }
                        );
                        if (applyRes.ok) {
                          const result = await applyRes.json();
                          queryClient.invalidateQueries({ queryKey: ["campaign"] });
                          if (result.failedPosts > 0) {
                            const failDetails = result.results
                              ?.filter((r: { success: boolean }) => !r.success)
                              .map((r: { platform: string; error: string }) => `${r.platform}: ${r.error}`)
                              .join("\n");
                            toast.warning(
                              `${result.scheduledPosts} scheduled, ${result.failedPosts} failed`,
                              { description: failDetails, duration: 10000 }
                            );
                          } else {
                            const dates = result.results
                              ?.filter((r: { success: boolean }) => r.success)
                              .map((r: { platform: string; scheduledDate: string }) => {
                                const d = new Date(r.scheduledDate);
                                return `${r.platform}: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                              })
                              .join(", ");
                            toast.success(
                              `${result.scheduledPosts} posts scheduled on Zernio`,
                              { description: dates, duration: 8000 }
                            );
                          }
                        } else {
                          const errData = await applyRes.json().catch(() => ({}));
                          toast.error(`Failed to schedule: ${errData.error || applyRes.statusText}`, { duration: 10000 });
                        }
                        setIsScheduling(false);
                      }}
                    >
                      {isScheduling ? (
                        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Scheduling on Zernio...</>
                      ) : (
                        <><Calendar className="mr-1.5 h-3.5 w-3.5" /> Schedule {scheduleCount}{hasActiveFilter ? " Filtered" : ""} Approved Posts</>
                      )}
                    </Button>
                  )}
                  {queuedCount > 0 && (
                    <PublishButton campaignId={campaignId} queuedCount={queuedCount} />
                  )}
                </div>
              )}

              {/* Campaign timeline heatmap — for campaigns with scheduled posts */}
              {posts.some((p) => p.scheduledDate && ["Queued", "Scheduled", "Published"].includes(p.status)) && campaign && (
                <CampaignTimeline
                  posts={posts}
                  campaignStartDate={campaign.startDate ? new Date(campaign.startDate + "T00:00:00") : new Date()}
                  durationDays={campaign.durationDays}
                  campaignId={campaignId}
                  onSync={syncWithZernio}
                  isSyncing={isSyncing}
                />
              )}

              {/* Status summary bar — scheduled/published/queued posts (not shown inline) */}
              {outOfViewCount > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5 text-xs">
                  {publishedCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {publishedCount} published
                    </span>
                  )}
                  {scheduledCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-500" />
                      {scheduledCount} scheduled
                    </span>
                  )}
                  {queuedCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {queuedCount} queued
                    </span>
                  )}
                  <a
                    href={`/dashboard/calendar?campaign=${campaignId}`}
                    className="ml-auto text-primary hover:underline text-xs"
                  >
                    View on calendar →
                  </a>
                </div>
              )}

              {/* "Running Low" / "Generate More" alert */}
              {campaign && (campaign.status === "Review" || campaign.status === "Active") && (() => {
                const cadence = campaign.platformCadence;
                if (!cadence) return null;
                const startDate = campaign.startDate ? new Date(campaign.startDate + "T00:00:00") : new Date();
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + (campaign.durationDays || 90));
                const now = new Date();
                const remainingMs = endDate.getTime() - now.getTime();
                if (remainingMs <= 0) return null;
                const remainingWeeks = Math.max(1, remainingMs / (7 * 86400000));
                const totalSlotsRemaining = Object.values(cadence).reduce(
                  (sum, entry) => sum + (entry.postsPerWeek * remainingWeeks), 0
                );
                const approvedAvailable = approvedCount;
                const isUrgent = approvedAvailable === 0 && totalSlotsRemaining > 0;
                const isLow = approvedAvailable < totalSlotsRemaining * 0.3;
                if (!isUrgent && !isLow) return null;
                return (
                  <div className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3",
                    isUrgent
                      ? "border-destructive/50 bg-destructive/5 text-destructive"
                      : "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                  )}>
                    <div className="text-xs">
                      {isUrgent ? (
                        <><strong>Queue empty</strong> — generate posts to keep your campaign active</>
                      ) : (
                        <><strong>Running low</strong> — {approvedAvailable} approved, ~{Math.round(totalSlotsRemaining)} slots remaining</>
                      )}
                    </div>
                    <Button
                      variant={isUrgent ? "destructive" : "outline"}
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        setShowGenOptions(true);
                        setActiveTab("posts");
                      }}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Generate More
                    </Button>
                  </div>
                );
              })()}

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

              {/* Status filter pills */}
              {(() => {
                const statusCounts: Record<string, number> = {};
                for (const p of actionablePosts) {
                  statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
                }
                const statuses = Object.keys(statusCounts).sort();
                if (statuses.length <= 1) return null;
                const STATUS_PILL_COLORS: Record<string, string> = {
                  Pending: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
                  Approved: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
                  Modified: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
                  Scheduled: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400",
                  Failed: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
                };
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
                    {statuses.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          statusFilter === s
                            ? STATUS_PILL_COLORS[s] || "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {s} ({statusCounts[s]})
                      </button>
                    ))}
                    {statusFilter && (
                      <button
                        onClick={() => setStatusFilter(null)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Posts grouped by date */}
              {filteredPosts.length > 0 ? (
              <div className="space-y-1">
                {sortedDateKeys.map((dateKey) => {
                  const datePosts = postsByDate[dateKey];
                  if (!datePosts || datePosts.length === 0) return null;
                  return (
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
                      {datePosts.map((post) => (
                        <CampaignPostRow
                          key={post.id}
                          post={post}
                          campaignStatus={campaign.status}
                          onClick={() => setSelectedPost(post)}
                          onApprove={() => quickApprove(post.id)}
                          onDismiss={() => quickDismiss(post.id)}
                          onUnapprove={() => quickUnapprove(post.id)}
                          onRetry={() => quickRetry(post.id)}
                          onDelete={() => quickDelete(post.id)}
                          onUnschedule={() => quickUnschedule(post.id)}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
              ) : posts.length > 0 ? (
                <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  All posts have been scheduled or published. <a href={`/dashboard/calendar?campaign=${campaignId}`} className="text-primary hover:underline">View on calendar</a>
                </div>
              ) : null}

              {/* Dismissed posts — collapsed section */}
              {dismissedCount > 0 && (
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground py-2 select-none">
                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    {dismissedCount} dismissed {dismissedCount === 1 ? "post" : "posts"}
                  </summary>
                  <div className="divide-y divide-border border rounded-lg mt-1 opacity-60">
                    {dismissedPosts.map((post) => (
                      <CampaignPostRow
                        key={post.id}
                        post={post}
                        campaignStatus={campaign.status}
                        onClick={() => setSelectedPost(post)}
                        onApprove={() => quickApprove(post.id)}
                        onDismiss={() => quickDismiss(post.id)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Settings Tab ──────────────────────────────────────────── */}
        <TabsContent value="settings">
          {/* Settings editable if no posts have been scheduled yet */}
          {!posts.some((p) => ["Queued", "Scheduled", "Published"].includes(p.status)) ? (
            <CampaignSettingsEditable
              campaign={campaign}
              campaignId={campaignId}
              onUnsavedChanges={setSettingsUnsaved}
            />
          ) : (
            <CampaignSettingsReadOnly campaign={campaign} />
          )}

          {/* Reset to Draft — for Review/Failed/Generating/Scraping/Active campaigns */}
          {["Review", "Failed", "Generating", "Scraping", "Active"].includes(campaign.status) && (
            <ResetCampaignSection
              campaignId={campaignId}
              campaignName={campaign.name}
              postCount={posts.length}
              hasScheduledPosts={posts.some((p) => ["Scheduled", "Queued"].includes(p.status))}
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

      {/* Progress log moved above tabs — see generation options card */}

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

function PublishButton({ campaignId, queuedCount }: { campaignId: string; queuedCount: number }) {
  const [isPublishing, setIsPublishing] = useState(false);
  const queryClient = useQueryClient();

  return (
    <Button
      size="sm"
      variant="default"
      className="bg-emerald-600 hover:bg-emerald-700"
      disabled={isPublishing}
      onClick={async () => {
        const confirmed = window.confirm(
          `Push ${queuedCount} scheduled posts to Zernio?\n\n` +
          `These posts have been spread across the full campaign duration using the tapering algorithm. ` +
          `Each platform respects its own cadence (e.g., LinkedIn on weekdays only, Instagram max 1/day).\n\n` +
          `Once pushed, posts will go live at their assigned dates and times. ` +
          `You can view them on the calendar and in the Zernio dashboard.\n\n` +
          `Proceed?`
        );
        if (!confirmed) return;

        setIsPublishing(true);
        try {
          const res = await fetch(
            `/api/campaigns/${campaignId}/publish`,
            { method: "POST" }
          );
          const data = await res.json();
          queryClient.invalidateQueries({ queryKey: ["campaign"] });
          if (!res.ok) {
            toast.error(data.error || "Failed to publish to Zernio");
          } else if (data.failed > 0) {
            const errors = data.results
              ?.filter((r: { success: boolean }) => !r.success)
              .map((r: { platform: string; error: string }) => `${r.platform}: ${r.error}`)
              .join("\n");
            toast.error(`${data.published} published, ${data.failed} failed:\n${errors}`, { duration: 10000 });
          } else {
            toast.success(`${data.published} posts pushed to Zernio!`);
          }
        } finally {
          setIsPublishing(false);
        }
      }}
    >
      {isPublishing ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Publishing...
        </>
      ) : (
        <>
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Push {queuedCount} to Zernio
        </>
      )}
    </Button>
  );
}

function CampaignPostRow({
  post,
  campaignStatus,
  onClick,
  onApprove,
  onDismiss,
  onUnapprove,
  onRetry,
  onDelete,
  onUnschedule,
}: {
  post: Post;
  campaignStatus: CampaignStatus;
  onClick: () => void;
  onApprove?: () => void;
  onDismiss?: () => void;
  onUnapprove?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  onUnschedule?: () => void;
}) {
  const statusConfig = POST_STATUS_CONFIG[post.status] || { variant: "outline" as const };
  const platformLower = toPlatformId(post.platform);

  // Count total images (hero + media URLs)
  const mediaUrlCount = post.mediaUrls ? post.mediaUrls.split("\n").filter((u) => u.trim()).length : 0;
  const totalImages = (post.imageUrl ? 1 : 0) + mediaUrlCount;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="w-full text-left hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Image thumbnail — clicking opens post detail (same as clicking anywhere on the row) */}
        {post.imageUrl ? (
          <div
            className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-muted relative group"
          >
            <img
              src={post.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {/* Multi-image count badge */}
            {totalImages > 1 && (
              <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] font-medium px-1 py-0.5 rounded flex items-center gap-0.5">
                <Layers className="h-2.5 w-2.5" />
                {totalImages}
              </span>
            )}
          </div>
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-muted flex items-center justify-center">
            <PlatformIcon platform={platformLower} size="md" showColor />
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
            <button
              onClick={onApprove}
              className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center px-2.5 py-1 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Approved post actions — step back to Pending for re-review */}
        {post.status === "Approved" && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onUnapprove}
              className="inline-flex items-center px-2.5 py-1 text-xs text-muted-foreground/50 hover:text-amber-600 transition-colors"
              title="Return to Pending for review"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Unapprove
            </button>
          </div>
        )}

        {/* Scheduled post actions — unschedule (cancel on Zernio and revert to Approved) */}
        {post.status === "Scheduled" && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onUnschedule}
              className="inline-flex items-center px-2.5 py-1 text-xs text-muted-foreground/50 hover:text-amber-600 transition-colors"
              title="Cancel schedule and revert to Approved"
            >
              <CalendarX2 className="mr-1 h-3 w-3" />
              Unschedule
            </button>
          </div>
        )}

        {/* Failed post actions */}
        {post.status === "Failed" && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onRetry}
              className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Retry
            </button>
            <button
              onClick={onDelete}
              className="inline-flex items-center px-2.5 py-1 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Debounced wheel handler — one trackpad swipe = one image change */
let _wheelCooldown = false;
function wheelNav(delta: number, onPrev: () => void, onNext: () => void) {
  if (_wheelCooldown) return;
  if (delta > 0) onNext(); else onPrev();
  _wheelCooldown = true;
  setTimeout(() => { _wheelCooldown = false; }, 300);
}

/** Keyboard handler for lightbox — uses window listener to bypass Radix focus trap */
function LightboxKeyHandler({ imageCount, onPrev, onNext, onClose }: {
  imageCount: number; onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (imageCount <= 1) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onPrev(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return null;
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
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [showAddImage, setShowAddImage] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const queryClient = useQueryClient();

  // Multi-image state with captions
  const buildMediaItems = (p: Post): MediaItem[] => parseMediaItems({
    "Image URL": p.imageUrl,
    "Media URLs": p.mediaUrls,
    "Media Captions": p.mediaCaptions,
  });
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(buildMediaItems(post));
  // Derived URL array for backward-compatible consumers
  const mediaImages = mediaItems.map((i) => i.url);

  // Track slide state locally (so UI updates immediately before query refetch)
  const [slidesLocalState, setSlidesLocalState] = useState<"applied" | "reset" | null>(null);

  // Reset state when navigating between posts
  const [prevPostId, setPrevPostId] = useState(post.id);
  if (prevPostId !== post.id) {
    setPrevPostId(post.id);
    setShowAddImage(false);
    setImageUrlInput("");
    setMediaItems(buildMediaItems(post));
    setIsDragging(false);
    setSlidesLocalState(null);
  }

  const platformLower = toPlatformId(post.platform);
  const isPublished = post.status === "Published";
  const statusConfig = POST_STATUS_CONFIG[post.status] || { variant: "outline" as const };
  const charCount = post.content?.length || 0;
  const platformCharLimits: Record<string, number> = {
    instagram: 2200, threads: 500, bluesky: 300, twitter: 280,
    linkedin: 3000, facebook: 63206, pinterest: 500, tiktok: 4000,
  };
  const charLimit = platformCharLimits[platformLower] || 0;

  // The URL to the source article — prefer shortUrl, fall back to linkUrl
  const articleUrl = post.shortUrl || post.linkUrl;

  // Save all images + captions to Airtable
  const saveImagesMutation = useMutation({
    mutationFn: async (items: MediaItem[]) => {
      const serialized = serializeMediaItems(items);
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: serialized["Image URL"],
          mediaUrls: serialized["Media URLs"],
          mediaCaptions: serialized["Media Captions"],
        }),
      });
      if (!res.ok) throw new Error("Failed to save images");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
    },
    onError: () => toast.error("Failed to save images"),
  });

  // Optimize for platform — AI outpainting
  const platformTargets: Record<string, { w: number; h: number; label: string }> = {
    instagram: { w: 1080, h: 1350, label: "4:5 portrait" },
    pinterest: { w: 1000, h: 1500, label: "2:3 tall pin" },
    threads: { w: 1440, h: 1920, label: "3:4" },
    tiktok: { w: 1080, h: 1920, label: "9:16 vertical" },
    bluesky: { w: 1000, h: 1000, label: "1:1 square" },
    facebook: { w: 1080, h: 1350, label: "4:5 portrait" },
    linkedin: { w: 1200, h: 1200, label: "1:1 square" },
  };
  const optimizeTarget = platformTargets[platformLower];
  const optimizeTooltip = optimizeTarget
    ? `AI outpaint to ${optimizeTarget.label} (${optimizeTarget.w}×${optimizeTarget.h})`
    : "Optimize image for this platform";

  const [optimizePreview, setOptimizePreview] = useState<{
    optimizedUrl: string;
    originalUrl: string;
    dimensions: string;
    duration: number;
  } | null>(null);

  const optimizeMutation = useMutation({
    mutationFn: async (imageIndex: number) => {
      const res = await fetch(`/api/posts/${post.id}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to optimize");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info(data.reason || "Image already optimal");
      } else {
        // Show preview dialog instead of auto-applying
        setOptimizePreview(data);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const acceptOptimization = () => {
    if (!optimizePreview) return;
    // Image is already saved by the endpoint — just refresh the view
    const next = [...mediaItems];
    next[0] = { ...next[0], url: optimizePreview.optimizedUrl };
    setMediaItems(next);
    queryClient.invalidateQueries({ queryKey: ["campaign"] });
    toast.success(`Optimized for ${post.platform} (${optimizePreview.dimensions})`);
    setOptimizePreview(null);
  };

  const rejectOptimization = () => {
    // Revert: restore the original image URL in Airtable
    if (optimizePreview?.originalUrl) {
      const next = [...mediaItems];
      next[0] = { ...next[0], url: optimizePreview.originalUrl };
      setMediaItems(next);
      saveImagesMutation.mutate(next);
    }
    setOptimizePreview(null);
  };

  // Carousel slide generation (Instagram framed slides with captions)
  // Per-slide options: frameColor (eyedropper-picked), removeColor (chroma key)
  type SlideOpt = { frameColor?: { r: number; g: number; b: number }; removeColor?: { r: number; g: number; b: number }; removeTolerance?: number };
  const [carouselPreviews, setCarouselPreviews] = useState<Array<{ dataUri: string; caption: string; frameColor: { r: number; g: number; b: number } }> | null>(null);
  const [perSlideOptions, setPerSlideOptions] = useState<(SlideOpt | undefined)[]>([]);
  const [eyedropperMode, setEyedropperMode] = useState<{ slideIndex: number; mode: "frame" | "removeBg" } | null>(null);
  const slidePlatforms = ["instagram", "threads", "linkedin", "bluesky"];
  const slidesApplied = slidesLocalState === "applied" ? true
    : slidesLocalState === "reset" ? false
    : !!post.originalMedia;
  const canGenerateSlides = slidePlatforms.includes(platformLower) && mediaImages.length >= 2
    && !slidesApplied
    && (platformLower === "bluesky" || mediaItems.some((m) => m.caption));

  // Cover slide designer state
  const [showCoverSlideDesigner, setShowCoverSlideDesigner] = useState(false);
  const [coverSlideKey, setCoverSlideKey] = useState(0);
  const canAddCoverSlide = slidePlatforms.includes(platformLower) && mediaImages.length >= 1 && post.status !== "Published";
  const savedCoverSlideData: CoverSlideData | null = (() => {
    try {
      if (!post.coverSlideData) return null;
      const data: CoverSlideData = JSON.parse(post.coverSlideData);
      // Only treat as "saved" if the applied cover URL is actually the first media item.
      // Prevents stale data from a previous session that was reset/undone.
      if (data.appliedUrl && mediaItems[0]?.url !== data.appliedUrl) return null;
      return data;
    } catch { return null; }
  })();

  // Get pixel color from a click on the rendered preview image
  const getPixelColor = (e: React.MouseEvent<HTMLImageElement>): { r: number; g: number; b: number } | null => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
    const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2] };
  };

  const handleSlideClick = (e: React.MouseEvent<HTMLImageElement>, slideIndex: number) => {
    if (!eyedropperMode || eyedropperMode.slideIndex !== slideIndex) return;
    e.stopPropagation();
    const color = getPixelColor(e);
    if (!color) return;

    const newOptions = [...perSlideOptions];
    const existing = newOptions[slideIndex] || {};

    if (eyedropperMode.mode === "frame") {
      newOptions[slideIndex] = { ...existing, frameColor: color };
    } else {
      newOptions[slideIndex] = { ...existing, removeColor: color, removeTolerance: 50 };
    }

    setPerSlideOptions(newOptions);
    setEyedropperMode(null);
    // Re-render with updated options
    carouselPreviewMutation.mutate(newOptions);
  };

  const carouselPreviewMutation = useMutation({
    mutationFn: async (slideOpts?: (SlideOpt | undefined)[]) => {
      const res = await fetch(`/api/posts/${post.id}/carousel-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false, slideOptions: slideOpts }),
      });
      if (!res.ok) throw new Error("Failed to generate carousel preview");
      return res.json();
    },
    onSuccess: (data) => {
      const previews = data.previews.map((p: { dataUri: string; caption: string; frameColor: { r: number; g: number; b: number } }) => ({
        dataUri: p.dataUri,
        caption: p.caption,
        frameColor: p.frameColor,
      }));
      setCarouselPreviews(previews);
    },
    onError: (err) => toast.error(`Carousel preview failed: ${err.message}`),
  });

  const carouselApplyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/carousel-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, slideOptions: perSlideOptions }),
      });
      if (!res.ok) throw new Error("Failed to apply carousel slides");
      return res.json();
    },
    onSuccess: (data) => {
      const newItems: MediaItem[] = data.mediaItems;
      setMediaItems(newItems);
      setCarouselPreviews(null);
      setPerSlideOptions([]);
      setEyedropperMode(null);
      setSlidesLocalState("applied");
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success(`${newItems.length} carousel slides applied`);
    },
    onError: (err) => toast.error(`Apply failed: ${err.message}`),
  });

  const carouselResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/carousel-preview`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to reset slides");
      return res.json();
    },
    onSuccess: (data) => {
      const restoredItems: MediaItem[] = data.mediaItems;
      setMediaItems(restoredItems);
      setCarouselPreviews(null);
      setPerSlideOptions([]);
      setEyedropperMode(null);
      setSlidesLocalState("reset");
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Original images restored");
    },
    onError: (err) => toast.error(`Reset failed: ${err.message}`),
  });

  const addImageUrl = (url: string) => {
    const next = [...mediaItems, { url, caption: "" }];
    setMediaItems(next);
    setImageUrlInput("");
    setShowAddImage(false);
    saveImagesMutation.mutate(next);
    toast.success(mediaItems.length === 0 ? "Image added" : `${next.length} images — carousel ready`);
  };

  const removeImage = (index: number) => {
    const next = mediaItems.filter((_, i) => i !== index);
    setMediaItems(next);
    saveImagesMutation.mutate(next);
    toast.success("Image removed");
  };

  const updateCaption = (index: number, caption: string) => {
    const next = [...mediaItems];
    next[index] = { ...next[index], caption };
    setMediaItems(next);
  };

  const saveCaption = (index: number) => {
    saveImagesMutation.mutate(mediaItems);
  };

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const validation = validateImage(file);
      if (!validation.valid) throw new Error(validation.error);
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch(`/api/posts/${post.id}/image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload image");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.imageUrl) {
        const next = [...mediaItems, { url: data.imageUrl, caption: "" }];
        setMediaItems(next);
        setShowAddImage(false);
        saveImagesMutation.mutate(next);
        toast.success(next.length > 1 ? `${next.length} images — carousel ready` : "Image uploaded");
      }
    },
    onError: () => toast.error("Failed to upload image"),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) {
      // Upload first file (could extend to batch later)
      uploadImageMutation.mutate(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handlePasteUrl = () => {
    const url = imageUrlInput.trim();
    if (url) addImageUrl(url);
  };

  // Approve/Dismiss mutations
  const { data: session } = useSession();

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
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Post approved");
      if (nextPost) onNavigate(nextPost);
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
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Post dismissed");
      if (nextPost) onNavigate(nextPost);
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
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success(scheduledFor
        ? `Scheduled ${post.platform} for ${format(new Date(scheduledFor), "MMM d, h:mm a")}`
        : `Published to ${post.platform} — scheduled in ~2 min`);
      setShowSchedulePicker(false);
      setScheduleDateTime("");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Schedule / Publish Now
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  // Regenerate
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [regenGuidance, setRegenGuidance] = useState("");

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
      await queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Post regenerated");
      setRegenDialogOpen(false);
      setRegenGuidance("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Content editing
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content || "");

  // Reset content edit state on post navigation
  if (prevPostId !== post.id && isEditingContent) {
    setIsEditingContent(false);
    setEditedContent(post.content || "");
  }

  const saveContentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save content");
    },
    onSuccess: () => {
      setIsEditingContent(false);
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Content saved");
    },
    onError: () => toast.error("Failed to save content"),
  });

  // Navigation
  const currentIndex = posts.findIndex((p) => p.id === post.id);
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  return (
    <div className="flex flex-col max-h-[90vh] min-h-[80vh] relative">
      {/* Sticky header — platform + navigation combined */}
      <div className="border-b border-border shrink-0 pr-10">
        <div className="flex items-center gap-2 px-4 py-2.5">
          {/* Prev */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={!prevPost}
            onClick={() => prevPost && onNavigate(prevPost)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>

          {/* Platform + status — center */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <PlatformBadge platform={platformLower} className="h-7 w-7 shrink-0" />
            <span className="font-medium text-sm truncate">{post.platform}</span>
            <Badge
              variant={statusConfig.variant}
              className={cn("text-[10px] px-1.5 py-0 shrink-0", statusConfig.className)}
            >
              {post.status}
            </Badge>
            {post.approvedBy && (
              <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                by {post.approvedBy}
              </span>
            )}
            {post.scheduledDate && (
              <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                {format(parseISO(post.scheduledDate), "MMM d, h:mm a")}
              </span>
            )}
          </div>

          {/* Counter + Next */}
          <span className="text-[11px] text-muted-foreground shrink-0">
            {currentIndex + 1}/{posts.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={!nextPost}
            onClick={() => nextPost && onNavigate(nextPost)}
          >
            <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
          </Button>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Image gallery — multi-image with add/remove/reorder for carousels */}
        <div className="px-6 pb-3 space-y-2">
          {/* Images — always show as strip when multiple */}
          {mediaImages.length > 0 && (
            <>
              {mediaImages.length === 1 ? (
                /* Single image — full width with click to lightbox */
                <div
                  className="rounded-lg overflow-hidden bg-muted relative group cursor-pointer"
                  onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
                >
                  <img src={mediaImages[0]} alt="" className="w-full max-h-64 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                  </div>
                  {/* Remove on hover */}
                  {!isPublished && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); removeImage(0); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  )}
                </div>
              ) : (
                /* Multiple images — horizontal strip */
                <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
                  {mediaImages.map((imgUrl, idx) => (
                    <div key={idx} className="shrink-0 snap-start flex flex-col gap-1">
                    <div
                      className={cn("relative group cursor-pointer rounded-lg overflow-hidden bg-muted", slidesApplied ? "w-40" : "w-40 h-40")}
                      style={slidesApplied ? { aspectRatio: platformLower === "linkedin" || platformLower === "bluesky" ? "1/1" : "4/5" } : undefined}
                      onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    >
                      <img src={imgUrl} alt="" className={cn(slidesApplied ? "w-full h-full object-contain" : "w-40 h-40 object-cover")} />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                      {/* Reorder buttons */}
                      {!isPublished && (
                      <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = [...mediaItems];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setMediaItems(next);
                              saveImagesMutation.mutate(next);
                            }}
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </Button>
                        )}
                        {idx < mediaImages.length - 1 && (
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = [...mediaItems];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              setMediaItems(next);
                              saveImagesMutation.mutate(next);
                            }}
                          >
                            <ArrowLeft className="h-3 w-3 rotate-180" />
                          </Button>
                        )}
                      </div>
                      )}
                      {/* Remove button */}
                      {!isPublished && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      )}
                      {/* Slide number */}
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        {idx + 1}/{mediaImages.length}
                      </span>
                    </div>
                    {/* Caption input — hidden for Bluesky and when slides are applied (captions baked in) */}
                    {platformLower !== "bluesky" && !slidesApplied && (
                    <input
                      type="text"
                      placeholder="Caption..."
                      maxLength={120}
                      value={mediaItems[idx]?.caption || ""}
                      onChange={(e) => updateCaption(idx, e.target.value)}
                      onBlur={() => saveCaption(idx)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCaption(idx); }}
                      readOnly={isPublished}
                      className={cn("w-40 text-[11px] px-1.5 py-1 border border-border rounded bg-background text-foreground truncate", isPublished && "opacity-60 cursor-default")}
                    />
                    )}
                  </div>
                ))}
                </div>
              )}

              {/* Carousel info */}
              {mediaImages.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {mediaImages.length} images — will post as carousel on supported platforms
                </p>
              )}
            </>
          )}

          {/* Always-visible action bar — hidden for published posts */}
          {!isPublished && (
          <div className="flex flex-wrap items-center gap-1.5">
            {!slidesApplied && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => setShowAddImage(!showAddImage)}
              title={mediaImages.length === 0 ? "Add image" : "Add images for carousel"}
            >
              <Plus className="h-3 w-3 mr-1" />
              {mediaImages.length >= 1 ? "Add for Carousel" : "Add"}
            </Button>
            )}
            {!slidesApplied && mediaImages.length === 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => {
                  removeImage(0);
                  setShowAddImage(true);
                }}
              >
                <ArrowLeftRight className="h-3 w-3 mr-1" />
                Replace
              </Button>
            )}
            {!slidesApplied && mediaImages.length >= 1 && optimizeTarget && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => optimizeMutation.mutate(0)}
                disabled={optimizeMutation.isPending}
                title={optimizeTooltip}
              >
                {optimizeMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Optimizing...</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" /> {optimizeTarget.label}</>
                )}
              </Button>
            )}
            {canAddCoverSlide && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => { setCoverSlideKey((k) => k + 1); setShowCoverSlideDesigner(true); }}
                title="Design a cover slide for this carousel"
              >
                <LayoutTemplate className="h-3 w-3 mr-1" /> Cover
              </Button>
            )}
            {canGenerateSlides && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => { setPerSlideOptions([]); carouselPreviewMutation.mutate(undefined); }}
                disabled={carouselPreviewMutation.isPending}
                title={`Generate framed carousel slides${platformLower === "bluesky" ? "" : " with captions"} (${platformLower === "linkedin" || platformLower === "bluesky" ? "1:1" : "4:5"})`}
              >
                {carouselPreviewMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</>
                ) : (
                  <><Layers className="h-3 w-3 mr-1" /> Slides</>
                )}
              </Button>
            )}
            {slidesApplied && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => carouselResetMutation.mutate()}
                disabled={carouselResetMutation.isPending}
                title="Reset to original images (undo slide generation)"
              >
                {carouselResetMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Resetting...</>
                ) : (
                  <><RotateCcw className="h-3 w-3 mr-1" /> Reset Slides</>
                )}
              </Button>
            )}
          </div>
          )}

          {/* Add image panel — drag-drop + paste URL */}
          {showAddImage && (
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-4 space-y-3 transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setIsDragging(false)}
            >
              <div className="text-center py-3">
                {uploadImageMutation.isPending ? (
                  <>
                    <Loader2 className="h-6 w-6 mx-auto text-primary mb-1 animate-spin" />
                    <p className="text-sm text-muted-foreground">Compressing & uploading...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-sm text-muted-foreground">Drag & drop an image</p>
                    <label className="inline-block mt-1">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadImageMutation.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImageMutation.mutate(file);
                        }}
                      />
                      <span className="text-xs text-primary hover:underline cursor-pointer">
                        Browse files
                      </span>
                    </label>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="Paste image URL..."
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasteUrl()}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handlePasteUrl}
                  disabled={!imageUrlInput.trim() || saveImagesMutation.isPending}
                >
                  Add
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setShowAddImage(false)}
              >
                Done
              </Button>
            </div>
          )}
        </div>

        {/* Image lightbox overlay with navigation */}
        {/* Lightbox placeholder — actual lightbox rendered below, outside scroll area */}

        {/* Full content — editable */}
        <div className="px-6 pb-3">
          {isEditingContent ? (
            <div className="space-y-2">
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={8}
                className="text-sm"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {editedContent.length} characters
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setEditedContent(post.content || "");
                      setIsEditingContent(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => saveContentMutation.mutate(editedContent)}
                    disabled={saveContentMutation.isPending || editedContent === post.content}
                  >
                    {saveContentMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn("group relative rounded-md p-1 -m-1", !isPublished && "cursor-pointer hover:bg-muted/30 transition-colors")}
              onClick={() => {
                if (isPublished) return;
                setEditedContent(post.content || "");
                setIsEditingContent(true);
              }}
            >
              <p className="text-sm whitespace-pre-wrap">
                {post.content || "(No content)"}
              </p>
              <div className="flex items-center justify-between mt-2">
                <p className={cn("text-xs", charLimit && charCount > charLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {charCount}{charLimit ? ` / ${charLimit.toLocaleString()}` : ""} chars
                </p>
                {!isPublished && (
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <Pencil className="h-3 w-3" />
                  Click to edit
                </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Metadata row: article link + variant — consolidated */}
        <div className="px-6 pb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {articleUrl && (
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Link2 className="h-3 w-3" />
              {post.shortUrl || "Source"}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {post.contentVariant && (
            <span>Variant {post.contentVariant}</span>
          )}
          {post.notes && (
            <span>{post.notes}</span>
          )}
        </div>
      </div>

      {/* Image lightbox — portaled to body to escape dialog transform containing block */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-none !w-screen !h-screen !p-0 !border-none !bg-black/92 !rounded-none flex flex-col items-center justify-center gap-0 !translate-x-0 !translate-y-0 !top-0 !left-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onWheel={(e: React.WheelEvent) => {
            if (mediaImages.length <= 1) return;
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(delta) < 20) return;
            wheelNav(
              delta,
              () => setLightboxIndex((i) => Math.max(i - 1, 0)),
              () => setLightboxIndex((i) => Math.min(i + 1, mediaImages.length - 1))
            );
          }}
          onTouchStart={(e: React.TouchEvent) => {
            (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX);
          }}
          onTouchEnd={(e: React.TouchEvent) => {
            const startX = Number((e.currentTarget as HTMLElement).dataset.touchX);
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) < 50 || mediaImages.length <= 1) return;
            if (diff > 0) {
              setLightboxIndex((i) => (i < mediaImages.length - 1 ? i + 1 : 0));
            } else {
              setLightboxIndex((i) => (i > 0 ? i - 1 : mediaImages.length - 1));
            }
          }}
        >
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <LightboxKeyHandler
            imageCount={mediaImages.length}
            onPrev={() => setLightboxIndex((i) => (i > 0 ? i - 1 : mediaImages.length - 1))}
            onNext={() => setLightboxIndex((i) => (i < mediaImages.length - 1 ? i + 1 : 0))}
            onClose={() => setLightboxOpen(false)}
          />

          {/* Close button — top right */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Image */}
          <img
            src={mediaImages[lightboxIndex]}
            alt={mediaItems[lightboxIndex]?.caption || `Image ${lightboxIndex + 1}`}
            className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            draggable={false}
          />

          {/* Bottom bar — caption, arrows, dots */}
          <div className="flex flex-col items-center gap-2 mt-4">
            {mediaItems[lightboxIndex]?.caption && !slidesApplied && (
              <p className="text-white/70 text-sm text-center max-w-md truncate">
                {mediaItems[lightboxIndex].caption}
              </p>
            )}
            {mediaImages.length > 1 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setLightboxIndex((i) => (i > 0 ? i - 1 : mediaImages.length - 1))}
                  className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2">
                  {mediaImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIndex(i)}
                      className={cn(
                        "rounded-full transition-all",
                        i === lightboxIndex
                          ? "w-2.5 h-2.5 bg-white"
                          : "w-2 h-2 bg-white/30 hover:bg-white/50"
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setLightboxIndex((i) => (i < mediaImages.length - 1 ? i + 1 : 0))}
                  className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5 rotate-180" />
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cover slide designer modal */}
      {showCoverSlideDesigner && (
        <CoverSlideDesigner
          key={coverSlideKey}
          postId={post.id}
          platform={platformLower}
          brandId={campaign?.brandIds?.[0]}
          brandHandle=""
          brandLogoUrl={null}
          savedData={savedCoverSlideData}
          onApply={(newMediaItems) => {
            setMediaItems(newMediaItems);
            setShowCoverSlideDesigner(false);
            queryClient.invalidateQueries({ queryKey: ["campaign"] });
          }}
          onRemove={(restoredItems) => {
            setMediaItems(restoredItems);
            setShowCoverSlideDesigner(false);
            queryClient.invalidateQueries({ queryKey: ["campaign"] });
          }}
          onClose={() => setShowCoverSlideDesigner(false)}
        />
      )}

      {/* Carousel slide preview modal */}
      {carouselPreviews && (
        <div className="absolute inset-0 z-[60] bg-zinc-900/95 flex flex-col rounded-lg border border-zinc-700/50 overflow-hidden">
          {/* Header — tools in toolbar, not on slides */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-zinc-700/50">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="h-4 w-4 text-white/70 shrink-0" />
              <span className="text-white font-medium text-sm truncate">{carouselPreviews.length} slides ({platformLower === "linkedin" || platformLower === "bluesky" ? "1:1" : "4:5"})</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Eyedropper tools — apply to whichever slide user clicks */}
              <button
                onClick={() => setEyedropperMode(
                  eyedropperMode?.mode === "frame" ? null : { slideIndex: -1, mode: "frame" }
                )}
                disabled={carouselPreviewMutation.isPending}
                className={cn(
                  "flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors",
                  eyedropperMode?.mode === "frame" ? "bg-amber-500/90" : "bg-zinc-700 hover:bg-zinc-600"
                )}
                title="Pick frame color from any slide"
              >
                <Pipette className="h-3 w-3" /> <span className="hidden sm:inline">Color</span>
              </button>
              <button
                onClick={() => setEyedropperMode(
                  eyedropperMode?.mode === "removeBg" ? null : { slideIndex: -1, mode: "removeBg" }
                )}
                disabled={carouselPreviewMutation.isPending}
                className={cn(
                  "flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors",
                  eyedropperMode?.mode === "removeBg" ? "bg-amber-500/90" : "bg-zinc-700 hover:bg-zinc-600"
                )}
                title="Click background color on any slide to remove it"
              >
                <Eraser className="h-3 w-3" /> <span className="hidden sm:inline">Remove BG</span>
              </button>
              {perSlideOptions.some(Boolean) && (
                <button
                  onClick={() => { setPerSlideOptions([]); carouselPreviewMutation.mutate([]); }}
                  disabled={carouselPreviewMutation.isPending}
                  className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors"
                  title="Reset all to auto-detected colors"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              <button
                className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
                onClick={() => { setCarouselPreviews(null); setEyedropperMode(null); setPerSlideOptions([]); }}
                disabled={carouselApplyMutation.isPending}
              >
                <X className="h-4 w-4" />
              </button>
              <Button
                size="sm"
                className="bg-white text-black hover:bg-white/90 text-xs h-7"
                onClick={() => carouselApplyMutation.mutate()}
                disabled={carouselApplyMutation.isPending || carouselPreviewMutation.isPending}
              >
                {carouselApplyMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Applying...</>
                ) : (
                  "Apply Slides"
                )}
              </Button>
            </div>
          </div>
          {eyedropperMode && (
            <div className="bg-amber-500/20 text-amber-400 text-xs text-center py-1 shrink-0">
              {eyedropperMode.mode === "frame" ? "Click any slide to pick a frame color" : "Click a background color on any slide to remove it"}
            </div>
          )}
          {/* Slides — constrained to correct aspect ratio */}
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 py-3 carousel-dark-scroll">
            <div className="flex gap-4 h-full items-center">
              {carouselPreviews.map((slide, idx) => {
                const ar = platformLower === "linkedin" || platformLower === "bluesky" ? "1/1" : "4/5";
                return (
                <div key={idx} className="shrink-0 flex flex-col items-center gap-1.5 h-full">
                  <div
                    className="relative rounded-lg overflow-hidden shadow-2xl border border-zinc-600/40 h-[calc(100%-24px)]"
                    style={{ aspectRatio: ar }}
                  >
                    <img
                      src={slide.dataUri}
                      alt={slide.caption || `Slide ${idx + 1}`}
                      crossOrigin="anonymous"
                      className={cn(
                        "h-full w-full object-contain",
                        carouselPreviewMutation.isPending && "opacity-50",
                        eyedropperMode && "cursor-crosshair"
                      )}
                      onClick={(e) => {
                        if (eyedropperMode) {
                          // Update the eyedropper to target this specific slide
                          setEyedropperMode({ slideIndex: idx, mode: eyedropperMode.mode });
                          handleSlideClick(e, idx);
                        }
                      }}
                    />
                    {/* Frame color swatch */}
                    {slide.frameColor && (
                      <div
                        className="absolute bottom-2 left-2 w-4 h-4 rounded-full border-2 border-white/50 shadow z-10"
                        style={{ backgroundColor: `rgb(${slide.frameColor.r},${slide.frameColor.g},${slide.frameColor.b})` }}
                        title={`Frame: rgb(${slide.frameColor.r}, ${slide.frameColor.g}, ${slide.frameColor.b})`}
                      />
                    )}
                  </div>
                  <span className="text-white/60 text-xs shrink-0">
                    {idx + 1}/{carouselPreviews.length}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer actions — pinned */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-2">
          {post.status === "Pending" && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending}
              >
                {dismissMutation.isPending ? "Dismissing..." : "Dismiss"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setRegenDialogOpen(true)}
                disabled={regenerateMutation.isPending}
                title="Regenerate"
              >
                {regenerateMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          {post.status === "Approved" && (
            <>
              {showSchedulePicker ? (
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                    className="text-xs border border-border rounded px-2 py-1 bg-background"
                    min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => publishNowMutation.mutate(new Date(scheduleDateTime).toISOString())}
                    disabled={publishNowMutation.isPending || !scheduleDateTime}
                  >
                    {publishNowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                    {publishNowMutation.isPending ? "" : "Schedule"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setShowSchedulePicker(false); setScheduleDateTime(""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => publishNowMutation.mutate(undefined)}
                    disabled={publishNowMutation.isPending}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {publishNowMutation.isPending ? "Publishing..." : "Publish Now"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setShowSchedulePicker(true)}
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    Schedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      fetch(`/api/posts/${post.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Pending" }),
                      }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["campaign"] });
                        toast.success("Post returned to Pending");
                      });
                    }}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Unapprove
                  </Button>
                </div>
              )}
            </>
          )}
          {post.status === "Scheduled" && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
              <Send className="mr-1 h-3 w-3" />
              Scheduled
            </Badge>
          )}
          {post.status === "Failed" && (
            <div className="flex items-center gap-1">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  fetch(`/api/posts/${post.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "Approved", clearZernioState: true }),
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["campaign"] });
                    toast.success("Post reset to Approved — ready to re-publish");
                  });
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm("Delete this failed post?")) {
                    fetch(`/api/posts/${post.id}`, { method: "DELETE" }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["campaign"] });
                      toast.success("Post deleted");
                      onClose();
                    });
                  }
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
          {post.status === "Dismissed" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                // Restore to Pending
                fetch(`/api/posts/${post.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "Pending" }),
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["campaign"] });
                  toast.success("Post restored to Pending");
                });
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setFlagDialogOpen(true)}
            title="Flag Issue"
          >
            <Flag className="h-3.5 w-3.5" />
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

      {/* Regenerate Dialog */}
      <Dialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Post</DialogTitle>
            <DialogDescription>
              Optionally describe what this post should focus on. Leave blank to generate a fresh take.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="e.g., Focus on the event itself, not a specific artist. Highlight the opening night details and CTA."
            value={regenGuidance}
            onChange={(e) => setRegenGuidance(e.target.value)}
            rows={3}
            disabled={regenerateMutation.isPending}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRegenDialogOpen(false); setRegenGuidance(""); }} disabled={regenerateMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => regenerateMutation.mutate(regenGuidance)}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Regenerating...</>
              ) : (
                <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Regenerate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Optimize Preview Dialog */}
      <Dialog open={!!optimizePreview} onOpenChange={(open) => !open && rejectOptimization()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Optimized for {post.platform}</DialogTitle>
            <DialogDescription>
              {optimizePreview?.dimensions} — generated in {optimizePreview?.duration}s. Accept, retry, or dismiss.
            </DialogDescription>
          </DialogHeader>
          {optimizePreview && (
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 text-center">Original</p>
                <img src={optimizePreview.originalUrl} alt="Original" className="w-full rounded border object-contain max-h-56 bg-muted" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 text-center">Optimized ({optimizePreview.dimensions})</p>
                <img src={optimizePreview.optimizedUrl} alt="Optimized" className="w-full rounded border object-contain max-h-56 bg-muted" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={rejectOptimization}>
              Dismiss
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOptimizePreview(null);
                optimizeMutation.mutate(0);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
            <Button onClick={acceptOptimization}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Editable settings for Draft campaigns — reuses creation form components */
function CampaignSettingsEditable({
  campaign,
  campaignId,
  onUnsavedChanges,
}: {
  campaign: Campaign;
  campaignId: string;
  onUnsavedChanges?: (hasChanges: boolean) => void;
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
  const [startDate, setStartDate] = useState(campaign.startDate || "");
  const [eventDate, setEventDate] = useState(campaign.eventDate || "");
  const [eventDetails, setEventDetails] = useState(campaign.eventDetails || "");
  const [additionalUrlsList, setAdditionalUrlsList] = useState<string[]>(
    campaign.additionalUrls ? campaign.additionalUrls.split("\n").filter(Boolean) : []
  );

  const isDateDriven = type === "Event" || type === "Open Call";

  const hasChanges =
    url !== campaign.url ||
    type !== campaign.type ||
    durationDays !== campaign.durationDays ||
    distributionBias !== (campaign.distributionBias || "Front-loaded") ||
    editorialDirection !== (campaign.editorialDirection || "") ||
    startDate !== (campaign.startDate || "") ||
    eventDate !== (campaign.eventDate || "") ||
    eventDetails !== (campaign.eventDetails || "") ||
    additionalUrlsList.filter(Boolean).join("\n") !== (campaign.additionalUrls || "");

  // Notify parent of unsaved changes
  useEffect(() => {
    onUnsavedChanges?.(hasChanges);
  }, [hasChanges, onUnsavedChanges]);

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
          startDate: startDate || undefined,
          eventDate: eventDate || undefined,
          eventDetails: eventDetails || undefined,
          additionalUrls: additionalUrlsList.filter(Boolean).join("\n") || undefined,
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

      {/* Additional URLs */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Additional Source URLs
          </Label>
          <p className="text-xs text-muted-foreground">
            Tip: For Artwork Archive exhibitions, use the embed URL format: <code className="bg-muted px-1 rounded">artworkarchive.com/profile/&#123;org&#125;/embed/exhibition/&#123;name&#125;</code>
          </p>
          {additionalUrlsList.map((addUrl, i) => (
            <div key={i} className="flex gap-2">
              <Input
                type="url"
                placeholder="https://additional-source.com/..."
                value={addUrl}
                onChange={(e) => {
                  const next = [...additionalUrlsList];
                  next[i] = e.target.value;
                  setAdditionalUrlsList(next);
                }}
                className="text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setAdditionalUrlsList(additionalUrlsList.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setAdditionalUrlsList([...additionalUrlsList, ""])}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add source URL
          </Button>
        </CardContent>
      </Card>

      {/* Event Details — only for date-driven types */}
      {isDateDriven && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Event Details
            </Label>
            <Textarea
              placeholder="Location, venue, time, tickets/RSVP link, dress code..."
              value={eventDetails}
              onChange={(e) => setEventDetails(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Supplement scraped content with details the audience needs to know.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Editorial Direction */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Editorial Direction
          </Label>
          <Textarea
            placeholder="e.g., Focus on the community aspect and upcoming deadline. Emphasize the free admission and family-friendly activities."
            value={editorialDirection}
            onChange={(e) => setEditorialDirection(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Optional — this guidance shapes the tone and focus of every generated post.
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              Tips for effective editorial direction
            </summary>
            <ul className="mt-2 ml-4 space-y-1 list-disc text-muted-foreground/80">
              <li><strong>Be specific about focus:</strong> &ldquo;Emphasize the free workshops and family-friendly activities&rdquo; rather than &ldquo;make it sound fun&rdquo;</li>
              <li><strong>Guide tone and angle:</strong> &ldquo;Lead with urgency — only 3 days left to RSVP&rdquo; or &ldquo;Keep it celebratory, this is a milestone event&rdquo;</li>
              <li><strong>Call out key details:</strong> &ldquo;Mention the new venue location&rdquo; or &ldquo;Highlight that tickets are selling fast&rdquo;</li>
              <li><strong>Let the AI handle attribution:</strong> The system automatically matches people and images from the scraped content — no need to instruct it to name specific individuals unless you want a particular focus</li>
            </ul>
          </details>
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
              const isEnabled = ENABLED_CAMPAIGN_TYPES.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (isEnabled) setType(t);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5 text-primary"
                      : isEnabled
                        ? "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        : "border-border/50 text-muted-foreground/50 opacity-60 cursor-not-allowed"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center leading-tight">{t}</span>
                </button>
              );
            })}
          </div>
          {type && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              {CAMPAIGN_TYPE_DESCRIPTIONS[type]}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campaign Start Date — when to begin posting */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Campaign Start (when to begin posting)
          </Label>
          <Input
            type="date"
            value={startDate}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">
            {startDate
              ? `Posts will be scheduled starting ${new Date(startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`
              : "Defaults to today if not set. Use a future date to avoid overlap with running campaigns."}
          </p>
          {isDateDriven && startDate && eventDate && new Date(startDate) >= new Date(eventDate) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Start date must be before the event date.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Duration & Distribution */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Date picker for date-driven types, duration presets for others */}
          {isDateDriven ? (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                {type === "Event" ? "Event Date" : "Submission Deadline"}
              </Label>
              <Input
                type="date"
                value={eventDate}
                min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                onChange={(e) => {
                  setEventDate(e.target.value);
                  if (e.target.value) {
                    const days = Math.max(1, Math.ceil((new Date(e.target.value).getTime() - Date.now()) / 86400000));
                    setDurationDays(days);
                    setDistributionBias("Back-loaded");
                  }
                }}
                className="w-48"
              />
              {eventDate && durationDays > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {durationDays} day{durationDays !== 1 ? "s" : ""} of promotion
                </p>
              )}
            </div>
          ) : (
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
          )}

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
                  className={cn("flex-1", isDateDriven && bias !== "Back-loaded" && "opacity-50")}
                  onClick={() => !isDateDriven && setDistributionBias(bias)}
                  disabled={isDateDriven && bias !== "Back-loaded"}
                >
                  {bias}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isDateDriven
                ? "Event campaigns always build intensity toward the date."
                : distributionBias === "Front-loaded"
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
          Settings are locked because posts have been scheduled. To change settings, unschedule posts first or reset the campaign.
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
          <SettingsField label="Campaign Start">
            <span className="text-sm">
              {campaign.startDate
                ? new Date(campaign.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "Today (default)"}
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
            <Badge variant="outline" className={`border-transparent ${STATUS_STYLES[campaign.status] || "bg-zinc-100 text-zinc-600"}`}>
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
  hasScheduledPosts = false,
}: {
  campaignId: string;
  campaignName: string;
  postCount: number;
  hasScheduledPosts?: boolean;
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
                  {hasScheduledPosts && (
                    <> Scheduled posts will be cancelled on Zernio.</>
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
