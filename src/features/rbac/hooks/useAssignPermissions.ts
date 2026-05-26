import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/core/constants/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { rolePermissionsService } from "../services/rolePermissions.service";
import { permissionAuditService } from "../services/permissionAudit.service";
import { rbacDebug } from "../utils/rbacDebug";
import type { RolePermissionUpsert } from "../types/rbac.types";

interface BulkInput {
  role: string;
  rows: RolePermissionUpsert[];
  /** Optional reason — captured in audit. */
  reason?: string;
}

/**
 * Bulk assign role permissions + write the audit row. Single hook so the
 * matrix UI doesn't have to coordinate the two services manually.
 *
 * Audit failures are non-fatal (the audit service swallows missing-table
 * errors); the upsert is the source of truth.
 */
export const useAssignRolePermissions = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ role, rows, reason }: BulkInput) => {
      await rolePermissionsService.upsertMany(rows, user?.profileId);
      // Fire one audit entry per row (the audit table is meant to be
      // append-only and granular — bulk diffs are reconstructed at read time).
      await Promise.all(
        rows.map((r) =>
          permissionAuditService.record({
            actorId: user?.profileId,
            targetRole: role,
            moduleId: r.moduleId,
            submoduleId: r.submoduleId ?? undefined,
            newCanView: r.canView,
            reason,
          })
        )
      );
    },
    onSuccess: (_v, { role, rows }) => {
      // Hard-bust the whole RBAC namespace. We *could* surgically pick
      // queryKeys.rbac.rolePermissions(role) + a few siblings, but the
      // saving session needs the role-usage stats, audit lists, role-catalog
      // entries and effective-access views all in sync — and the cost of a
      // namespace-wide invalidation is one extra refetch per active query.
      // The realtime layer fires the same wide bust on remote sessions, so
      // local and remote sessions stay symmetric.
      qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
      qc.invalidateQueries({ queryKey: queryKeys.permissions.all });
      rbacDebug("mutation", {
        source: "useAssignRolePermissions",
        role,
        rowCount: rows.length,
      });
    },
  });
};

export const useResetRolePermissions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => rolePermissionsService.resetRole(role),
    onSuccess: (_v, role) => {
      qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
      qc.invalidateQueries({ queryKey: queryKeys.permissions.all });
      rbacDebug("mutation", { source: "useResetRolePermissions", role });
    },
  });
};
