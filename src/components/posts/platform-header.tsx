"use client";

import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/shared/platform-icon";
import { cn } from "@/lib/utils";
import { POST_STATUS_CONFIG, toPlatformId } from "@/lib/platform-constants";
import type { Platform } from "@/lib/late-api";
import type { PostStatus } from "@/lib/airtable/types";

interface PlatformHeaderProps {
  platform: string;
  status: PostStatus | string;
  /** Slot for content on the left (e.g. nav arrows) */
  leftSlot?: React.ReactNode;
  /** Slot for content on the right (e.g. post counter) */
  rightSlot?: React.ReactNode;
  /** Additional info below the platform name */
  subtitle?: React.ReactNode;
  className?: string;
}

export function PlatformHeader({
  platform,
  status,
  leftSlot,
  rightSlot,
  subtitle,
  className,
}: PlatformHeaderProps) {
  const platformLower = toPlatformId(platform);
  const statusConfig = POST_STATUS_CONFIG[status as PostStatus] || { variant: "outline" as const };

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2.5", className)}>
      {leftSlot}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <PlatformBadge platform={platformLower} className="h-7 w-7 shrink-0" />
        <span className="font-medium text-sm truncate">{platform}</span>
        <Badge
          variant={statusConfig.variant}
          className={cn("text-[10px] px-1.5 py-0 shrink-0", statusConfig.className)}
        >
          {status}
        </Badge>
        {subtitle}
      </div>
      {rightSlot}
    </div>
  );
}
