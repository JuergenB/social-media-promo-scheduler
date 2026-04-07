/**
 * Shared platform constants — used by campaign detail, calendar, and compose pages.
 */
import type { Platform } from "@/lib/late-api";
import type { PostStatus } from "@/lib/airtable/types";

// ── Platform ID mapping ────────────────────────────────────────────────

/** Map Airtable platform select values to Zernio platform IDs */
const AIRTABLE_TO_PLATFORM: Record<string, Platform> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
  YouTube: "youtube",
  Reddit: "reddit",
  Telegram: "telegram",
  Snapchat: "snapchat",
  "Google Business": "googlebusiness",
};

export function toPlatformId(airtableValue: string): Platform {
  return AIRTABLE_TO_PLATFORM[airtableValue] || airtableValue.toLowerCase() as Platform;
}

// ── Character limits per platform ──────────────────────────────────────

export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  threads: 500,
  bluesky: 300,
  twitter: 280,
  linkedin: 3000,
  facebook: 63206,
  pinterest: 500,
  tiktok: 4000,
};

// ── Platform aspect ratio targets for AI optimization ──────────────────

export const PLATFORM_OPTIMIZE_TARGETS: Record<string, { w: number; h: number; label: string }> = {
  instagram: { w: 1080, h: 1350, label: "4:5 portrait" },
  pinterest: { w: 1000, h: 1500, label: "2:3 tall pin" },
  threads: { w: 1440, h: 1920, label: "3:4" },
  tiktok: { w: 1080, h: 1920, label: "9:16 vertical" },
  bluesky: { w: 1000, h: 1000, label: "1:1 square" },
  facebook: { w: 1080, h: 1350, label: "4:5 portrait" },
  linkedin: { w: 1200, h: 1200, label: "1:1 square" },
};

// ── Platforms that support carousel slides ──────────────────────────────

export const SLIDE_PLATFORMS = ["instagram", "threads", "linkedin", "bluesky"];

// ── Post status styling ────────────────────────────────────────────────

export const POST_STATUS_CONFIG: Record<
  PostStatus,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  Pending: { variant: "outline" },
  Approved: {
    variant: "secondary",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  Modified: {
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  Dismissed: { variant: "secondary", className: "opacity-50" },
  Queued: {
    variant: "secondary",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  Scheduled: {
    variant: "secondary",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  Published: {
    variant: "secondary",
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  Failed: { variant: "destructive" },
};
