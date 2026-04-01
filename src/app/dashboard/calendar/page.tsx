"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";
import { addMonths } from "date-fns/addMonths";
import { subMonths } from "date-fns/subMonths";
import { startOfMonth } from "date-fns/startOfMonth";
import { endOfMonth } from "date-fns/endOfMonth";
import { addDays } from "date-fns/addDays";
import { subDays } from "date-fns/subDays";
import { useQuery } from "@tanstack/react-query";
import { useCalendarPosts, useDeletePost, useRetryPost } from "@/hooks";
import { useBrand } from "@/lib/brand-context";
import { useAppStore } from "@/stores";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { PostCard, PostStatusBadge, PlatformIcons } from "@/components/posts";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { cn } from "@/lib/utils";
import { type Platform, PLATFORM_NAMES } from "@/lib/late-api";
import { PlatformBadge } from "@/components/shared/platform-icon";
import { CalendarGrid } from "./_components/calendar-grid";
import { CalendarList } from "./_components/calendar-list";
import type { Campaign, CampaignType, Post } from "@/lib/airtable/types";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Calendar,
  List,
  Grid3X3,
  RefreshCw,
  Clock,
  FileText,
  ExternalLink,
  Mail,
  Frame,
  User,
  Mic,
  CalendarDays,
  Megaphone,
  Landmark,
  Film,
  Building2,
  Sparkles,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";

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

type ViewMode = "list" | "grid";

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="animate-pulse p-6">Loading...</div>}>
      <CalendarContent />
    </Suspense>
  );
}

function CalendarContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [currentDate, setCurrentDate] = useState(() => {
    if (dateParam) {
      try { return parseISO(dateParam); } catch { /* fall through */ }
    }
    return new Date();
  });
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => {
    if (dateParam) {
      try { return parseISO(dateParam); } catch { /* fall through */ }
    }
    return null;
  });
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    searchParams.get("campaign") || "all"
  );
  const [campaignFilterOpen, setCampaignFilterOpen] = useState(false);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const { currentBrand } = useBrand();

  // Default to list on mobile, grid on desktop
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setViewMode(isMobile ? "list" : "grid");
  }, []);

  const deleteMutation = useDeletePost();
  const retryMutation = useRetryPost();

  // Fetch posts for the current month (with buffer for edge days)
  const dateFrom = format(subMonths(startOfMonth(currentDate), 1), "yyyy-MM-dd");
  const dateTo = format(addMonths(endOfMonth(currentDate), 1), "yyyy-MM-dd");

  const { data: postsData, isLoading } = useCalendarPosts(dateFrom, dateTo);
  const posts = useMemo(() => (postsData?.posts || []) as any[], [postsData?.posts]);

  // Fetch campaigns list for the filter dropdown
  const { data: campaignsData } = useQuery({
    queryKey: ["campaigns", currentBrand?.id],
    queryFn: async () => {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json() as Promise<{ campaigns: Campaign[] }>;
    },
  });

  const campaigns = useMemo(() => {
    const all = campaignsData?.campaigns ?? [];
    const branded = currentBrand ? all.filter((c) => c.brandIds.includes(currentBrand.id)) : all;
    // Exclude Draft campaigns (no posts generated yet) — everything else may have published posts
    const withPosts = branded.filter((c) => c.status !== "Draft");
    // Sort: Active first, then Review, then Completed, by creation date (newest first)
    const statusPriority: Record<string, number> = { Active: 0, Review: 1, Generating: 2, Scraping: 2, Completed: 3, Archived: 4 };
    return withPosts.sort((a, b) => {
      const pa = statusPriority[a.status] ?? 2;
      const pb = statusPriority[b.status] ?? 2;
      if (pa !== pb) return pa - pb;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [campaignsData, currentBrand]);

  // Fetch selected campaign's posts to get zernioPostId values
  const { data: campaignPostsData, isLoading: isCampaignPostsLoading } = useQuery({
    queryKey: ["campaign-posts", selectedCampaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${selectedCampaignId}`);
      if (!res.ok) throw new Error("Failed to fetch campaign posts");
      return res.json() as Promise<{ campaign: Campaign; posts: Post[] }>;
    },
    enabled: selectedCampaignId !== "all",
  });

  // Set of zernioPostIds for the selected campaign
  const campaignZernioIds = useMemo(() => {
    if (selectedCampaignId === "all" || !campaignPostsData?.posts) return null;
    const ids = new Set<string>();
    for (const post of campaignPostsData.posts) {
      if (post.zernioPostId) ids.add(post.zernioPostId);
    }
    return ids;
  }, [selectedCampaignId, campaignPostsData]);

  const selectedPost = useMemo(
    () => posts.find((p: any) => p._id === selectedPostId),
    [posts, selectedPostId]
  );

  const handlePrevMonth = () => setCurrentDate((d) => subMonths(d, 1));
  const handleNextMonth = () => setCurrentDate((d) => addMonths(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleDelete = async () => {
    if (!postToDelete) return;
    try {
      await deleteMutation.mutateAsync(postToDelete);
      toast.success("Post deleted");
      setPostToDelete(null);
      setSelectedPostId(null);
    } catch {
      toast.error("Failed to delete post");
    }
  };

  const handleRetry = async (postId: string) => {
    try {
      await retryMutation.mutateAsync(postId);
      toast.success("Post queued for retry");
    } catch {
      toast.error("Failed to retry post");
    }
  };

  // All unique platforms across all loaded posts (for the filter UI)
  const allPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    posts.forEach((p: any) =>
      p.platforms?.forEach((pl: any) => platforms.add(pl.platform))
    );
    return Array.from(platforms).sort();
  }, [posts]);

  // Posts filtered by selected campaign and platforms
  const filteredPosts = useMemo(() => {
    let result = posts;
    // Campaign filter
    if (campaignZernioIds) {
      result = result.filter((p: any) => campaignZernioIds.has(p._id));
    }
    // Platform filter
    if (platformFilter.size > 0) {
      result = result.filter((p: any) =>
        p.platforms?.some((pl: any) => platformFilter.has(pl.platform))
      );
    }
    return result;
  }, [posts, platformFilter, campaignZernioIds]);

  // Stats for the month — reflects campaign + platform filters
  const monthPosts = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return filteredPosts.filter((p: any) => {
      if (!p.scheduledFor) return false;
      const postDate = new Date(p.scheduledFor);
      return postDate >= monthStart && postDate <= monthEnd;
    });
  }, [filteredPosts, currentDate]);

  const scheduledCount = useMemo(
    () => monthPosts.filter((p: any) => p.status === "scheduled").length,
    [monthPosts]
  );
  const publishedCount = useMemo(
    () => monthPosts.filter((p: any) => p.status === "published").length,
    [monthPosts]
  );

  // Posts for the selected day in the sheet
  const selectedDayPosts = useMemo(() => {
    if (!selectedDay) return [];
    const dateKey = format(selectedDay, "yyyy-MM-dd");
    return filteredPosts.filter((p: any) => {
      if (!p.scheduledFor) return false;
      return format(parseISO(p.scheduledFor), "yyyy-MM-dd") === dateKey;
    });
  }, [selectedDay, filteredPosts]);

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

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">
          View and manage your scheduled posts.
        </p>
      </div>

      {/* Month Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-32 text-center text-base font-semibold sm:min-w-36">
                {format(currentDate, "MMMM yyyy")}
              </h2>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="hidden h-8 sm:inline-flex" onClick={handleToday}>
                Today
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg border border-border p-0.5">
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
              </div>

              {/* Stats badges - hidden on mobile */}
              <Badge variant="outline" className="hidden text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 sm:inline-flex">
                {scheduledCount} scheduled
              </Badge>
              <Badge variant="outline" className="hidden text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 sm:inline-flex">
                {publishedCount} published
              </Badge>

              <Button size="sm" className="h-8" asChild>
                <Link href="/dashboard/compose">
                  <Plus className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">New Post</span>
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {viewMode === "grid" ? (
              <Calendar className="h-4 w-4" />
            ) : (
              <List className="h-4 w-4" />
            )}
            {format(currentDate, "MMMM")} Schedule
          </CardTitle>
          <CardDescription>
            {viewMode === "grid"
              ? "Click on a post to view details or a day to create a new post."
              : "Tap a post to view details."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Campaign + Platform filter bar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            {/* Campaign filter — searchable combobox */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Campaign:</span>
              <Popover open={campaignFilterOpen} onOpenChange={setCampaignFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={campaignFilterOpen}
                    className="h-8 w-[240px] justify-between text-xs font-normal"
                  >
                    <span className="truncate">
                      {selectedCampaignId === "all"
                        ? "All campaigns"
                        : campaigns.find((c) => c.id === selectedCampaignId)?.name || "Select..."}
                    </span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search campaigns..." className="text-xs h-8" />
                    <CommandList>
                      <CommandEmpty>No campaigns found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => {
                            setSelectedCampaignId("all");
                            setCampaignFilterOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-3 w-3", selectedCampaignId === "all" ? "opacity-100" : "opacity-0")} />
                          All campaigns
                        </CommandItem>
                        {campaigns.map((campaign) => {
                          const TypeIcon = CAMPAIGN_TYPE_ICONS[campaign.type] || Sparkles;
                          const isCompleted = campaign.status === "Completed" || campaign.status === "Archived";
                          return (
                            <CommandItem
                              key={campaign.id}
                              value={campaign.name}
                              onSelect={() => {
                                setSelectedCampaignId(campaign.id);
                                setCampaignFilterOpen(false);
                              }}
                              className={isCompleted ? "opacity-50" : ""}
                            >
                              <Check className={cn("mr-2 h-3 w-3", selectedCampaignId === campaign.id ? "opacity-100" : "opacity-0")} />
                              <TypeIcon className="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate text-xs">{campaign.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {isCampaignPostsLoading && selectedCampaignId !== "all" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Platform filter bar */}
          {allPlatforms.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground mr-1">Filter:</span>
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
                  <PlatformIcon platform={platform as Platform} size="xs" showColor />
                  <span className="capitalize">{platform}</span>
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

          {isLoading ? (
            viewMode === "grid" ? <CalendarSkeleton /> : <ListSkeleton />
          ) : viewMode === "grid" ? (
            <CalendarGrid
              currentDate={currentDate}
              posts={filteredPosts}
              onPostClick={setSelectedPostId}
              onDayClick={(date) => setSelectedDay(date)}
              weekStartsOn={weekStartsOn}
            />
          ) : (
            <CalendarList
              currentDate={currentDate}
              posts={filteredPosts}
              onPostClick={setSelectedPostId}
            />
          )}
        </CardContent>
      </Card>

      {/* Day detail sheet — timeline style */}
      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => selectedDay && setSelectedDay(subDays(selectedDay, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <SheetTitle className="text-lg">
                  {selectedDay ? format(selectedDay, "EEEE, MMMM d") : ""}
                </SheetTitle>
                <SheetDescription>
                  {selectedDayPosts.length === 0
                    ? "No posts scheduled"
                    : `${selectedDayPosts.length} post${selectedDayPosts.length !== 1 ? "s" : ""}`}
                </SheetDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => selectedDay && setSelectedDay(addDays(selectedDay, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedDayPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Calendar className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">No posts on this day</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {selectedDayPosts
                  .sort((a: any, b: any) =>
                    (a.scheduledFor || "").localeCompare(b.scheduledFor || "")
                  )
                  .map((post: any) => {
                    const platform = post.platforms?.[0]?.platform as Platform | undefined;
                    const isPdf = post.mediaItems?.[0]?.url && /\.pdf(\?|$)/i.test(post.mediaItems[0].url);
                    return (
                      <button
                        key={post._id}
                        onClick={() => {
                          setSelectedPostId(post._id);
                          setSelectedDay(null);
                        }}
                        className="w-full text-left hover:bg-accent/50 transition-colors"
                      >
                        <div className="px-6 py-4">
                          {/* Time bar */}
                          <div className="flex items-center gap-3 mb-3">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {post.scheduledFor
                                ? format(parseISO(post.scheduledFor), "h:mm a")
                                : "Unscheduled"}
                            </span>
                            <PostStatusBadge status={post.status} />
                          </div>

                          {/* Platform + content card */}
                          <div className="flex gap-4">
                            {/* Platform badge */}
                            {platform && (
                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <PlatformBadge platform={platform} className="h-10 w-10" />
                                {post.platforms.length > 1 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{post.platforms.length - 1}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm line-clamp-3 mb-2">
                                {post.content || "(No content)"}
                              </p>
                              {/* Media thumbnail row */}
                              {post.mediaItems?.length > 0 && (
                                <div className="flex gap-2">
                                  {post.mediaItems.slice(0, 4).map((media: any, i: number) => (
                                    isPdf || /\.pdf(\?|$)/i.test(media.url) ? (
                                      <div key={i} className="h-16 w-16 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                                        <FileText className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    ) : (
                                      <img
                                        key={i}
                                        src={media.url}
                                        alt=""
                                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                                      />
                                    )
                                  ))}
                                  {post.mediaItems.length > 4 && (
                                    <div className="h-16 w-16 shrink-0 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                      +{post.mediaItems.length - 4}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Post detail dialog — with platform header, retry, expandable text */}
      <Dialog
        open={!!selectedPostId}
        onOpenChange={() => setSelectedPostId(null)}
      >
        <DialogContent className="max-w-lg p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Post Detail</DialogTitle>
          {selectedPost && (
            <PostDetailView
              post={selectedPost}
              onRetry={handleRetry}
              isRetrying={retryMutation.isPending}
              onEdit={() => setSelectedPostId(null)}
              onDelete={(id) => setPostToDelete(id)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!postToDelete} onOpenChange={() => setPostToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Render text with clickable URLs */
function LinkifiedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/** Post detail view with platform header, retry button, expandable text */
function PostDetailView({
  post,
  onRetry,
  isRetrying,
  onEdit,
  onDelete,
}: {
  post: any;
  onRetry: (id: string) => void;
  isRetrying: boolean;
  onEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const platform = post.platforms?.[0]?.platform as Platform | undefined;
  const platformName = platform ? PLATFORM_NAMES[platform] || platform : "Post";
  const hasMedia = post.mediaItems?.length > 0;
  const firstMedia = post.mediaItems?.[0];
  const isPdf = firstMedia?.url && /\.pdf(\?|$)/i.test(firstMedia.url);

  return (
    <div>
      {/* Platform header bar */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        {platform && (
          <PlatformBadge platform={platform} className="h-10 w-10" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-base">{platformName} Post</h3>
          {post.scheduledFor && (
            <p className="text-sm text-muted-foreground">
              {format(parseISO(post.scheduledFor), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        <PostStatusBadge status={post.status} />
      </div>

      {/* Media */}
      {hasMedia && (
        <div className="px-6 pb-3">
          {isPdf ? (
            <div className="flex items-center justify-center rounded-lg bg-muted py-8">
              <div className="text-center">
                <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground mb-1">PDF Carousel</p>
                <a
                  href={firstMedia.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open PDF
                </a>
              </div>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-muted">
              <img
                src={firstMedia.url}
                alt=""
                className="w-full max-h-72 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              {post.mediaItems.length > 1 && (
                <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                  +{post.mediaItems.length - 1} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content — expandable */}
      <div className="px-6 pb-4">
        <p
          className={cn(
            "text-sm whitespace-pre-wrap",
            !expanded && "line-clamp-4"
          )}
        >
          {post.content ? <LinkifiedText text={post.content} /> : "(No content)"}
        </p>
        {post.content && post.content.length > 200 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline mt-1"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Multi-platform list (if posting to multiple platforms) */}
      {post.platforms?.length > 1 && (
        <div className="px-6 pb-4">
          <p className="text-xs text-muted-foreground mb-2">Posting to:</p>
          <div className="flex flex-wrap gap-2">
            {post.platforms.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
                <PlatformIcon platform={p.platform as Platform} size="xs" showColor />
                <span>{PLATFORM_NAMES[p.platform as Platform] || p.platform}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <div className="flex gap-2">
          {post.status === "failed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(post._id)}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Retry
            </Button>
          )}
          {post.status !== "published" && (
            <Button variant="outline" size="sm" onClick={() => onEdit()}>
              Edit
            </Button>
          )}
          {post.status === "published" && post.platforms?.[0]?.platformPostUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={post.platforms[0].platformPostUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                View on {platformName}
              </a>
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(post._id)}
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="animate-pulse">
      {/* Week day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekDays.map((day) => (
          <div
            key={day}
            className="px-2 py-3 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid skeleton - 5 rows of 7 days */}
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className={`min-h-24 border-b border-r border-border p-1 ${
              index % 7 === 6 ? "border-r-0" : ""
            } ${index >= 28 ? "border-b-0" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="h-7 w-7 rounded-full bg-muted" />
            </div>
            {index % 3 === 0 && (
              <div className="mt-1 space-y-1">
                <div className="h-5 w-full rounded bg-muted" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-border">
      {[1, 2, 3].map((group) => (
        <div key={group}>
          {/* Day header skeleton */}
          <div className="bg-muted/50 px-4 py-2">
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
          {/* Posts skeleton */}
          {[1, 2].map((post) => (
            <div key={post} className="flex gap-3 p-4">
              <div className="h-14 w-14 shrink-0 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
