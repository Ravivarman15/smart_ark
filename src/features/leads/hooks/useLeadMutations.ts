import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { leadIntakeService } from "../services/leadIntake.service";
import { leadActionsService } from "../services/leadActions.service";
import { leadsService } from "../services/leads.service";
import type { CreateLeadInput, IntakeResult, Lead, LeadStatus } from "../types/lead.types";

/** Invalidate everything a lead change can affect (lists, detail, dashboards, reports). */
const useInvalidateLeads = () => {
  const qc = useQueryClient();
  return (leadId?: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.leads.all });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    if (leadId) qc.invalidateQueries({ queryKey: queryKeys.leads.detail(leadId) });
  };
};

const useActor = () => {
  const { user } = useAuth();
  return { profileId: user?.profileId, name: user?.name };
};

/** Create a lead through the full automation pipeline. */
export const useCreateLead = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<IntakeResult, Error, CreateLeadInput>({
    mutationFn: (input) => leadIntakeService.intake(input, actor),
    onSuccess: (r) => invalidate(r.lead.id),
  });
};

export const useUpdateLeadStage = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<void, Error, { lead: Lead; to: LeadStatus }>({
    mutationFn: ({ lead, to }) => leadActionsService.moveStage(lead, to, actor),
    onSuccess: (_d, v) => invalidate(v.lead.id),
  });
};

export const useAssignLead = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<void, Error, { lead: Lead; counselorId: string }>({
    mutationFn: ({ lead, counselorId }) => leadActionsService.assign(lead, counselorId, actor),
    onSuccess: (_d, v) => invalidate(v.lead.id),
  });
};

export const useScheduleDemo = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<
    void,
    Error,
    { lead: Lead; facultyId?: string; scheduledAt: string; batch?: string; subject?: string; mode?: "offline" | "online" }
  >({
    mutationFn: ({ lead, ...input }) => leadActionsService.scheduleDemo(lead, input, actor),
    onSuccess: (_d, v) => invalidate(v.lead.id),
  });
};

export const useConvertAdmission = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<
    void,
    Error,
    {
      lead: Lead;
      feeAmount?: number;
      scholarshipAmount?: number;
      paymentStatus?: "pending" | "partial" | "paid";
      batch?: string;
      campus?: string;
      course?: string;
      studentId?: string;
    }
  >({
    mutationFn: ({ lead, ...input }) => leadActionsService.convertToAdmission(lead, input, actor),
    onSuccess: (_d, v) => invalidate(v.lead.id),
  });
};

export const useCompleteFollowup = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<void, Error, { lead: Lead; followupId: string; notes?: string }>({
    mutationFn: ({ lead, followupId, notes }) =>
      leadActionsService.completeFollowup(lead, followupId, actor, notes),
    onSuccess: (_d, v) => invalidate(v.lead.id),
  });
};

export const useAddLeadNote = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<void, Error, { leadId: string; note: string }>({
    mutationFn: ({ leadId, note }) => leadsService.addNote(leadId, note, actor.profileId),
    onSuccess: (_d, v) => invalidate(v.leadId),
  });
};

export const useDeleteLead = () => {
  const invalidate = useInvalidateLeads();
  const actor = useActor();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => leadsService.remove(id, actor.profileId),
    onSuccess: () => invalidate(),
  });
};
