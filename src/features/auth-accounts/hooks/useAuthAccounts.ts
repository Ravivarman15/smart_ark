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

/**
 * Is the provisioning edge function deployed and are we authorised?
 *
 * Runs once on the Parent Accounts page so staff see "not deployed" as a
 * banner instead of discovering it as a failed form submission.
 */
export const useProvisioningStatus = () =>
  useQuery({
    queryKey: [...queryKeys.authAccounts.all, "probe"],
    queryFn: () => authAccountsService.probe(),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const useParentAccounts = () =>
  useQuery({
    queryKey: queryKeys.authAccounts.parents(),
    queryFn: () => authAccountsService.listParentAccounts(),
    staleTime: 30_000,
  });

/**
 * Provision a parent login and link their children in ONE call.
 *
 * The edge function creates the auth user, writes the account row as `active`,
 * links every studentId, rotates to a fresh password and PROVES it signs in
 * before returning. A parent handed credentials that don't work is worse than
 * no parent portal at all, so nothing is reported as created until the login
 * has actually been exercised server-side.
 */
export const useProvisionParent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      email?: string;
      mobile?: string;
      studentIds?: string[];
      /** Guardian slot — drives sync_parent_from_student(). */
      relation?: string;
    }) => authAccountsService.createParent(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      if (res.ok && res.loginVerified) {
        toast.success("Parent account created & login verified");
        // A created-but-unlinked account is a success that behaves like a
        // failure the first time the parent signs in. Say so now.
        if (res.linkWarning) toast.warning(res.linkWarning);
      } else toast.error(res.message ?? accountReasonLabel(res.reason));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useLinkChild = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      parentAccountId: string;
      studentId: string;
      relation?: string;
      isPrimary?: boolean;
    }) => authAccountsService.linkStudent(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      if (res.ok) toast.success("Child linked");
      else toast.error(res.message ?? accountReasonLabel(res.reason));
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateParent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      accountId: string;
      name?: string;
      mobile?: string;
      email?: string;
      autoSync?: boolean;
    }) => {
      const { accountId, ...patch } = input;
      return authAccountsService.updateParent(accountId, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      toast.success("Parent details updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUnlinkChild = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentAccountId: string; studentId: string }) =>
      authAccountsService.unlinkStudent(input.parentAccountId, input.studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.authAccounts.all });
      toast.success("Child unlinked — the parent loses access to that student immediately");
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
