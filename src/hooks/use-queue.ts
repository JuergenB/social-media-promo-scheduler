import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLate } from "./use-late";
import { useCurrentProfileId } from "./use-profiles";
import { useBrand } from "@/lib/brand-context";

export const queueKeys = {
  all: (brandId?: string) => ["queue", brandId ?? "default"] as const,
  queues: (profileId: string, brandId?: string) => ["queue", "queues", profileId, brandId ?? "default"] as const,
  slots: (profileId: string, brandId?: string) => ["queue", "slots", profileId, brandId ?? "default"] as const,
  preview: (profileId: string, count: number, brandId?: string) =>
    ["queue", "preview", profileId, count, brandId ?? "default"] as const,
  nextSlot: (profileId: string, brandId?: string) => ["queue", "nextSlot", profileId, brandId ?? "default"] as const,
};

// SDK-aligned types
// Note: API may return either `time` string or `hour`/`minute` numbers depending on how slot was created
export interface QueueSlot {
  dayOfWeek: number; // 0-6, Sunday = 0
  time?: string; // "HH:mm" format (preferred)
  hour?: number; // Legacy: 0-23
  minute?: number; // Legacy: 0-59
}

export interface QueueSchedule {
  _id?: string;
  profileId?: string;
  name?: string;
  timezone?: string;
  slots?: QueueSlot[];
  active?: boolean;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
  nextSlots?: string[]; // Computed upcoming slot times as ISO strings
}

// Helper functions for time conversion
export function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function parseTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

/**
 * Get the time string from a slot, handling both formats.
 * API may return either `time` string or `hour`/`minute` numbers.
 */
export function getSlotTime(slot: QueueSlot): string {
  if (slot.time) {
    return slot.time;
  }
  if (typeof slot.hour === "number" && typeof slot.minute === "number") {
    return formatTime(slot.hour, slot.minute);
  }
  return "00:00"; // fallback
}

/**
 * Normalize a slot to always have the `time` field.
 */
export function normalizeSlot(slot: QueueSlot): QueueSlot {
  return {
    dayOfWeek: slot.dayOfWeek,
    time: getSlotTime(slot),
  };
}

/**
 * Hook to fetch all queues for a profile
 */
export function useQueues(profileId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: queueKeys.queues(targetProfileId || "", brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.queue.listQueueSlots({
        query: { profileId: targetProfileId!, all: "true" },
      });
      if (error) throw error;
      return data as { queues?: QueueSchedule[]; count?: number };
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to fetch queue slots (single queue / default)
 */
export function useQueueSlots(profileId?: string, queueId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: queueKeys.slots(targetProfileId || "", brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.queue.listQueueSlots({
        query: { profileId: targetProfileId!, queueId },
      });
      if (error) throw error;
      return data as { exists?: boolean; schedule?: QueueSchedule; nextSlots?: string[] };
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to preview upcoming queue times
 */
export function useQueuePreview(count = 10, profileId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: queueKeys.preview(targetProfileId || "", count, brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.queue.previewQueue({
        query: { profileId: targetProfileId!, count },
      });
      if (error) throw error;
      return data as { profileId?: string; count?: number; slots?: string[] };
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to get the next available queue slot
 */
export function useNextQueueSlot(profileId?: string, queueId?: string) {
  const late = useLate();
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  const currentProfileId = useCurrentProfileId();
  const targetProfileId = profileId || currentProfileId;

  return useQuery({
    queryKey: queueKeys.nextSlot(targetProfileId || "", brandId),
    queryFn: async () => {
      if (!late) throw new Error("Not authenticated");
      const { data, error } = await late.queue.getNextQueueSlot({
        query: { profileId: targetProfileId!, queueId },
      });
      if (error) throw error;
      return data as {
        profileId?: string;
        nextSlot?: string;
        timezone?: string;
        queueId?: string;
        queueName?: string;
      };
    },
    enabled: !!late && !!targetProfileId,
  });
}

/**
 * Hook to create a new queue
 */
export function useCreateQueue() {
  const late = useLate();
  const queryClient = useQueryClient();
  const currentProfileId = useCurrentProfileId();

  return useMutation({
    mutationFn: async ({
      name,
      timezone,
      slots,
      active = true,
      profileId,
    }: {
      name: string;
      timezone: string;
      slots: QueueSlot[];
      active?: boolean;
      profileId?: string;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const targetProfileId = profileId || currentProfileId;
      if (!targetProfileId) throw new Error("No profile selected");

      const { data, error } = await late.queue.createQueueSlot({
        body: {
          profileId: targetProfileId,
          name,
          timezone,
          slots,
          active,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

/**
 * Hook to update queue slots
 */
export function useUpdateQueueSlots() {
  const late = useLate();
  const queryClient = useQueryClient();
  const currentProfileId = useCurrentProfileId();

  return useMutation({
    mutationFn: async ({
      slots,
      profileId,
      queueId,
      name,
      timezone,
      active,
      setAsDefault,
      reshuffleExisting,
    }: {
      slots: QueueSlot[];
      profileId?: string;
      queueId?: string;
      name?: string;
      timezone?: string;
      active?: boolean;
      setAsDefault?: boolean;
      reshuffleExisting?: boolean;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const targetProfileId = profileId || currentProfileId;
      if (!targetProfileId) throw new Error("No profile selected");

      const { data, error } = await late.queue.updateQueueSlot({
        body: {
          profileId: targetProfileId,
          queueId,
          name,
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          slots,
          active,
          setAsDefault,
          reshuffleExisting,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

/**
 * Hook to update a queue (name, active status, etc.)
 */
export function useUpdateQueue() {
  const late = useLate();
  const queryClient = useQueryClient();
  const currentProfileId = useCurrentProfileId();

  return useMutation({
    mutationFn: async ({
      queueId,
      name,
      timezone,
      slots,
      active,
      setAsDefault,
      profileId,
    }: {
      queueId: string;
      name?: string;
      timezone?: string;
      slots?: QueueSlot[];
      active?: boolean;
      setAsDefault?: boolean;
      profileId?: string;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const targetProfileId = profileId || currentProfileId;
      if (!targetProfileId) throw new Error("No profile selected");

      // We need to get the current queue to preserve existing values
      const { data: current } = await late.queue.listQueueSlots({
        query: { profileId: targetProfileId, queueId },
      });
      const currentSchedule = (current as { schedule?: QueueSchedule })?.schedule;

      const { data, error } = await late.queue.updateQueueSlot({
        body: {
          profileId: targetProfileId,
          queueId,
          name: name ?? currentSchedule?.name,
          timezone: timezone ?? currentSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          slots: slots ?? currentSchedule?.slots ?? [],
          active,
          setAsDefault,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

/**
 * Hook to delete a queue
 */
export function useDeleteQueue() {
  const late = useLate();
  const queryClient = useQueryClient();
  const currentProfileId = useCurrentProfileId();

  return useMutation({
    mutationFn: async ({
      queueId,
      profileId,
    }: {
      queueId: string;
      profileId?: string;
    }) => {
      if (!late) throw new Error("Not authenticated");
      const targetProfileId = profileId || currentProfileId;
      if (!targetProfileId) throw new Error("No profile selected");

      const { data, error } = await late.queue.deleteQueueSlot({
        query: { profileId: targetProfileId, queueId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

/**
 * Hook to toggle queue active status
 */
export function useToggleQueueActive() {
  const updateQueue = useUpdateQueue();

  return useMutation({
    mutationFn: async ({
      queueId,
      active,
      profileId,
    }: {
      queueId: string;
      active: boolean;
      profileId?: string;
    }) => {
      return updateQueue.mutateAsync({ queueId, active, profileId });
    },
  });
}

/**
 * Hook to set a queue as default
 */
export function useSetDefaultQueue() {
  const updateQueue = useUpdateQueue();

  return useMutation({
    mutationFn: async ({
      queueId,
      profileId,
    }: {
      queueId: string;
      profileId?: string;
    }) => {
      return updateQueue.mutateAsync({ queueId, setAsDefault: true, profileId });
    },
  });
}

/**
 * Days of the week for display
 */
export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAYS_OF_WEEK_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/**
 * Format a queue slot for display
 */
export function formatQueueSlot(slot: QueueSlot): string {
  const day = DAYS_OF_WEEK[slot.dayOfWeek];
  return `${day} at ${slot.time}`;
}

// Re-export timezone utilities from lib for convenience
export {
  COMMON_TIMEZONES,
  getUserTimezone,
  getTimezoneOptions,
  formatTimezoneDisplay,
} from "@/lib/timezones";
