"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp, ImageIcon } from "lucide-react";

interface ScrapedImage {
  url: string;
  alt: string;
  storyTitle?: string;
}

interface CampaignImageLibraryProps {
  /** All images scraped from the campaign source URL */
  scrapedImages: ScrapedImage[];
  /** URLs already attached to the current post (to mark as "already added") */
  existingUrls: Set<string>;
  /** Called when user clicks an image to add it */
  onAdd: (url: string) => void;
}

export function CampaignImageLibrary({
  scrapedImages,
  existingUrls,
  onAdd,
}: CampaignImageLibraryProps) {
  const [expanded, setExpanded] = useState(true);

  // Deduplicate and filter out broken/tiny thumbnails
  const images = useMemo(() => {
    const seen = new Set<string>();
    return scrapedImages.filter((img) => {
      if (!img.url || seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  }, [scrapedImages]);

  if (images.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <ImageIcon className="h-3 w-3" />
        <span>Campaign images ({images.length})</span>
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
          {images.map((img) => {
            const alreadyAdded = existingUrls.has(img.url);
            return (
              <button
                key={img.url}
                type="button"
                onClick={() => { if (!alreadyAdded) onAdd(img.url); }}
                disabled={alreadyAdded}
                title={img.alt || "Campaign image"}
                className={cn(
                  "relative shrink-0 w-16 h-16 rounded-md overflow-hidden border transition-all group",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  alreadyAdded
                    ? "border-muted opacity-50 cursor-default"
                    : "border-transparent hover:border-primary cursor-pointer"
                )}
              >
                <img
                  src={img.url}
                  alt={img.alt || ""}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).parentElement!.style.display = "none";
                  }}
                />
                {alreadyAdded && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Check className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                {!alreadyAdded && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
