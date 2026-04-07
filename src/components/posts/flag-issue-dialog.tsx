"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackSeverity,
} from "@/lib/airtable/types";
import { toast } from "sonner";

const SEVERITY_OPTIONS: FeedbackSeverity[] = ["Minor", "Moderate", "Critical"];

interface FlagIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: { id: string; platform: string };
  campaign: { id: string };
}

export function FlagIssueDialog({ open, onOpenChange, post, campaign }: FlagIssueDialogProps) {
  const [selectedCategories, setSelectedCategories] = useState<Set<FeedbackCategory>>(new Set());
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FeedbackSeverity>("Minor");
  const [submitting, setSubmitting] = useState(false);

  const toggleCategory = (cat: FeedbackCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedCategories.size === 0) {
      toast.error("Please select at least one issue category");
      return;
    }

    setSubmitting(true);
    try {
      const categories = Array.from(selectedCategories);
      const summary = categories.length === 1
        ? categories[0] + " — " + post.platform
        : categories.length + " issues — " + post.platform;

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          campaignIds: [campaign.id],
          postIds: [post.id],
          campaignTypeIds: [],
          issueCategories: categories,
          description,
          severity,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit feedback");

      toast.success("Feedback submitted");
      onOpenChange(false);
      setSelectedCategories(new Set());
      setDescription("");
      setSeverity("Minor");
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flag Issue</DialogTitle>
          <DialogDescription>
            Report a problem with this {post.platform} post. This feedback helps
            improve future content generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Issue Category
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedCategories.has(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  {cat}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Description (optional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue in more detail..."
              className="text-sm"
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Severity
            </Label>
            <div className="flex gap-3">
              {SEVERITY_OPTIONS.map((sev) => (
                <label key={sev} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="severity"
                    value={sev}
                    checked={severity === sev}
                    onChange={() => setSeverity(sev)}
                    className="accent-primary"
                  />
                  {sev}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedCategories.size === 0}>
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
