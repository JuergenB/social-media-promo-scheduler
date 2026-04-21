"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useBrand } from "@/lib/brand-context";
import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";
import {
  toPlatformId,
  PLATFORM_OPTIMIZE_TARGETS,
  SLIDE_PLATFORMS,
  PLATFORM_CHAR_LIMITS,
} from "@/lib/platform-constants";
import { PLATFORM_LABELS } from "@/lib/platform-cadence-defaults";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { buildMediaItems, usePostMedia } from "@/hooks/use-post-media";
import { usePostContent } from "@/hooks/use-post-content";
import { useCarousel } from "@/hooks/use-carousel";
import { useImageOptimize } from "@/hooks/use-image-optimize";
import { usePostActions } from "@/hooks/use-post-actions";
import { MediaGallery } from "@/components/posts/media-gallery";
import { ImageDropZone } from "@/components/posts/image-drop-zone";
import { ContentEditor } from "@/components/posts/content-editor";
import { Lightbox } from "@/components/posts/lightbox";
import { CarouselPreviewOverlay } from "@/components/posts/carousel-preview-overlay";
import { OptimizePreviewDialog } from "@/components/posts/optimize-preview-dialog";
import { OutpaintImageSelector } from "@/components/posts/outpaint-image-selector";
import { CardImageSelector } from "@/components/posts/card-image-selector";
import { CampaignImageLibrary } from "@/components/posts/campaign-image-library";
import { CoverSlideDesigner } from "@/components/posts/cover-slide-designer";
import { ImagePicker, type ScrapedImageItem } from "@/components/posts/image-picker";
import { CollaborationSection } from "@/components/posts/collaboration-section";
import { PostFirstComment } from "@/components/posts/post-first-comment";
import { getToneLabel } from "@/lib/prompts/tone-guidance";
import { toast } from "sonner";
import { getEligibleOutpaintIndices } from "@/lib/media-items";
import type { Campaign, Post } from "@/lib/airtable/types";
import type { Platform } from "@/lib/late-api";
import type { CoverSlideData } from "@/lib/cover-slide-types";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutTemplate,
  Layers,
  Loader2,
  PenSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

// ── SSE progress type ─────────────────────────────────────────────────

interface ProgressEvent {
  step: number;
  totalSteps: number;
  status: "running" | "success" | "error";
  message: string;
  detail?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Map Zernio platform ID to Airtable display name */
const PLATFORM_ID_TO_AIRTABLE: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  tiktok: "TikTok",
};

// ── Main Page ─────────────────────────────────────────────────────────

export default function QuickPostPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const { data: accountsData } = useAccounts();
  const connectedAccounts = accountsData?.accounts ?? [];

  // Connected platforms (active only)
  const connectedPlatforms = useMemo(() => {
    const platforms: { id: Platform; label: string; username: string }[] = [];
    const seen = new Set<string>();
    for (const account of connectedAccounts) {
      if (account.isActive && !seen.has(account.platform)) {
        seen.add(account.platform);
        platforms.push({
          id: account.platform as Platform,
          label: PLATFORM_LABELS[account.platform] || account.platform.charAt(0).toUpperCase() + account.platform.slice(1),
          username: account.username || account.displayName || "",
        });
      }
    }
    return platforms;
  }, [connectedAccounts]);

  // ── Existing quick posts ────────────────────────────────────────────────
  const { data: campaignsData } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["campaigns", currentBrand?.id],
    queryFn: async () => {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const quickPostCampaigns = useMemo(() => {
    const all = campaignsData?.campaigns ?? [];
    return (currentBrand
      ? all.filter((c) => c.brandIds?.includes(currentBrand.id))
      : all
    ).filter((c) => c.name?.startsWith("Quick Post:"))
     .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [campaignsData, currentBrand]);

  // ── Form state ────────────────────────────────────────────────────────
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [url, setUrl] = useState("");
  const [editorialDirection, setEditorialDirection] = useState("");
  const [voiceIntensity, setVoiceIntensity] = useState(currentBrand?.defaultVoiceIntensity ?? 50);
  const [generateSectionOpen, setGenerateSectionOpen] = useState(true);

  // Sync voice intensity when brand changes
  React.useEffect(() => {
    if (currentBrand?.defaultVoiceIntensity != null) {
      setVoiceIntensity(currentBrand.defaultVoiceIntensity);
    }
  }, [currentBrand?.id, currentBrand?.defaultVoiceIntensity]);

  // ── Phantom campaign + post state ──────────────────────────────────────
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // ── Generation state ──────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([]);

  // ── Image picker state ────────────────────────────────────────────────
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedImages, setScrapedImages] = useState<ScrapedImageItem[] | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Array<{ url: string; caption: string }>>([]);
  // Refs to hold campaign/post during the async scrape → pick → generate flow
  const pendingCampaignRef = useRef<Campaign | null>(null);
  const pendingPostRef = useRef<Post | null>(null);

  // ── Create phantom campaign + post ────────────────────────────────────

  const createPhantomPost = useCallback(
    async (platform: Platform, opts?: { url?: string; editorialDirection?: string; voiceIntensity?: number }) => {
      if (!currentBrand) return null;
      setIsCreating(true);
      try {
        const res = await fetch("/api/quick-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: currentBrand.id,
            platform,
            url: opts?.url || "",
            editorialDirection: opts?.editorialDirection || "",
            voiceIntensity: opts?.voiceIntensity ?? 50,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create quick post");
        }
        const data = await res.json();
        setCampaign(data.campaign as Campaign);
        setPost(data.post as Post);
        return data as { campaign: Campaign; post: Post };
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create quick post");
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [currentBrand]
  );

  // ── Handle platform selection ──────────────────────────────────────────

  const handlePlatformSelect = (platform: Platform) => {
    setSelectedPlatform(platform);
    // Don't create Airtable records yet — wait until user takes an action
    // (Generate, type content, or upload image)
  };

  /** Ensure phantom campaign + post exist, creating lazily if needed */
  const ensurePost = useCallback(
    async (opts?: { url?: string; editorialDirection?: string; voiceIntensity?: number }) => {
      if (post && campaign) return { campaign, post };
      if (!selectedPlatform) return null;
      return createPhantomPost(selectedPlatform, opts);
    },
    [post, campaign, selectedPlatform, createPhantomPost]
  );

  // ── Handle generate (two-phase: scrape → pick images → generate) ─────

  /** Phase 1: Scrape the URL and show image picker */
  const handleGenerate = async () => {
    if (!selectedPlatform || !currentBrand) return;

    const hasUrl = url.trim().length > 0;

    // Create phantom campaign if needed (lazy — only when user commits to generating)
    let targetCampaign = campaign;
    let targetPost = post;

    if (!targetCampaign) {
      const result = await ensurePost({
        url,
        editorialDirection,
        voiceIntensity,
      });
      if (!result) return;
      targetCampaign = result.campaign;
      targetPost = result.post;
    } else {
      // Update the campaign with URL/editorial direction/tone if they changed
      try {
        await fetch(`/api/campaigns/${targetCampaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            editorialDirection: editorialDirection.trim(),
            voiceIntensity,
            type: url.trim() ? "Blog Post" : "Custom",
          }),
        });
      } catch {
        // Non-critical update
      }
    }

    if (!targetCampaign) return;

    // Save refs for the async flow
    pendingCampaignRef.current = targetCampaign;
    pendingPostRef.current = targetPost;

    // If there's a URL, scrape first and show image picker
    if (hasUrl) {
      setIsScraping(true);
      setProgressLog([{
        step: 0,
        totalSteps: 1,
        status: "running",
        message: "Scraping URL for images...",
      }]);

      try {
        const scrapeRes = await fetch("/api/quick-post/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!scrapeRes.ok) {
          const errData = await scrapeRes.json().catch(() => ({}));
          throw new Error(errData.error || "Scrape failed");
        }

        const scrapeData = await scrapeRes.json();
        const images = (scrapeData.images || []) as ScrapedImageItem[];

        setIsScraping(false);
        setProgressLog([{
          step: 0,
          totalSteps: 1,
          status: "success",
          message: `Found ${images.length} image${images.length !== 1 ? "s" : ""}`,
        }]);

        if (images.length > 0) {
          // Show image picker
          setScrapedImages(images);
          setShowImagePicker(true);
          return; // Wait for user selection — generation continues in handleImageSelect/handleImageSkip
        }

        // No images found — go straight to generation
        await runGeneration(targetCampaign, targetPost, []);
      } catch (err) {
        setIsScraping(false);
        setProgressLog([{
          step: 0,
          totalSteps: 1,
          status: "error",
          message: "Scrape failed",
          detail: err instanceof Error ? err.message : "Unknown error",
        }]);
        // Fall through to generate without images
        await runGeneration(targetCampaign, targetPost, []);
      }
    } else {
      // No URL — generate directly (custom post)
      await runGeneration(targetCampaign, targetPost, []);
    }
  };

  /** Image picker callbacks */
  const handleImageSelect = async (items: Array<{ url: string; caption: string }>) => {
    setShowImagePicker(false);
    setSelectedImages(items);
    setScrapedImages(null);
    const targetCampaign = pendingCampaignRef.current;
    const targetPost = pendingPostRef.current;
    if (!targetCampaign) return;
    await runGeneration(targetCampaign, targetPost, items);
  };

  const handleImageSkip = async () => {
    setShowImagePicker(false);
    setScrapedImages(null);
    setSelectedImages([]);
    const targetCampaign = pendingCampaignRef.current;
    const targetPost = pendingPostRef.current;
    if (!targetCampaign) return;
    await runGeneration(targetCampaign, targetPost, []);
  };

  /** Phase 2: Run the AI generation via SSE, then override images with user selection */
  const runGeneration = async (
    targetCampaign: Campaign,
    targetPost: Post | null,
    userSelectedImages: Array<{ url: string; caption: string }>
  ) => {
    setIsGenerating(true);
    setProgressLog([]);

    try {
      const genParams = new URLSearchParams();
      genParams.set("platforms", selectedPlatform!);
      genParams.set("maxPerPlatform", "1");

      const res = await fetch(
        `/api/campaigns/${targetCampaign.id}/generate?${genParams.toString()}`,
        { method: "POST" }
      );

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

    // Refetch the post from the campaign to get generated content
    if (targetCampaign) {
      try {
        const res = await fetch(`/api/campaigns/${targetCampaign.id}`);
        if (res.ok) {
          const data = await res.json();
          const posts = data.posts ?? [];
          if (posts.length > 0) {
            // Use the generated post for our platform (not the empty phantom)
            const platformPost = posts.find(
              (p: Post) => toPlatformId(p.platform) === selectedPlatform && p.content
            ) || posts.find(
              (p: Post) => toPlatformId(p.platform) === selectedPlatform
            ) || posts[0];

            // Clean up the original empty phantom post if generation created a new one
            if (targetPost && platformPost.id !== targetPost.id) {
              fetch(`/api/posts/${targetPost.id}`, { method: "DELETE" }).catch(() => {});
            }

            // Override images with user's selection (if any)
            if (userSelectedImages.length > 0) {
              try {
                const mediaCaptions = JSON.stringify(
                  userSelectedImages.map((img) => ({ url: img.url, caption: img.caption }))
                );
                await fetch(`/api/posts/${platformPost.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    imageUrl: userSelectedImages[0].url,
                    mediaUrls: userSelectedImages.length > 1
                      ? userSelectedImages.slice(1).map((img) => img.url).join("\n")
                      : "",
                    mediaCaptions,
                  }),
                });
                // Update local state to reflect overridden images
                platformPost.imageUrl = userSelectedImages[0].url;
                platformPost.mediaUrls = userSelectedImages.length > 1
                  ? userSelectedImages.slice(1).map((img) => img.url).join("\n")
                  : "";
                platformPost.mediaCaptions = mediaCaptions;
              } catch {
                // Non-critical — user can still change images in editor
              }
            }

            setPost(platformPost);
            setCampaign(data.campaign);
          }
        }
      } catch {
        // Non-critical
      }
    }

    // Clear refs
    pendingCampaignRef.current = null;
    pendingPostRef.current = null;

    setGenerateSectionOpen(false);
  };

  // ── Invalidation keys for hooks ────────────────────────────────────────
  const invalidateKeys = campaign ? [["campaign", campaign.id], ["campaign"]] : [["campaign"]];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quick Post</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create a single post for {currentBrand?.name || "your brand"}
        </p>
      </div>

      {/* ── Create section ─────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Create</h2>

      {/* Platform selector */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 block">
            Platform
          </Label>
          {connectedPlatforms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connected accounts found. Connect a social account in Settings to get started.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {connectedPlatforms.map(({ id, label, username }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePlatformSelect(id)}
                  disabled={isCreating}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    selectedPlatform === id
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  <PlatformIcon platform={id} className="h-4 w-4" />
                  <span className="font-medium">{label}</span>
                  {username && (
                    <span className="text-xs text-muted-foreground">@{username.replace(/^@/, "")}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPlatform && (
        <>
          {/* Generate from URL section (collapsible) */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <button
                type="button"
                onClick={() => setGenerateSectionOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium flex-1">Generate from URL</span>
                {generateSectionOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {generateSectionOpen && (
                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="qp-url" className="text-xs">URL (optional)</Label>
                    <Input
                      id="qp-url"
                      type="url"
                      placeholder="https://example.com/blog-post"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="qp-editorial" className="text-xs">Editorial Direction (optional)</Label>
                    <Textarea
                      id="qp-editorial"
                      placeholder="e.g., Focus on the artist's technique..."
                      value={editorialDirection}
                      onChange={(e) => setEditorialDirection(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs">Tone</Label>
                      <span className="text-xs text-muted-foreground">
                        {voiceIntensity} &mdash; {getToneLabel(voiceIntensity)}
                      </span>
                    </div>
                    <Slider
                      value={[voiceIntensity]}
                      onValueChange={([v]) => setVoiceIntensity(v)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      <a href="/dashboard/settings/brands" className="text-primary hover:underline">Edit tone dimensions</a>
                    </p>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || isCreating || isScraping}
                    className="w-full"
                  >
                    {isScraping ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scraping URL...</>
                    ) : isGenerating ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Generate Draft</>
                    )}
                  </Button>

                  {/* SSE progress */}
                  {progressLog.length > 0 && (
                    <div className="space-y-1 text-xs">
                      {progressLog.map((event, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start gap-2 py-0.5",
                            event.status === "error" && "text-destructive",
                            event.status === "success" && "text-green-600 dark:text-green-400"
                          )}
                        >
                          {event.status === "running" && (
                            <Loader2 className="h-3 w-3 animate-spin shrink-0 mt-0.5" />
                          )}
                          {event.status === "success" && (
                            <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                          )}
                          {event.status === "error" && (
                            <span className="text-destructive shrink-0">!</span>
                          )}
                          <span>
                            {event.message}
                            {event.detail && (
                              <span className="text-muted-foreground ml-1">{event.detail}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">or write directly</span>
            </div>
          </div>

          {/* Editor section */}
          {post ? (
            <QuickPostEditor
              key={post.id + "-" + (post.content?.length || 0)}
              post={post}
              campaign={campaign!}
              platform={selectedPlatform}
              invalidateKeys={invalidateKeys}
              onPostUpdate={setPost}
            />
          ) : (
            <Card>
              <CardContent className="py-6">
                {isCreating ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Setting up...
                  </div>
                ) : (
                  <Textarea
                    placeholder="Start writing your post..."
                    rows={4}
                    className="resize-none"
                    onFocus={async () => {
                      // Create phantom on first interaction with the editor
                      const result = await ensurePost();
                      if (!result) return;
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── My Posts section ──────────────────────────────────── */}
      {quickPostCampaigns.length > 0 && (
        <>
          <div className="pt-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">My Posts</h2>
          </div>
          <Card>
            <CardContent className="pt-4 pb-2">
              <div className="divide-y divide-border">
                {quickPostCampaigns.map((qp) => {
                  // Derive a meaningful title: scraped page title (in description),
                  // or cleaned campaign name, or URL
                  const title = qp.description
                    || qp.name?.replace("Quick Post: ", "")
                    || qp.url?.replace(/^https?:\/\//, "").replace(/\/$/, "")
                    || "Untitled";
                  const platformLabel = qp.targetPlatforms?.join(", ") || "";
                  return (
                    <Link
                      key={qp.id}
                      href={`/dashboard/campaigns/${qp.id}`}
                      className="flex items-center gap-3 py-3 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                    >
                      {qp.imageUrl ? (
                        <img src={qp.imageUrl} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                          <PenSquare className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{title}</p>
                        <p className="text-xs text-muted-foreground">
                          {qp.status}{platformLabel ? ` · ${platformLabel}` : ""}
                          {qp.createdAt ? ` · ${new Date(qp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Image picker modal */}
      {showImagePicker && scrapedImages && (
        <ImagePicker
          images={scrapedImages}
          onSelect={handleImageSelect}
          onSkip={handleImageSkip}
          isOpen={showImagePicker}
        />
      )}
    </div>
  );
}

// ── Editor Sub-Component ─────────────────────────────────────────────

interface QuickPostEditorProps {
  post: Post;
  campaign: Campaign;
  platform: Platform;
  invalidateKeys: string[][];
  onPostUpdate: (post: Post) => void;
}

function QuickPostEditor({ post, campaign, platform, invalidateKeys, onPostUpdate }: QuickPostEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showAddImage, setShowAddImage] = useState(false);
  const [showCoverSlideDesigner, setShowCoverSlideDesigner] = useState(false);
  const [coverSlideKey, setCoverSlideKey] = useState(0);
  const [showCardImageSelector, setShowCardImageSelector] = useState(false);
  const [newCardImageIndex, setNewCardImageIndex] = useState<number | null>(null);
  const [cardInsertPosition, setCardInsertPosition] = useState<"prepend" | "append">("prepend");

  // Schedule picker state
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  const platformLower = toPlatformId(post.platform);
  const isPublished = post.status === "Published";

  // ── Shared hooks ──────────────────────────────────────────────────────

  const media = usePostMedia({
    postId: post.id,
    initialItems: buildMediaItems(post),
    invalidateKeys,
  });
  const { mediaItems, mediaImages, setMediaItems } = media;

  const content = usePostContent({
    postId: post.id,
    initialContent: post.content || "",
    invalidateKeys,
  });

  const carousel = useCarousel({
    postId: post.id,
    onMediaUpdate: setMediaItems,
    invalidateKeys,
  });

  const optimize = useImageOptimize({
    postId: post.id,
    platform: post.platform,
    onMediaUpdate: setMediaItems,
    mediaItems,
    saveMutation: media.saveImagesMutation,
    invalidateKeys,
  });

  // ── Approve + Publish ──────────────────────────────────────────────────

  const [isApproving, setIsApproving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const approveAndPublish = async (scheduledFor?: string) => {
    // Save any unsaved content first
    if (content.editedContent !== (post.content || "")) {
      content.saveContent();
      // Wait briefly for save to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // First approve, then publish
    setIsPublishing(true);
    try {
      // Approve if still Pending
      if (post.status === "Pending") {
        setIsApproving(true);
        const approveRes = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Approved" }),
        });
        if (!approveRes.ok) throw new Error("Failed to approve post");
        setIsApproving(false);
      }

      // Publish
      const publishRes = await fetch(`/api/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: scheduledFor || undefined }),
      });
      if (!publishRes.ok) {
        const data = await publishRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish");
      }

      toast.success(
        scheduledFor
          ? `Scheduled for ${new Date(scheduledFor).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : `Published to ${PLATFORM_ID_TO_AIRTABLE[platform] || platform} -- scheduled in ~2 min`
      );
      router.push("/dashboard/calendar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setIsPublishing(false);
      setIsApproving(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────

  const optimizeTarget = PLATFORM_OPTIMIZE_TARGETS[platformLower];
  const optimizeTooltip = optimizeTarget
    ? `AI outpaint to ${optimizeTarget.label} (${optimizeTarget.w}x${optimizeTarget.h})`
    : "Optimize image for this platform";

  const slidesApplied = carousel.slidesLocalState === "applied" ? true
    : carousel.slidesLocalState === "reset" ? false
    : !!post.originalMedia;

  const [showOutpaintSelector, setShowOutpaintSelector] = useState(false);

  const canAddCoverSlide = SLIDE_PLATFORMS.includes(platformLower) && mediaImages.length >= 1 && !isPublished;
  const savedCoverSlideData: CoverSlideData | null = (() => {
    try {
      if (!post.coverSlideData) return null;
      const data: CoverSlideData = JSON.parse(post.coverSlideData);
      if (data.appliedUrl && mediaItems[0]?.url !== data.appliedUrl) return null;
      return data;
    } catch { return null; }
  })();

  const hasCoverSlide = !!savedCoverSlideData;
  const frameableImages = hasCoverSlide ? mediaImages.length - 1 : mediaImages.length;
  const canGenerateSlides = SLIDE_PLATFORMS.includes(platformLower) && frameableImages >= 1
    && mediaImages.length >= 2
    && !slidesApplied
    && (platformLower === "bluesky" || mediaItems.some((m) => m.caption));

  const eligibleOutpaintIndices = useMemo(
    () => getEligibleOutpaintIndices(mediaItems, post.coverSlideData),
    [mediaItems, post.coverSlideData]
  );

  // ── Media toolbar ──────────────────────────────────────────────────────

  const mediaToolbar = !isPublished ? (
    <div className="flex flex-wrap items-center gap-1.5">
      {!slidesApplied && (
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => setShowAddImage(!showAddImage)}
          title="Add images — multiple images will post as a carousel on supported platforms"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      )}
      {!slidesApplied && mediaImages.length === 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7 px-2"
          onClick={() => {
            media.removeImage(0);
            setShowAddImage(true);
          }}
        >
          <ArrowLeftRight className="h-3 w-3 mr-1" />
          Replace
        </Button>
      )}
      {!slidesApplied && eligibleOutpaintIndices.length >= 1 && optimizeTarget && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7 px-2"
          onClick={() => {
            if (eligibleOutpaintIndices.length === 1) {
              optimize.startBatchOptimize(eligibleOutpaintIndices);
            } else {
              setShowOutpaintSelector(true);
            }
          }}
          disabled={optimize.optimizeMutation.isPending}
          title={optimizeTooltip}
        >
          {optimize.optimizeMutation.isPending ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {optimize.batchProgress && optimize.batchProgress.total > 1
                ? `Optimizing ${optimize.batchProgress.current}/${optimize.batchProgress.total}...`
                : "Optimizing..."}
            </>
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
          onClick={() => {
            if (!hasCoverSlide && eligibleOutpaintIndices.length === 1) {
              setNewCardImageIndex(null);
              setCardInsertPosition("prepend");
              setCoverSlideKey((k) => k + 1);
              setShowCoverSlideDesigner(true);
            } else {
              setShowCardImageSelector(true);
            }
          }}
          title="Add a designed card — editorial covers, quote cards, and more"
        >
          <LayoutTemplate className="h-3 w-3 mr-1" /> Cards
        </Button>
      )}
      {canGenerateSlides && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7 px-2"
          onClick={() => carousel.generatePreview(undefined)}
          disabled={carousel.previewMutation.isPending}
          title={`Frame each image as a ${platformLower === "linkedin" || platformLower === "bluesky" ? "1:1" : "4:5"} slide with caption overlay — designed cards are preserved`}
        >
          {carousel.previewMutation.isPending ? (
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
          onClick={() => carousel.resetMutation.mutate()}
          disabled={carousel.resetMutation.isPending}
          title="Reset to original images"
        >
          {carousel.resetMutation.isPending ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Resetting...</>
          ) : (
            <><RotateCcw className="h-3 w-3 mr-1" /> Reset Slides</>
          )}
        </Button>
      )}
    </div>
  ) : null;

  return (
    <>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Media gallery */}
          <MediaGallery
            mediaItems={mediaItems}
            mediaImages={mediaImages}
            platform={platformLower}
            isPublished={isPublished}
            slidesApplied={slidesApplied}
            onImageClick={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
            onRemoveImage={media.removeImage}
            onReorderImages={media.reorderImages}
            onUpdateCaption={media.updateCaption}
            onSaveCaption={media.saveCaption}
            toolbarSlot={mediaToolbar}
          />

          {/* Add image panel */}
          {showAddImage && (
            <div className="space-y-2">
              {campaign?.scrapedImages && campaign.scrapedImages.length > 0 && (
                <CampaignImageLibrary
                  scrapedImages={campaign.scrapedImages}
                  existingUrls={new Set(mediaItems.map((m) => m.url))}
                  onAdd={(url, caption) => media.addImageUrl(url, caption)}
                />
              )}
              <ImageDropZone
                onFileUpload={(file) => media.uploadImageMutation.mutate(file)}
                onUrlAdd={(url) => { media.addImageUrl(url); setShowAddImage(false); }}
                isUploading={media.uploadImageMutation.isPending}
                onClose={() => setShowAddImage(false)}
              />
            </div>
          )}

          {/* Content editor - always in editing mode, saves on blur */}
          <div onBlur={() => {
            if (content.editedContent !== (post.content || "")) {
              content.saveContent();
            }
          }}>
            <ContentEditor
              content={post.content || ""}
              platform={platformLower}
              readOnly={isPublished}
              alwaysEditing
              isEditing={true}
              editedContent={content.editedContent}
              onEditedContentChange={content.setEditedContent}
              onStartEditing={content.startEditing}
              onCancelEditing={content.cancelEditing}
              onSave={content.saveContent}
              isSaving={content.saveContentMutation.isPending}
              saveDisabled={content.editedContent === (post.content || "")}
            />
          </div>

          {/* Instagram collaboration — collaborators & image tags */}
          {platformLower === "instagram" && (
            <CollaborationSection
              key={post.id}
              postId={post.id}
              collaborators={(() => {
                try { return post.collaborators ? JSON.parse(post.collaborators) : []; }
                catch { return []; }
              })()}
              userTags={(() => {
                try { return post.userTags ? JSON.parse(post.userTags) : []; }
                catch { return []; }
              })()}
              isPublished={isPublished}
              onPostChange={(fields) => onPostUpdate({ ...post, ...fields })}
            />
          )}

          {/* First Comment / Hashtags (Instagram / Facebook / LinkedIn) */}
          <PostFirstComment
            post={post}
            isPublished={isPublished}
            onPostChange={onPostUpdate}
          />

          {/* Action bar */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {showSchedulePicker ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="text-xs border border-border rounded px-2 py-1.5 bg-background"
                  min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                />
                <Button
                  size="sm"
                  onClick={() => approveAndPublish(new Date(scheduleDateTime).toISOString())}
                  disabled={isPublishing || !scheduleDateTime}
                >
                  {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                  {isPublishing ? "" : "Schedule"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setShowSchedulePicker(false); setScheduleDateTime(""); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => approveAndPublish()}
                  disabled={isPublishing || !(content.editedContent || post.content)}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {isPublishing ? "Publishing..." : "Publish Now"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setShowSchedulePicker(true)}
                  disabled={!(content.editedContent || post.content)}
                >
                  <Clock className="mr-1 h-3 w-3" />
                  Schedule
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    if (content.editedContent !== (post.content || "")) {
                      content.saveContent();
                    }
                    toast.success("Draft saved");
                    router.push("/dashboard/quick-post");
                  }}
                >
                  Save Draft
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lightbox */}
      <Lightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={mediaImages}
        mediaItems={mediaItems}
        initialIndex={lightboxIndex}
        slidesApplied={slidesApplied}
      />

      {/* Cover slide designer */}
      {showCoverSlideDesigner && (
        <CoverSlideDesigner
          key={coverSlideKey}
          postId={post.id}
          platform={platformLower}
          brandId={campaign?.brandIds?.[0]}
          brandHandle={currentBrand?.instagramHandle || ""}
          brandLogoUrl={currentBrand?.logoTransparentDark || currentBrand?.logoTransparentLight || null}
          brandLogoLightUrl={currentBrand?.logoTransparentLight || null}
          brandLogoDarkUrl={currentBrand?.logoTransparentDark || null}
          brandWebsiteUrl={currentBrand?.websiteUrl || null}
          savedData={newCardImageIndex !== null ? null : savedCoverSlideData}
          insertPosition={cardInsertPosition}
          availableImages={
            newCardImageIndex !== null
              ? [mediaItems[newCardImageIndex]].filter(Boolean)
              : mediaItems.filter((_, i) => {
                  if (savedCoverSlideData?.appliedUrl && i === 0 && mediaItems[0]?.url === savedCoverSlideData.appliedUrl) return false;
                  return true;
                })
          }
          onApply={(newMediaItems) => {
            setMediaItems(newMediaItems);
            setShowCoverSlideDesigner(false);
            setNewCardImageIndex(null);
            queryClient.invalidateQueries({ queryKey: ["campaign"] });
          }}
          onRemove={(restoredItems) => {
            setMediaItems(restoredItems);
            setShowCoverSlideDesigner(false);
            setNewCardImageIndex(null);
            queryClient.invalidateQueries({ queryKey: ["campaign"] });
          }}
          onClose={() => { setShowCoverSlideDesigner(false); setNewCardImageIndex(null); }}
        />
      )}

      {/* Card image selector */}
      {showCardImageSelector && (
        <CardImageSelector
          mediaItems={mediaItems}
          eligibleIndices={eligibleOutpaintIndices}
          hasExistingCover={hasCoverSlide}
          isOpen={showCardImageSelector}
          onSelectImage={(idx) => {
            setShowCardImageSelector(false);
            setNewCardImageIndex(idx);
            setCardInsertPosition(hasCoverSlide ? "append" : "prepend");
            setCoverSlideKey((k) => k + 1);
            setShowCoverSlideDesigner(true);
          }}
          onEditExisting={() => {
            setShowCardImageSelector(false);
            setNewCardImageIndex(null);
            setCardInsertPosition("prepend");
            setCoverSlideKey((k) => k + 1);
            setShowCoverSlideDesigner(true);
          }}
          onClose={() => setShowCardImageSelector(false)}
        />
      )}

      {/* Carousel slide preview overlay */}
      {carousel.carouselPreviews && (
        <CarouselPreviewOverlay
          previews={carousel.carouselPreviews}
          platform={platformLower}
          isPreviewing={carousel.previewMutation.isPending}
          isApplying={carousel.applyMutation.isPending}
          eyedropperMode={carousel.eyedropperMode}
          perSlideOptions={carousel.perSlideOptions}
          onEyedropperToggle={(mode) => {
            carousel.setEyedropperMode(
              carousel.eyedropperMode?.mode === mode ? null : { slideIndex: -1, mode }
            );
          }}
          onSlideClick={carousel.handleSlideClick}
          onResetOptions={carousel.resetAllOptions}
          onApply={() => carousel.applyMutation.mutate()}
          onClose={carousel.closePreview}
        />
      )}

      {/* Optimize preview */}
      {optimize.optimizePreview && (
        <OptimizePreviewDialog
          preview={optimize.optimizePreview}
          platform={platformLower}
          onAccept={optimize.acceptOptimization}
          onReject={optimize.rejectOptimization}
          onRetry={optimize.retryCurrentOptimization}
        />
      )}

      {showOutpaintSelector && optimizeTarget && (
        <OutpaintImageSelector
          mediaItems={mediaItems}
          eligibleIndices={eligibleOutpaintIndices}
          targetLabel={optimizeTarget.label}
          isOpen={showOutpaintSelector}
          onSelect={(indices) => {
            setShowOutpaintSelector(false);
            optimize.startBatchOptimize(indices);
          }}
          onClose={() => setShowOutpaintSelector(false)}
        />
      )}
    </>
  );
}
