import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { commsCampaignsService } from "../services";
import type {
  CampaignAudience,
  CampaignRecipientInput,
  CampaignStatus,
  CommsCampaignInput,
} from "../types/communication.types";

export const useCommsCampaigns = (filter: {
  status?: CampaignStatus | "all";
  audience?: CampaignAudience | "all";
} = {}) =>
  useQuery({
    queryKey: queryKeys.communication.campaigns(filter),
    queryFn: () => commsCampaignsService.list(filter),
    staleTime: 30_000,
  });

export const useCommsCampaign = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.communication.campaign(id ?? ""),
    queryFn: () => commsCampaignsService.get(id as string),
    enabled: !!id,
  });

export const useCommsCampaignRecipients = (campaignId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.communication.recipients(campaignId ?? ""),
    queryFn: () => commsCampaignsService.listRecipients(campaignId as string),
    enabled: !!campaignId,
  });

export const useCreateCommsCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, createdBy }: { input: CommsCampaignInput; createdBy?: string }) =>
      commsCampaignsService.create(input, createdBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Campaign created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateCommsCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CommsCampaignInput> }) =>
      commsCampaignsService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success("Campaign updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetCampaignStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectReason,
      approvedBy,
      actorId,
    }: {
      id: string;
      status: CampaignStatus;
      rejectReason?: string;
      approvedBy?: string;
      actorId?: string;
    }) => commsCampaignsService.setStatus(id, status, { rejectReason, approvedBy, actorId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success(`Campaign ${vars.status.replace("_", " ")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useAddCampaignRecipients = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      recipients,
    }: {
      campaignId: string;
      recipients: CampaignRecipientInput[];
    }) => commsCampaignsService.addRecipients(campaignId, recipients),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.recipients(vars.campaignId) });
      qc.invalidateQueries({ queryKey: queryKeys.communication.campaign(vars.campaignId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useLaunchCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actorId }: { id: string; actorId?: string }) =>
      commsCampaignsService.launch(id, { actorId }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.communication.all });
      toast.success(`Queued ${res.queued} message${res.queued === 1 ? "" : "s"}`);
      void vars;
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
