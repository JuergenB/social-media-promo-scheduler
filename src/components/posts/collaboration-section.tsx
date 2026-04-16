"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Save, Users } from "lucide-react";

interface CollaborationSectionProps {
  postId: string;
  collaborators: string[];
  userTags: string[];
  isPublished: boolean;
}

/** Strip @ prefix and whitespace from a username. */
function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** Parse comma-separated usernames, strip @, filter empties. */
function parseUsernames(input: string): string[] {
  return input
    .split(",")
    .map(cleanUsername)
    .filter((u) => u.length > 0);
}

export function CollaborationSection({
  postId,
  collaborators: initialCollaborators,
  userTags: initialUserTags,
  isPublished,
}: CollaborationSectionProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [collabInput, setCollabInput] = useState(initialCollaborators.join(", "));
  const [tagsInput, setTagsInput] = useState(initialUserTags.join(", "));

  const parsedCollabs = parseUsernames(collabInput);
  const parsedTags = parseUsernames(tagsInput);
  const collabError = parsedCollabs.length > 3 ? "Maximum 3 collaborators allowed" : null;

  // Summary for collapsed state
  const parts: string[] = [];
  if (initialCollaborators.length > 0) {
    parts.push(`${initialCollaborators.length} collaborator${initialCollaborators.length > 1 ? "s" : ""}`);
  }
  if (initialUserTags.length > 0) {
    parts.push(`${initialUserTags.length} tag${initialUserTags.length > 1 ? "s" : ""}`);
  }
  const summary = parts.join(", ");

  const hasChanges =
    JSON.stringify(parsedCollabs) !== JSON.stringify(initialCollaborators) ||
    JSON.stringify(parsedTags) !== JSON.stringify(initialUserTags);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborators: JSON.stringify(parsedCollabs),
          userTags: JSON.stringify(parsedTags),
        }),
      });
      if (!res.ok) throw new Error("Failed to save collaboration settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Collaboration settings saved");
    },
    onError: () => toast.error("Failed to save collaboration settings"),
  });

  return (
    <div className="px-6 pb-3">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <Users className="h-3.5 w-3.5" />
        Collaboration
        {summary && !expanded && (
          <span className="ml-auto text-xs text-muted-foreground font-normal">{summary}</span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4 pl-6">
          {/* Collaborators */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Collaborators <span className="text-muted-foreground font-normal">(max 3)</span>
            </label>
            <Input
              value={collabInput}
              onChange={(e) => setCollabInput(e.target.value)}
              placeholder="username1, username2"
              disabled={isPublished}
              className="text-sm h-8"
            />
            {collabError && (
              <p className="text-xs text-destructive">{collabError}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Invite these accounts as collaborators — they&apos;ll be asked to co-publish this post.
            </p>
          </div>

          {/* User Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Image Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="artistname, galleryname"
              disabled={isPublished}
              className="text-sm h-8"
            />
            <p className="text-[11px] text-muted-foreground">
              Tag these accounts on the image — the post appears on their Tagged tab.
            </p>
          </div>

          {/* Save */}
          {!isPublished && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!hasChanges || !!collabError || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-3 w-3 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
