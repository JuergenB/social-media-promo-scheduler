"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload } from "lucide-react";

interface ImageDropZoneProps {
  onFileUpload: (file: File) => void;
  onUrlAdd: (url: string) => void;
  isUploading?: boolean;
  onClose?: () => void;
  /** When true, the drop zone also accepts a single PDF file routed through
   *  `onPdfUpload`. LinkedIn-only — gates the PDF carousel override flow. */
  acceptPdf?: boolean;
  /** Callback invoked when a PDF is dropped/picked. Caller is responsible for
   *  the Vercel Blob client-upload + finalize round-trip. Required if acceptPdf. */
  onPdfUpload?: (file: File) => void;
  /** When true, picking an image prompts the user — adding images to a post
   *  with an attached PDF detaches the PDF (only one publish path can win). */
  pdfAttached?: boolean;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function ImageDropZone({
  onFileUpload,
  onUrlAdd,
  isUploading,
  onClose,
  acceptPdf = false,
  onPdfUpload,
  pdfAttached = false,
}: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const routeFile = (file: File) => {
    setErrorMsg(null);
    if (file.type === "application/pdf") {
      if (!acceptPdf || !onPdfUpload) {
        setErrorMsg("PDF carousels are only supported on LinkedIn posts.");
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        setErrorMsg(
          `PDF exceeds 25 MB (got ${(file.size / 1024 / 1024).toFixed(1)} MB). Optimize externally and re-attach.`,
        );
        return;
      }
      onPdfUpload(file);
      return;
    }
    if (file.type.startsWith("image/")) {
      if (pdfAttached) {
        const ok = window.confirm(
          "A PDF carousel is currently attached. Adding an image will detach the PDF and switch back to the auto-assembly carousel. Continue?",
        );
        if (!ok) return;
      }
      onFileUpload(file);
      return;
    }
    setErrorMsg(
      acceptPdf
        ? "Only image files or a PDF are supported here."
        : "Only image files are supported here.",
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const first = files[0];
    if (first) routeFile(first);
  };

  const handlePasteUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (pdfAttached) {
      const ok = window.confirm(
        "A PDF carousel is currently attached. Adding an image will detach the PDF and switch back to the auto-assembly carousel. Continue?",
      );
      if (!ok) return;
    }
    onUrlAdd(url);
    setImageUrlInput("");
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-4 space-y-3 transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      )}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
    >
      <div className="text-center py-3">
        {isUploading ? (
          <>
            <Loader2 className="h-6 w-6 mx-auto text-primary mb-1 animate-spin" />
            <p className="text-sm text-muted-foreground">Compressing & uploading...</p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">
              {acceptPdf
                ? "Drag & drop an image, or a PDF for LinkedIn carousel"
                : "Drag & drop an image"}
            </p>
            {acceptPdf && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Maximum 25 MB for LinkedIn PDF
              </p>
            )}
            <label className="inline-block mt-1">
              <input
                type="file"
                accept={acceptPdf ? "image/*,application/pdf" : "image/*"}
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) routeFile(file);
                }}
              />
              <span className="text-xs text-primary hover:underline cursor-pointer">
                Browse files
              </span>
            </label>
            {errorMsg && (
              <p className="text-xs text-destructive mt-2">{errorMsg}</p>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="Paste image URL..."
          value={imageUrlInput}
          onChange={(e) => setImageUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePasteUrl()}
          className="text-sm"
        />
        <Button
          size="sm"
          onClick={handlePasteUrl}
          disabled={!imageUrlInput.trim()}
        >
          Add
        </Button>
      </div>
      {onClose && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={onClose}
        >
          Done
        </Button>
      )}
    </div>
  );
}
