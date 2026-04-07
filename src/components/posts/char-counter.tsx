"use client";

import { cn } from "@/lib/utils";
import { PLATFORM_CHAR_LIMITS } from "@/lib/platform-constants";

interface CharCounterProps {
  count: number;
  platform?: string;
  limit?: number;
  className?: string;
}

export function CharCounter({ count, platform, limit, className }: CharCounterProps) {
  const charLimit = limit ?? (platform ? PLATFORM_CHAR_LIMITS[platform] || 0 : 0);
  const isOver = charLimit > 0 && count > charLimit;

  return (
    <p className={cn(
      "text-xs",
      isOver ? "text-destructive font-medium" : "text-muted-foreground",
      className,
    )}>
      {count}{charLimit ? ` / ${charLimit.toLocaleString()}` : ""} chars
    </p>
  );
}
