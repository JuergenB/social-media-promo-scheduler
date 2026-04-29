"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Users, X } from "lucide-react";
import type { Post } from "@/lib/airtable/types";
import { getPostDirtyActions } from "@/hooks/use-post-dirty";

const LS_COLLABS_KEY = "polywiz-recent-collaborators";
const LS_TAGS_KEY = "polywiz-recent-user-tags";
const MAX_RECENT = 8;

interface CollaborationSectionProps {
  postId: string;
  collaborators: string[];
  userTags: string[];
  isPublished: boolean;
  /** Optional: sync a local Post state (used by Quick Post which doesn't read from React Query). */
  onPostChange?: (fields: { collaborators: string; userTags: string }) => void;
}

/** Ensure @ prefix on a handle. */
const ensureAt = (h: string) => (h.startsWith("@") ? h : `@${h}`);

/** Strip @ for comparison. */
const stripAt = (h: string) => h.replace(/^@/, "").toLowerCase();

/** Parse comma-separated usernames, trim whitespace, ensure @ prefix, filter empties. */
function parseUsernames(input: string): string[] {
  return input
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .map(ensureAt);
}

/** Read recent handles from localStorage. */
function getRecent(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Merge new handles into the recent list (most recent first, deduped, capped). */
function saveRecent(key: string, handles: string[]) {
  if (handles.length === 0) return;
  try {
    const existing = getRecent(key);
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const h of [...handles, ...existing]) {
      const lc = h.toLowerCase();
      if (!seen.has(lc)) {
        seen.add(lc);
        merged.push(h);
      }
    }
    localStorage.setItem(key, JSON.stringify(merged.slice(0, MAX_RECENT)));
  } catch { /* localStorage unavailable */ }
}

/** Remove a handle from the recent list in localStorage. */
function removeRecent(key: string, handle: string) {
  try {
    const existing = getRecent(key);
    localStorage.setItem(key, JSON.stringify(existing.filter((h) => h.toLowerCase() !== handle.toLowerCase())));
  } catch { /* localStorage unavailable */ }
}

/** Append a handle to a comma-separated input value. */
function appendHandle(currentInput: string, handle: string): string {
  const existing = parseUsernames(currentInput);
  if (existing.some((h) => stripAt(h) === stripAt(handle))) return currentInput;
  return [...existing, handle].join(", ");
}

export function CollaborationSection({
  postId,
  collaborators: initialCollaborators,
  userTags: initialUserTags,
  isPublished,
  onPostChange,
}: CollaborationSectionProps) {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collabInput, setCollabInput] = useState(initialCollaborators.map(ensureAt).join(", "));
  const [tagsInput, setTagsInput] = useState(initialUserTags.map(ensureAt).join(", "));
  const [chipVersion, setChipVersion] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  const parsedCollabs = parseUsernames(collabInput);
  const parsedTags = parseUsernames(tagsInput);
  const collabError = parsedCollabs.length > 3 ? "Maximum 3 collaborators allowed" : null;

  // Latest parsed values, dereferenced inside debounced/async callbacks to avoid
  // stale-closure overwrites (#163).
  const latestRef = useRef({ parsedCollabs, parsedTags });
  latestRef.current = { parsedCollabs, parsedTags };

  // Recent handles from localStorage
  const recentCollabs = expanded && chipVersion >= 0 ? getRecent(LS_COLLABS_KEY) : [];
  const recentTags = expanded && chipVersion >= 0 ? getRecent(LS_TAGS_KEY) : [];

  // Filter out handles already in the current input
  const collabSet = new Set(parsedCollabs.map(stripAt));
  const tagSet = new Set(parsedTags.map(stripAt));
  const availableCollabs = recentCollabs.filter((h) => !collabSet.has(stripAt(h)));
  const availableTags = recentTags.filter((h) => !tagSet.has(stripAt(h)));

  // Summary — always from current input values
  const parts: string[] = [];
  if (parsedCollabs.length > 0) {
    parts.push(`${parsedCollabs.length} collaborator${parsedCollabs.length > 1 ? "s" : ""}`);
  }
  if (parsedTags.length > 0) {
    parts.push(`${parsedTags.length} tag${parsedTags.length > 1 ? "s" : ""}`);
  }
  const summary = parts.join(", ");

  const normalizedInitialCollabs = initialCollaborators.map(ensureAt);
  const normalizedInitialTags = initialUserTags.map(ensureAt);
  const hasChanges =
    JSON.stringify(parsedCollabs) !== JSON.stringify(normalizedInitialCollabs) ||
    JSON.stringify(parsedTags) !== JSON.stringify(normalizedInitialTags);

  const saveMutation = useMutation({
    onMutate: () => getPostDirtyActions().markDirty(postId),
    mutationFn: async (payload: { collaborators: string[]; userTags: string[] }) => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborators: JSON.stringify(payload.collaborators),
          userTags: JSON.stringify(payload.userTags),
        }),
      });
      if (!res.ok) throw new Error("Failed to save collaboration settings");
    },
    onSuccess: (_data, payload) => {
      saveRecent(LS_COLLABS_KEY, payload.collaborators);
      saveRecent(LS_TAGS_KEY, payload.userTags);
      // Write saved values into the cache directly — skip the refetch round-trip
      // which can return stale data (Airtable read-after-write delay).
      const collaboratorsJson = JSON.stringify(payload.collaborators);
      const userTagsJson = JSON.stringify(payload.userTags);
      queryClient.setQueriesData<{ posts: Post[] } | undefined>(
        { queryKey: ["campaign"] },
        (old) => {
          if (!old?.posts) return old;
          return {
            ...old,
            posts: old.posts.map((p) =>
              p.id === postId ? { ...p, collaborators: collaboratorsJson, userTags: userTagsJson } : p
            ),
          };
        }
      );
      onPostChange?.({ collaborators: collaboratorsJson, userTags: userTagsJson });
      toast.success("Collaboration saved");
    },
    onError: () => toast.error("Failed to save collaboration settings"),
  });

  // Auto-save: debounced on blur, immediate on collapse or chip click
  const triggerSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const { parsedCollabs, parsedTags } = latestRef.current;
    saveMutation.mutate({ collaborators: parsedCollabs, userTags: parsedTags });
  }, [saveMutation]);

  const handleBlur = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const { parsedCollabs, parsedTags } = latestRef.current;
        saveMutation.mutate({ collaborators: parsedCollabs, userTags: parsedTags });
      }
    }, 500);
  }, [saveMutation]);

  // Flush on unmount — if the user closes the dialog while a debounced save is
  // pending (or while dirty), send the PATCH before teardown. fetch() continues
  // even after the component unmounts.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const { parsedCollabs, parsedTags } = latestRef.current;
        fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collaborators: JSON.stringify(parsedCollabs),
            userTags: JSON.stringify(parsedTags),
          }),
          keepalive: true,
        }).catch(() => { /* best-effort flush */ });
      }
    };
  }, [postId]);

  const handleRemoveChip = (key: string, handle: string) => {
    removeRecent(key, handle);
    setChipVersion((v) => v + 1);
  };

  const handleChipAdd = (setter: (v: string) => void, currentInput: string, handle: string) => {
    setter(appendHandle(currentInput, handle));
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      const { parsedCollabs, parsedTags } = latestRef.current;
      saveMutation.mutate({ collaborators: parsedCollabs, userTags: parsedTags });
    }, 300);
  };

  return (
    <div className="border-t border-border">
      <button
        onClick={() => {
          const opening = !expanded;
          setExpanded(opening);
          if (!opening && dirtyRef.current && !isPublished && parsedCollabs.length <= 3) {
            dirtyRef.current = false;
            triggerSave();
          } else if (opening) {
            requestAnimationFrame(() => {
              contentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
          }
        }}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="h-3 w-3" />
        <span>Collaboration</span>
        {summary && (
          <span className="text-[10px] text-muted-foreground/60">({summary})</span>
        )}
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {expanded && (
        <div ref={contentRef} className="px-6 pb-3">
          {isPublished ? (
            <div className="text-xs leading-relaxed text-muted-foreground">
              {initialCollaborators.length > 0 && (
                <div>Collaborators: {initialCollaborators.map(ensureAt).join(", ")}</div>
              )}
              {initialUserTags.length > 0 && (
                <div>Image tags: {initialUserTags.map(ensureAt).join(", ")}</div>
              )}
              {initialCollaborators.length === 0 && initialUserTags.length === 0 && (
                <span className="italic">None</span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Collaborators (max 3)</label>
                <input
                  value={collabInput}
                  onChange={(e) => { setCollabInput(e.target.value); dirtyRef.current = true; }}
                  onBlur={handleBlur}
                  placeholder="@username1, @username2 (comma-separated)"
                  className="w-full text-xs leading-relaxed bg-background border rounded-md p-2"
                />
                {collabError && (
                  <p className="text-[10px] text-destructive">{collabError}</p>
                )}
                {availableCollabs.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {availableCollabs.map((h) => (
                      <span key={h} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground transition-colors">
                        <span
                          className="hover:text-foreground cursor-pointer"
                          onClick={() => handleChipAdd(setCollabInput, collabInput, h)}
                        >
                          + {h}
                        </span>
                        <button
                          type="button"
                          className="hover:text-destructive ml-0.5"
                          onClick={() => handleRemoveChip(LS_COLLABS_KEY, h)}
                          title="Remove from suggestions"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Image Tags</label>
                <input
                  value={tagsInput}
                  onChange={(e) => { setTagsInput(e.target.value); dirtyRef.current = true; }}
                  onBlur={handleBlur}
                  placeholder="@artistname, @galleryname (comma-separated)"
                  className="w-full text-xs leading-relaxed bg-background border rounded-md p-2"
                />
                {availableTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {availableTags.map((h) => (
                      <span key={h} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground transition-colors">
                        <span
                          className="hover:text-foreground cursor-pointer"
                          onClick={() => handleChipAdd(setTagsInput, tagsInput, h)}
                        >
                          + {h}
                        </span>
                        <button
                          type="button"
                          className="hover:text-destructive ml-0.5"
                          onClick={() => handleRemoveChip(LS_TAGS_KEY, h)}
                          title="Remove from suggestions"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
