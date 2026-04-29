"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, MessageSquare, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPlatformId } from "@/lib/platform-constants";
import type { Post } from "@/lib/airtable/types";
import { getPostDirtyActions } from "@/hooks/use-post-dirty";

const FIRST_COMMENT_PLATFORMS = ["instagram", "facebook", "linkedin"];

interface Props {
  post: Post;
  isPublished: boolean;
  /** Optional: sync a local Post state (used by Quick Post which doesn't read from React Query). */
  onPostChange?: (post: Post) => void;
}

/**
 * Collapsible "First Comment" editor for Instagram/Facebook/LinkedIn.
 * Saves directly to the React Query cache on success to sidestep Airtable
 * read-after-write delay (see issue #154).
 *
 * Renders even when empty if the post isn't published yet, so users can
 * author a first comment from scratch (needed for Quick Post — #155).
 */
export function PostFirstComment({ post, isPublished, onPostChange }: Props) {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(post.firstComment || "");
  const [prevPostId, setPrevPostId] = useState(post.id);

  const platformLower = toPlatformId(post.platform);
  const supported = FIRST_COMMENT_PLATFORMS.includes(platformLower);

  if (prevPostId !== post.id) {
    setPrevPostId(post.id);
    setEdited(post.firstComment || "");
    setEditing(false);
    setExpanded(false);
  }

  const save = useMutation({
    onMutate: () => getPostDirtyActions().markDirty(post.id),
    mutationFn: async (firstComment: string) => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstComment }),
      });
      if (!res.ok) throw new Error("Failed to save first comment");
    },
    onSuccess: (_data, firstComment) => {
      setEditing(false);
      queryClient.setQueriesData<{ posts: Post[] } | undefined>(
        { queryKey: ["campaign"] },
        (old) => {
          if (!old?.posts) return old;
          return {
            ...old,
            posts: old.posts.map((p) =>
              p.id === post.id ? { ...p, firstComment } : p
            ),
          };
        }
      );
      onPostChange?.({ ...post, firstComment });
      toast.success("First comment saved");
    },
    onError: () => toast.error("Failed to save first comment"),
  });

  // Hide entirely on unsupported platforms, or on published posts with no content.
  if (!supported) return null;
  if (isPublished && !post.firstComment) return null;

  const hashtagCount = post.firstComment
    ? (post.firstComment.match(/#\w+/g) || []).length
    : 0;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => {
          setExpanded((v) => !v);
          if (!expanded) {
            requestAnimationFrame(() =>
              contentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            );
          }
        }}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageSquare className="h-3 w-3" />
        <span>First Comment</span>
        {hashtagCount > 0 && (
          <span className="text-[10px] text-muted-foreground/60">({hashtagCount} hashtags)</span>
        )}
        {!post.firstComment && !isPublished && (
          <span className="text-[10px] text-muted-foreground/60 italic">(empty — click to add)</span>
        )}
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div ref={contentRef} className="px-6 pb-3">
          {editing && !isPublished ? (
            <div className="space-y-2">
              <textarea
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
                className="w-full text-xs leading-relaxed bg-background border rounded-md p-2 min-h-[80px] resize-y"
                placeholder="Engagement hook + hashtags..."
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  disabled={save.isPending || edited === (post.firstComment || "")}
                  onClick={() => save.mutate(edited)}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {save.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setEdited(post.firstComment || "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "text-xs leading-relaxed text-muted-foreground min-h-[24px]",
                !isPublished && "cursor-pointer hover:text-foreground"
              )}
              onClick={() => {
                if (!isPublished) {
                  setEditing(true);
                  setEdited(post.firstComment || "");
                }
              }}
              title={isPublished ? undefined : "Click to edit"}
            >
              {post.firstComment || (
                <span className="italic text-muted-foreground/60">No first comment yet — click to add hashtags or credits.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
