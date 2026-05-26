export { useModuleCatalog } from "./useModuleCatalog";
export { useRolePermissions } from "./useRolePermissions";
export {
  useUserOverrides,
  useUpsertUserOverride,
  useRemoveUserOverride,
} from "./useUserOverrides";
export {
  useAssignRolePermissions,
  useResetRolePermissions,
} from "./useAssignPermissions";
export { useEffectivePermissions } from "./useEffectivePermissions";
export { useSidebarAccess } from "./useSidebarAccess";

// ── Phase 3: action-level RBAC ──────────────────────────────────────────────
export { useActionRights } from "./useActionRights";
export {
  useUserActionOverrides,
  useUpsertUserActionOverride,
  useRemoveUserActionOverride,
} from "./useUserActionOverrides";
export {
  useAssignActionRights,
  useResetActionRights,
} from "./useAssignActionRights";
export { useEffectiveActions } from "./useEffectiveActions";
export { useCanDo } from "./useCanDo";
export { useActionAccess } from "./useActionAccess";

// ── Phase 4: centralized resolver ───────────────────────────────────────────
export { useEffectiveAccess } from "./useEffectiveAccess";
export { useWhyAccess } from "./useWhyAccess";
export { useRefreshAccess } from "./useRefreshAccess";

// ── Phase 5: role catalog ───────────────────────────────────────────────────
export {
  useRolesCatalog,
  useRoleCatalogEntry,
  useRoleUsage,
  useRoleUsers,
  useRoleAudit,
  useCreateRole,
  useUpdateRole,
  useArchiveRole,
  useCloneRole,
} from "./useRolesCatalog";
