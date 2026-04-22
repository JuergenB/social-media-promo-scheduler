"use client";

import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns/format";
import { parseISO } from "date-fns/parseISO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
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
import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";
import { toPlatformId, PLATFORM_OPTIMIZE_TARGETS, SLIDE_PLATFORMS, POST_STATUS_CONFIG, PLATFORM_CHAR_LIMITS } from "@/lib/platform-constants";
import { buildMediaItems, usePostMedia } from "@/hooks/use-post-media";
import { usePostContent } from "@/hooks/use-post-content";
import { useCarousel } from "@/hooks/use-carousel";
import { useImageOptimize } from "@/hooks/use-image-optimize";
import { usePostActions } from "@/hooks/use-post-actions";
import { PlatformHeader } from "./platform-header";
import { ContentEditor } from "./content-editor";
import { MediaGallery } from "./media-gallery";
import { ImageDropZone } from "./image-drop-zone";
import { Lightbox } from "./lightbox";
import { CarouselPreviewOverlay } from "./carousel-preview-overlay";
import { OptimizePreviewDialog } from "./optimize-preview-dialog";
import { OutpaintImageSelector } from "./outpaint-image-selector";
import { CardImageSelector } from "./card-image-selector";
import { CampaignImageLibrary } from "./campaign-image-library";
import { RegenerateDialog } from "./regenerate-dialog";
import { FlagIssueDialog } from "./flag-issue-dialog";
import { CoverSlideDesigner } from "./cover-slide-designer";
import { CollaborationSection } from "./collaboration-section";
import { PostFirstComment } from "./post-first-comment";
import { PlatformBadge } from "@/components/shared/platform-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getEligibleOutpaintIndices } from "@/lib/media-items";
import type { Campaign, Post } from "@/lib/airtable/types";
import type { CoverSlideData } from "@/lib/cover-slide-types";
import {
  ArrowLeft,
  CalendarClock,
  CalendarIcon,
  CalendarX,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Flag,
  Layers,
  Link2,
  Send,
  Sparkles,
  Trash2,
  LayoutTemplate,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CampaignPostDetailProps {
  post: Post;
  posts: Post[];
  campaign: Campaign;
  onClose: () => void;
  onNavigate: (post: Post) => void;
}

export function CampaignPostDetail({
  post,
  posts,
  campaign,
  onClose,
  onNavigate,
}: CampaignPostDetailProps) {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [showAddImage, setShowAddImage] = useState(false);
  const [showOutpaintSelector, setShowOutpaintSelector] = useState(false);

  const platformLower = toPlatformId(post.platform);
  const isPublished = post.status === "Published";
  const articleUrl = post.shortUrl || post.linkUrl;

  // Navigation
  const currentIndex = posts.findIndex((p) => p.id === post.id);
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  // ── Shared hooks ──────────────────────────────────────────────────────

  const media = usePostMedia({
    postId: post.id,
    initialItems: buildMediaItems(post),
  });
  const { mediaItems, mediaImages, setMediaItems } = media;

  const content = usePostContent({
    postId: post.id,
    initialContent: post.content || "",
  });

  const carousel = useCarousel({
    postId: post.id,
    onMediaUpdate: setMediaItems,
  });

  const optimize = useImageOptimize({
    postId: post.id,
    platform: post.platform,
    onMediaUpdate: setMediaItems,
    mediaItems,
    saveMutation: media.saveImagesMutation,
  });

  const actions = usePostActions({
    post,
    onClose,
    onNavigateNext: nextPost ? () => onNavigate(nextPost) : undefined,
  });

  // ── Collaboration (Instagram only) ────────────────────────────────────
  const isInstagram = platformLower === "instagram";
  const collaborators: string[] = (() => {
    try { return post.collaborators ? JSON.parse(post.collaborators) : []; }
    catch { return []; }
  })();
  const userTags: string[] = (() => {
    try { return post.userTags ? JSON.parse(post.userTags) : []; }
    catch { return []; }
  })();

  // Reset state when navigating between posts
  const [prevPostId, setPrevPostId] = useState(post.id);
  if (prevPostId !== post.id) {
    setPrevPostId(post.id);
    setShowAddImage(false);
    media.resetItems(buildMediaItems(post));
    content.reset(post.content || "");
    carousel.resetState();
  }

  // ── Derived state ─────────────────────────────────────────────────────

  const optimizeTarget = PLATFORM_OPTIMIZE_TARGETS[platformLower];
  const optimizeTooltip = optimizeTarget
    ? `AI outpaint to ${optimizeTarget.label} (${optimizeTarget.w}×${optimizeTarget.h})`
    : "Optimize image for this platform";

  const eligibleOutpaintIndices = useMemo(
    () => getEligibleOutpaintIndices(mediaItems, post.coverSlideData),
    [mediaItems, post.coverSlideData]
  );

  const slidesApplied = carousel.slidesLocalState === "applied" ? true
    : carousel.slidesLocalState === "reset" ? false
    : !!post.originalMedia;

  // Cover slide state — must be computed before canGenerateSlides
  const [showCoverSlideDesigner, setShowCoverSlideDesigner] = useState(false);
  const [coverSlideKey, setCoverSlideKey] = useState(0);
  const [showCardImageSelector, setShowCardImageSelector] = useState(false);
  // When creating a new card (not editing existing), track the selected image and insert position
  const [newCardImageIndex, setNewCardImageIndex] = useState<number | null>(null);
  const [cardInsertPosition, setCardInsertPosition] = useState<"prepend" | "append">("prepend");
  const canAddCoverSlide = SLIDE_PLATFORMS.includes(platformLower) && mediaImages.length >= 1 && !isPublished;
  const savedCoverSlideData: CoverSlideData | null = (() => {
    try {
      if (!post.coverSlideData) return null;
      const data: CoverSlideData = JSON.parse(post.coverSlideData);
      if (data.appliedUrl && mediaItems[0]?.url !== data.appliedUrl) return null;
      return data;
    } catch { return null; }
  })();

  // With a cover slide applied, 1 content image is enough (cover + 1 = carousel).
  // Without a cover, need 2+ images for a carousel.
  const hasCoverSlide = !!savedCoverSlideData;
  const frameableImages = hasCoverSlide ? mediaImages.length - 1 : mediaImages.length;
  const canGenerateSlides = SLIDE_PLATFORMS.includes(platformLower) && frameableImages >= 1
    && mediaImages.length >= 2
    && !slidesApplied
    && (platformLower === "bluesky" || mediaItems.some((m) => m.caption));

  // ── Toolbar for media gallery ─────────────────────────────────────────

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
            // If no existing cover and only 1 eligible image, go straight to designer
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
          title="Reset to original images (undo slide generation)"
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
    <div className="flex flex-col max-h-[90vh] min-h-[80vh] relative">
      {/* Sticky header — platform + navigation */}
      <div className="border-b border-border shrink-0 pr-10">
        <PlatformHeader
          platform={post.platform}
          status={post.status}
          leftSlot={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={!prevPost}
              onClick={() => prevPost && onNavigate(prevPost)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          }
          rightSlot={
            <>
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
            </>
          }
        />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Image gallery */}
        <div className="px-6 pt-3 pb-3 space-y-2">
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
              {campaign.scrapedImages && campaign.scrapedImages.length > 0 && (
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
        </div>

        {/* Content editor */}
        <div className="px-6 pb-3">
          <ContentEditor
            content={post.content || ""}
            platform={platformLower}
            readOnly={isPublished}
            isEditing={content.isEditing}
            editedContent={content.editedContent}
            onEditedContentChange={content.setEditedContent}
            onStartEditing={content.startEditing}
            onCancelEditing={content.cancelEditing}
            onSave={content.saveContent}
            isSaving={content.saveContentMutation.isPending}
            saveDisabled={content.editedContent === post.content}
          />
        </div>

        {/* Source link row — right-aligned, paired with char count row above */}
        <div className="px-6 pb-2 flex items-center text-xs text-muted-foreground">
          {post.notes && (
            <span className="mr-3">{post.notes}</span>
          )}
          <div className="ml-auto">
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
          </div>
        </div>

        {/* View on platform — shown for published posts with a platform URL */}
        {isPublished && post.platformPostUrl && (
          <div className="px-6 pb-2 flex">
            <a
              href={post.platformPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View on {post.platform}
            </a>
          </div>
        )}

        {/* Instagram collaboration — collaborators & image tags */}
        {isInstagram && (
          <CollaborationSection
            key={post.id}
            postId={post.id}
            collaborators={collaborators}
            userTags={userTags}
            isPublished={isPublished}
          />
        )}

        {/* First Comment / Hashtags */}
        <PostFirstComment post={post} isPublished={isPublished} />
      </div>

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
          artistHandle={campaign?.type === "Artist Profile" ? campaign.artistHandle : undefined}
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

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4 shrink-0">
        <div className="flex gap-2">
          {post.status === "Pending" && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => actions.approveMutation.mutate()}
                disabled={actions.approveMutation.isPending}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {actions.approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => actions.dismissMutation.mutate()}
                disabled={actions.dismissMutation.isPending}
              >
                {actions.dismissMutation.isPending ? "Dismissing..." : "Dismiss"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => actions.setRegenDialogOpen(true)}
                disabled={actions.regenerateMutation.isPending}
                title="Regenerate"
              >
                {actions.regenerateMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          {post.status === "Approved" && (
            <>
              {actions.showSchedulePicker ? (
                <SchedulePopover
                  initialValue={actions.scheduleDateTime}
                  isPending={actions.publishNowMutation.isPending}
                  onSchedule={(combined) => {
                    actions.setScheduleDateTime(combined);
                    actions.publishNowMutation.mutate(new Date(combined).toISOString());
                  }}
                  onCancel={() => {
                    actions.setShowSchedulePicker(false);
                    actions.setScheduleDateTime("");
                  }}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => actions.publishNowMutation.mutate(undefined)}
                    disabled={actions.publishNowMutation.isPending}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {actions.publishNowMutation.isPending ? "Publishing..." : "Publish Now"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => actions.setShowSchedulePicker(true)}
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    Schedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      actions.updateStatus("Pending").then(() => {
                        import("sonner").then(({ toast }) => toast.success("Post returned to Pending"));
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
            <>
              {actions.showSchedulePicker ? (
                <SchedulePopover
                  initialValue={actions.scheduleDateTime || post.scheduledDate || ""}
                  isPending={actions.rescheduleMutation.isPending}
                  onSchedule={(combined) => {
                    actions.setScheduleDateTime(combined);
                    actions.rescheduleMutation.mutate(new Date(combined).toISOString());
                  }}
                  onCancel={() => {
                    actions.setShowSchedulePicker(false);
                    actions.setScheduleDateTime("");
                  }}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => actions.setShowSchedulePicker(true)}
                  >
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    Reschedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Unschedule this post? It will be cancelled on Zernio and removed from lnk.bio (if applicable), then return to your Approved pool.")) {
                        actions.updateStatus("Approved", { clearZernioState: true }).then(() => {
                          import("sonner").then(({ toast }) => toast.success("Post unscheduled — back in Approved pool"));
                          onClose();
                        });
                      }
                    }}
                  >
                    <CalendarX className="mr-1.5 h-3.5 w-3.5" />
                    Unschedule
                  </Button>
                </div>
              )}
            </>
          )}
          {post.status === "Failed" && (
            <div className="flex items-center gap-1">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  actions.updateStatus("Approved", { clearZernioState: true }).then(() => {
                    import("sonner").then(({ toast }) => toast.success("Post reset to Approved — ready to re-publish"));
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
                    actions.deletePost();
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
                actions.updateStatus("Pending").then(() => {
                  import("sonner").then(({ toast }) => toast.success("Post restored to Pending"));
                });
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              title="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFlagDialogOpen(true)}>
              <Flag className="mr-2 h-3.5 w-3.5" />
              Flag Issue
            </DropdownMenuItem>
            {post.status === "Scheduled" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Delete this scheduled post? It will be cancelled on Zernio and removed from lnk.bio (if applicable).")) {
                      actions.deletePost();
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialogs */}
      <FlagIssueDialog
        open={flagDialogOpen}
        onOpenChange={setFlagDialogOpen}
        post={post}
        campaign={campaign}
      />

      <RegenerateDialog
        open={actions.regenDialogOpen}
        onOpenChange={actions.setRegenDialogOpen}
        guidance={actions.regenGuidance}
        onGuidanceChange={actions.setRegenGuidance}
        onRegenerate={() => actions.regenerateMutation.mutate(actions.regenGuidance)}
        isPending={actions.regenerateMutation.isPending}
      />

      <OptimizePreviewDialog
        preview={optimize.optimizePreview}
        platform={post.platform}
        onAccept={optimize.acceptOptimization}
        onReject={optimize.rejectOptimization}
        onRetry={optimize.retryCurrentOptimization}
      />

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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SchedulePopover — Calendar + time picker with explicit Schedule action
// inside the popover overlay (replaces the confusing native datetime-local)
// ─────────────────────────────────────────────────────────────────────────────

interface SchedulePopoverProps {
  /** datetime-local style string ("YYYY-MM-DDTHH:MM"), may be empty */
  initialValue: string;
  isPending: boolean;
  /** Called with a datetime-local style string on confirm */
  onSchedule: (combined: string) => void;
  onCancel: () => void;
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function combineLocal(date: Date | undefined, time: string): string {
  if (!date || !time) return "";
  return `${formatLocalDate(date)}T${time}`;
}

function parseInitialValue(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: "" };
  const [datePart, timePart] = value.split("T");
  if (!datePart) return { date: undefined, time: "" };
  const [y, m, d] = datePart.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return { date, time: timePart || "" };
}

function SchedulePopover({
  initialValue,
  isPending,
  onSchedule,
  onCancel,
}: SchedulePopoverProps) {
  const initial = React.useMemo(() => parseInitialValue(initialValue), [initialValue]);
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState<Date | undefined>(initial.date);
  const [time, setTime] = useState<string>(initial.time);

  const combined = combineLocal(date, time);
  const triggerLabel = combined
    ? format(new Date(combined), "MMM d, yyyy 'at' h:mm a")
    : "Pick date & time";

  const setQuickPick = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    setDate(d);
    setTime(`${pad2(hour)}:${pad2(minute)}`);
  };

  const setNextMonday = (hour: number, minute = 0) => {
    const d = new Date();
    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(hour, minute, 0, 0);
    setDate(d);
    setTime(`${pad2(hour)}:${pad2(minute)}`);
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const handleSchedule = () => {
    if (!combined) return;
    setOpen(false);
    onSchedule(combined);
  };

  const handleCancel = () => {
    setOpen(false);
    onCancel();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onCancel();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="space-y-3 p-3">
          {/* Quick picks */}
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setQuickPick(1, 9)}
            >
              Tomorrow 9 AM
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setQuickPick(1, 18)}
            >
              Tomorrow 6 PM
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNextMonday(10)}
            >
              Next Monday 10 AM
            </Button>
          </div>

          <div className="border-t" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d) => d < todayStart}
              initialFocus
            />
            <div className="space-y-2 sm:w-40">
              <Label className="text-xs">Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Local time
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSchedule}
            disabled={isPending || !combined}
          >
            {isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            {isPending ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
