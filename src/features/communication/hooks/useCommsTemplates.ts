import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsTemplatesService } from "../services";
import type { CommsTemplateInput } from "../types/communication.types";

export const useCommsTemplates = () =>
  useQuery({
    queryKey: queryKeys.communication.templates(),
    queryFn: () => commsTemplatesService.list(),
    staleTime: 5 * 60 * 1000,
  });

export const useCommsTemplate = (key: string | undefined, language = "en") =>
  useQuery({
    queryKey: queryKeys.communication.templateByKey(key ?? "", language),
    queryFn: () => commsTemplatesService.getByKey(key as string, language),
    enabled: !!key,
    staleTime: 5 * 60 * 1000,
  });

export const useCreateCommsTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CommsTemplateInput) => commsTemplatesService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Template created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateCommsTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CommsTemplateInput> }) =>
      commsTemplatesService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Template updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteCommsTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commsTemplatesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
