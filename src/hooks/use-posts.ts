import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLate } from "./use-late";
import { useCurrentProfileId } from "./use-profiles";
import { useBrand } from "@/lib/brand-context";
import type { Platform, PlatformSpecificData } from "@/lib/late-api";

export const postKeys = {
  all: (brandId?: string) => ["posts", brandId ?? "default"] as const,
  lists: (brandId?: string) => ["posts", "list", brandId ?? "default"] as const,
  list: (filters: PostFilters, brandId?: string) => ["posts", "list", brandId ?? "default", filters] as const,
  detail: (postId: string, brandId?: string) => ["posts", "detail", brandId ?? "default", postId] as const,
};

export interface PostFilters {
  profileId?: string;
  status?: "draft" | "scheduled" | "publishing" | "published" | "failed";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface MediaItem {
  type: "image" | "video";
  url: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface PlatformPost {
  platform: Platform;
  accountId: string;
  customContent?: string;
  platformSpecificData?: PlatformSpecificData;
}

export interface CreatePostInput {
  content: string;
  mediaItems?: MediaItem[];
  platforms: PlatformPost[];
  scheduledFor?: string;
  publishNow?: boolean;
  timezone?: string;
  queuedFromProfile?: string;
}

export interface UpdatePostInput {
  postId: string;
  content?: string;
  mediaItems?: MediaItem[];
  platforms?: PlatformPost[];
  scheduledFor?: string;
}

/**
 * Hook to fetch posts with filters
 */
export function usePosts(filters: PostFilters = {}) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const profileId = filters.profileId || currentProfileId;

  return useQuery({
    queryKey: postKeys.list({ ...filters, profileId }, brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.posts.listPosts({
        query: {
          profileId,
          status: filters.status,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          page: filters.page,
          limit: filters.limit || 50,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!late && !!profileId,
  });
}

/**
 * Hook to fetch a single post
 */
export function usePost(postId: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: postKeys.detail(postId, brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.posts.getPost({
        path: { postId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!late && !!postId,
  });
}

/**
 * Hook to create a post
 */
export function useCreatePost() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.posts.createPost({
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all list queries but not details (they aren't affected)
      queryClient.invalidateQueries({ queryKey: ["posts", "list"] });
    },
  });
}

/**
 * Hook to update a post
 */
export function useUpdatePost() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, ...input }: UpdatePostInput) => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.posts.updatePost({
        path: { postId },
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { postId }) => {
      // Invalidate the specific post detail and all lists (post may appear in multiple list views)
      queryClient.invalidateQueries({ queryKey: ["posts", "detail"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "list"] });
    },
  });
}

/**
 * Hook to delete a post
 */
export function useDeletePost() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!late) throw new Error("Not authenticated");
      const { error } = await late.posts.deletePost({
        path: { postId },
      });
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      // Remove the deleted post from cache and invalidate lists
      queryClient.removeQueries({ queryKey: ["posts", "detail"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "list"] });
    },
  });
}

/**
 * Hook to retry a failed post
 */
export function useRetryPost() {
  const late = useLate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.posts.retryPost({
        path: { postId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, postId) => {
      // Invalidate the specific post and all lists (status changes)
      queryClient.invalidateQueries({ queryKey: ["posts", "detail"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "list"] });
    },
  });
}

/**
 * Hook to fetch posts for calendar view (by date range)
 */
export function useCalendarPosts(dateFrom: string, dateTo: string) {
  return usePosts({
    dateFrom,
    dateTo,
    limit: 500, // Get more posts for calendar view
  });
}

/**
 * Hook to fetch scheduled posts
 */
export function useScheduledPosts(limit = 10) {
  return usePosts({
    status: "scheduled",
    limit,
  });
}

/**
 * Hook to fetch recent posts (published)
 */
export function useRecentPosts(limit = 10) {
  return usePosts({
    status: "published",
    limit,
  });
}
