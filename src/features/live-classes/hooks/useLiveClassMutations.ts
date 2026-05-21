import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { liveClassesService } from "../services/liveClasses.service";
import type {
  CreateLiveClassInput,
  LiveClass,
  LiveClassStatus,
  UpdateLiveClassInput,
} from "../types/liveClass.types";

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.liveClasses.all });
};

/** Create a live class (also enqueues WhatsApp notifications, server-side). */
export const useCreateLiveClass = () => {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation<LiveClass, Error, CreateLiveClassInput>({
    mutationFn: (input) => liveClassesService.create(input, user?.profileId),
    onSuccess: invalidate,
  });
};

export const useUpdateLiveClass = () => {
  const invalidate = useInvalidate();
  return useMutation<LiveClass, Error, { id: string; updates: UpdateLiveClassInput }>({
    mutationFn: ({ id, updates }) => liveClassesService.update(id, updates),
    onSuccess: invalidate,
  });
};

export const useDeleteLiveClass = () => {
  const invalidate = useInvalidate();
  return useMutation<void, Error, string>({
    mutationFn: (id) => liveClassesService.remove(id),
    onSuccess: invalidate,
  });
};

export const useRescheduleClass = () => {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation<
    LiveClass,
    Error,
    { id: string; startDate: string; startTime: string; endTime: string }
  >({
    mutationFn: ({ id, ...when }) =>
      liveClassesService.reschedule(id, when, user?.profileId),
    onSuccess: invalidate,
  });
};

export const useCancelClass = () => {
  const invalidate = useInvalidate();
  return useMutation<LiveClass, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => liveClassesService.cancel(id, reason),
    onSuccess: invalidate,
  });
};

export const useCompleteClass = () => {
  const invalidate = useInvalidate();
  return useMutation<
    LiveClass,
    Error,
    { id: string; recordingUrl?: string; classNotes?: string }
  >({
    mutationFn: ({ id, ...payload }) => liveClassesService.complete(id, payload),
    onSuccess: invalidate,
  });
};

export const useSetClassStatus = () => {
  const invalidate = useInvalidate();
  return useMutation<LiveClass, Error, { id: string; status: LiveClassStatus }>({
    mutationFn: ({ id, status }) => liveClassesService.setStatus(id, status),
    onSuccess: invalidate,
  });
};
