// Public API of the RBAC feature.
// External code should import from "@/features/rbac" — never reach into
// subfolders.

// ── Catalog ─────────────────────────────────────────────────────────────────
export {
  MODULE_CATALOG,
  MODULES_BY_ID,
  SUBMODULES_BY_ID,
  isCatalogModule,
  type ModuleId,
  type ModuleDef,
  type SubmoduleDef,
} from "./constants/catalog";
export {
  ACTION_CATALOG,
  ACTIONS_BY_ID,
  ACTIONS_BY_SUBMODULE,
  ACTION_CATEGORIES,
  isCatalogAction,
  type ActionDef,
  type ActionCategory,
} from "./constants/actionCatalog";

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  RolePermission,
  UserPermissionOverride,
  EffectivePermissions,
  PermissionAuditEntry,
  RolePermissionUpsert,
  ActionRight,
  UserActionOverride,
  ActionAuditEntry,
  EffectiveActions,
  ActionRightUpsert,
  CatalogRole,
  CatalogRoleUpsert,
  RoleAuditEntry,
  RoleAuditEventType,
  RoleCategory,
  RoleUsageStats,
} from "./types";

// ── Resolver ────────────────────────────────────────────────────────────────
export {
  resolveAccess,
  lookup,
  explain,
  type AccessEntry,
  type AccessLayer,
  type AccessSource,
  type EffectiveAccess,
  type ResolverInput,
} from "./resolver";

// ── Schemas ─────────────────────────────────────────────────────────────────
export {
  rolePermissionUpsertSchema,
  userOverrideSchema,
  actionRightUpsertSchema,
  userActionOverrideSchema,
  catalogRoleSchema,
  type RolePermissionUpsertValues,
  type UserOverrideValues,
  type ActionRightUpsertValues,
  type UserActionOverrideValues,
  type CatalogRoleValues,
} from "./schemas/rbac.schema";

// ── Utils ───────────────────────────────────────────────────────────────────
export {
  deriveEffectivePermissions,
  setAllSubmodulesForModule,
  deriveEffectiveActions,
  setAllForCategory,
  setAllForSubmodule,
  rbacDebug,
  enableRbacDebug,
  validateEffectiveAccess,
  type ValidationFinding,
  type ValidationResult,
  type ValidationInput,
  type ValidationSeverity,
} from "./utils";
export {
  buildDefaultModuleRows,
  buildDefaultActionRows,
} from "./utils/catalogDefaults";

// ── Providers ───────────────────────────────────────────────────────────────
export { RbacRealtimeProvider } from "./providers/RbacRealtimeProvider";

// ── Services ────────────────────────────────────────────────────────────────
export {
  moduleCatalogService,
  rolePermissionsService,
  userOverridesService,
  permissionAuditService,
  actionRightsService,
  userActionOverridesService,
  actionAuditService,
  rolesCatalogService,
  roleAuditService,
  roleUsageService,
} from "./services";

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useModuleCatalog,
  useRolePermissions,
  useUserOverrides,
  useUpsertUserOverride,
  useRemoveUserOverride,
  useAssignRolePermissions,
  useResetRolePermissions,
  useEffectivePermissions,
  useSidebarAccess,
  useActionRights,
  useUserActionOverrides,
  useUpsertUserActionOverride,
  useRemoveUserActionOverride,
  useAssignActionRights,
  useResetActionRights,
  useEffectiveActions,
  useCanDo,
  useActionAccess,
  useEffectiveAccess,
  useWhyAccess,
  useRefreshAccess,
  useRolesCatalog,
  useRoleCatalogEntry,
  useRoleUsage,
  useRoleUsers,
  useRoleAudit,
  useCreateRole,
  useUpdateRole,
  useArchiveRole,
  useCloneRole,
} from "./hooks";

// ── Components ──────────────────────────────────────────────────────────────
export {
  PermissionMatrix,
  ModulePermissionCard,
  CopyFromRoleDialog,
  ActionGuard,
  ProtectedButton,
  ProtectedMenuItem,
  ProtectedActionDropdown,
  ActionRightsMatrix,
  ActionRightsCard,
  AccessTracePanel,
  EffectiveAccessPanel,
  RouteAccessGuard,
  LayoutAccessGate,
  AccessSyncIndicator,
  PermissionBuilder,
  RoleCard,
  CloneRoleDialog,
  RoleDetailsForm,
  RolePermissionsTab,
  RoleUsersTab,
  RoleDiagnosticsTab,
  UserOverridesDrawer,
  type DropdownAction,
  type BuilderDraft,
  type BuilderInheritance,
} from "./components";
