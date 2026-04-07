"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, RotateCcw } from "lucide-react";
import type { OptimizePreview } from "@/hooks/use-image-optimize";

interface OptimizePreviewDialogProps {
  preview: OptimizePreview | null;
  platform: string;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
}

export function OptimizePreviewDialog({
  preview,
  platform,
  onAccept,
  onReject,
  onRetry,
}: OptimizePreviewDialogProps) {
  return (
    <Dialog open={!!preview} onOpenChange={(open) => !open && onReject()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Optimized for {platform}</DialogTitle>
          <DialogDescription>
            {preview?.dimensions} — generated in {preview?.duration}s. Accept, retry, or dismiss.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 text-center">Original</p>
              <img src={preview.originalUrl} alt="Original" className="w-full rounded border object-contain max-h-56 bg-muted" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 text-center">Optimized ({preview.dimensions})</p>
              <img src={preview.optimizedUrl} alt="Optimized" className="w-full rounded border object-contain max-h-56 bg-muted" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onReject}>
            Dismiss
          </Button>
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
          <Button onClick={onAccept}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
