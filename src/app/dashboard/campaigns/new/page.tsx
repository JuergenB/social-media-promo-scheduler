"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { differenceInDays, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/lib/brand-context";
import { pickBrandLogo } from "@/lib/brand-logo";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_TYPES,
  ENABLED_CAMPAIGN_TYPES,
  DISTRIBUTION_BIASES,
  DURATION_PRESETS,
  type CampaignType,
  type DistributionBias,
  type PlatformCadenceConfig,
} from "@/lib/airtable/types";
import {
  PLATFORM_LABELS as CADENCE_PLATFORM_LABELS,
  GLOBAL_CADENCE_DEFAULTS,
} from "@/lib/platform-cadence-defaults";
import { FrequencyPreview } from "@/components/campaigns/frequency-preview";
import { useAccounts } from "@/hooks/use-accounts";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { Platform } from "@/lib/late-api";
import { getToneLabel, getAllToneTiers } from "@/lib/prompts/tone-guidance";
import {
  ArrowLeft,
  Mail,
  FileText,
  Frame,
  User,
  Mic,
  CalendarDays,
  Landmark,
  Film,
  Building2,
  Sparkles,
  Megaphone,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Globe,
  Newspaper,
  Settings,
  Eye,
  Plus,
  X,
} from "lucide-react";
import type { GenerationRule, CampaignTypeRule } from "@/lib/airtable/types";

/** Per-type color config for visually distinctive tiles */
const CAMPAIGN_TYPE_COLORS: Record<CampaignType, {
  base: string;       // Base hue color (hex)
  lightBg: string;    // Light mode default bg
  lightHover: string; // Light mode hover bg
  lightActive: string;// Light mode selected bg
  darkBg: string;     // Dark mode default bg
  darkHover: string;  // Dark mode hover bg
  darkActive: string; // Dark mode selected bg
  border: string;     // Selected border color
  icon: string;       // Icon color (muted)
  iconActive: string; // Icon color (selected/hover)
}> = {
  Newsletter:       { base: "#4f46e5", lightBg: "rgba(79,70,229,0.06)",  lightHover: "rgba(79,70,229,0.12)",  lightActive: "rgba(79,70,229,0.15)",  darkBg: "rgba(99,102,241,0.08)",  darkHover: "rgba(99,102,241,0.16)",  darkActive: "rgba(99,102,241,0.22)",  border: "#6366f1", icon: "#818cf8",  iconActive: "#6366f1" },
  "Blog Post":      { base: "#059669", lightBg: "rgba(5,150,105,0.06)",  lightHover: "rgba(5,150,105,0.12)",  lightActive: "rgba(5,150,105,0.15)",  darkBg: "rgba(16,185,129,0.08)",  darkHover: "rgba(16,185,129,0.16)",  darkActive: "rgba(16,185,129,0.22)",  border: "#10b981", icon: "#34d399",  iconActive: "#10b981" },
  Exhibition:       { base: "#7c3aed", lightBg: "rgba(124,58,237,0.06)", lightHover: "rgba(124,58,237,0.12)", lightActive: "rgba(124,58,237,0.15)", darkBg: "rgba(139,92,246,0.08)", darkHover: "rgba(139,92,246,0.16)", darkActive: "rgba(139,92,246,0.22)", border: "#8b5cf6", icon: "#a78bfa",  iconActive: "#8b5cf6" },
  "Artist Profile": { base: "#e11d48", lightBg: "rgba(225,29,72,0.06)",  lightHover: "rgba(225,29,72,0.12)",  lightActive: "rgba(225,29,72,0.15)",  darkBg: "rgba(244,63,94,0.08)",  darkHover: "rgba(244,63,94,0.16)",  darkActive: "rgba(244,63,94,0.22)",  border: "#f43f5e", icon: "#fb7185",  iconActive: "#f43f5e" },
  "Podcast Episode":{ base: "#d97706", lightBg: "rgba(217,119,6,0.06)",  lightHover: "rgba(217,119,6,0.12)",  lightActive: "rgba(217,119,6,0.15)",  darkBg: "rgba(245,158,11,0.08)", darkHover: "rgba(245,158,11,0.16)", darkActive: "rgba(245,158,11,0.22)", border: "#f59e0b", icon: "#fbbf24",  iconActive: "#f59e0b" },
  Event:            { base: "#0891b2", lightBg: "rgba(8,145,178,0.06)",  lightHover: "rgba(8,145,178,0.12)",  lightActive: "rgba(8,145,178,0.15)",  darkBg: "rgba(6,182,212,0.08)",  darkHover: "rgba(6,182,212,0.16)",  darkActive: "rgba(6,182,212,0.22)",  border: "#06b6d4", icon: "#22d3ee",  iconActive: "#06b6d4" },
  "Open Call":      { base: "#dc2626", lightBg: "rgba(220,38,38,0.06)",  lightHover: "rgba(220,38,38,0.12)",  lightActive: "rgba(220,38,38,0.15)",  darkBg: "rgba(239,68,68,0.08)",  darkHover: "rgba(239,68,68,0.16)",  darkActive: "rgba(239,68,68,0.22)",  border: "#ef4444", icon: "#f87171",  iconActive: "#ef4444" },
  "Public Art":     { base: "#475569", lightBg: "rgba(71,85,105,0.06)",  lightHover: "rgba(71,85,105,0.12)",  lightActive: "rgba(71,85,105,0.15)",  darkBg: "rgba(100,116,139,0.08)",darkHover: "rgba(100,116,139,0.16)",darkActive: "rgba(100,116,139,0.22)",border: "#64748b", icon: "#94a3b8",  iconActive: "#64748b" },
  "Video/Film":     { base: "#0284c7", lightBg: "rgba(2,132,199,0.06)",  lightHover: "rgba(2,132,199,0.12)",  lightActive: "rgba(2,132,199,0.15)",  darkBg: "rgba(14,165,233,0.08)", darkHover: "rgba(14,165,233,0.16)", darkActive: "rgba(14,165,233,0.22)", border: "#0ea5e9", icon: "#38bdf8",  iconActive: "#0ea5e9" },
  Institutional:    { base: "#6b7280", lightBg: "rgba(107,114,128,0.06)",lightHover: "rgba(107,114,128,0.12)",lightActive: "rgba(107,114,128,0.15)",darkBg: "rgba(156,163,175,0.08)",darkHover: "rgba(156,163,175,0.16)",darkActive: "rgba(156,163,175,0.22)",border: "#9ca3af", icon: "#9ca3af",  iconActive: "#6b7280" },
  Custom:           { base: "#ca8a04", lightBg: "rgba(202,138,4,0.06)",  lightHover: "rgba(202,138,4,0.12)",  lightActive: "rgba(202,138,4,0.15)",  darkBg: "rgba(234,179,8,0.08)",  darkHover: "rgba(234,179,8,0.16)",  darkActive: "rgba(234,179,8,0.22)",  border: "#eab308", icon: "#facc15",  iconActive: "#eab308" },
};

const CAMPAIGN_TYPE_ICONS: Record<CampaignType, React.ElementType> = {
  Newsletter: Mail,
  "Blog Post": FileText,
  Exhibition: Frame,
  "Artist Profile": User,
  "Podcast Episode": Mic,
  Event: CalendarDays,
  "Open Call": Megaphone,
  "Public Art": Landmark,
  "Video/Film": Film,
  Institutional: Building2,
  Custom: Sparkles,
};

const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  Newsletter: "Promote a newsletter issue across social media. Each story becomes its own post with a link that scrolls directly to that story. Great for curated newsletters with multiple features.",
  "Blog Post": "Turn a blog post or article into a series of social media posts. Images and key quotes are extracted and cycled through, with each post highlighting a different aspect of the article.",
  Exhibition: "Promote an art exhibition by featuring individual artists and artworks. Auto-detects Artwork Archive embeds on gallery pages to extract structured artwork data, artist names, and images.",
  "Artist Profile": "Spotlight an artist with posts featuring their work and story. Uses artwork images and artist bio to generate posts that celebrate the artist across platforms.",
  "Podcast Episode": "Promote a podcast episode with guest highlights, key quotes, takeaways, and curiosity hooks. Works with show notes or full transcripts — designed cards fill the visual gap.",
  Event: "Promote physical or virtual events — gallery openings, anniversary celebrations, studio tours, art fairs. Date-driven campaigns that build intensity toward the event date with RSVP/ticket CTAs.",
  "Open Call": "Promote open calls for artist submissions. Deadline-driven campaigns that build toward a submission deadline with apply/submit CTAs. (Coming soon)",
  "Public Art": "Promote public art installations, murals, and outdoor exhibitions with location-specific content and visual storytelling. (Coming soon)",
  "Video/Film": "Promote video content, short films, or video art with platform-optimized teasers and behind-the-scenes posts. (Coming soon)",
  Institutional: "Promote organizational news, grants, residencies, and institutional announcements across social platforms. (Coming soon)",
  Custom: "Create a custom campaign with manual configuration for content types not covered by other presets. (Coming soon)",
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { currentBrand, brands, switchBrand } = useBrand();

  const [url, setUrl] = useState("");
  const [type, setType] = useState<CampaignType | null>(null);
  const [previewType, setPreviewType] = useState<CampaignType | null>(null);
  const [durationDays, setDurationDays] = useState<number>(90);
  const [distributionBias, setDistributionBias] = useState<DistributionBias>("Front-loaded");
  const [customDuration, setCustomDuration] = useState(false);
  const [editorialDirection, setEditorialDirection] = useState("");
  const [voiceIntensity, setVoiceIntensity] = useState<number>(currentBrand?.defaultVoiceIntensity ?? 50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);

  // Campaign start date (when to begin posting — defaults to today)
  const [startDate, setStartDate] = useState("");

  // Event-specific state
  const [eventDate, setEventDate] = useState("");
  const [eventDetails, setEventDetails] = useState("");

  // Multi-URL state (all campaign types)
  const [additionalUrls, setAdditionalUrls] = useState<string[]>([]);

  // Generation options state (all campaign types)
  const [showGenOptions, setShowGenOptions] = useState(true);
  const [genMaxPerPlatform, setGenMaxPerPlatform] = useState<number | null>(null);

  // Cadence-aware platform selection
  const [cadencePlatformToggles, setCadencePlatformToggles] = useState<Record<string, boolean>>({});
  const [cadenceInitialized, setCadenceInitialized] = useState(false);

  // Connected accounts for generation options
  const { data: accountsData } = useAccounts();
  const connectedAccounts = accountsData?.accounts ?? [];
  const connectedPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    for (const account of connectedAccounts) {
      if (account.isActive) platforms.add(account.platform);
    }
    return platforms;
  }, [connectedAccounts]);

  // Brand cadence: the brand's saved cadence merged with connected platforms.
  // If a connected platform isn't in the saved cadence, use global defaults so
  // newly connected accounts always appear in the platform list.
  const brandCadence: PlatformCadenceConfig = useMemo(() => {
    const saved = currentBrand?.platformCadence && Object.keys(currentBrand.platformCadence).length > 0
      ? { ...currentBrand.platformCadence }
      : {} as PlatformCadenceConfig;
    // Merge in any connected platforms not yet in saved cadence
    for (const p of connectedPlatforms) {
      if (!saved[p]) {
        saved[p] = GLOBAL_CADENCE_DEFAULTS[p] || { postsPerWeek: 3, activeDays: [1,2,3,4,5], timeWindows: ["morning", "afternoon"] };
      }
    }
    return saved;
  }, [currentBrand?.platformCadence, connectedPlatforms]);

  // Platforms available for this campaign: intersection of cadence platforms and connected accounts
  const availableCadencePlatforms = useMemo(() => {
    return Object.keys(brandCadence)
      .filter((p) => connectedPlatforms.has(p))
      .sort();
  }, [brandCadence, connectedPlatforms]);

  // Initialize toggles: all available cadence platforms ON
  useEffect(() => {
    if (availableCadencePlatforms.length > 0 && !cadenceInitialized) {
      const toggles: Record<string, boolean> = {};
      for (const p of availableCadencePlatforms) {
        toggles[p] = true;
      }
      setCadencePlatformToggles(toggles);
      setCadenceInitialized(true);
    }
  }, [availableCadencePlatforms, cadenceInitialized]);

  // Sync voice intensity default when brand changes
  useEffect(() => {
    if (currentBrand?.defaultVoiceIntensity != null) {
      setVoiceIntensity(currentBrand.defaultVoiceIntensity);
    }
  }, [currentBrand?.id, currentBrand?.defaultVoiceIntensity]);

  // Derived: active platforms set (for backward compat references)
  const genPlatforms = useMemo(() => {
    return new Set(
      Object.entries(cadencePlatformToggles)
        .filter(([, on]) => on)
        .map(([p]) => p)
    );
  }, [cadencePlatformToggles]);

  // Derived: campaign cadence (only enabled platforms)
  const campaignCadence: PlatformCadenceConfig = useMemo(() => {
    const result: PlatformCadenceConfig = {};
    for (const [p, on] of Object.entries(cadencePlatformToggles)) {
      if (on && brandCadence[p]) {
        result[p] = brandCadence[p];
      }
    }
    return result;
  }, [cadencePlatformToggles, brandCadence]);

  const isDateDriven = type === "Event" || type === "Open Call";

  // Auto-compute duration from event date
  useEffect(() => {
    if (isDateDriven && eventDate) {
      const days = differenceInDays(parseISO(eventDate), new Date());
      setDurationDays(Math.max(1, days));
      setDistributionBias("Back-loaded");
    }
  }, [eventDate, isDateDriven]);

  // Fetch campaign type rules from Airtable for rule counts and descriptions
  const { data: typeRulesData } = useQuery<{ rules: CampaignTypeRule[] }>({
    queryKey: ["campaign-type-rules"],
    queryFn: async () => {
      const res = await fetch("/api/campaign-type-rules");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // Fetch generation rules for the active/previewed type
  const activeTypeName = previewType || type;
  const activeTypeRule = typeRulesData?.rules?.find((r) => r.name === activeTypeName);
  const { data: genRulesData } = useQuery<{ rules: GenerationRule[] }>({
    queryKey: ["generation-rules", activeTypeRule?.id],
    queryFn: async () => {
      const res = await fetch(`/api/generation-rules?campaignTypeId=${activeTypeRule!.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!activeTypeRule?.id,
  });

  const activeRuleCount = genRulesData?.rules?.filter((r) => r.active).length ?? 0;
  const ruleCategories = useMemo(() => {
    const cats = new Set(genRulesData?.rules?.filter((r) => r.active).map((r) => r.category) ?? []);
    return [...cats];
  }, [genRulesData]);

  const hasStartDateConflict = isDateDriven && startDate && eventDate && new Date(startDate) >= new Date(eventDate);
  const canSubmit = url.trim() !== "" && type !== null && !isSubmitting && !hasStartDateConflict;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          type,
          brandId: currentBrand?.id,
          durationDays,
          distributionBias,
          editorialDirection,
          ...(startDate ? { startDate } : {}),
          ...(isDateDriven && eventDate ? { eventDate } : {}),
          ...(isDateDriven && eventDetails ? { eventDetails } : {}),
          ...(additionalUrls.filter(Boolean).length > 0 ? { additionalUrls: additionalUrls.filter(Boolean).join("\n") } : {}),
          ...(genPlatforms.size > 0 ? { targetPlatforms: Array.from(genPlatforms).join(",") } : {}),
          ...(genMaxPerPlatform !== null ? { maxVariantsPerPlatform: genMaxPerPlatform } : {}),
          ...(Object.keys(campaignCadence).length > 0 ? { platformCadence: campaignCadence } : {}),
          voiceIntensity,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/campaigns/${data.campaign.id}`);
      }
    } catch (error) {
      console.error("Failed to create campaign:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Create Campaign
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick the brand, set the direction, and drop in a URL.
          </p>
        </div>
      </div>

      {/* Brand — first, prominent */}
      <Card className="overflow-hidden !py-0 !gap-0">
        {currentBrand ? (
          <>
            {/* Brand header — dark with logo */}
            <div className="bg-zinc-900 px-5 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const url = pickBrandLogo(currentBrand, { surface: "dark" });
                    return url ? (
                      <img
                        src={url}
                        alt={`${currentBrand.name} logo`}
                        className="h-9 w-auto max-w-[120px] object-contain rounded"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-300 text-base font-bold">
                        {currentBrand.name.charAt(0)}
                      </div>
                    );
                  })()}
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {currentBrand.name}
                    </h3>
                    <div className="flex items-center gap-3">
                      {currentBrand.websiteUrl && (
                        <a
                          href={currentBrand.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
                        >
                          <Globe className="h-2.5 w-2.5" />
                          {currentBrand.websiteUrl.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {currentBrand.newsletterUrl && (
                        <a
                          href={currentBrand.newsletterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
                        >
                          <Newspaper className="h-2.5 w-2.5" />
                          Newsletter
                          <ExternalLink className="h-2 w-2" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {brands.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                    onClick={() => setBrandPickerOpen(!brandPickerOpen)}
                  >
                    Switch
                    <ChevronDown
                      className={cn(
                        "ml-1 h-3 w-3 transition-transform",
                        brandPickerOpen && "rotate-180"
                      )}
                    />
                  </Button>
                )}
              </div>
            </div>

            {/* Brand picker — expandable list */}
            {brandPickerOpen && (
              <div className="border-b border-border bg-zinc-50 dark:bg-zinc-900/50">
                {brands
                  .filter((b) => b.id !== currentBrand.id)
                  .map((brand) => (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => {
                        switchBrand(brand.id);
                        setBrandPickerOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-6 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      {(() => {
                        const url = pickBrandLogo(brand, { surface: "light" });
                        return url ? (
                          <img
                            src={url}
                            alt=""
                            className="h-7 w-7 rounded object-contain"
                          />
                        ) : (
                          <span className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-bold">
                            {brand.name.charAt(0)}
                          </span>
                        );
                      })()}
                      <div>
                        <p className="text-sm font-medium">{brand.name}</p>
                        {brand.websiteUrl && (
                          <p className="text-xs text-muted-foreground">
                            {brand.websiteUrl.replace(/^https?:\/\//, "")}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {/* Voice guidelines — 3 lines, click to expand */}
            {currentBrand.voiceGuidelines && (
              <div className="px-5 pt-2.5 pb-1.5 border-t border-border">
                <button
                  type="button"
                  onClick={() => setVoiceExpanded(!voiceExpanded)}
                  className="text-left w-full"
                >
                  <p
                    className={cn(
                      "text-xs text-muted-foreground leading-relaxed",
                      !voiceExpanded && "line-clamp-3"
                    )}
                  >
                    {currentBrand.voiceGuidelines}
                  </p>
                </button>
                <Link
                  href="/dashboard/settings/brands"
                  className="text-[11px] text-muted-foreground/60 hover:text-primary transition-colors"
                >
                  Manage Brands
                </Link>
              </div>
            )}
          </>
        ) : (
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading brand...
          </CardContent>
        )}
      </Card>

      {/* Campaign Type — first choice, determines everything else */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">What are you promoting?</CardTitle>
            <Link
              href="/dashboard/settings/campaign-types"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-3 w-3" />
              Manage types
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CAMPAIGN_TYPES.map((t) => {
              const Icon = CAMPAIGN_TYPE_ICONS[t];
              const c = CAMPAIGN_TYPE_COLORS[t];
              const isSelected = type === t;
              const isEnabled = ENABLED_CAMPAIGN_TYPES.includes(t);
              const isPreviewing = previewType === t;

              // Compute theme-aware background and border
              const bg = isSelected
                ? (isDark ? c.darkActive : c.lightActive)
                : isPreviewing
                  ? (isDark ? c.darkHover : c.lightHover)
                  : (isDark ? c.darkBg : c.lightBg);

              const borderColor = isSelected
                ? c.border
                : isPreviewing
                  ? `${c.border}66`
                  : isEnabled
                    ? `${c.border}30`
                    : 'transparent';

              const iconColor = isSelected
                ? c.iconActive
                : isEnabled || isPreviewing
                  ? c.icon
                  : `${c.icon}80`;

              const textColor = isSelected
                ? c.iconActive
                : isPreviewing
                  ? (isDark ? '#d1d5db' : '#6b7280')
                  : undefined;

              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (isEnabled) {
                      setType(t);
                      setPreviewType(null);
                    } else {
                      setPreviewType(previewType === t ? null : t);
                    }
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs font-medium transition-all duration-200",
                    !isSelected && !isPreviewing && isEnabled && "hover:scale-[1.02] hover:shadow-sm",
                    !isEnabled && !isPreviewing && "opacity-55 hover:opacity-75"
                  )}
                  style={{
                    backgroundColor: bg,
                    borderColor: borderColor,
                  }}
                >
                  <Icon
                    className="h-5 w-5 transition-colors duration-200"
                    style={{ color: iconColor }}
                  />
                  <span
                    className="text-center leading-tight transition-colors duration-200"
                    style={{ color: textColor }}
                  >
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Type description — shows for selected or previewed type */}
          {(type || previewType) && (
            <div className={cn(
              "text-xs rounded-lg p-3",
              previewType && !type
                ? "bg-muted/30 text-muted-foreground/70 border border-dashed border-border"
                : previewType
                  ? "bg-muted/30 text-muted-foreground/70 border border-dashed border-border"
                  : "bg-muted/50 text-muted-foreground"
            )}>
              {previewType && (
                <span className="font-medium text-muted-foreground">
                  {previewType} — Coming soon{"\n"}
                </span>
              )}
              <p>{CAMPAIGN_TYPE_DESCRIPTIONS[previewType || type!]}</p>
              {activeRuleCount > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                  <span className="text-muted-foreground/70">
                    {activeRuleCount} active AI rule{activeRuleCount !== 1 ? "s" : ""} across{" "}
                    {ruleCategories.length} categor{ruleCategories.length !== 1 ? "ies" : "y"}
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-primary hover:underline whitespace-nowrap ml-2 text-xs flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        View rules
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 max-h-80 overflow-y-auto p-0" align="end">
                      <div className="p-3 border-b">
                        <p className="text-sm font-medium">{activeTypeName} — AI Rules</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          These rules guide how AI generates social posts for this type.{" "}
                          <Link href={`/dashboard/settings/campaign-types?type=${encodeURIComponent(activeTypeRule?.slug || "")}`} className="text-primary hover:underline">
                            Edit in Settings →
                          </Link>
                        </p>
                      </div>
                      <RulesPreviewList rules={genRulesData?.rules ?? []} />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* URL Input — context-aware based on type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Input
              type="url"
              placeholder={
                type === "Newsletter" && currentBrand?.newsletterUrl
                  ? `${currentBrand.newsletterUrl}/issues/...`
                  : activeTypeRule?.urlPlaceholder || "https://example.com/..."
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {type === "Newsletter"
                ? "Paste the link to the specific newsletter issue. We\u2019ll extract each story and its images."
                : type === "Blog Post"
                  ? "Paste the blog post URL. We\u2019ll extract the content, images, and key quotes."
                  : isDateDriven
                    ? "Paste the event or listing page URL. We\u2019ll extract dates, details, and images."
                    : "Paste a link to the content you want to promote."}
            </p>
          </div>

          {/* Additional URLs */}
          <p className="text-xs text-muted-foreground">
            Tip: For Artwork Archive exhibitions, use the embed URL format: <code className="bg-muted px-1 rounded">artworkarchive.com/profile/&#123;org&#125;/embed/exhibition/&#123;name&#125;</code>
          </p>
          {additionalUrls.map((addUrl, i) => (
            <div key={i} className="flex gap-2">
              <Input
                type="url"
                placeholder="https://additional-source.com/..."
                value={addUrl}
                onChange={(e) => {
                  const next = [...additionalUrls];
                  next[i] = e.target.value;
                  setAdditionalUrls(next);
                }}
                className="text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setAdditionalUrls(additionalUrls.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setAdditionalUrls([...additionalUrls, ""])}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add another source URL
          </Button>
        </CardContent>
      </Card>

      {/* Editorial Direction */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Editorial Direction</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={
              type === "Newsletter"
                ? "e.g., Lead with the gallery partnership story — it's our biggest announcement this month."
                : type === "Blog Post"
                  ? "e.g., Focus on the practical tips in the second half. Emphasize the free resources."
                  : type === "Event"
                    ? "e.g., Focus on the community aspect and upcoming deadline. Emphasize the free admission and family-friendly activities."
                    : "e.g., Lead with the most surprising detail. Keep it conversational and invite discussion."
            }
            value={editorialDirection}
            onChange={(e) => setEditorialDirection(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Optional — this guidance shapes the tone and focus of every generated post.
          </p>
          <details className="text-xs text-muted-foreground mt-1">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              Tips for effective editorial direction
            </summary>
            <ul className="mt-2 ml-4 space-y-1 list-disc text-muted-foreground/80">
              <li><strong>Be specific about focus:</strong> &ldquo;Emphasize the free workshops and family-friendly activities&rdquo; rather than &ldquo;make it sound fun&rdquo;</li>
              <li><strong>Guide tone and angle:</strong> &ldquo;Lead with urgency — only 3 days left to RSVP&rdquo; or &ldquo;Keep it celebratory, this is a milestone event&rdquo;</li>
              <li><strong>Call out key details:</strong> &ldquo;Mention the new venue location&rdquo; or &ldquo;Highlight that tickets are selling fast&rdquo;</li>
              <li><strong>Let the AI handle attribution:</strong> The system automatically matches people and images from the scraped content — no need to instruct it to name specific individuals unless you want a particular focus</li>
            </ul>
          </details>
        </CardContent>
      </Card>

      {/* Event Details — only for date-driven types */}
      {isDateDriven && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Location, venue, time, tickets/RSVP link, dress code, parking... Include any details not on the source page."
              value={eventDetails}
              onChange={(e) => setEventDetails(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-2">
              These details supplement what we scrape from the URL. Include anything the audience needs to know.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Campaign Start Date — when to begin posting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            When to start posting
          </Label>
          <Input
            type="date"
            value={startDate}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">
            {startDate
              ? `Posts will be scheduled starting ${new Date(startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`
              : "Defaults to today. Set a future date to avoid overlap with campaigns that are still running."}
          </p>
          {isDateDriven && startDate && eventDate && new Date(startDate) >= new Date(eventDate) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Campaign start must be before the event date.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Duration & Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duration & Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Date picker for date-driven types, duration presets for others */}
          {isDateDriven ? (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                {type === "Event" ? "Event Date" : "Submission Deadline"}
              </Label>
              <Input
                type="date"
                value={eventDate}
                min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-48"
              />
              {eventDate && durationDays > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {durationDays} day{durationDays !== 1 ? "s" : ""} of promotion, building toward{" "}
                  {new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                Campaign Length
              </Label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={
                      !customDuration && durationDays === preset.days
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setDurationDays(preset.days);
                      setDistributionBias(preset.defaultBias);
                      setCustomDuration(false);
                    }}
                  >
                    {preset.label}{" "}
                    <span className="ml-1 text-xs opacity-70">
                      {preset.description}
                    </span>
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={customDuration ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCustomDuration(true)}
                >
                  Custom
                </Button>
              </div>
              {customDuration && (
                <div className="flex items-center gap-2 mt-2">
                  <Label htmlFor="custom-days" className="text-sm whitespace-nowrap">
                    Days:
                  </Label>
                  <Input
                    id="custom-days"
                    type="number"
                    min={7}
                    max={730}
                    value={durationDays}
                    onChange={(e) =>
                      setDurationDays(parseInt(e.target.value) || 0)
                    }
                    className="w-24"
                  />
                </div>
              )}
            </div>
          )}

          {/* Distribution bias */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Posting Intensity
            </Label>
            <div className="flex gap-2">
              {DISTRIBUTION_BIASES.map((bias) => (
                <Button
                  key={bias}
                  type="button"
                  variant={distributionBias === bias ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setDistributionBias(bias)}
                >
                  {bias}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {distributionBias === "Front-loaded"
                  ? "Heavy promotion early, tapering off over time. Best for launches and events."
                  : distributionBias === "Back-loaded"
                    ? "Builds momentum toward a deadline. Good for countdowns and upcoming events."
                    : "Steady presence throughout. Works well for evergreen content."}
            </p>
          </div>

          {/* Frequency preview chart */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Frequency Preview
            </Label>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <FrequencyPreview
                durationDays={durationDays}
                bias={distributionBias}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generation Options — collapsible, all campaign types */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowGenOptions(!showGenOptions)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Generation Options</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              {showGenOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showGenOptions ? "Hide" : "Show"}
            </Button>
          </div>
        </CardHeader>
        {showGenOptions && (
          <CardContent className="space-y-4 pt-0">
            {/* Platform selection — cadence-aware */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                Platforms to generate
              </Label>
              {availableCadencePlatforms.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {connectedPlatforms.size === 0
                    ? `No connected accounts for ${currentBrand?.name || "this brand"}.`
                    : "No cadence configured. Set up platform cadence in brand settings."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {availableCadencePlatforms.map((p) => {
                    const label = CADENCE_PLATFORM_LABELS[p] || p.charAt(0).toUpperCase() + p.slice(1);
                    const entry = brandCadence[p];
                    const isOn = cadencePlatformToggles[p] ?? false;
                    return (
                      <label
                        key={p}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors",
                          isOn ? "bg-muted/50" : "opacity-50"
                        )}
                      >
                        <Switch
                          checked={isOn}
                          onCheckedChange={(checked) => {
                            setCadencePlatformToggles((prev) => ({
                              ...prev,
                              [p]: checked,
                            }));
                          }}
                          className="scale-75"
                        />
                        <PlatformIcon platform={p as Platform} size="xs" showColor />
                        <span className="text-xs font-medium">{label}</span>
                        {entry && (
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            {entry.postsPerWeek} post{entry.postsPerWeek !== 1 ? "s" : ""}/week
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Variant count */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                Max variants per platform
              </Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 5, null].map((val) => (
                  <Button
                    key={val ?? "auto"}
                    type="button"
                    variant={genMaxPerPlatform === val ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setGenMaxPerPlatform(val)}
                  >
                    {val === null ? "Auto" : val}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {genMaxPerPlatform
                  ? `${genMaxPerPlatform} variant${genMaxPerPlatform > 1 ? "s" : ""} per platform × ${genPlatforms.size} platform${genPlatforms.size !== 1 ? "s" : ""} = ~${genMaxPerPlatform * genPlatforms.size} posts`
                  : "Auto: variant count based on content and campaign duration"}
              </p>
            </div>

            {/* Voice intensity slider */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                Tone of Voice
              </Label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Slider
                    value={[voiceIntensity]}
                    onValueChange={([val]) => setVoiceIntensity(val)}
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
                      onClick={() => setVoiceIntensity(Math.round((tier.min + tier.max) / 2))}
                    >
                      {tier.label}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {getToneLabel(voiceIntensity)} — adjusts how much brand personality comes through in generated posts.{" "}
                  <a href="/dashboard/settings/brands" className="text-primary hover:underline">Edit tone dimensions</a>
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" asChild>
          <Link href="/dashboard/campaigns">Cancel</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Campaign"
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Rules Preview Popover Content ────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Important: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  "Nice-to-have": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const CATEGORY_ORDER: Record<string, number> = {
  "Content Pairing": 0, "Tone & Voice": 1, Structure: 2,
  "Image Handling": 3, "Link Handling": 4, Avoidance: 5, "Platform-Specific": 6,
};

function RulesPreviewList({ rules }: { rules: GenerationRule[] }) {
  const activeRules = rules.filter((r) => r.active);

  const grouped = useMemo(() => {
    const groups = new Map<string, GenerationRule[]>();
    for (const rule of activeRules) {
      const existing = groups.get(rule.category) || [];
      existing.push(rule);
      groups.set(rule.category, existing);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
    );
  }, [activeRules]);

  if (activeRules.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground italic">
        No active rules for this type.
      </p>
    );
  }

  return (
    <div className="p-2 space-y-3">
      {grouped.map(([category, categoryRules]) => (
        <div key={category}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
            {category}
          </p>
          <div className="space-y-1">
            {categoryRules.map((rule) => (
              <div key={rule.id} className="flex items-start gap-2 px-1 py-1">
                <Badge
                  variant="secondary"
                  className={cn("text-[9px] px-1 py-0 shrink-0 mt-0.5", PRIORITY_COLORS[rule.priority])}
                >
                  {rule.priority === "Nice-to-have" ? "Nice" : rule.priority}
                </Badge>
                <span className="text-xs text-muted-foreground leading-snug">
                  {rule.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
