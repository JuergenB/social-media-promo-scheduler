"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { X, ArrowLeft } from "lucide-react";
import type { MediaItem } from "@/lib/media-items";

// ── Wheel debounce ─────────────────────────────────────────────────────

let _wheelCooldown = false;
function wheelNav(delta: number, onPrev: () => void, onNext: () => void) {
  if (_wheelCooldown) return;
  if (delta > 0) onNext(); else onPrev();
  _wheelCooldown = true;
  setTimeout(() => { _wheelCooldown = false; }, 300);
}

// ── Keyboard handler ───────────────────────────────────────────────────

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

// ── Lightbox component ─────────────────────────────────────────────────

interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  mediaItems?: MediaItem[];
  initialIndex?: number;
  /** Whether captions are baked into slides (hides caption text) */
  slidesApplied?: boolean;
}

export function Lightbox({
  open,
  onOpenChange,
  images,
  mediaItems,
  initialIndex = 0,
  slidesApplied = false,
}: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  // Sync index when initialIndex changes (e.g. clicking different image)
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const onClose = () => onOpenChange(false);
  const onPrev = () => setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  const onNext = () => setIndex((i) => (i < images.length - 1 ? i + 1 : 0));

  if (!open || images.length === 0) return null;

  const caption = mediaItems?.[index]?.caption;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-none !w-screen !h-screen !p-0 !border-none !bg-black/92 !rounded-none flex flex-col items-center justify-center gap-0 !translate-x-0 !translate-y-0 !top-0 !left-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e: React.WheelEvent) => {
          if (images.length <= 1) return;
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (Math.abs(delta) < 20) return;
          wheelNav(
            delta,
            () => setIndex((i) => Math.max(i - 1, 0)),
            () => setIndex((i) => Math.min(i + 1, images.length - 1))
          );
        }}
        onTouchStart={(e: React.TouchEvent) => {
          (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX);
        }}
        onTouchEnd={(e: React.TouchEvent) => {
          const startX = Number((e.currentTarget as HTMLElement).dataset.touchX);
          const diff = startX - e.changedTouches[0].clientX;
          if (Math.abs(diff) < 50 || images.length <= 1) return;
          if (diff > 0) onNext(); else onPrev();
        }}
      >
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <LightboxKeyHandler
          imageCount={images.length}
          onPrev={onPrev}
          onNext={onNext}
          onClose={onClose}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Image */}
        <img
          src={images[index]}
          alt={caption || `Image ${index + 1}`}
          className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          draggable={false}
        />

        {/* Bottom bar — caption, arrows, dots */}
        <div className="flex flex-col items-center gap-2 mt-4">
          {caption && !slidesApplied && (
            <p className="text-white/70 text-sm text-center max-w-md truncate">
              {caption}
            </p>
          )}
          {images.length > 1 && (
            <div className="flex items-center gap-4">
              <button
                onClick={onPrev}
                className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "rounded-full transition-all",
                      i === index
                        ? "w-2.5 h-2.5 bg-white"
                        : "w-2 h-2 bg-white/30 hover:bg-white/50"
                    )}
                  />
                ))}
              </div>
              <button
                onClick={onNext}
                className="text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 rotate-180" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
