import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { leadsService } from "../services/leads.service";
import { leadActivityService } from "../services/leadActivity.service";
import { followupsService } from "../services/followups.service";
import type { LeadFilters } from "../types/lead.types";

export const useLeads = (filters: LeadFilters = {}) =>
  useQuery({
    queryKey: queryKeys.leads.list(filters as Record<string, unknown>),
    queryFn: () => leadsService.list(filters),
  });

export const useLead = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.detail(id ?? ""),
    queryFn: () => leadsService.getById(id!),
    enabled: !!id,
  });

export const useLeadActivities = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.activities(id ?? ""),
    queryFn: () => leadActivityService.listForLead(id!),
    enabled: !!id,
  });

export const useLeadFollowups = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.followups({ leadId: id }),
    queryFn: () => followupsService.listForLead(id!),
    enabled: !!id,
  });

export const useLeadNotes = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.leads.notes(id ?? ""),
    queryFn: () => leadsService.listNotes(id!),
    enabled: !!id,
  });
