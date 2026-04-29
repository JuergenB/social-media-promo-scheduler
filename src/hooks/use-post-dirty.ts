"use client";

import { create } from "zustand";

/**
 * Optimistic per-post dirty tracker. Edit hooks call `markDirty(postId)` the
 * moment a mutation fires (in onMutate, before the network request) so the
 * Apply Changes button surfaces immediately — without waiting for the server
 * to set `Lnk.Bio Sync Pending` and a refetch to land.
 *
 * The Apply Changes UI uses `usePostDirty(postId) || post.lnkBioSyncPending`,
 * so cross-tab / page-reload state is still server-driven.
 */
interface DirtyState {
  ids: Set<string>;
  markDirty: (postId: string) => void;
  clearDirty: (postId: string) => void;
}

const useDirtyStore = create<DirtyState>((set) => ({
  ids: new Set<string>(),
  markDirty: (postId) =>
    set((s) => {
      if (s.ids.has(postId)) return s;
      const next = new Set(s.ids);
      next.add(postId);
      return { ids: next };
    }),
  clearDirty: (postId) =>
    set((s) => {
      if (!s.ids.has(postId)) return s;
      const next = new Set(s.ids);
      next.delete(postId);
      return { ids: next };
    }),
}));

/** Subscribe to one post's optimistic dirty state. */
export function usePostDirty(postId: string): boolean {
  return useDirtyStore((s) => s.ids.has(postId));
}

/** Imperative actions for use inside mutations. */
export function getPostDirtyActions() {
  const { markDirty, clearDirty } = useDirtyStore.getState();
  return { markDirty, clearDirty };
}

/** Hook variant for component-scope usage (subscribed; re-renders on change). */
export function usePostDirtyActions() {
  const markDirty = useDirtyStore((s) => s.markDirty);
  const clearDirty = useDirtyStore((s) => s.clearDirty);
  return { markDirty, clearDirty };
}
