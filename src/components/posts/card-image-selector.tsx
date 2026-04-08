"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, LayoutTemplate, PenLine } from "lucide-react";
import type { MediaItem } from "@/lib/media-items";

interface CardImageSelectorProps {
  mediaItems: MediaItem[];
  /** Indices of eligible images (designed cards excluded) */
  eligibleIndices: number[];
  /** Whether an existing cover slide can be edited */
  hasExistingCover: boolean;
  isOpen: boolean;
  /** User picked an image to create a new card from */
  onSelectImage: (imageIndex: number) => void;
  /** User chose to edit the existing cover */
  onEditExisting: () => void;
  onClose: () => void;
}

export function CardImageSelector({
  mediaItems,
  eligibleIndices,
  hasExistingCover,
  isOpen,
  onSelectImage,
  onEditExisting,
  onClose,
}: CardImageSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" />
            Create a Card
          </DialogTitle>
          <DialogDescription>
            Select an image to use as the card background.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {eligibleIndices.map((idx) => {
              const item = mediaItems[idx];
              const isSelected = selected === idx;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelected(idx)}
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
                      <Check className="h-7 w-7 text-primary-foreground drop-shadow" />
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
            {selected !== null
              ? `Image ${selected + 1} selected`
              : "Select an image"}
          </div>
          <div className="flex items-center gap-2">
            {hasExistingCover && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={onEditExisting}
              >
                <PenLine className="h-3.5 w-3.5 mr-1" />
                Edit existing cover
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => { if (selected !== null) onSelectImage(selected); }}
              disabled={selected === null}
            >
              <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
              Create Card
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
