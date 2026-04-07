/**
 * Hook to track "new" posts that haven't been opened yet.
 * Uses localStorage to persist across page refreshes.
 * Posts are considered "new" until:
 * - The user opens the post detail, OR
 * - 24 hours have elapsed since generation
 */

import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "polywiz-new-posts";
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface NewPostEntry {
  /** Timestamp when the post was marked as new (ms since epoch) */
  ts: number;
}

type NewPostMap = Record<string, NewPostEntry>;

function loadFromStorage(): NewPostMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NewPostMap;
    // Prune expired entries
    const now = Date.now();
    const pruned: NewPostMap = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (now - entry.ts < EXPIRY_MS) {
        pruned[id] = entry;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

function saveToStorage(map: NewPostMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useNewPosts() {
  const [newPostMap, setNewPostMap] = useState<NewPostMap>(() => loadFromStorage());
  const mapRef = useRef(newPostMap);
  mapRef.current = newPostMap;

  // Sync to localStorage whenever map changes
  useEffect(() => {
    saveToStorage(newPostMap);
  }, [newPostMap]);

  /** Mark a set of post IDs as "new" (e.g., after generation completes) */
  const markNew = useCallback((postIds: string[]) => {
    if (postIds.length === 0) return;
    const now = Date.now();
    setNewPostMap((prev) => {
      const next = { ...prev };
      for (const id of postIds) {
        next[id] = { ts: now };
      }
      return next;
    });
  }, []);

  /** Dismiss a single post (e.g., when user opens it) */
  const dismissNew = useCallback((postId: string) => {
    setNewPostMap((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  }, []);

  /** Check if a post is "new" */
  const isNew = useCallback(
    (postId: string): boolean => {
      const entry = newPostMap[postId];
      if (!entry) return false;
      if (Date.now() - entry.ts >= EXPIRY_MS) return false;
      return true;
    },
    [newPostMap]
  );

  /** Get the set of currently new post IDs */
  const newPostIds = new Set(
    Object.entries(newPostMap)
      .filter(([, entry]) => Date.now() - entry.ts < EXPIRY_MS)
      .map(([id]) => id)
  );

  return { markNew, dismissNew, isNew, newPostIds };
}
