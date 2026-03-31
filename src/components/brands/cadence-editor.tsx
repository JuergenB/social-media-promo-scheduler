"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformIcon } from "@/components/shared/platform-icon";
import type { Platform } from "@/lib/late-api";
import { toast } from "sonner";
import { Save, RotateCcw, Clock, ChevronDown, ChevronUp, Plus, Minus, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTimezoneOptions, formatTimezoneDisplay } from "@/lib/timezones";
import type { Brand, PlatformCadenceConfig, PlatformCadenceEntry, TimeWindow } from "@/lib/airtable/types";
import {
  CADENCE_PLATFORMS,
  PLATFORM_LABELS,
  GLOBAL_CADENCE_DEFAULTS,
  PLATFORM_TIME_WINDOWS,
} from "@/lib/platform-cadence-defaults";
import { useAccounts } from "@/hooks/use-accounts";
import { useBrand } from "@/lib/brand-context";

// ── Constants ─────────────────────────────────────────────────────────

const DAYS = [
  { key: 0, label: "Sun", short: "S" },
  { key: 1, label: "Mon", short: "M" },
  { key: 2, label: "Tue", short: "T" },
  { key: 3, label: "Wed", short: "W" },
  { key: 4, label: "Thu", short: "T" },
  { key: 5, label: "Fri", short: "F" },
  { key: 6, label: "Sat", short: "S" },
];

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string; description: string }[] = [
  { value: "morning", label: "Morning", description: "" },
  { value: "afternoon", label: "Afternoon", description: "" },
  { value: "evening", label: "Evening", description: "" },
];

function getTimeDescription(platform: string, window: TimeWindow): string {
  const map = PLATFORM_TIME_WINDOWS[platform];
  if (!map) return "";
  const hours = map[window];
  if (!hours || hours.length === 0) return "";
  const fmt = (h: number) => h <= 12 ? `${h}am` : `${h - 12}pm`;
  if (hours.length === 1) return fmt(hours[0]);
  return `${fmt(hours[0])}–${fmt(hours[hours.length - 1])}`;
}

// ── Component ─────────────────────────────────────────────────────────

interface CadenceEditorProps {
  brand: Brand;
  /** When true, the editor is always expanded (no collapse toggle). Used inside Sheet panels. */
  alwaysExpanded?: boolean;
}

export function CadenceEditor({ brand, alwaysExpanded = false }: CadenceEditorProps) {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  const [expanded, setExpanded] = useState(alwaysExpanded);

  // Local draft state — start from brand's saved cadence or empty
  const [timezone, setTimezone] = useState(brand.timezone || "America/New_York");
  const [cadence, setCadence] = useState<PlatformCadenceConfig>(
    brand.platformCadence || {}
  );
  const [dirty, setDirty] = useState(false);

  // We can only fetch accounts from the Zernio API when this brand matches
  // the currently-selected brand (because the SDK client uses that brand's API key).
  const isCurrentBrand = currentBrand?.id === brand.id;

  // Fetch connected accounts — only reliable for the currently active brand
  const { data: accountsData, isLoading: accountsLoading } = useAccounts(
    isCurrentBrand ? (brand.zernioProfileId || undefined) : undefined
  );
  const connectedPlatforms = useMemo(() => {
    if (!isCurrentBrand || !accountsData?.accounts) return null; // null = unknown
    return new Set<string>(
      accountsData.accounts
        .filter((a: { isActive: boolean }) => a.isActive)
        .map((a: { platform: string }) => a.platform)
    );
  }, [accountsData, isCurrentBrand]);

  // Platforms with saved cadence config (preserve even if account disconnected)
  const platformsWithCadence = useMemo(() => {
    return new Set<string>(Object.keys(cadence));
  }, [cadence]);

  // Show only connected + cadence-configured platforms when we know the accounts;
  // otherwise show all platforms (we can't tell which are connected for other brands)
  const visiblePlatforms = useMemo(() => {
    if (connectedPlatforms === null) {
      // Unknown — show all platforms
      return [...CADENCE_PLATFORMS];
    }
    return CADENCE_PLATFORMS.filter(
      (p) => connectedPlatforms.has(p) || platformsWithCadence.has(p)
    );
  }, [connectedPlatforms, platformsWithCadence]);

  const hasNoConnectedPlatforms = isCurrentBrand && !accountsLoading && connectedPlatforms !== null && connectedPlatforms.size === 0;

  // Keep expanded in sync when alwaysExpanded prop changes
  useEffect(() => {
    if (alwaysExpanded) setExpanded(true);
  }, [alwaysExpanded]);

  // Warn user before losing unsaved cadence changes (browser nav, refresh, tab close)
  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: brand.id,
          timezone,
          platformCadence: cadence,
        }),
      });
      if (!res.ok) throw new Error("Failed to save cadence");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      setDirty(false);
      toast.success("Posting cadence saved");
    },
    onError: () => {
      toast.error("Failed to save posting cadence");
    },
  });

  // Get effective entry: brand override → global default
  const getEntry = (platform: string): PlatformCadenceEntry => {
    return cadence[platform] || GLOBAL_CADENCE_DEFAULTS[platform] || {
      postsPerWeek: 3,
      activeDays: [1, 2, 3, 4, 5],
      timeWindows: ["morning", "afternoon"] as TimeWindow[],
    };
  };

  const isCustomized = (platform: string) => !!cadence[platform];

  const updatePlatform = (platform: string, updates: Partial<PlatformCadenceEntry>) => {
    const current = getEntry(platform);
    setCadence((prev) => ({
      ...prev,
      [platform]: { ...current, ...updates },
    }));
    setDirty(true);
  };

  const resetPlatform = (platform: string) => {
    setCadence((prev) => {
      const next = { ...prev };
      delete next[platform];
      return next;
    });
    setDirty(true);
  };

  const toggleDay = (platform: string, day: number) => {
    const entry = getEntry(platform);
    const current = entry.activeDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    updatePlatform(platform, { activeDays: next });
  };

  const toggleTimeWindow = (platform: string, window: TimeWindow) => {
    const entry = getEntry(platform);
    const current = entry.timeWindows;
    const next = current.includes(window)
      ? current.filter((w) => w !== window)
      : [...current, window];
    // Must have at least one window
    if (next.length === 0) return;
    updatePlatform(platform, { timeWindows: next });
  };

  const adjustPostsPerWeek = (platform: string, delta: number) => {
    const entry = getEntry(platform);
    const next = Math.max(1, Math.min(28, entry.postsPerWeek + delta));
    updatePlatform(platform, { postsPerWeek: next });
  };

  const tzOptions = getTimezoneOptions(brand.timezone, timezone);

  return (
    <div className="space-y-4">
      {!alwaysExpanded && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <Clock className="h-3 w-3" />
            Posting Cadence
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {dirty && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="h-3 w-3 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save Cadence"}
            </Button>
          )}
        </div>
      )}

      {alwaysExpanded && dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-3 w-3 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Cadence"}
          </Button>
        </div>
      )}

      {!alwaysExpanded && !expanded && (
        <p className="text-xs text-muted-foreground">
          {connectedPlatforms !== null && connectedPlatforms.size > 0
            ? `${connectedPlatforms.size} connected`
            : connectedPlatforms === null ? "All platforms" : accountsLoading ? "Loading..." : "No platforms connected"}
          {Object.keys(cadence).length > 0
            ? ` · ${Object.keys(cadence).length} customized`
            : " · Using defaults"}
          {brand.timezone ? ` · ${brand.timezone.replace(/_/g, " ")}` : ""}
        </p>
      )}

      {expanded && (
        <div className="space-y-4">
          {/* Timezone selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Brand timezone</Label>
            <Select
              value={timezone}
              onValueChange={(v) => {
                setTimezone(v);
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-full max-w-xs h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tzOptions.map((tz) => (
                  <SelectItem key={tz} value={tz} className="text-xs">
                    {formatTimezoneDisplay(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Platform rows */}
          <div className="space-y-3">
            {accountsLoading && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Loading connected accounts...
              </p>
            )}
            {!accountsLoading && hasNoConnectedPlatforms && platformsWithCadence.size === 0 && (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center space-y-2">
                <LinkIcon className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connect social accounts to configure posting cadence.
                </p>
                <p className="text-xs text-muted-foreground">
                  Go to{" "}
                  <a href="/dashboard/accounts" className="underline hover:text-foreground">
                    Accounts
                  </a>{" "}
                  to connect your platforms.
                </p>
              </div>
            )}
            {visiblePlatforms.map((platform) => {
              const entry = getEntry(platform);
              const custom = isCustomized(platform);

              return (
                <div
                  key={platform}
                  className="rounded-lg border bg-card p-3 space-y-3"
                >
                  {/* Platform header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformIcon
                        platform={platform as Platform}
                        showColor
                        size="sm"
                      />
                      <span className="text-sm font-medium">
                        {PLATFORM_LABELS[platform]}
                      </span>
                      {custom ? (
                        <Badge variant="default" className="text-[10px] h-4 px-1.5">
                          Custom
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                          Default
                        </Badge>
                      )}
                      {connectedPlatforms !== null && !connectedPlatforms.has(platform) && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-600 border-amber-300">
                          Disconnected
                        </Badge>
                      )}
                    </div>
                    {custom && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => resetPlatform(platform)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  </div>

                  {/* Posts per week */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">
                      Posts / week
                    </Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => adjustPostsPerWeek(platform, -1)}
                        disabled={entry.postsPerWeek <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">
                        {entry.postsPerWeek}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => adjustPostsPerWeek(platform, 1)}
                        disabled={entry.postsPerWeek >= 28}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Active days */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">
                      Active days
                    </Label>
                    <div className="flex gap-1">
                      {DAYS.map((day) => {
                        // Empty activeDays = all days active
                        const allActive = entry.activeDays.length === 0;
                        const active = allActive || entry.activeDays.includes(day.key);
                        return (
                          <button
                            key={day.key}
                            onClick={() => {
                              if (allActive) {
                                // Switch from "all days" to explicit: remove this one day
                                const allDays = [0, 1, 2, 3, 4, 5, 6];
                                updatePlatform(platform, {
                                  activeDays: allDays.filter((d) => d !== day.key),
                                });
                              } else {
                                toggleDay(platform, day.key);
                              }
                            }}
                            className={cn(
                              "h-7 w-7 rounded-full text-[11px] font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            title={day.label}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time windows */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground w-20 shrink-0">
                      Time slots
                    </Label>
                    <div className="flex gap-1.5">
                      {TIME_WINDOW_OPTIONS.map((opt) => {
                        const active = entry.timeWindows.includes(opt.value);
                        const desc = getTimeDescription(platform, opt.value);
                        return (
                          <button
                            key={opt.value}
                            onClick={() => toggleTimeWindow(platform, opt.value)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            title={desc ? `${opt.label}: ${desc}` : opt.label}
                          >
                            {opt.label}
                            {desc && (
                              <span className="ml-1 opacity-70 text-[10px]">
                                {desc}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            These preferences control how campaign posts are distributed across your schedule.
            Platforms without custom settings use research-backed defaults for arts &amp; culture brands.
            Time slots are in {timezone.replace(/_/g, " ")} and include organic variation (&#177;30 min) to avoid looking automated.
          </p>
        </div>
      )}
    </div>
  );
}
