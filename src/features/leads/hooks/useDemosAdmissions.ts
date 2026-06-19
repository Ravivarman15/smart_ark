import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { demosService } from "../services/demos.service";
import { admissionsService } from "../services/admissions.service";

export const useDemos = (params: { from: string; to: string; facultyId?: string }) =>
  useQuery({
    queryKey: queryKeys.leads.demos(params as Record<string, unknown>),
    queryFn: () => demosService.listBetween(params.from, params.to, params.facultyId),
  });

export const useLeadDemos = (leadId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.demos({ leadId }),
    queryFn: () => demosService.listForLead(leadId!),
    enabled: !!leadId,
  });

export const useAdmissions = (params: { from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: queryKeys.leads.admissions(params as Record<string, unknown>),
    queryFn: () => admissionsService.list(params),
  });
