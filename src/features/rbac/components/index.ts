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
