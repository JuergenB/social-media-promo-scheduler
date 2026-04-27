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
  | "light-square"
  | "dark-square"
  | "light-rect"
  | "dark-rect";

interface SlotDef {
  slot: LogoSlot;
  label: string;
  helper: string;
  /** Background swatch behind the preview — opposite of the logo's intended bg. */
  previewBg: "light" | "dark";
  /** Aspect class (Tailwind) for the drop target. */
  aspect: string;
  /** Map to the camelCase Brand field that stores this slot's URL. */
  brandField: keyof Pick<
    Brand,
    | "logoTransparentDark" // light-square (logo art is dark, lives on light bg)
    | "logoTransparentLight" // dark-square (logo art is light, lives on dark bg)
    | "logoRectangularLight" // light-rect (wordmark for light bg)
    | "logoRectangularDark" // dark-rect (wordmark for dark bg)
  >;
}

const SLOTS: SlotDef[] = [
  {
    slot: "light-square",
    label: "Square — Light Background",
    helper: "Dark/black logo art for placement on light backgrounds.",
    previewBg: "light",
    aspect: "aspect-square",
    brandField: "logoTransparentDark",
  },
  {
    slot: "dark-square",
    label: "Square — Dark Background",
    helper: "Light/white logo art for placement on dark backgrounds.",
    previewBg: "dark",
    aspect: "aspect-square",
    brandField: "logoTransparentLight",
  },
  {
    slot: "light-rect",
    label: "Rectangular — Light Background",
    helper: "Wordmark or horizontal logo for use over light backgrounds.",
    previewBg: "light",
    aspect: "aspect-[2/1]",
    brandField: "logoRectangularLight",
  },
  {
    slot: "dark-rect",
    label: "Rectangular — Dark Background",
    helper: "Wordmark or horizontal logo for use over dark backgrounds.",
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
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium text-foreground">{def.label}</Label>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={!!busy}
          >
            {busy === "delete" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-3 w-3 mr-1" />
                Remove
              </>
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
          "block w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer overflow-hidden relative",
          def.aspect,
          def.previewBg === "light"
            ? "bg-white border-zinc-300"
            : "bg-zinc-900 border-zinc-700",
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
          <div className="absolute inset-0 flex items-center justify-center p-4">
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
              "absolute inset-0 flex flex-col items-center justify-center text-center p-3",
              def.previewBg === "light" ? "text-zinc-500" : "text-zinc-400"
            )}
          >
            <ImageIcon className="h-6 w-6 mb-1.5 opacity-60" />
            <p className="text-xs font-medium">Drag &amp; drop</p>
            <p className="text-[10px] opacity-70">or click to browse</p>
            <p className="text-[10px] mt-1 opacity-50">PNG, JPG, WEBP, SVG &middot; max 5MB</p>
          </div>
        )}

        {busy === "upload" && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </label>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground leading-tight">{def.helper}</p>
        {currentUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-muted-foreground"
            onClick={(e) => {
              e.preventDefault();
              inputRef.current?.click();
            }}
            disabled={!!busy}
          >
            <Upload className="h-3 w-3 mr-1" />
            Replace
          </Button>
        )}
      </div>
    </div>
  );
}

export function LogoManager({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["brands"] });

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
          Upload square and rectangular logo variants for use across cover slides,
          carousels, and other generated assets. Each slot is paired with a
          contrasting preview background so you can verify legibility.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {SLOTS.map((def) => (
            <LogoDropZone
              key={def.slot}
              brand={brand}
              def={def}
              onChanged={refresh}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
