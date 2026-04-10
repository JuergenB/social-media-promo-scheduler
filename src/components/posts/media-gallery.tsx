"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, X, Maximize2 } from "lucide-react";
import type { MediaItem } from "@/lib/media-items";

interface MediaGalleryProps {
  mediaItems: MediaItem[];
  mediaImages: string[];
  platform: string;
  isPublished: boolean;
  slidesApplied: boolean;
  onImageClick: (index: number) => void;
  onRemoveImage?: (index: number) => void;
  onReorderImages?: (fromIndex: number, toIndex: number) => void;
  onUpdateCaption?: (index: number, caption: string) => void;
  onSaveCaption?: (index: number) => void;
  /** Slot for toolbar buttons below the gallery */
  toolbarSlot?: React.ReactNode;
  className?: string;
}

export function MediaGallery({
  mediaItems,
  mediaImages,
  platform,
  isPublished,
  slidesApplied,
  onImageClick,
  onRemoveImage,
  onReorderImages,
  onUpdateCaption,
  onSaveCaption,
  toolbarSlot,
  className,
}: MediaGalleryProps) {
  const platformLower = platform.toLowerCase();
  const showCaptions = platformLower !== "bluesky" && !slidesApplied;

  if (mediaImages.length === 0) {
    // No images — still render the toolbar so user can add images
    return toolbarSlot ? <div className={cn("space-y-2", className)}>{toolbarSlot}</div> : null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {mediaImages.length === 1 ? (
        /* Single image — full width with click to lightbox */
        <div
          className="rounded-lg overflow-hidden bg-muted relative group cursor-pointer"
          onClick={() => onImageClick(0)}
        >
          <img src={mediaImages[0]} alt="" className="w-full max-h-64 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
          </div>
          {!isPublished && onRemoveImage && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onRemoveImage(0); }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ) : (
        /* Multiple images — horizontal strip */
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
            {mediaImages.map((imgUrl, idx) => (
              <div key={idx} className="shrink-0 snap-start flex flex-col gap-1">
                <div
                  className={cn(
                    "relative group cursor-pointer rounded-lg overflow-hidden bg-muted",
                    slidesApplied ? "w-40" : "w-40 h-40",
                  )}
                  style={slidesApplied ? { aspectRatio: platformLower === "linkedin" || platformLower === "bluesky" ? "1/1" : "4/5" } : undefined}
                  onClick={() => onImageClick(idx)}
                >
                  <img
                    src={imgUrl}
                    alt=""
                    className={cn(slidesApplied ? "w-full h-full object-contain" : "w-40 h-40 object-cover")}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  {/* Reorder buttons */}
                  {!isPublished && onReorderImages && (
                    <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx > 0 && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onReorderImages(idx, idx - 1); }}
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </Button>
                      )}
                      {idx < mediaImages.length - 1 && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onReorderImages(idx, idx + 1); }}
                        >
                          <ArrowLeft className="h-3 w-3 rotate-180" />
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Remove button */}
                  {!isPublished && onRemoveImage && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); onRemoveImage(idx); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  {/* Slide number */}
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {idx + 1}/{mediaImages.length}
                  </span>
                </div>
                {/* Caption input */}
                {showCaptions && onUpdateCaption && (
                  <input
                    type="text"
                    placeholder="Caption..."
                    maxLength={120}
                    value={mediaItems[idx]?.caption || ""}
                    onChange={(e) => onUpdateCaption(idx, e.target.value)}
                    onBlur={() => onSaveCaption?.(idx)}
                    onKeyDown={(e) => { if (e.key === "Enter") onSaveCaption?.(idx); }}
                    readOnly={isPublished}
                    className={cn(
                      "w-40 text-[11px] px-1.5 py-1 border border-border rounded bg-background text-foreground truncate",
                      isPublished && "opacity-60 cursor-default",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {mediaImages.length} images — will post as carousel on supported platforms
          </p>
        </>
      )}

      {/* Toolbar slot — action buttons */}
      {toolbarSlot}
    </div>
  );
}
