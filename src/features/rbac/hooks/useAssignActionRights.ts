import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { actionRightsService } from "../services/actionRights.service";
import { actionAuditService } from "../services/actionAudit.service";
import { rbacDebug } from "../utils/rbacDebug";
import type { ActionRightUpsert } from "../types/rbac.types";

interface BulkInput {
  role: string;
  rows: ActionRightUpsert[];
  /** Optional reason — captured in audit. */
  reason?: string;
}

/**
 * Bulk assign role-level action rights + write the audit row. Single hook so
 * the matrix UI doesn't have to coordinate the two services manually.
 *
 * Audit failures are non-fatal (the audit service swallows missing-table
 * errors); the upsert is the source of truth.
 */
export const useAssignActionRights = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ role, rows, reason }: BulkInput) => {
      await actionRightsService.upsertMany(rows, user?.profileId);
      await Promise.all(
        rows.map((r) =>
          actionAuditService.record({
            actorId: user?.profileId,
            targetRole: role,
            actionId: r.actionId,
            newIsAllowed: r.isAllowed,
            reason,
          })
        )
      );
    },
    onSuccess: (_v, { role, rows }) => {
      qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
      qc.invalidateQueries({ queryKey: queryKeys.permissions.all });
      rbacDebug("mutation", { source: "useAssignActionRights", role, rowCount: rows.length });
    },
  });
};

export const useResetActionRights = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => actionRightsService.resetRole(role),
    onSuccess: (_v, role) => {
      qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
      qc.invalidateQueries({ queryKey: queryKeys.permissions.all });
      rbacDebug("mutation", { source: "useResetActionRights", role });
    },
  });
};
