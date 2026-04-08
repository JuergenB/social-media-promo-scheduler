"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Loader2,
  X,
  Pipette,
  RotateCcw,
  Sparkles,
  ImageIcon,
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { CoverSlideTemplate, CoverSlideData } from "@/lib/cover-slide-types";
import type { MediaItem } from "@/lib/media-items";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverSlideDesignerProps {
  postId: string;
  platform: string;
  brandId?: string;
  brandHandle?: string;
  /** Artist's Instagram handle (without @) — used as default for Artist Profile campaigns */
  artistHandle?: string;
  brandLogoUrl?: string | null;
  brandLogoLightUrl?: string | null;
  brandLogoDarkUrl?: string | null;
  brandWebsiteUrl?: string | null;
  /** Previously saved cover slide data (for re-editing) */
  savedData?: CoverSlideData | null;
  /** Available source images for background selection (raw images, no rendered slides) */
  availableImages?: Array<{ url: string; caption?: string }>;
  /** Where to insert the card: "prepend" (default, lead cover) or "append" (additional card) */
  insertPosition?: "prepend" | "append";
  /** Called when cover slide is applied or removed */
  onApply: (mediaItems: MediaItem[]) => void;
  onRemove: (mediaItems: MediaItem[]) => void;
  onClose: () => void;
}

interface ContentFields {
  campaignTypeLabel: string;
  headline: string;
  description: string;
  handle: string;
}

// ---------------------------------------------------------------------------
// Font size +/- controls
// ---------------------------------------------------------------------------

function FontSizeControls({
  field,
  deltas,
  onChange,
}: {
  field: string;
  deltas: Record<string, number>;
  onChange: (deltas: Record<string, number>) => void;
}) {
  const current = deltas[field] || 0;
  const MAX_DELTA = 12;
  const MIN_DELTA = -12;
  const atMax = current >= MAX_DELTA;
  const atMin = current <= MIN_DELTA;
  const adjust = (delta: number) => {
    const next = current + delta;
    const clamped = Math.max(MIN_DELTA, Math.min(MAX_DELTA, next));
    onChange({ ...deltas, [field]: clamped });
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => adjust(-2)}
        disabled={atMin}
        className={cn(
          "p-0.5 rounded transition-colors",
          atMin ? "text-white/15 cursor-not-allowed" : "text-white/40 hover:text-white/80 hover:bg-zinc-700"
        )}
        title={atMin ? "Minimum size reached" : "Decrease font size"}
      >
        <Minus className="h-2.5 w-2.5" />
      </button>
      <span className={cn("text-[9px] w-[20px] text-center tabular-nums", current !== 0 ? "text-white/30" : "text-transparent")}>
        {current > 0 ? `+${current}` : current || "0"}
      </span>
      <button
        onClick={() => adjust(2)}
        disabled={atMax}
        className={cn(
          "p-0.5 rounded transition-colors",
          atMax ? "text-white/15 cursor-not-allowed" : "text-white/40 hover:text-white/80 hover:bg-zinc-700"
        )}
        title={atMax ? "Maximum size reached" : "Increase font size"}
      >
        <Plus className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schematic preview — CSS-based thumbnail of a template's band structure
// ---------------------------------------------------------------------------

function TemplatePreviewWithFallback({ template }: { template: CoverSlideTemplate }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="aspect-[4/5] overflow-hidden bg-zinc-900">
      {!imgFailed ? (
        <img
          src={`/template-previews/${template.slug}-wireframe.png`}
          alt={template.name}
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <TemplateSchemPreview template={template} />
      )}
    </div>
  );
}

function TemplateSchemPreview({ template }: { template: CoverSlideTemplate }) {
  const scheme = template.colorScheme;
  const bands = template.bands;
  const isQuotable = template.slug.includes("quotable") || template.slug.includes("quote");
  const bgColor = scheme.background || "#FFFFFF";
  const primaryColor = scheme.primary || "#1A1A1A";
  const secondaryColor = scheme.secondary || "rgba(30,30,30,0.72)";
  const accentColor = scheme.accent || "rgba(30,30,30,0.55)";

  // Resolve template variables in colors
  const resolve = (c: string) => {
    if (c.includes("scheme.primary")) return primaryColor;
    if (c.includes("scheme.secondary")) return secondaryColor;
    if (c.includes("scheme.accent")) return accentColor;
    if (c.includes("scheme.background")) return bgColor;
    return c;
  };

  return (
    <div
      className={cn("h-full w-full flex flex-col relative", isQuotable && "justify-center")}
      style={{ backgroundColor: bgColor }}
    >
      {bands.map((band, i) => {
        const h = typeof band.height === "string" && band.height.endsWith("%")
          ? band.height
          : band.type === "image" ? "45%" : undefined;

        if (band.type === "image") {
          // Soft gradient placeholder for image area
          const isDark = bgColor.toLowerCase() === "#1a1a1a" || bgColor.toLowerCase() === "#000000";
          return (
            <div
              key={i}
              className="relative overflow-hidden"
              style={{
                height: h || "45%",
                background: isDark
                  ? `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.08) 100%)`
                  : `linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.01) 50%, rgba(0,0,0,0.06) 100%)`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 opacity-10" style={{ color: primaryColor }} />
              </div>
            </div>
          );
        }

        if (band.type === "text") {
          const color = resolve(band.color);
          const isLabel = band.contentSource === "campaignTypeLabel";
          const isHeadline = band.contentSource === "headline";
          const isHandle = band.contentSource === "handle";
          const isDescription = band.contentSource === "description";

          if (isQuotable) {
            // Quotable templates: centered, wider lines resembling quote text
            if (isLabel) {
              return (
                <div
                  key={i}
                  className="flex justify-center px-4"
                  style={{
                    paddingTop: Math.min((band.paddingTop || 0) / 3, 6),
                    paddingBottom: Math.min((band.paddingBottom || 0) / 3, 4),
                  }}
                >
                  <div className="rounded-full" style={{ height: 3, width: "35%", backgroundColor: color, opacity: 0.3 }} />
                </div>
              );
            }
            if (isHeadline) {
              // Wide, prominent italic-style lines — the quote itself
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1.5 px-3"
                  style={{
                    paddingTop: Math.min((band.paddingTop || 0) / 3, 4),
                    paddingBottom: Math.min((band.paddingBottom || 0) / 3, 6),
                  }}
                >
                  {/* Opening quote mark */}
                  <div style={{ fontSize: 14, lineHeight: 1, color, opacity: 0.25, fontFamily: "Georgia, serif" }}>&ldquo;</div>
                  {[92, 88, 70].map((w, li) => (
                    <div
                      key={li}
                      className="rounded-full"
                      style={{ height: 5, width: `${w}%`, backgroundColor: color, opacity: 0.3 }}
                    />
                  ))}
                </div>
              );
            }
            if (isDescription) {
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1 px-4"
                  style={{
                    paddingTop: Math.min((band.paddingTop || 0) / 3, 4),
                    paddingBottom: Math.min((band.paddingBottom || 0) / 3, 4),
                  }}
                >
                  <div className="rounded-full" style={{ height: 4, width: "55%", backgroundColor: color, opacity: 0.25 }} />
                  <div className="rounded-full" style={{ height: 4, width: "40%", backgroundColor: color, opacity: 0.25 }} />
                </div>
              );
            }
            if (isHandle) {
              return (
                <div
                  key={i}
                  className="flex justify-center px-4"
                  style={{
                    paddingTop: Math.min((band.paddingTop || 0) / 3, 4),
                    paddingBottom: Math.min((band.paddingBottom || 0) / 3, 6),
                  }}
                >
                  <div className="rounded-full" style={{ height: 3, width: "30%", backgroundColor: color, opacity: 0.25 }} />
                </div>
              );
            }
          }

          // Editorial / default templates: bar-style placeholders
          const barH = isLabel ? 4 : isHeadline ? 6 : 4;
          const barW = isLabel ? "40%" : isHeadline ? "75%" : isHandle ? "35%" : "65%";
          const lines = isHeadline ? 3 : isDescription ? 2 : 1;

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1 px-4"
              style={{
                paddingTop: Math.min((band.paddingTop || 0) / 3, 6),
                paddingBottom: Math.min((band.paddingBottom || 0) / 3, 6),
              }}
            >
              {Array.from({ length: lines }).map((_, li) => (
                <div
                  key={li}
                  className="rounded-full"
                  style={{
                    height: barH,
                    width: li === lines - 1 && lines > 1 ? `calc(${barW} * 0.7)` : barW,
                    backgroundColor: color,
                    opacity: 0.35,
                  }}
                />
              ))}
            </div>
          );
        }

        if (band.type === "separator") {
          const color = resolve(band.color);
          const widthPct = band.widthPercent || 25;
          return (
            <div key={i} className="flex justify-center py-1">
              <div style={{ width: `${widthPct}%`, height: 1, backgroundColor: color, opacity: 0.15 }} />
            </div>
          );
        }

        if (band.type === "branding") {
          return (
            <div key={i} className="flex-1 flex items-end px-3 pb-2" style={{ minHeight: 16 }}>
              <div
                className="rounded px-2 py-0.5"
                style={{ backgroundColor: `${accentColor}33`, fontSize: 6, color: primaryColor }}
              >
                LOGO
              </div>
            </div>
          );
        }

        if (band.type === "spacer") {
          // Skip spacers in quotable previews — flex justify-center handles vertical centering
          if (isQuotable) return null;
          const h2 = typeof band.height === "string" && band.height.endsWith("%")
            ? band.height : "8%";
          return <div key={i} style={{ height: h2 }} />;
        }

        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CoverSlideDesigner({
  postId,
  platform,
  brandId,
  brandHandle,
  artistHandle,
  brandLogoUrl,
  brandLogoLightUrl,
  brandLogoDarkUrl,
  brandWebsiteUrl,
  savedData,
  availableImages,
  insertPosition = "prepend",
  onApply,
  onRemove,
  onClose,
}: CoverSlideDesignerProps) {
  // State — always start at gallery unless there's persisted (applied) cover slide data
  const [step, setStep] = useState<"gallery" | "editor">(savedData?.appliedUrl ? "editor" : "gallery");
  const [selectedTemplate, setSelectedTemplate] = useState<CoverSlideTemplate | null>(null);
  // Platform-aware default: Artist Profile → artist's handle, Instagram → brand handle, others → domain
  const defaultHandleOrWebsite = (() => {
    // Artist Profile: prefer artist's Instagram handle when available
    if (artistHandle) return `@${artistHandle.replace(/^@/, "")}`;
    if (platform.toLowerCase() === "instagram" && brandHandle) return brandHandle;
    // For non-Instagram: extract clean domain (no https://, no www., no path)
    if (brandWebsiteUrl) {
      return brandWebsiteUrl
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
    }
    return brandHandle || "";
  })();

  const [fields, setFields] = useState<ContentFields>({
    campaignTypeLabel: savedData?.fields.campaignTypeLabel || "",
    headline: savedData?.fields.headline || "",
    description: savedData?.fields.description || "",
    handle: savedData?.fields.handle || defaultHandleOrWebsite,
  });
  const [imageOffset, setImageOffset] = useState(savedData?.imageOffset ?? 30);
  const [previewDataUri, setPreviewDataUri] = useState<string | null>(null);
  const [charBudgets, setCharBudgets] = useState<Record<string, number>>({});
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [fontSizeDeltas, setFontSizeDeltas] = useState<Record<string, number>>(
    savedData?.fontSizeDeltas || {}
  );
  const [showLogo, setShowLogo] = useState(true);
  const [showLinkInBio, setShowLinkInBio] = useState(platform.toLowerCase() === "instagram");
  const [sourceImageIndex, setSourceImageIndex] = useState(0);
  const sourceImages = availableImages || [];
  const [overlayOpacity, setOverlayOpacity] = useState<number>(50);
  const [overlayTint, setOverlayTint] = useState<string | undefined>(undefined);
  const [keepOriginalColors, setKeepOriginalColors] = useState(false);
  const [blurBackground, setBlurBackground] = useState(false);

  // Preview debounce
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch templates
  const templatesQuery = useQuery({
    queryKey: ["cover-slide-templates", brandId],
    queryFn: async () => {
      const params = brandId ? `?brand=${brandId}` : "";
      const res = await fetch(`/api/cover-slide-templates${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      return data.templates as CoverSlideTemplate[];
    },
  });

  // If we have saved data, auto-select the template
  useEffect(() => {
    if (savedData && templatesQuery.data) {
      const saved = templatesQuery.data.find((t) => t.id === savedData.templateId);
      if (saved) setSelectedTemplate(saved);
    }
  }, [savedData, templatesQuery.data]);

  // AI content generation
  const generateContentMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await fetch(`/api/posts/${postId}/cover-slide-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate content");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const newFields: ContentFields = {
        campaignTypeLabel: data.fields.campaignTypeLabel || "",
        headline: data.fields.headline || "",
        description: data.fields.description || "",
        handle: data.fields.handle || defaultHandleOrWebsite,
      };
      setFields(newFields);
      setCharBudgets(data.charBudgets || {});
      // Pass new fields directly — React state hasn't flushed yet
      requestPreview(newFields);
    },
    onError: (err) => toast.error(`Content generation failed: ${err.message}`),
  });

  // Preview mutation — uses refs to avoid stale React state in debounced calls
  const previewMutation = useMutation({
    mutationFn: async (fieldsOverride?: ContentFields) => {
      const tmpl = selectedTemplateRef.current;
      if (!tmpl) throw new Error("No template selected");
      const currentFields = fieldsOverride || fieldsRef.current;
      const res = await fetch(`/api/posts/${postId}/cover-slide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: false,
          templateId: tmpl.id,
          fields: {
            ...currentFields,
            brandLogoUrl: resolvedLogoUrl,
          },
          imageOffset,
          backgroundColor,
          fontSizeDeltas,
          showLinkInBio,
          platform,
          sourceImageUrl: sourceImages[sourceImageIndex]?.url || undefined,
          overlayOpacity,
          overlayTint,
          keepOriginalColors,
          blurBackground,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate preview");
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewDataUri(data.preview.dataUri);
      if (data.preview.charBudgets) setCharBudgets(data.preview.charBudgets);
    },
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
  });

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("No template selected");
      const res = await fetch(`/api/posts/${postId}/cover-slide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: true,
          templateId: selectedTemplate.id,
          fields: {
            ...fields,
            brandLogoUrl: resolvedLogoUrl,
          },
          imageOffset,
          backgroundColor,
          fontSizeDeltas,
          showLinkInBio,
          platform,
          sourceImageUrl: sourceImages[sourceImageIndex]?.url || undefined,
          overlayOpacity,
          overlayTint,
          keepOriginalColors,
          blurBackground,
          insertPosition,
        }),
      });
      if (!res.ok) throw new Error("Failed to apply cover slide");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Cover slide applied");
      onApply(data.mediaItems);
    },
    onError: (err) => toast.error(`Apply failed: ${err.message}`),
  });

  // Refs for values that may not have flushed to state yet when debounced preview fires
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const selectedTemplateRef = useRef(selectedTemplate);
  selectedTemplateRef.current = selectedTemplate;

  const requestPreview = (fieldsOverride?: ContentFields) => {
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(() => {
      previewMutation.mutate(fieldsOverride);
    }, 750);
  };

  // Re-preview when fields or offset change
  useEffect(() => {
    if (selectedTemplate && step === "editor" && fields.headline) {
      requestPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageOffset, backgroundColor, fontSizeDeltas, showLogo, showLinkInBio, sourceImageIndex, overlayOpacity, overlayTint, keepOriginalColors, blurBackground]);

  // Handle template selection
  const handleTemplateSelect = (template: CoverSlideTemplate) => {
    setSelectedTemplate(template);
    setStep("editor");

    // If we have saved data for this template, use it; otherwise generate
    if (savedData && savedData.templateId === template.id) {
      requestPreview();
    } else {
      generateContentMutation.mutate(template.id);
    }
  };

  // Eyedropper: pick background color from preview image
  const handlePreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!eyedropperActive) return;
    e.stopPropagation();

    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth);
    const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;

    // For overlay templates (quotable cards), set the overlay tint
    // For editorial templates, set the background color
    const isOverlayTemplate = selectedTemplate && !selectedTemplate.bands.some((b) => b.type === "image");
    if (isOverlayTemplate) {
      setOverlayTint(hex);
    } else {
      setBackgroundColor(hex);
    }
    setEyedropperActive(false);
    // Preview will re-trigger from the useEffect watching backgroundColor/overlayTint
  };

  // Update a field and request preview
  const updateField = (key: keyof ContentFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleFieldBlur = () => {
    requestPreview();
  };

  const isLoading = previewMutation.isPending || generateContentMutation.isPending;
  const isApplying = applyMutation.isPending;
  const aspectRatio = ["linkedin", "bluesky"].includes(platform.toLowerCase()) ? "1/1" : "4/5";

  // Choose logo variant based on template background color (or user-picked bg)
  const resolvedLogoUrl = (() => {
    if (!showLogo) return null;
    const bg = backgroundColor || selectedTemplateRef.current?.colorScheme?.background || "#FFFFFF";
    // Simple luminance check: dark bg → light logo, light bg → dark logo
    const hex = bg.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return lum < 0.5 ? (brandLogoLightUrl || brandLogoDarkUrl) : (brandLogoDarkUrl || brandLogoLightUrl);
    }
    return brandLogoDarkUrl || brandLogoLightUrl || brandLogoUrl;
  })() || null;

  // Lightbox for full-size preview
  const [showLightbox, setShowLightbox] = useState(false);

  // ---------------------------------------------------------------------------
  // Render: Template Gallery
  // ---------------------------------------------------------------------------

  if (step === "gallery") {
    return (
      <div className="absolute inset-0 z-[60] bg-zinc-900/95 flex flex-col rounded-lg border border-zinc-700/50">
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-white/70" />
            <span className="text-white font-medium text-sm">Choose a card template</span>
          </div>
          <button
            className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {templatesQuery.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 text-white/50 animate-spin" />
            </div>
          ) : templatesQuery.data?.length === 0 ? (
            <div className="text-white/50 text-center py-12">
              No templates available. Create templates in Airtable.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {templatesQuery.data?.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="group text-left rounded-lg overflow-hidden border border-zinc-700/50 hover:border-zinc-500 transition-colors bg-zinc-800/50"
                >
                  {/* Preview — wireframe PNG with CSS schematic fallback on error */}
                  <TemplatePreviewWithFallback template={template} />
                  <div className="p-3">
                    <p className="text-white text-sm font-medium truncate group-hover:text-white/90">
                      {template.name}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {template.aspectRatios.join(", ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Editor
  // ---------------------------------------------------------------------------

  return (
    <div className="absolute inset-0 z-[60] bg-zinc-900 flex flex-col rounded-lg border border-zinc-700/50 overflow-hidden">
      {/* Header — compact toolbar with all actions */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-zinc-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => {
              setStep("gallery");
              setPreviewDataUri(null);
              setSelectedTemplate(null);
              setFields({ campaignTypeLabel: "", headline: "", description: "", handle: defaultHandleOrWebsite });
              setFontSizeDeltas({});
              setBackgroundColor(undefined);
              setCharBudgets({});
            }}
            className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            title="Back to templates"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-white font-medium text-sm truncate">
            {selectedTemplate?.name || "Cover Slide"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Color picker */}
          <button
            onClick={() => setEyedropperActive(!eyedropperActive)}
            disabled={isLoading || !previewDataUri}
            className={cn(
              "flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full transition-colors",
              eyedropperActive ? "bg-amber-500/90" : "bg-zinc-700 hover:bg-zinc-600"
            )}
            title="Pick background color from preview"
          >
            <Pipette className="h-3 w-3" />
            <span className="hidden sm:inline">Color</span>
          </button>
          {backgroundColor && (
            <>
              <div
                className="w-5 h-5 rounded-full border-2 border-zinc-600 shrink-0"
                style={{ backgroundColor }}
                title={`Background: ${backgroundColor}`}
              />
              <button
                onClick={() => setBackgroundColor(undefined)}
                className="text-white/50 hover:text-white p-1 rounded hover:bg-zinc-700 transition-colors"
                title="Reset colors"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </>
          )}
          {/* Regenerate */}
          <button
            onClick={() => selectedTemplate && generateContentMutation.mutate(selectedTemplate.id)}
            disabled={generateContentMutation.isPending || !selectedTemplate}
            className="flex items-center gap-1 text-white text-[10px] px-2 py-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors disabled:opacity-40"
            title="Regenerate all text with AI"
          >
            {generateContentMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">{generateContentMutation.isPending ? "Generating..." : "Regenerate"}</span>
          </button>
          {/* Close */}
          <button
            className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            onClick={onClose}
            disabled={isApplying}
          >
            <X className="h-4 w-4" />
          </button>
          {/* Apply */}
          <Button
            size="sm"
            className="bg-white text-black hover:bg-white/90 text-xs h-7"
            onClick={() => applyMutation.mutate()}
            disabled={isApplying || isLoading || !previewDataUri}
          >
            {isApplying ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Applying...</>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      </div>

      {eyedropperActive && (
        <div className="bg-amber-500/20 text-amber-400 text-xs text-center py-1 shrink-0">
          Click on the preview image to pick a background color
        </div>
      )}

      {/* Main content: side-by-side, preview gets priority space */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: Preview — takes 55% width */}
        <div className="w-[55%] flex items-center justify-center p-3 min-h-0 bg-zinc-950/50">
          {previewDataUri ? (
            <div className="relative h-full flex items-center justify-center">
              <img
                src={previewDataUri}
                alt="Cover slide preview"
                crossOrigin="anonymous"
                className={cn(
                  "max-h-full max-w-full object-contain rounded shadow-2xl",
                  isLoading && "opacity-50",
                  eyedropperActive && "cursor-crosshair"
                )}
                style={{ aspectRatio }}
                onClick={(e) => {
                  if (eyedropperActive) {
                    handlePreviewClick(e);
                  } else {
                    setShowLightbox(true);
                  }
                }}
              />
              {/* Enlarge hint */}
              {!eyedropperActive && (
                <button
                  onClick={() => setShowLightbox(true)}
                  className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-colors"
                  title="View full size"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-500 gap-3">
              {generateContentMutation.isPending ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                  <span className="text-xs text-white/30">Generating text...</span>
                </>
              ) : previewMutation.isPending ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                  <span className="text-xs text-white/30">Rendering...</span>
                </>
              ) : (
                <>
                  <LayoutTemplate className="h-8 w-8 text-zinc-700" />
                  <span className="text-xs text-zinc-600">Preview</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Compact editor fields — 45% width, internal scroll */}
        <div className="w-[45%] flex flex-col gap-2 p-3 overflow-y-auto border-l border-zinc-800">
          {/* Category label */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Label</span>
              {charBudgets.campaignTypeLabel && (
                <span className={cn("text-[10px]", fields.campaignTypeLabel.length > charBudgets.campaignTypeLabel ? "text-red-400" : "text-white/20")}>
                  {fields.campaignTypeLabel.length}/{charBudgets.campaignTypeLabel}
                </span>
              )}
            </div>
            <Input
              value={fields.campaignTypeLabel}
              onChange={(e) => updateField("campaignTypeLabel", e.target.value)}
              onBlur={handleFieldBlur}
              className="bg-zinc-800/50 border-zinc-700/50 text-white text-xs font-bold uppercase tracking-wider h-8"
              placeholder="e.g., Q+ART INTERVIEW"
              maxLength={charBudgets.campaignTypeLabel || 40}
            />
          </div>

          {/* Headline */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Headline</span>
                <FontSizeControls
                  field="headline"
                  deltas={fontSizeDeltas}
                  onChange={(d) => { setFontSizeDeltas(d); }}
                />
              </div>
              {charBudgets.headline && (
                <span className={cn("text-[10px]", fields.headline.length > charBudgets.headline ? "text-red-400" : "text-white/20")}>
                  {fields.headline.length}/{charBudgets.headline}
                </span>
              )}
            </div>
            <Textarea
              value={fields.headline}
              onChange={(e) => updateField("headline", e.target.value)}
              onBlur={handleFieldBlur}
              className="bg-zinc-800/50 border-zinc-700/50 text-white text-xs font-bold min-h-[56px] resize-none"
              placeholder="Headline..."
              maxLength={charBudgets.headline || 120}
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Description</span>
                <FontSizeControls
                  field="description"
                  deltas={fontSizeDeltas}
                  onChange={(d) => { setFontSizeDeltas(d); }}
                />
              </div>
              {charBudgets.description && (
                <span className={cn("text-[10px]", fields.description.length > charBudgets.description ? "text-red-400" : "text-white/20")}>
                  {fields.description.length}/{charBudgets.description}
                </span>
              )}
            </div>
            <Textarea
              value={fields.description}
              onChange={(e) => updateField("description", e.target.value)}
              onBlur={handleFieldBlur}
              className="bg-zinc-800/50 border-zinc-700/50 text-white text-xs min-h-[48px] resize-none"
              placeholder="Brief description..."
              maxLength={charBudgets.description || 200}
            />
          </div>

          {/* Handle — inline */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">{platform.toLowerCase() === "instagram" ? "Handle" : "Website"}</span>
            </div>
            <Input
              value={fields.handle}
              onChange={(e) => updateField("handle", e.target.value)}
              onBlur={handleFieldBlur}
              className="bg-zinc-800/50 border-zinc-700/50 text-white text-xs h-8"
              placeholder="@brandhandle"
            />
          </div>

          {/* Image / Quote band position */}
          <div>
            <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">
              {selectedTemplate && !selectedTemplate.bands.some((b) => b.type === "image") ? "Quote Position" : "Image Position"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/20 text-[10px]">Top</span>
              <Slider
                value={[imageOffset]}
                onValueChange={([v]) => setImageOffset(v)}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-white/20 text-[10px]">Btm</span>
            </div>
          </div>

          {/* Overlay opacity — only for templates without an image band (quotable cards, etc.) */}
          {selectedTemplate && !selectedTemplate.bands.some((b) => b.type === "image") && (
            <div>
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Overlay</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/20 text-[10px]">Light</span>
                <Slider
                  value={[overlayOpacity]}
                  onValueChange={([v]) => setOverlayOpacity(v)}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="text-white/20 text-[10px]">Heavy</span>
                <button
                  onClick={() => {
                    // Simple tint picker — cycle through preset tints or use eyedropper
                    setEyedropperActive(true);
                  }}
                  className={cn(
                    "shrink-0 w-5 h-5 rounded-full border transition-colors",
                    overlayTint ? "border-white/50" : "border-zinc-600"
                  )}
                  style={{ backgroundColor: overlayTint || "transparent" }}
                  title="Pick overlay tint color from the preview image"
                />
              </div>
              {/* Color/B&W toggle */}
              <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                <input
                  type="checkbox"
                  checked={keepOriginalColors}
                  onChange={(e) => { setKeepOriginalColors(e.target.checked); }}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-500 h-3.5 w-3.5"
                />
                <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Keep original colors</span>
              </label>
              {/* Gaussian blur toggle */}
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={blurBackground}
                  onChange={(e) => { setBlurBackground(e.target.checked); }}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-500 h-3.5 w-3.5"
                />
                <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Blur background</span>
              </label>
            </div>
          )}

          {/* Background image selector — compact: single preview + arrows */}
          {sourceImages.length > 1 && (
            <div>
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Background</span>
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={() => setSourceImageIndex((sourceImageIndex - 1 + sourceImages.length) % sourceImages.length)}
                  className="text-white/30 hover:text-white/70 p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-12 h-12 rounded overflow-hidden border border-zinc-600/50">
                    <img src={sourceImages[sourceImageIndex]?.url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-white/25 text-[9px] ml-1.5 tabular-nums">{sourceImageIndex + 1}/{sourceImages.length}</span>
                </div>
                <button
                  onClick={() => setSourceImageIndex((sourceImageIndex + 1) % sourceImages.length)}
                  className="text-white/30 hover:text-white/70 p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Show logo toggle */}
          {(brandLogoLightUrl || brandLogoDarkUrl || brandLogoUrl) && (
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => { setShowLogo(e.target.checked); }}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 h-3.5 w-3.5"
              />
              <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Include brand logo</span>
            </label>
          )}

          {/* Link in bio toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLinkInBio}
              onChange={(e) => { setShowLinkInBio(e.target.checked); }}
              className="rounded border-zinc-600 bg-zinc-800 text-blue-500 h-3.5 w-3.5"
            />
            <span className="text-white/50 text-[10px] font-medium uppercase tracking-wide">Link in bio</span>
          </label>
        </div>
      </div>

      {/* Lightbox — stays within the cover slide designer container */}
      {showLightbox && previewDataUri && (
        <div
          className="absolute inset-0 z-[70] bg-black/95 flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setShowLightbox(false); }}
        >
          <img
            src={previewDataUri}
            alt="Cover slide full preview"
            className="h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setShowLightbox(false); }}
            className="absolute top-3 right-3 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
