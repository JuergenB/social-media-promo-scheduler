"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";
import type { MediaItem } from "@/lib/media-items";

interface OutpaintImageSelectorProps {
  /** All media items on this post */
  mediaItems: MediaItem[];
  /** Indices of media items eligible for outpainting (designed cards excluded) */
  eligibleIndices: number[];
  /** Target aspect ratio label, e.g. "4:5 portrait" */
  targetLabel: string;
  isOpen: boolean;
  onSelect: (indices: number[]) => void;
  onClose: () => void;
}

export function OutpaintImageSelector({
  mediaItems,
  eligibleIndices,
  targetLabel,
  isOpen,
  onSelect,
  onClose,
}: OutpaintImageSelectorProps) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggleImage = useCallback((idx: number) => {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  }, []);

  const handleContinue = () => {
    if (selected.length > 0) {
      onSelect(selected);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Outpaint to {targetLabel}
          </DialogTitle>
          <DialogDescription>
            Select images to outpaint. Designed cards (covers, quote cards) are excluded.
            {selected.length > 1 && " Images will be processed sequentially."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {eligibleIndices.map((idx) => {
              const item = mediaItems[idx];
              const isSelected = selected.includes(idx);
              const selectionOrder = selected.indexOf(idx) + 1;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleImage(idx)}
                  className={cn(
                    "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary ring-1 ring-primary"
                      : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img
                    src={item.url}
                    alt={item.caption || `Image ${idx + 1}`}
                    className="h-full w-full object-cover"
                    loading="eager"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />

                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {selectionOrder}
                      </span>
                    </div>
                  )}

                  {!isSelected && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-sm text-muted-foreground">
            {selected.length === 0
              ? "No images selected"
              : `${selected.length} image${selected.length > 1 ? "s" : ""} selected`}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleContinue}
              disabled={selected.length === 0}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Outpaint{selected.length > 0 ? ` ${selected.length}` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
