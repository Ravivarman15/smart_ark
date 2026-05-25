import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { ticketsService, type TicketFilter } from "../services";
import type {
  SupportTicketInput,
  TicketAssignmentInput,
  TicketStatus,
} from "../types/help.types";

const useActor = () => {
  const { user } = useAuth();
  return { id: user?.profileId, name: user?.name };
};

const useRequester = () => {
  const { user } = useAuth();
  return {
    profileId: user?.profileId,
    role: user?.role,
    name: user?.name,
    email: user?.email,
    campusId: user?.campusId,
  };
};

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: queryKeys.help.all });

export const useTickets = (filter: TicketFilter = {}) =>
  useQuery({
    queryKey: queryKeys.help.tickets(filter as Record<string, unknown>),
    queryFn: () => ticketsService.list(filter),
    staleTime: 30_000,
  });

export const useTicket = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.help.ticket(id ?? ""),
    queryFn: () => ticketsService.get(id as string),
    enabled: !!id,
    staleTime: 15_000,
  });

export const useCreateTicket = () => {
  const qc = useQueryClient();
  const requester = useRequester();
  return useMutation({
    mutationFn: (input: SupportTicketInput) => ticketsService.create(input, requester),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useUpdateTicket = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<SupportTicketInput> }) =>
      ticketsService.update(args.id, args.patch, actor),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useAssignTicket = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; input: TicketAssignmentInput }) =>
      ticketsService.assign(args.id, args.input, actor),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useSetTicketStatus = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; status: TicketStatus }) =>
      ticketsService.setStatus(args.id, args.status, actor),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useReopenTicket = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => ticketsService.reopen(id, actor),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useSubmitSatisfaction = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (args: { id: string; rating: number; comment?: string }) =>
      ticketsService.submitSatisfaction(args.id, args.rating, args.comment, actor),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useDeleteTicket = () => {
  const qc = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: (id: string) => ticketsService.remove(id, actor),
    onSuccess: () => invalidateAll(qc),
  });
};
