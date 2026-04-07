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
}

export function ImageDropZone({ onFileUpload, onUrlAdd, isUploading, onClose }: ImageDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) onFileUpload(files[0]);
  };

  const handlePasteUrl = () => {
    const url = imageUrlInput.trim();
    if (url) {
      onUrlAdd(url);
      setImageUrlInput("");
    }
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
            <p className="text-sm text-muted-foreground">Drag & drop an image</p>
            <label className="inline-block mt-1">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileUpload(file);
                }}
              />
              <span className="text-xs text-primary hover:underline cursor-pointer">
                Browse files
              </span>
            </label>
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
