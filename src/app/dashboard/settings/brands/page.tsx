"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Save,
  X,
  Globe,
  Mail,
  MessageSquareText,
  Clock,
  ChevronDown,
  ChevronUp,
  Settings2,
  LinkIcon,
  SlidersHorizontal,
  Sparkles,
  Loader2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import type { Brand, PlatformCadenceEntry, TimeWindow, ToneDimensions } from "@/lib/airtable/types";
import { TONE_DIMENSION_DEFS } from "@/lib/airtable/types";
import { Slider } from "@/components/ui/slider";
import type { Platform } from "@/lib/late-api";
import { useBrand } from "@/lib/brand-context";
import { buildProfileUrl } from "@/lib/lnk-bio";
import { cn } from "@/lib/utils";
import { getToneLabel, getAllToneTiers } from "@/lib/prompts/tone-guidance";
import { CadenceEditor } from "@/components/brands/cadence-editor";
import { LogoManager } from "@/components/brands/logo-manager";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { useAccounts } from "@/hooks/use-accounts";
import {
  CADENCE_PLATFORMS,
  PLATFORM_LABELS,
  GLOBAL_CADENCE_DEFAULTS,
} from "@/lib/platform-cadence-defaults";

// ── Cadence Summary (read-only compact grid) ────────────────────────────

function abbreviateDays(activeDays: number[]): string {
  // Empty = all days
  if (activeDays.length === 0 || activeDays.length === 7) return "All";
  // Weekdays only
  const weekdays = [1, 2, 3, 4, 5];
  if (
    activeDays.length === 5 &&
    weekdays.every((d) => activeDays.includes(d))
  )
    return "M\u2013F";
  // Weekends only
  if (
    activeDays.length === 2 &&
    activeDays.includes(0) &&
    activeDays.includes(6)
  )
    return "S\u2013S";
  // Individual days
  const labels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return activeDays.map((d) => labels[d]).join(" ");
}

function CadenceSummary({ brand }: { brand: Brand }) {
  const { currentBrand } = useBrand();
  const isCurrentBrand = currentBrand?.id === brand.id;

  const { data: accountsData, isLoading: accountsLoading } = useAccounts(
    isCurrentBrand ? (brand.zernioProfileId || undefined) : undefined
  );

  const connectedPlatforms = useMemo(() => {
    if (!isCurrentBrand || !accountsData?.accounts) return null;
    return new Set<string>(
      accountsData.accounts
        .filter((a: { isActive: boolean }) => a.isActive)
        .map((a: { platform: string }) => a.platform)
    );
  }, [accountsData, isCurrentBrand]);

  const platformsWithCadence = useMemo(
    () => new Set<string>(Object.keys(brand.platformCadence || {})),
    [brand.platformCadence]
  );

  const visiblePlatforms = useMemo(() => {
    if (connectedPlatforms === null) return [...CADENCE_PLATFORMS];
    return CADENCE_PLATFORMS.filter(
      (p) => connectedPlatforms.has(p) || platformsWithCadence.has(p)
    );
  }, [connectedPlatforms, platformsWithCadence]);

  const getEntry = (platform: string): PlatformCadenceEntry => {
    return (
      brand.platformCadence?.[platform] ||
      GLOBAL_CADENCE_DEFAULTS[platform] || {
        postsPerWeek: 3,
        activeDays: [1, 2, 3, 4, 5],
        timeWindows: ["morning", "afternoon"] as TimeWindow[],
      }
    );
  };

  const isCustomized = (platform: string) =>
    !!(brand.platformCadence && brand.platformCadence[platform]);

  const hasNoConnected =
    isCurrentBrand &&
    !accountsLoading &&
    connectedPlatforms !== null &&
    connectedPlatforms.size === 0;

  if (accountsLoading) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Loading connected accounts...
      </p>
    );
  }

  if (hasNoConnected && platformsWithCadence.size === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <LinkIcon className="h-3.5 w-3.5 shrink-0" />
        <span>
          No connected platforms.{" "}
          <a
            href="/dashboard/accounts"
            className="underline hover:text-foreground"
          >
            Connect accounts
          </a>{" "}
          to configure cadence.
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visiblePlatforms.map((platform) => {
        const entry = getEntry(platform);
        const custom = isCustomized(platform);
        const windowLabels: Record<TimeWindow, string> = {
          morning: "AM",
          afternoon: "PM",
          evening: "Eve",
        };

        return (
          <div
            key={platform}
            className={
              "rounded-md border px-2.5 py-2 space-y-1" +
              (custom ? " border-primary/30 bg-primary/[0.03]" : " bg-muted/30")
            }
          >
            {/* Platform name + icon */}
            <div className="flex items-center gap-1.5">
              <PlatformIcon
                platform={platform as Platform}
                showColor
                size="xs"
              />
              <span className="text-[11px] font-medium truncate leading-none">
                {PLATFORM_LABELS[platform]}
              </span>
              {custom && (
                <span className="ml-auto text-[9px] font-medium text-primary leading-none">
                  Custom
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground leading-none">
              <span className="font-semibold text-foreground tabular-nums">
                {entry.postsPerWeek}/wk
              </span>
              <span className="text-muted-foreground/50">&middot;</span>
              <span>{abbreviateDays(entry.activeDays)}</span>
            </div>

            {/* Time window pills */}
            <div className="flex gap-0.5">
              {(["morning", "afternoon", "evening"] as TimeWindow[]).map(
                (tw) => {
                  const active = entry.timeWindows.includes(tw);
                  return (
                    <span
                      key={tw}
                      className={
                        "text-[9px] px-1 py-px rounded font-medium leading-tight " +
                        (active
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground/40")
                      }
                    >
                      {windowLabels[tw]}
                    </span>
                  );
                }
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tone Dimensions Editor ────────────────────────────────────────────

const DEFAULT_TONE_DIMENSIONS: ToneDimensions = {
  wit: 5, warmth: 5, opinion: 5, skepticism: 5,
  playfulness: 5, urgency: 5, authority: 5, intimacy: 5,
};

function ToneDimensionsEditor({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const [dimensions, setDimensions] = useState<ToneDimensions>(
    brand.toneDimensions || DEFAULT_TONE_DIMENSIONS
  );
  const [toneNotes, setToneNotes] = useState(brand.toneNotes || "");
  const [voiceIntensity, setVoiceIntensity] = useState(brand.defaultVoiceIntensity ?? 50);
  const [isDirty, setIsDirty] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Reset state when brand changes
  const brandId = brand.id;
  const [lastBrandId, setLastBrandId] = useState(brandId);
  if (brandId !== lastBrandId) {
    setDimensions(brand.toneDimensions || DEFAULT_TONE_DIMENSIONS);
    setToneNotes(brand.toneNotes || "");
    setVoiceIntensity(brand.defaultVoiceIntensity ?? 50);
    setIsDirty(false);
    setPreviewText(null);
    setLastBrandId(brandId);
  }

  // Warn before losing unsaved tone changes (browser navigation / tab close)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: brand.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update brand");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Tone dimensions saved");
      setIsDirty(false);
    },
    onError: () => {
      toast.error("Failed to save tone dimensions");
    },
  });

  const handleDimensionChange = (key: keyof ToneDimensions, value: number) => {
    setDimensions((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    mutation.mutate({ toneDimensions: dimensions, toneNotes, defaultVoiceIntensity: voiceIntensity });
  };

  const handleGeneratePreview = async () => {
    setPreviewLoading(true);
    setPreviewText(null);
    try {
      const res = await fetch("/api/brands/tone-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brand.name,
          toneDimensions: dimensions,
          toneNotes,
          voiceGuidelines: brand.voiceGuidelines,
          anthropicApiKeyLabel: brand.anthropicApiKeyLabel,
          voiceIntensity,
        }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      setPreviewText(data.preview);
    } catch {
      toast.error("Failed to generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3" />
            Tone of Voice Dimensions
          </Label>
          {isDirty && (
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={mutation.isPending}>
              <Save className="h-3 w-3 mr-1" />
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          These settings shape how AI generates content for this brand. Each dimension is a 1-10 scale.
          The campaign-level intensity slider will amplify or dampen these settings.
        </p>

        <div className="space-y-4">
          {TONE_DIMENSION_DEFS.map((def) => (
            <div key={def.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{def.label}</span>
                <span className="text-sm font-semibold tabular-nums w-6 text-right">
                  {dimensions[def.key]}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground w-24 text-right shrink-0">
                  {def.lowLabel}
                </span>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[dimensions[def.key]]}
                  onValueChange={([v]) => handleDimensionChange(def.key, v)}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground w-24 shrink-0">
                  {def.highLabel}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 pl-[calc(6rem+12px)]">
                {def.description}
              </p>
            </div>
          ))}
        </div>

        <Separator className="my-4" />

        {/* Additional tone notes */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Additional tone notes</Label>
          <Input
            value={toneNotes}
            onChange={(e) => {
              setToneNotes(e.target.value);
              setIsDirty(true);
            }}
            placeholder="e.g., Dry British-adjacent humor, never sarcastic"
            className="text-sm h-8"
          />
        </div>

        <Separator className="my-4" />

        {/* Voice intensity slider */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Overall Voice Intensity</Label>
          <div className="flex items-center gap-3">
            <Slider
              value={[voiceIntensity]}
              onValueChange={([val]) => { setVoiceIntensity(val); setIsDirty(true); }}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-medium text-muted-foreground w-8 text-right tabular-nums">
              {voiceIntensity}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground/70 px-0.5">
            {getAllToneTiers().map((tier) => (
              <span
                key={tier.label}
                className={cn(
                  "cursor-pointer hover:text-foreground transition-colors",
                  voiceIntensity >= tier.min && voiceIntensity <= tier.max && "text-foreground font-medium"
                )}
                onClick={() => { setVoiceIntensity(Math.round((tier.min + tier.max) / 2)); setIsDirty(true); }}
              >
                {tier.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {getToneLabel(voiceIntensity)} — controls how much brand personality comes through. This amplifies or dampens the dimension settings above.
          </p>
        </div>

        <Separator className="my-4" />

        {/* Preview section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleGeneratePreview}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              {previewLoading ? "Generating..." : "Generate Preview"}
            </Button>
          </div>
          {previewText && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-sm leading-relaxed text-foreground/80 space-y-3">
                {previewText.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                This is how your brand sounds at these settings
              </p>
            </div>
          )}
        </div>

        {/* Sticky save banner — visible when changes are unsaved */}
        {isDirty && (
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 px-5 py-3 bg-amber-50 dark:bg-amber-950/50 border-t border-amber-200 dark:border-amber-800 rounded-b-lg flex items-center justify-between gap-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              You have unsaved tone of voice changes.
            </p>
            <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleSave} disabled={mutation.isPending}>
              <Save className="h-3 w-3 mr-1" />
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── lnk.bio Settings ──────────────────────────────────────────────────

function LnkBioSettings({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(!!brand.lnkBioEnabled);

  // Reset local state when brand changes
  const brandId = brand.id;
  const [lastBrandId, setLastBrandId] = useState(brandId);
  if (brandId !== lastBrandId) {
    setEnabled(!!brand.lnkBioEnabled);
    setLastBrandId(brandId);
  }

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: brand.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update brand");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("lnk.bio settings saved");
    },
    onError: () => {
      toast.error("Failed to save lnk.bio settings");
      // Revert local state on error
      setEnabled(!!brand.lnkBioEnabled);
    },
  });

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    mutation.mutate({ lnkBioEnabled: next });
  };

  const profileUrl = buildProfileUrl(brand.lnkBioUsername);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor={`lnkbio-enabled-${brand.id}`}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="h-3 w-3" />
              lnk.bio
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <Switch
              id={`lnkbio-enabled-${brand.id}`}
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={mutation.isPending}
            />
          </div>
        </div>

        {!enabled ? (
          <p className="text-xs text-muted-foreground mt-3">
            Automatically creates a link-in-bio entry on your lnk.bio profile
            when Instagram posts are scheduled. Toggle on to configure.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Group ID — read-only */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Group ID</Label>
              {brand.lnkBioGroupId ? (
                <div className="text-sm">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {brand.lnkBioGroupId}
                  </code>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    No group ID configured — lnk.bio entries will not be
                    created. Contact an admin.
                  </span>
                </div>
              )}
            </div>

            {/* Profile link */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Profile link
              </Label>
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {profileUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No username configured.
                </p>
              )}
            </div>

            {/* Explanation */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Instagram-only. When an Instagram post is scheduled, a
              link-in-bio entry is automatically created on your lnk.bio
              profile. Scheduled posts appear with their future publish date.
              If a post is cancelled, deleted, or rescheduled, its lnk.bio
              entry is updated automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Brand Settings (single brand) ─────────────────────────────────────

function BrandSettings({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();

  // Sheet states
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [cadenceSheetOpen, setCadenceSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Edit details state
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState({
    name: brand.name,
    websiteUrl: brand.websiteUrl,
    newsletterUrl: brand.newsletterUrl,
  });

  // Voice guidelines draft
  const [voiceDraft, setVoiceDraft] = useState(brand.voiceGuidelines);

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: brand.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update brand");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand updated");
    },
    onError: () => {
      toast.error("Failed to update brand");
    },
  });

  const handleSaveDetails = () => {
    mutation.mutate(detailsDraft, {
      onSuccess: () => setEditingDetails(false),
    });
  };

  const handleCancelDetails = () => {
    setDetailsDraft({
      name: brand.name,
      websiteUrl: brand.websiteUrl,
      newsletterUrl: brand.newsletterUrl,
    });
    setEditingDetails(false);
  };

  const handleSaveVoice = () => {
    mutation.mutate(
      { voiceGuidelines: voiceDraft },
      { onSuccess: () => setVoiceSheetOpen(false) }
    );
  };

  const handleCancelVoice = () => {
    setVoiceDraft(brand.voiceGuidelines);
    setVoiceSheetOpen(false);
  };

  // Voice preview: first 3 lines
  const voiceLines = brand.voiceGuidelines?.split("\n") || [];
  const voicePreview = voiceLines.slice(0, 3).join("\n");
  const voiceTruncated = voiceLines.length > 3;

  return (
    <>
      <div className="space-y-5">
        {/* ── Brand identity ──────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {brand.logoUrl ? (
                  <img
                    src={brand.logoUrl}
                    alt={`${brand.name} logo`}
                    className="h-12 w-auto max-w-[160px] object-contain rounded shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-lg font-bold shrink-0">
                    {brand.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  {editingDetails ? (
                    <Input
                      value={detailsDraft.name}
                      onChange={(e) =>
                        setDetailsDraft({ ...detailsDraft, name: e.target.value })
                      }
                      className="text-lg font-semibold h-9 w-56"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold truncate">
                      {brand.name}
                    </h2>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className={
                        brand.status === "Active"
                          ? "border-emerald-500/50 text-emerald-600 text-[10px] h-4 px-1.5"
                          : "text-[10px] h-4 px-1.5"
                      }
                    >
                      {brand.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Edit toggle */}
              <div className="flex items-center gap-1 shrink-0">
                {editingDetails ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancelDetails}>
                      <X className="h-3 w-3" />
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleSaveDetails} disabled={mutation.isPending}>
                      <Save className="h-3 w-3 mr-1" />
                      {mutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setEditingDetails(true)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* URLs — inline when not editing, form when editing */}
            {editingDetails ? (
              <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-4 border-t">
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Globe className="h-3 w-3" /> Website
                  </Label>
                  <Input
                    value={detailsDraft.websiteUrl}
                    onChange={(e) => setDetailsDraft({ ...detailsDraft, websiteUrl: e.target.value })}
                    placeholder="https://..."
                    className="text-sm h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Mail className="h-3 w-3" /> Newsletter URL
                  </Label>
                  <Input
                    value={detailsDraft.newsletterUrl}
                    onChange={(e) => setDetailsDraft({ ...detailsDraft, newsletterUrl: e.target.value })}
                    placeholder="https://..."
                    className="text-sm h-8"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t text-xs text-muted-foreground">
                {brand.websiteUrl && (
                  <a
                    href={brand.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    {brand.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {brand.newsletterUrl && (
                  <a
                    href={brand.newsletterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <Mail className="h-3 w-3" />
                    Newsletter
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {/* Technical details toggle */}
                {brand.zernioProfileId && (
                  <button
                    onClick={() => setDetailsOpen(!detailsOpen)}
                    className="inline-flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <Settings2 className="h-3 w-3" />
                    Technical
                    {detailsOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                  </button>
                )}
              </div>
            )}

            {/* Collapsible technical details */}
            {detailsOpen && brand.zernioProfileId && (
              <div className="mt-2 text-[11px] text-muted-foreground/60">
                Zernio Profile:{" "}
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {brand.zernioProfileId}
                </code>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Brand Logos ─────────────────────────────────────────── */}
        <LogoManager brand={brand} />

        {/* ── Cover Generator (Intersect only — dev tool) ─────────── */}
        {brand?.name === "The Intersect" && (
          <Card>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cover Generator
                </Label>
                <span className="text-sm">
                  Render Overview-post cover slides for any Intersect newsletter
                  issue.
                </span>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href="/dashboard/tools/cover-generator">Open Cover Generator</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Voice Guidelines ────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquareText className="h-3 w-3" />
                Voice Guidelines
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setVoiceDraft(brand.voiceGuidelines);
                  setVoiceSheetOpen(true);
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                {brand.voiceGuidelines ? "Edit" : "Add Guidelines"}
              </Button>
            </div>
            {brand.voiceGuidelines ? (
              <div
                className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition-colors"
                onClick={() => {
                  setVoiceDraft(brand.voiceGuidelines);
                  setVoiceSheetOpen(true);
                }}
              >
                {voicePreview}
                {voiceTruncated && (
                  <span className="text-xs text-primary ml-1">...more</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No voice guidelines set. These shape how campaign content is generated.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Tone Dimensions ─────────────────────────────────────── */}
        <ToneDimensionsEditor brand={brand} />

        {/* ── lnk.bio ─────────────────────────────────────────────── */}
        <LnkBioSettings brand={brand} />

        {/* ── Posting Cadence ─────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Posting Cadence
                </Label>
                {brand.timezone && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {brand.timezone.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCadenceSheetOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Configure
              </Button>
            </div>
            <CadenceSummary brand={brand} />
          </CardContent>
        </Card>
      </div>

      {/* ── Voice Guidelines Sheet ──────────────────────────────────── */}
      <Sheet open={voiceSheetOpen} onOpenChange={setVoiceSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle>Voice Guidelines</SheetTitle>
            <SheetDescription>
              Defines the brand voice, tone, audience, and content guidelines
              used when generating campaign posts for {brand.name}.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4">
            <Textarea
              value={voiceDraft}
              onChange={(e) => setVoiceDraft(e.target.value)}
              rows={20}
              className="text-sm leading-relaxed resize-none min-h-[300px]"
              placeholder="Describe the brand voice, tone, audience, and content guidelines..."
            />
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={handleCancelVoice}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveVoice}
              disabled={mutation.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {mutation.isPending ? "Saving..." : "Save Guidelines"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Posting Cadence Sheet ───────────────────────────────────── */}
      <Sheet open={cadenceSheetOpen} onOpenChange={setCadenceSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col h-full overflow-hidden">
          <SheetHeader>
            <SheetTitle>Posting Cadence</SheetTitle>
            <SheetDescription>
              Configure how often and when posts are scheduled for each
              connected platform for {brand.name}.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            <CadenceEditor brand={brand} alwaysExpanded />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function BrandsSettingsPage() {
  const { currentBrand } = useBrand();

  const { data, isLoading } = useQuery<{ brands: Brand[] }>({
    queryKey: ["brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands");
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

  // Find the full brand record matching the currently selected brand
  const brand = data?.brands?.find((b) => b.id === currentBrand?.id) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brand Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage voice guidelines, posting cadence, and profile details.
            Use the brand selector to switch brands.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card className="animate-pulse">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-muted rounded w-40" />
                  <div className="h-3 bg-muted rounded w-56" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="animate-pulse">
            <CardContent className="p-5 space-y-3">
              <div className="h-3 bg-muted rounded w-24" />
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        </div>
      ) : brand ? (
        <BrandSettings key={brand.id} brand={brand} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No brand selected. Use the brand selector in the sidebar to choose a brand.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
