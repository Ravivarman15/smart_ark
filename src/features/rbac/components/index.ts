export { PermissionMatrix } from "./PermissionMatrix";
export { ModulePermissionCard } from "./ModulePermissionCard";
export { CopyFromRoleDialog } from "./CopyFromRoleDialog";

// ── Phase 3: action-level RBAC ──────────────────────────────────────────────
export { ActionGuard } from "./ActionGuard";
export { ProtectedButton } from "./ProtectedButton";
export { ProtectedMenuItem } from "./ProtectedMenuItem";
export { ProtectedActionDropdown, type DropdownAction } from "./ProtectedActionDropdown";
export { ActionRightsMatrix } from "./ActionRightsMatrix";
export { ActionRightsCard } from "./ActionRightsCard";

// ── Phase 4: centralized resolver + diagnostics ─────────────────────────────
export { AccessTracePanel } from "./AccessTracePanel";
export { EffectiveAccessPanel } from "./EffectiveAccessPanel";
export { RouteAccessGuard } from "./RouteAccessGuard";
export { LayoutAccessGate } from "./LayoutAccessGate";
export { ModuleUnavailable } from "./ModuleUnavailable";
export { AccessSyncIndicator } from "./AccessSyncIndicator";

// ── Phase 5: Role Center ────────────────────────────────────────────────────
export {
  PermissionBuilder,
  type BuilderDraft,
  type BuilderInheritance,
} from "./PermissionBuilder";
export { RoleCard } from "./RoleCard";
export { CloneRoleDialog } from "./CloneRoleDialog";
export { RoleDetailsForm } from "./RoleDetailsForm";
export { RolePermissionsTab } from "./RolePermissionsTab";
export { RoleUsersTab } from "./RoleUsersTab";
export { RoleDiagnosticsTab } from "./RoleDiagnosticsTab";
export { UserOverridesDrawer } from "./UserOverridesDrawer";
