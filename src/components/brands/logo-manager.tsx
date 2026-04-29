"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Brand } from "@/lib/airtable/types";

export type LogoSlot =
  | "color-square"
  | "light-square"
  | "dark-square"
  | "color-rect"
  | "light-rect"
  | "dark-rect";

type PreviewBg = "light" | "dark" | "checker";

interface SlotDef {
  slot: LogoSlot;
  label: string;
  helper: string;
  /** Background swatch behind the preview. */
  previewBg: PreviewBg;
  /** Aspect class (Tailwind) for the drop target. */
  aspect: string;
  /** Map to the camelCase Brand field that stores this slot's URL. */
  brandField: keyof Pick<
    Brand,
    | "logoColorSquare"
    | "logoTransparentDark" // light-square (logo art is dark, lives on light bg)
    | "logoTransparentLight" // dark-square (logo art is light, lives on dark bg)
    | "logoColorRect"
    | "logoRectangularLight" // light-rect (wordmark for light bg)
    | "logoRectangularDark" // dark-rect (wordmark for dark bg)
  >;
}

const SLOTS: SlotDef[] = [
  {
    slot: "color-square",
    label: "Color",
    helper: "Full-color square logo. Used in the brand switcher.",
    previewBg: "checker",
    aspect: "aspect-square",
    brandField: "logoColorSquare",
  },
  {
    slot: "light-square",
    label: "On Light",
    helper: "Dark/black logo art for light backgrounds.",
    previewBg: "light",
    aspect: "aspect-square",
    brandField: "logoTransparentDark",
  },
  {
    slot: "dark-square",
    label: "On Dark",
    helper: "Light/white logo art for dark backgrounds.",
    previewBg: "dark",
    aspect: "aspect-square",
    brandField: "logoTransparentLight",
  },
  {
    slot: "color-rect",
    label: "Color",
    helper: "Full-color rectangular wordmark.",
    previewBg: "checker",
    aspect: "aspect-[2/1]",
    brandField: "logoColorRect",
  },
  {
    slot: "light-rect",
    label: "On Light",
    helper: "Wordmark for light backgrounds.",
    previewBg: "light",
    aspect: "aspect-[2/1]",
    brandField: "logoRectangularLight",
  },
  {
    slot: "dark-rect",
    label: "On Dark",
    helper: "Wordmark for dark backgrounds.",
    previewBg: "dark",
    aspect: "aspect-[2/1]",
    brandField: "logoRectangularDark",
  },
];

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];

function previewBgClasses(previewBg: PreviewBg): string {
  if (previewBg === "light") return "bg-white border-zinc-300";
  if (previewBg === "dark") return "bg-zinc-900 border-zinc-700";
  return "bg-checker border-zinc-300";
}

function placeholderTextClass(previewBg: PreviewBg): string {
  if (previewBg === "dark") return "text-zinc-400";
  return "text-zinc-500";
}

function LogoDropZone({
  brand,
  def,
  onChanged,
}: {
  brand: Brand;
  def: SlotDef;
  onChanged: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUrl = brand[def.brandField];

  const handleFile = async (file: File) => {
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error(`Unsupported file type. Use PNG, JPG, WEBP, or SVG.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
      return;
    }

    setBusy("upload");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/brands/${brand.id}/logo?slot=${def.slot}`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      toast.success("Logo uploaded");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy("delete");
    try {
      const res = await fetch(
        `/api/brands/${brand.id}/logo?slot=${def.slot}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Logo removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <Label className="text-[11px] font-medium text-foreground">{def.label}</Label>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={!!busy}
            title="Remove"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      <label
        htmlFor={`logo-input-${def.slot}-${brand.id}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "block w-full rounded-md border-2 border-dashed transition-colors cursor-pointer overflow-hidden relative",
          def.aspect,
          previewBgClasses(def.previewBg),
          dragOver && "border-primary ring-2 ring-primary/40",
          busy && "opacity-60 cursor-wait"
        )}
      >
        <input
          ref={inputRef}
          id={`logo-input-${def.slot}-${brand.id}`}
          type="file"
          accept={ALLOWED_MIME.join(",")}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
          disabled={!!busy}
        />

        {currentUrl ? (
          <div className="absolute inset-0 flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt={def.label}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center text-center p-2",
              placeholderTextClass(def.previewBg)
            )}
          >
            <ImageIcon className="h-4 w-4 mb-0.5 opacity-60" />
            <p className="text-[10px] font-medium leading-tight">Drop image</p>
            <p className="text-[9px] opacity-70 leading-tight">or click</p>
          </div>
        )}

        {busy === "upload" && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        )}
      </label>

      <div className="flex items-center justify-between gap-1 min-h-[18px]">
        <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">{def.helper}</p>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 shrink-0 text-muted-foreground"
            onClick={(e) => {
              e.preventDefault();
              inputRef.current?.click();
            }}
            disabled={!!busy}
            title="Replace"
          >
            <Upload className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function LogoManager({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["brands"] });

  const squareSlots = SLOTS.filter((s) => s.aspect === "aspect-square");
  const rectSlots = SLOTS.filter((s) => s.aspect === "aspect-[2/1]");

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ImageIcon className="h-3 w-3" />
            Brand Logos
          </Label>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Upload color, light-bg, and dark-bg variants for both square and rectangular shapes.
          The color square is used in the brand switcher; the transparent variants are used on
          generated cover slides and carousels.
        </p>

        <div className="space-y-5">
          <div>
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Square (1:1)
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {squareSlots.map((def) => (
                <LogoDropZone
                  key={def.slot}
                  brand={brand}
                  def={def}
                  onChanged={refresh}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Rectangular (2:1)
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {rectSlots.map((def) => (
                <LogoDropZone
                  key={def.slot}
                  brand={brand}
                  def={def}
                  onChanged={refresh}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
