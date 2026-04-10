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
import { Check, ImageIcon, Layers, Star } from "lucide-react";

export interface ScrapedImageItem {
  url: string;
  alt?: string;
  caption?: string;
  featured?: boolean;
}

export interface SelectedImage {
  url: string;
  caption: string;
}

interface ImagePickerProps {
  images: ScrapedImageItem[];
  onSelect: (selected: SelectedImage[]) => void;
  onSkip: () => void;
  isOpen: boolean;
}

export function ImagePicker({ images, onSelect, onSkip, isOpen }: ImagePickerProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleImage = useCallback((url: string) => {
    setSelected((prev) => {
      if (prev.includes(url)) {
        return prev.filter((u) => u !== url);
      }
      return [...prev, url];
    });
  }, []);

  const handleContinue = () => {
    if (selected.length > 0) {
      // Map selected URLs to { url, caption } — prefer figcaption over alt text
      const result: SelectedImage[] = selected.map((url) => {
        const img = images.find((i) => i.url === url);
        return { url, caption: img?.caption || img?.alt || "" };
      });
      onSelect(result);
    }
  };

  const featuredImage = images.find((img) => img.featured);
  const isCarousel = selected.length > 1;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Choose Images
          </DialogTitle>
          <DialogDescription>
            Select one image for a single post, or multiple for a carousel.
          </DialogDescription>
        </DialogHeader>

        {/* Image grid */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
          {images.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No images found on this page.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((img, idx) => {
                const isSelected = selected.includes(img.url);
                const selectionOrder = selected.indexOf(img.url) + 1;

                return (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => toggleImage(img.url)}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent hover:border-muted-foreground/30"
                    )}
                  >
                    {/* Image */}
                    <img
                      src={img.url}
                      alt={img.alt || `Image ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading={idx < 8 ? "eager" : "lazy"}
                      onError={(e) => {
                        // Hide broken images
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />

                    {/* Featured badge */}
                    {img.featured && (
                      <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        <Star className="h-2.5 w-2.5" />
                        Featured
                      </span>
                    )}

                    {/* Selection overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {selectionOrder}
                        </span>
                      </div>
                    )}

                    {/* Hover check hint (not selected) */}
                    {!isSelected && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-60 transition-opacity drop-shadow" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-sm text-muted-foreground">
            {selected.length === 0 ? (
              "No images selected"
            ) : isCarousel ? (
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                {selected.length} images selected (carousel)
              </span>
            ) : (
              `${selected.length} image selected`
            )}
          </div>
          <div className="flex items-center gap-2">
            {featuredImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="text-xs text-muted-foreground"
              >
                Skip — use featured image
              </Button>
            )}
            {images.length === 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
              >
                Continue without images
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleContinue}
                disabled={selected.length === 0}
              >
                Continue{selected.length > 0 ? ` with ${selected.length}` : ""}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
