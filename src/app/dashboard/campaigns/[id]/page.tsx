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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlatformIcon, PlatformBadge } from "@/components/shared/platform-icon";
import { FrequencyPreview } from "@/components/campaigns/frequency-preview";
import { CampaignTimeline } from "@/components/campaigns/campaign-timeline";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/late-api";
import { useAccounts } from "@/hooks/use-accounts";
import { useBrand } from "@/lib/brand-context";
import {
  CAMPAIGN_TYPES,
  ENABLED_CAMPAIGN_TYPES,
  DISTRIBUTION_BIASES,
  DURATION_PRESETS,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
  type DistributionBias,
  type Post,
  type PostStatus,
} from "@/lib/airtable/types";
import { toast } from "sonner";
import { getToneLabel, getAllToneTiers } from "@/lib/prompts/tone-guidance";
import { compressImage, validateImage } from "@/lib/image-compression";
import { toPlatformId, POST_STATUS_CONFIG } from "@/lib/platform-constants";
import { CampaignPostDetail } from "@/components/posts/campaign-post-detail";
import { useNewPosts } from "@/hooks/use-new-posts";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchiveCampaignDialog } from "@/components/campaigns/archive-campaign-dialog";
import { RedistributeDialog } from "@/components/campaigns/redistribute-dialog";
import { countPostsByBucket } from "@/components/campaigns/campaign-row-actions";
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
  ArchiveRestore,
  CalendarRange,
  Eraser,
  MoreHorizontal,
  Save,
  Trash2,
  X,
  Link2,
  Plus,
  RotateCcw,
  Upload,
  Layers,
  Send,
  CalendarX2,
  GripVertical,
  Pencil,
  Settings,
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
  const [genVoiceIntensity, setGenVoiceIntensity] = useState<number>(50);
  const [genVoiceInitialized, setGenVoiceInitialized] = useState(false);
  const [settingsUnsaved, setSettingsUnsaved] = useState(false);
  // Settings used to be a tab; it's now a right-side Sheet drawer (Slice 1
  // of the campaign-detail UX redesign). Backward-compat: ?tab=settings in
  // the URL still opens the Sheet, and the existing #delete-campaign-section
  // hash deep link still scrolls to the destructive section inside the Sheet.
  const [settingsOpen, setSettingsOpen] = useState(() => searchParams.get("tab") === "settings");
  const isCompact = useMediaQuery("(max-width: 639px)");
  // When opening to a hash anchor (e.g. #delete-campaign-section), scroll the
  // Sheet's body to the bottom once the target mounts. The Sheet's content
  // is its own scroll container (overflow-y-auto on SheetContent).
  useEffect(() => {
    if (!settingsOpen) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash) return;
    const id = hash.replace(/^#/, "");

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts++;
      const el = document.getElementById(id);
      // Sheet content is portaled — find the scroll-able ancestor.
      const scroller = el?.closest('[data-slot="sheet-content"]') as HTMLElement | null;
      if (el && scroller) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
        window.clearInterval(intervalId);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } else if (attempts >= 30) {
        window.clearInterval(intervalId);
      }
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [settingsOpen]);
  const queryClient = useQueryClient();
  const { markNew, dismissNew, isNew } = useNewPosts();

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

  // Auto-sync stale scheduled posts on page load.
  // If any post is "Scheduled" with a date in the past, fire a background sync
  // to reconcile with Zernio (catches missed webhooks).
  const [syncDone, setSyncDone] = useState(false);
  useEffect(() => {
    if (!campaignId || syncDone || posts.length === 0) return;
    const now = new Date();
    const hasStale = posts.some(
      (p) => p.status === "Scheduled" && p.scheduledDate && new Date(p.scheduledDate) < now
    );
    if (!hasStale) { setSyncDone(true); return; }
    // Fire-and-forget sync, then refresh
    setSyncDone(true);
    fetch(`/api/campaigns/${campaignId}/sync`, { method: "POST" })
      .then((res) => {
        if (res.ok) return res.json();
      })
      .then((data) => {
        if (data?.updated > 0) {
          queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
        }
      })
      .catch(() => { /* sync failure is non-critical */ });
  }, [campaignId, posts, syncDone, queryClient]);

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

  // Initialize voice intensity from campaign's saved value
  useEffect(() => {
    if (!genVoiceInitialized && campaign?.voiceIntensity != null) {
      setGenVoiceIntensity(campaign.voiceIntensity);
      setGenVoiceInitialized(true);
    }
  }, [campaign?.voiceIntensity, genVoiceInitialized]);

  // Track whether generation options have unsaved changes
  const genOptionsChanged = useMemo(() => {
    if (!campaign) return false;
    const savedPlatforms = campaign.targetPlatforms || [];
    const currentPlatforms = Array.from(genPlatforms).sort();
    const platformsMatch = savedPlatforms.sort().join(",") === currentPlatforms.join(",");
    const maxMatch = (campaign.maxVariantsPerPlatform ?? null) === genMaxPerPlatform;
    const voiceMatch = (campaign.voiceIntensity ?? 50) === genVoiceIntensity;
    return !platformsMatch || !maxMatch || !voiceMatch;
  }, [campaign, genPlatforms, genMaxPerPlatform, genVoiceIntensity]);

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
          voiceIntensity: genVoiceIntensity,
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
  // Slice 2: identity strip — collapsed by default. ▾ expands the
  // page excerpt + editorial direction (rare reading, not always-on).
  const [identityExpanded, setIdentityExpanded] = useState(false);
  // Slice 2: image-actions Popover — Upload / Paste URL / Remove live in a
  // popover triggered by clicking the thumbnail (no longer hover-overlay
  // buttons since the thumbnail is too small for three inline buttons).
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
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

  // Drag-reorder state: whether we're showing the reorderable view
  const isReorderMode = statusFilter === "Approved" || statusFilter === "Modified";

  // Approved posts sorted by sortOrder (for drag-and-drop reordering)
  const sortedApprovedPosts = useMemo(() => {
    if (!isReorderMode) return [];
    return [...filteredPosts].sort((a, b) => {
      const aOrder = a.sortOrder ?? Infinity;
      const bOrder = b.sortOrder ?? Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Fall back to createdAt descending
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredPosts, isReorderMode]);

  // Filter-aware approved posts for scheduling
  const hasActiveFilter = platformFilter.size > 0 || statusFilter !== null;
  const filteredApprovedPosts = useMemo(() => {
    return filteredPosts.filter((p) => p.status === "Approved" || p.status === "Modified");
  }, [filteredPosts]);
  const scheduleCount = hasActiveFilter ? filteredApprovedPosts.length : approvedCount;
  const schedulePostIds = hasActiveFilter ? filteredApprovedPosts.map((p) => p.id) : null;

  // Group filtered posts by date. Within each day, scheduled posts go in
  // chronological order (next-up first); posts without a date fall back to
  // newest-created first.
  const postsByDate = useMemo(() => {
    const groups: Record<string, Post[]> = {};
    filteredPosts.forEach((p) => {
      const dateKey = p.scheduledDate
        ? format(parseISO(p.scheduledDate), "yyyy-MM-dd")
        : "unscheduled";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(p);
    });
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        if (a.scheduledDate && b.scheduledDate) {
          return a.scheduledDate.localeCompare(b.scheduledDate);
        }
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return groups;
  }, [filteredPosts]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(postsByDate).sort((a, b) => {
      // Unscheduled (no date) keeps top placement — needs attention.
      if (a === "unscheduled") return -1;
      if (b === "unscheduled") return 1;
      // Chronological — next-up first.
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

  // ── Drag-to-reorder for approved posts ───────────────────────────────
  const [reorderList, setReorderList] = useState<Post[]>([]);
  const [isReordering, setIsReordering] = useState(false);

  // Sync reorderList when sortedApprovedPosts changes (fresh data from server)
  useEffect(() => {
    if (isReorderMode && sortedApprovedPosts.length > 0 && !isReordering) {
      setReorderList(sortedApprovedPosts);
    }
  }, [sortedApprovedPosts, isReorderMode, isReordering]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = reorderList.findIndex((p) => p.id === active.id);
    const newIndex = reorderList.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(reorderList, oldIndex, newIndex);
    setReorderList(newList);
    setIsReordering(true);

    try {
      const res = await fetch("/api/posts/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: newList.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast.success("Post order saved");
    } catch {
      // Revert on failure
      setReorderList(sortedApprovedPosts);
      toast.error("Failed to save order");
    } finally {
      setIsReordering(false);
    }
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

  // ── Track post IDs before generation (for "New" badge) ──────────────
  const preGenPostIdsRef = useRef<Set<string>>(new Set());

  // ── Generate posts handler (SSE) ─────────────────────────────────────
  const handleGenerate = async () => {
    // Snapshot current post IDs so we can diff after generation
    preGenPostIdsRef.current = new Set(posts.map((p) => p.id));
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
    // Refresh to show generated posts (post list is now always visible —
    // no tab switch needed since Settings is a Sheet drawer).
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
  };

  // Mark newly generated posts as "new" when query data refreshes after generation
  const prevPostIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (posts.length === 0) return;
    const currentIds = new Set(posts.map((p) => p.id));
    const preGenIds = preGenPostIdsRef.current;
    // Only detect new posts if we had a pre-generation snapshot (i.e., generation was triggered)
    if (preGenIds.size > 0) {
      const newIds = posts
        .filter((p) => !preGenIds.has(p.id))
        .map((p) => p.id);
      if (newIds.length > 0) {
        markNew(newIds);
      }
      // Clear the snapshot so we don't re-detect on subsequent refetches
      preGenPostIdsRef.current = new Set();
    }
    prevPostIdsRef.current = currentIds;
  }, [posts, markNew]);

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
  const isQuickPost = campaign.name?.startsWith("Quick Post:");
  const backHref = isQuickPost ? "/dashboard/quick-post" : "/dashboard/campaigns";

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button + page title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold flex-1 break-words">{displayName}</h1>
        <CampaignHeaderActions
          campaign={campaign}
          posts={posts}
          onDeleteRequest={() => {
            // Open the Settings Sheet; the existing #delete-campaign-section
            // hash effect handles scrolling within the Sheet's scroll container
            // once the destructive section mounts.
            window.location.hash = "delete-campaign-section";
            setSettingsOpen(true);
            // Belt-and-suspenders scroll fallback (in case the hash effect's
            // selector doesn't find the Sheet content fast enough).
            let attempts = 0;
            const intervalId = window.setInterval(() => {
              attempts++;
              const el = document.getElementById("delete-campaign-section");
              const scroller = el?.closest('[data-slot="sheet-content"]') as HTMLElement | null;
              if (el && scroller) {
                scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
                window.clearInterval(intervalId);
              } else if (attempts >= 30) {
                window.clearInterval(intervalId);
              }
            }, 100);
          }}
        />
      </div>

      {campaign.archivedAt && (
        <ArchivedBanner campaign={campaign} />
      )}

      {/* Header card + (when expanded) generation-options panel form a
          single visual unit. Wrapping them in this div takes them out of
          the parent's space-y-6 cadence so the panel can flush-attach to
          the card with no gap. */}
      <div>
      <Card className={cn(
        "overflow-hidden !py-0 !gap-0",
        showGenOptions && (campaign.status === "Draft" || campaign.status === "Active" || campaign.status === "Review") && !isGenerating && "rounded-b-none border-b-0",
      )}>
        {/* Compact identity strip (slice 2): 80×80 thumbnail + identity text
            on a single row. Image-management actions (Upload / Paste URL /
            Remove) live in a Popover triggered by clicking the thumbnail
            since three inline buttons don't fit at this size. Excerpt +
            editorial direction collapse behind a ▾ expander since they're
            reference reading, not always-on. */}
        <div className="px-5 py-4 flex items-start gap-4">
          <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative shrink-0 w-28 sm:w-40 aspect-[5/4] rounded-md overflow-hidden bg-muted group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Manage cover image"
              >
                {campaign.imageUrl ? (
                  <img
                    src={campaign.imageUrl}
                    alt=""
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
                    <TypeIcon className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 group-focus-visible:bg-black/35 flex items-center justify-center transition-colors">
                  {heroUploading ? (
                    <Loader2 className="h-4 w-4 text-white animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                  )}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-64 p-2">
              {showHeroUrlInput ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Paste image URL</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="url"
                      placeholder="https://…"
                      value={heroUrlInput}
                      onChange={(e) => setHeroUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setHeroImageUrl(heroUrlInput);
                          setImagePopoverOpen(false);
                        }
                        if (e.key === "Escape") {
                          setShowHeroUrlInput(false);
                          setHeroUrlInput("");
                        }
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => {
                        setHeroImageUrl(heroUrlInput);
                        setImagePopoverOpen(false);
                      }}
                      disabled={!heroUrlInput.trim()}
                    >
                      Set
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => { setShowHeroUrlInput(false); setHeroUrlInput(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={heroUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadHeroImage(file);
                          setImagePopoverOpen(false);
                        }
                        e.target.value = "";
                      }}
                    />
                    <span className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      {campaign.imageUrl ? "Change image…" : "Upload image…"}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent cursor-pointer text-left"
                    onClick={() => setShowHeroUrlInput(true)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Paste URL…
                  </button>
                  {campaign.imageUrl && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-destructive/10 cursor-pointer text-destructive text-left"
                      onClick={() => {
                        removeHeroImage();
                        setImagePopoverOpen(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove image
                    </button>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Identity content — title (wraps), URL, status badge, meta line,
              optional ▾ expander for excerpt + editorial direction */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold break-words leading-snug">{displayName}</h2>
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
                    Created {format(parseISO(campaign.createdAt), "MMM d, yyyy")}
                  </span>
                </>
              )}
            </div>

            {(campaign.description || campaign.editorialDirection) && (
              <div>
                <button
                  type="button"
                  onClick={() => setIdentityExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-expanded={identityExpanded}
                >
                  {identityExpanded ? (
                    <><ChevronUp className="h-3 w-3" /> Hide details</>
                  ) : (
                    <><ChevronDown className="h-3 w-3" /> Show details</>
                  )}
                </button>
                {identityExpanded && (
                  <div className="mt-2 space-y-2">
                    {campaign.description && (
                      <p className="text-sm text-foreground/80">
                        {campaign.description}
                      </p>
                    )}
                    {campaign.editorialDirection && (
                      <p className="text-sm text-muted-foreground italic">
                        &ldquo;{campaign.editorialDirection}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: action bar — actions live below the identity row, separated
            visually from the lead image. Card height stays constant when
            "Options" is toggled because the panel is rendered as a sibling
            block outside this card. */}
        <div className="px-5 py-3 border-t border-border/60 flex flex-wrap items-center gap-3">
          {settingsUnsaved && campaign.status === "Draft" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
              Unsaved Settings changes — save in Settings tab before generating.
            </div>
          )}
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
              className={cn(
                "text-xs",
                showGenOptions
                  ? "bg-muted text-foreground hover:bg-muted"
                  : "text-muted-foreground",
              )}
              aria-expanded={showGenOptions}
            >
              {showGenOptions ? <ChevronUp className="h-3 w-3 sm:mr-1" /> : <ChevronDown className="h-3 w-3 sm:mr-1" />}
              <span className="hidden sm:inline">{showGenOptions ? "Hide options" : "Options"}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="text-xs text-muted-foreground"
            aria-label="Open campaign settings"
          >
            <Settings className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </Card>

      {/* Generation options — platform selection + test mode.
          Lives OUTSIDE the header card so the header stays focused on
          identity (image + title + meta + actions). Flush-attached to
          the card's bottom edge (no rounded top, no top border, negative
          top margin cancels the parent's space-y-6) so the two read as a
          single continuous unit when expanded. */}
      {showGenOptions && (campaign.status === "Draft" || campaign.status === "Active" || campaign.status === "Review") && !isGenerating && (
        <div className="border border-t-0 rounded-b-lg rounded-t-none p-4 space-y-4 bg-muted/30">
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
            <div className="flex flex-wrap items-center gap-2">
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

          {/* Voice intensity slider */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-2 block">
              Tone of Voice
            </Label>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Slider
                  value={[genVoiceIntensity]}
                  onValueChange={([val]) => setGenVoiceIntensity(val)}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs font-medium text-muted-foreground w-8 text-right tabular-nums">
                  {genVoiceIntensity}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/70 px-0.5">
                {getAllToneTiers().map((tier) => (
                  <span
                    key={tier.label}
                    className={cn(
                      "cursor-pointer hover:text-foreground transition-colors",
                      genVoiceIntensity >= tier.min && genVoiceIntensity <= tier.max && "text-foreground font-medium"
                    )}
                    onClick={() => setGenVoiceIntensity(Math.round((tier.min + tier.max) / 2))}
                  >
                    {tier.label}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {getToneLabel(genVoiceIntensity)} — adjusts how much brand personality comes through.{" "}
                <a href="/dashboard/settings/brands" className="text-primary hover:underline">Edit tone dimensions</a>
              </p>
            </div>
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

      {/* Posts list — always visible (no tab toggle). Settings, which used
          to be a peer Tab, is now a right-side Sheet drawer triggered from
          the action bar in the header card above. */}
      <div className="space-y-4">
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
                  {scheduleCount > 0 && !isQuickPost && (
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
                          // Hard refresh so the post list reflects new statuses.
                          // Cache invalidation alone doesn't reliably pick up the Airtable writes here.
                          setTimeout(() => window.location.reload(), 1500);
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

              {/* Status counts (published / scheduled / queued) and the
                  Calendar link both moved into the timeline strip's header
                  to remove redundancy. The standalone bar that used to live
                  here was the third "View in Calendar" entry point on the
                  page. */}

              {/* Queue-empty alert — only shows once the campaign has run out
                  of pre-scheduled content (i.e., no future-dated Scheduled or
                  Queued posts) AND the campaign window is still open. The
                  previous trigger (approved < 30% of remaining slots) fired
                  even when many Scheduled posts were still queued ahead,
                  which is a false alarm — those Scheduled posts WILL fill
                  the curve as their dates come up. */}
              {campaign && (campaign.status === "Review" || campaign.status === "Active") && (() => {
                const startDate = campaign.startDate ? new Date(campaign.startDate + "T00:00:00") : new Date();
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + (campaign.durationDays || 90));
                const now = new Date();
                if (now >= endDate) return null; // campaign window done — banner irrelevant

                // Hide banner while there are still future-dated Scheduled/Queued
                // posts. The campaign is humming along; nothing to alert about.
                const futureQueueExists = posts.some((p) =>
                  ["Scheduled", "Queued"].includes(p.status) &&
                  p.scheduledDate &&
                  new Date(p.scheduledDate) > now,
                );
                if (futureQueueExists) return null;

                // Queue is empty (last scheduled post has run) but window is
                // still open. Differentiate two states by what's available.
                const isUrgent = approvedCount === 0;
                return (
                  <div className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3",
                    isUrgent
                      ? "border-destructive/50 bg-destructive/5 text-destructive"
                      : "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                  )}>
                    <div className="text-xs">
                      {isUrgent ? (
                        <><strong>Queue empty</strong> — your last scheduled post has run. Generate more to keep the campaign going.</>
                      ) : (
                        <><strong>Queue empty</strong> — your last scheduled post has run. {approvedCount} approved {approvedCount === 1 ? "post is" : "posts are"} ready to schedule.</>
                      )}
                    </div>
                    <Button
                      variant={isUrgent ? "destructive" : "outline"}
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        setShowGenOptions(true);
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

              {/* Posts — reorderable list or grouped by date */}
              {isReorderMode && reorderList.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg mb-2">
                  <GripVertical className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    Drag to reorder — posts scheduled first appear at the top
                  </span>
                  {isReordering && <Loader2 className="h-3 w-3 animate-spin text-blue-500 ml-auto" />}
                </div>
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={reorderList.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-border border rounded-lg">
                      {reorderList.map((post, index) => (
                        <SortablePostRow
                          key={post.id}
                          post={post}
                          index={index}
                          campaignStatus={campaign.status}
                          isNewPost={isNew(post.id)}
                          onClick={() => { dismissNew(post.id); setSelectedPost(post); }}
                          onApprove={() => quickApprove(post.id)}
                          onDismiss={() => quickDismiss(post.id)}
                          onUnapprove={() => quickUnapprove(post.id)}
                          onRetry={() => quickRetry(post.id)}
                          onDelete={() => quickDelete(post.id)}
                          onUnschedule={() => quickUnschedule(post.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              ) : filteredPosts.length > 0 ? (
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
                          isNewPost={isNew(post.id)}
                          onClick={() => { dismissNew(post.id); setSelectedPost(post); }}
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
                        isNewPost={isNew(post.id)}
                        onClick={() => { dismissNew(post.id); setSelectedPost(post); }}
                        onApprove={() => quickApprove(post.id)}
                        onDismiss={() => quickDismiss(post.id)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
      </div>

      {/* Settings Sheet — opens from the right when triggered. Holds the
          editable settings form (or read-only view when posts are already
          scheduled), the Reset-to-Draft section, and the danger-zone
          Delete section. The post list stays visible behind the Sheet
          overlay so working context isn't lost. */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side={isCompact ? "bottom" : "right"}
          className={cn(
            "overflow-y-auto",
            isCompact ? "h-[90vh]" : "w-full sm:max-w-2xl",
          )}
        >
          <SheetHeader>
            <SheetTitle>Campaign settings</SheetTitle>
            <SheetDescription>
              Edit configuration, reset, or delete this campaign.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
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
                isQuickPost={isQuickPost}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Progress log moved above tabs — see generation options card */}

      {/* Post detail dialog */}
      <Dialog
        open={!!selectedPost}
        onOpenChange={(open) => !open && setSelectedPost(null)}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Post Detail</DialogTitle>
          {selectedPost && (
            <CampaignPostDetail
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

function SortablePostRow({
  post,
  index,
  campaignStatus,
  isNewPost,
  onClick,
  onApprove,
  onDismiss,
  onUnapprove,
  onRetry,
  onDelete,
  onUnschedule,
}: {
  post: Post;
  index: number;
  campaignStatus: CampaignStatus;
  isNewPost?: boolean;
  onClick: () => void;
  onApprove?: () => void;
  onDismiss?: () => void;
  onUnapprove?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  onUnschedule?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: post.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: "relative" as const,
  };

  const statusConfig = POST_STATUS_CONFIG[post.status] || { variant: "outline" as const };
  const platformLower = toPlatformId(post.platform);
  const mediaUrlCount = post.mediaUrls ? post.mediaUrls.split("\n").filter((u) => u.trim()).length : 0;
  const totalImages = (post.imageUrl ? 1 : 0) + mediaUrlCount;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full text-left hover:bg-accent/50 transition-colors cursor-pointer",
        isDragging && "bg-accent shadow-lg ring-2 ring-primary/20 rounded-lg"
      )}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Drag handle + order number */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-5 text-center">
            {index + 1}
          </span>
          <button
            className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>

        {/* Image thumbnail */}
        {post.imageUrl ? (
          <div
            className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-muted relative group"
            onClick={onClick}
          >
            <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
            {totalImages > 1 && (
              <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] font-medium px-1 py-0.5 rounded flex items-center gap-0.5">
                <Layers className="h-2.5 w-2.5" />
                {totalImages}
              </span>
            )}
          </div>
        ) : (
          <div
            className="h-14 w-14 shrink-0 rounded-lg bg-muted flex items-center justify-center"
            onClick={onClick}
          >
            <PlatformIcon platform={platformLower} size="md" showColor />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-2 mb-1">
            <PlatformIcon platform={platformLower} size="xs" showColor />
            <span className="text-xs font-medium">{post.platform}</span>
            <Badge
              variant={statusConfig.variant}
              className={cn("text-[10px] px-1.5 py-0", statusConfig.className)}
            >
              {post.status}
            </Badge>
            {isNewPost && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-400"
              >
                New
              </Badge>
            )}
          </div>
          <p className="text-sm line-clamp-2">{post.content || "(No content)"}</p>
        </div>

        {/* Actions */}
        {post.status === "Approved" && onUnapprove && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onUnapprove}
              className="inline-flex items-center rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors"
            >
              Unapprove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignPostRow({
  post,
  campaignStatus,
  isNewPost,
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
  isNewPost?: boolean;
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
            {isNewPost && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-400"
              >
                New
              </Badge>
            )}
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

// PostDetailView extracted to src/components/posts/campaign-post-detail.tsx


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
  const [voiceIntensity, setVoiceIntensity] = useState<number>(campaign.voiceIntensity ?? 50);

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
    additionalUrlsList.filter(Boolean).join("\n") !== (campaign.additionalUrls || "") ||
    voiceIntensity !== (campaign.voiceIntensity ?? 50);

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
          voiceIntensity,
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

      {/* Tone of Voice */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Tone of Voice
          </Label>
          <div className="flex items-center gap-3">
            <Slider
              value={[voiceIntensity]}
              onValueChange={([val]) => setVoiceIntensity(val)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-medium text-muted-foreground w-8 text-right tabular-nums">
              {voiceIntensity}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/70 px-0.5">
            {getAllToneTiers().map((tier) => (
              <span
                key={tier.label}
                className={cn(
                  "cursor-pointer hover:text-foreground transition-colors",
                  voiceIntensity >= tier.min && voiceIntensity <= tier.max && "text-foreground font-medium"
                )}
                onClick={() => setVoiceIntensity(Math.round((tier.min + tier.max) / 2))}
              >
                {tier.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {getToneLabel(voiceIntensity)} — adjusts how much brand personality comes through in generated posts.{" "}
            <a href="/dashboard/settings/brands" className="text-primary hover:underline">Edit tone dimensions</a>
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
  const queryClient = useQueryClient();
  const [editingUrl, setEditingUrl] = useState(false);
  const [pendingUrl, setPendingUrl] = useState(campaign.url);

  // Re-sync if the underlying campaign URL changes from elsewhere
  useEffect(() => {
    setPendingUrl(campaign.url);
  }, [campaign.url]);

  const urlMutation = useMutation({
    mutationFn: async (newUrl: string) => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl }),
      });
      if (!res.ok) throw new Error("Failed to update Source URL");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      toast.success("Source URL updated. Future generations will use the new URL.");
      setEditingUrl(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          Settings are locked because posts have been scheduled. To change settings, unschedule posts first or reset the campaign. The Source URL can still be updated below — handy for swapping a Curated.co preview link for the public URL after the issue publishes.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SettingsField label="Source URL">
            {editingUrl ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="url"
                  value={pendingUrl}
                  onChange={(e) => setPendingUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pendingUrl && pendingUrl !== campaign.url) {
                      urlMutation.mutate(pendingUrl);
                    } else if (e.key === "Escape") {
                      setPendingUrl(campaign.url);
                      setEditingUrl(false);
                    }
                  }}
                  className="flex-1 min-w-0 px-2 py-1 text-sm border border-input rounded bg-background"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => urlMutation.mutate(pendingUrl)}
                  disabled={
                    urlMutation.isPending ||
                    !pendingUrl ||
                    pendingUrl === campaign.url
                  }
                  className="h-7 px-2"
                >
                  {urlMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPendingUrl(campaign.url);
                    setEditingUrl(false);
                  }}
                  disabled={urlMutation.isPending}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <a
                  href={campaign.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all min-w-0 flex-1"
                >
                  {campaign.url}
                  <ExternalLink className="inline-block h-3 w-3 ml-1 align-baseline" />
                </a>
                <button
                  type="button"
                  onClick={() => setEditingUrl(true)}
                  className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Edit Source URL (e.g. swap preview for public URL)"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
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
  isQuickPost = false,
}: {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  postCount: number;
  isQuickPost?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
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
      toast.success(isQuickPost ? "Quick post deleted" : "Campaign deleted");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(isQuickPost ? "/dashboard/quick-post" : "/dashboard/campaigns");
    } catch {
      toast.error("Failed to delete campaign");
      setIsDeleting(false);
    }
  };

  return (
    <Card id="delete-campaign-section" className="mt-6 border-destructive/30">
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

// ── Archived banner ────────────────────────────────────────────────────

function ArchivedBanner({ campaign }: { campaign: Campaign }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const archivedDate = campaign.archivedAt
    ? format(parseISO(campaign.archivedAt), "MMM d, yyyy")
    : null;

  async function handleUnarchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/unarchive`, { method: "POST" });
      if (!res.ok) throw new Error("Unarchive failed");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      toast.success("Campaign restored");
    } catch (err) {
      console.error(err);
      toast.error("Failed to unarchive");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-muted-foreground">
        This campaign is <strong className="text-foreground">archived</strong>
        {archivedDate && <> — hidden from the main list since {archivedDate}</>}.
      </span>
      <Button size="sm" variant="outline" onClick={handleUnarchive} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
          <><ArchiveRestore className="h-3.5 w-3.5 mr-1.5" /> Unarchive</>
        )}
      </Button>
    </div>
  );
}

// ── Campaign header actions (archive/cleanup menu) ─────────────────────

function CampaignHeaderActions({
  campaign,
  posts,
  onDeleteRequest,
}: {
  campaign: Campaign;
  posts: Post[];
  onDeleteRequest: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [busy, setBusy] = useState<"unarchive" | "cleanup" | null>(null);

  const isArchived = Boolean(campaign.archivedAt);
  const counts = countPostsByBucket(posts);
  const canRedistribute = !isArchived && (counts.approved + counts.scheduled) > 0;

  async function handleUnarchive() {
    setBusy("unarchive");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/unarchive`, { method: "POST" });
      if (!res.ok) throw new Error("Unarchive failed");
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      toast.success("Campaign restored");
    } catch (err) {
      console.error(err);
      toast.error("Failed to unarchive campaign");
    } finally {
      setBusy(null);
    }
  }

  async function handleCleanup() {
    if (counts.pending === 0) {
      toast.info("No pending posts to clean up");
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
      toast.success(`Cleaned up ${counts.pending} post${counts.pending === 1 ? "" : "s"}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to clean up posts");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Page-level campaign actions — exposed inline rather than hidden in
          a 3-dot menu (per user request). Delete stays behind a small
          overflow menu as a destructive-action guardrail. */}
      <div className="flex items-center gap-1 shrink-0">
        {isArchived ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnarchive}
            disabled={busy === "unarchive"}
            className="h-8 text-xs"
          >
            {busy === "unarchive" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
            )}
            Unarchive
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRedistributeOpen(true)}
              disabled={!canRedistribute}
              className="hidden sm:inline-flex h-8 text-xs"
            >
              <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
              Redistribute
              {canRedistribute && (
                <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] font-medium">
                  {counts.approved + counts.scheduled}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanup}
              disabled={counts.pending === 0 || busy === "cleanup"}
              className="hidden sm:inline-flex h-8 text-xs"
            >
              {busy === "cleanup" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Eraser className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clean up
              {counts.pending > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px] font-medium">
                  {counts.pending}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveOpen(true)}
              className="hidden sm:inline-flex h-8 text-xs"
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
          </>
        )}
        {/* Overflow menu — Delete is always here as a destructive-action
            guardrail. At <sm, Redistribute / Clean up / Archive collapse in
            here too (the inline buttons are hidden via sm:inline-flex). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More campaign actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isArchived && (
              <>
                <DropdownMenuItem
                  className="sm:hidden"
                  disabled={!canRedistribute}
                  onClick={() => setRedistributeOpen(true)}
                >
                  <CalendarRange className="h-4 w-4 mr-2" /> Redistribute
                  {canRedistribute && (
                    <Badge variant="secondary" className="ml-auto px-1 py-0 text-[10px] font-medium">
                      {counts.approved + counts.scheduled}
                    </Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  disabled={counts.pending === 0 || busy === "cleanup"}
                  onClick={handleCleanup}
                >
                  <Eraser className="h-4 w-4 mr-2" /> Clean up
                  {counts.pending > 0 && (
                    <Badge variant="secondary" className="ml-auto px-1 py-0 text-[10px] font-medium">
                      {counts.pending}
                    </Badge>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="sm:hidden"
                  onClick={() => setArchiveOpen(true)}
                >
                  <Archive className="h-4 w-4 mr-2" /> Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator className="sm:hidden" />
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteRequest}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
        onArchived={() => router.push("/dashboard/campaigns")}
      />

      <RedistributeDialog
        campaign={campaign}
        posts={posts}
        open={redistributeOpen}
        onOpenChange={setRedistributeOpen}
      />
    </>
  );
}

