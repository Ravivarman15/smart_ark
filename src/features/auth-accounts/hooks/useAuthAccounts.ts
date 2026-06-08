import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/core/constants/queryKeys";
import { authAccountsService } from "../services/authAccounts.service";
import { accountReasonLabel } from "../utils/authAccounts";
import type { AccountStatus } from "../types/authAccounts.types";

export const useAccountHealth = () =>
  useQuery({
    queryKey: queryKeys.authAccounts.health(),
    queryFn: () => authAccountsService.health(),
    staleTime: 30_000,
  });

export const useStudentAccounts = () =>
  useQuery({
    queryKey: queryKeys.authAccounts.students(),
    queryFn: () => authAccountsService.listStudentAccounts(),
    staleTime: 30_000,
  });

/** Provision a student login (create auth account + prove login). */
export const useProvisionStudent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; username?: string; email?: string; mobile?: string }) =>
      authAccountsService.createStudent(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      if (res.ok && res.loginVerified) toast.success(`Account created & login verified (${res.username})`);
      else toast.error(res.message ?? accountReasonLabel(res.reason));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useResetAccountPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject: "student" | "parent"; accountId: string }) =>
      authAccountsService.resetPassword(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      if (res.ok && res.loginVerified) toast.success("Password reset & login verified");
      else toast.error(res.message ?? accountReasonLabel(res.reason));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSetAccountStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject: "student" | "parent"; accountId: string; status: AccountStatus }) =>
      authAccountsService.setStatus(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      if (res.ok) toast.success("Account updated");
      else toast.error(res.message ?? accountReasonLabel(res.reason));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
