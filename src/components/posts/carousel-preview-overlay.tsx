"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Layers, X, Pipette, Eraser, RotateCcw, Loader2 } from "lucide-react";
import type { CarouselPreview, SlideOption } from "@/hooks/use-carousel";

interface CarouselPreviewOverlayProps {
  previews: CarouselPreview[];
  platform: string;
  isPreviewing: boolean;
  isApplying: boolean;
  eyedropperMode: { slideIndex: number; mode: "frame" | "removeBg" } | null;
  perSlideOptions: (SlideOption | undefined)[];
  onEyedropperToggle: (mode: "frame" | "removeBg") => void;
  onSlideClick: (e: React.MouseEvent<HTMLImageElement>, slideIndex: number) => void;
  onResetOptions: () => void;
  onApply: () => void;
  onClose: () => void;
}

export function CarouselPreviewOverlay({
  previews,
  platform,
  isPreviewing,
  isApplying,
  eyedropperMode,
  perSlideOptions,
  onEyedropperToggle,
  onSlideClick,
  onResetOptions,
  onApply,
  onClose,
}: CarouselPreviewOverlayProps) {
  const platformLower = platform.toLowerCase();

  return (
    <div className="absolute inset-0 z-[60] bg-zinc-900/95 flex flex-col rounded-lg border border-zinc-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-zinc-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 text-white/70 shrink-0" />
          <span className="text-white font-medium text-sm truncate">
            {previews.length} slides ({platformLower === "linkedin" || platformLower === "bluesky" ? "1:1" : "4:5"})
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onEyedropperToggle("frame")}
            disabled={isPreviewing}
            className={cn(
              "flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors",
              eyedropperMode?.mode === "frame" ? "bg-amber-500/90" : "bg-zinc-700 hover:bg-zinc-600",
            )}
            title="Pick frame color from any slide"
          >
            <Pipette className="h-3 w-3" /> <span className="hidden sm:inline">Color</span>
          </button>
          <button
            onClick={() => onEyedropperToggle("removeBg")}
            disabled={isPreviewing}
            className={cn(
              "flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors",
              eyedropperMode?.mode === "removeBg" ? "bg-amber-500/90" : "bg-zinc-700 hover:bg-zinc-600",
            )}
            title="Click background color on any slide to remove it"
          >
            <Eraser className="h-3 w-3" /> <span className="hidden sm:inline">Remove BG</span>
          </button>
          {perSlideOptions.some(Boolean) && (
            <button
              onClick={onResetOptions}
              disabled={isPreviewing}
              className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors"
              title="Reset all to auto-detected colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button
            className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            onClick={onClose}
            disabled={isApplying}
          >
            <X className="h-4 w-4" />
          </button>
          <Button
            size="sm"
            className="bg-white text-black hover:bg-white/90 text-xs h-7"
            onClick={onApply}
            disabled={isApplying || isPreviewing}
          >
            {isApplying ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Applying...</>
            ) : (
              "Apply Slides"
            )}
          </Button>
        </div>
      </div>

      {/* Eyedropper hint */}
      {eyedropperMode && (
        <div className="bg-amber-500/20 text-amber-400 text-xs text-center py-1 shrink-0">
          {eyedropperMode.mode === "frame"
            ? "Click any slide to pick a frame color"
            : "Click a background color on any slide to remove it"}
        </div>
      )}

      {/* Slides */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 py-3 carousel-dark-scroll">
        <div className="flex gap-4 h-full items-center">
          {previews.map((slide, idx) => {
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
                      isPreviewing && "opacity-50",
                      eyedropperMode && "cursor-crosshair",
                    )}
                    onClick={(e) => onSlideClick(e, idx)}
                  />
                  {slide.frameColor && (
                    <div
                      className="absolute bottom-2 left-2 w-4 h-4 rounded-full border-2 border-white/50 shadow z-10"
                      style={{ backgroundColor: `rgb(${slide.frameColor.r},${slide.frameColor.g},${slide.frameColor.b})` }}
                      title={`Frame: rgb(${slide.frameColor.r}, ${slide.frameColor.g}, ${slide.frameColor.b})`}
                    />
                  )}
                </div>
                <span className="text-white/60 text-xs shrink-0">
                  {idx + 1}/{previews.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
