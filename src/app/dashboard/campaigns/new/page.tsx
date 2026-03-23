"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_TYPES,
  DISTRIBUTION_BIASES,
  DURATION_PRESETS,
  type CampaignType,
  type DistributionBias,
} from "@/lib/airtable/types";
import { FrequencyPreview } from "@/components/campaigns/frequency-preview";
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
  Loader2,
  ExternalLink,
  ChevronDown,
  Globe,
  Newspaper,
} from "lucide-react";

const CAMPAIGN_TYPE_ICONS: Record<CampaignType, React.ElementType> = {
  Newsletter: Mail,
  "Blog Post": FileText,
  Exhibition: Frame,
  "Artist Profile": User,
  "Podcast Episode": Mic,
  Event: CalendarDays,
  "Public Art": Landmark,
  "Video/Film": Film,
  Institutional: Building2,
  Custom: Sparkles,
};

export default function NewCampaignPage() {
  const router = useRouter();
  const { currentBrand, brands, switchBrand } = useBrand();

  const [url, setUrl] = useState("");
  const [type, setType] = useState<CampaignType | null>(null);
  const [durationDays, setDurationDays] = useState<number>(90);
  const [distributionBias, setDistributionBias] = useState<DistributionBias>("Front-loaded");
  const [customDuration, setCustomDuration] = useState(false);
  const [editorialDirection, setEditorialDirection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);

  const canSubmit = url.trim() !== "" && type !== null && !isSubmitting;

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
        }),
      });

      if (res.ok) {
        router.push("/dashboard/campaigns");
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
                  {currentBrand.logoUrl ? (
                    <img
                      src={currentBrand.logoUrl}
                      alt={`${currentBrand.name} logo`}
                      className="h-9 w-auto max-w-[120px] object-contain rounded"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-300 text-base font-bold">
                      {currentBrand.name.charAt(0)}
                    </div>
                  )}
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
                      {brand.logoUrl ? (
                        <img
                          src={brand.logoUrl}
                          alt=""
                          className="h-7 w-7 rounded object-contain"
                        />
                      ) : (
                        <span className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-bold">
                          {brand.name.charAt(0)}
                        </span>
                      )}
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

      {/* URL Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source URL</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="url"
            placeholder={
              currentBrand?.newsletterUrl
                ? `${currentBrand.newsletterUrl}/...`
                : "https://example.com/..."
            }
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="text-base"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Paste a link to a newsletter, blog post, exhibition page, or any
            content worth promoting.
          </p>
        </CardContent>
      </Card>

      {/* Editorial Direction */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Editorial Direction</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="What should we emphasize? Which pieces stood out? What angle should the posts take?"
            value={editorialDirection}
            onChange={(e) => setEditorialDirection(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Optional — this guidance shapes every post that gets generated. Your
            perspective comes first.
          </p>
        </CardContent>
      </Card>

      {/* Campaign Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CAMPAIGN_TYPES.map((t) => {
              const Icon = CAMPAIGN_TYPE_ICONS[t];
              const isSelected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center leading-tight">{t}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Duration & Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duration & Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Duration presets */}
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
            "Generate Campaign"
          )}
        </Button>
      </div>
    </div>
  );
}
