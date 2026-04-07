"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw } from "lucide-react";

interface RegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guidance: string;
  onGuidanceChange: (guidance: string) => void;
  onRegenerate: () => void;
  isPending: boolean;
}

export function RegenerateDialog({
  open,
  onOpenChange,
  guidance,
  onGuidanceChange,
  onRegenerate,
  isPending,
}: RegenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regenerate Post</DialogTitle>
          <DialogDescription>
            Optionally describe what this post should focus on. Leave blank to generate a fresh take.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="e.g., Focus on the event itself, not a specific artist. Highlight the opening night details and CTA."
          value={guidance}
          onChange={(e) => onGuidanceChange(e.target.value)}
          rows={3}
          disabled={isPending}
        />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => { onOpenChange(false); onGuidanceChange(""); }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onRegenerate} disabled={isPending}>
            {isPending ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Regenerating...</>
            ) : (
              <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Regenerate</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
