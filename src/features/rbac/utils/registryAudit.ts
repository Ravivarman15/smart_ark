// ──────────────────────────────────────────────────────────────────────────────
// RBAC REGISTRY CONSISTENCY AUDIT
//
// The RBAC surface is described by FOUR registries that must stay in lockstep:
//
//   1. catalog.ts        MODULE_CATALOG    — modules + submodules (what the
//                                            permission matrix renders)
//   2. actionCatalog.ts  ACTION_CATALOG    — fine-grained actions, each tied to
//                                            a parent submodule
//   3. menu.config.ts    NAV_CONFIG        — the navigation tree, whose groups
//                                            reference `module`, items reference
//                                            `submodule` + `action`
//   4. StaffRightsContext ACTION_DEFS /    — the legacy action/module keys the
//                        MODULE_KEYS         nav `action` gates resolve against
//
// The Attendance/Payroll bug was exactly this drift: the modules were wired into
// NAV_CONFIG + StaffRightsContext + routes, but never registered in MODULE_CATALOG
// / ACTION_CATALOG — so the matrix had no rows and management couldn't grant them.
//
// This module computes every cross-registry inconsistency as a structured report.
// It is PURE (no I/O) so it powers both the Permission Diagnostics UI and the
// build-gating test (registryAudit.test.ts) that fails CI when registries drift.
// ──────────────────────────────────────────────────────────────────────────────

import { MODULE_CATALOG, MODULES_BY_ID, SUBMODULES_BY_ID } from "../constants/catalog";
import { ACTION_CATALOG, ACTIONS_BY_ID } from "../constants/actionCatalog";
import { NAV_CONFIG } from "@/core/navigation/menu.config";
import { ACTION_DEFS, MODULE_KEYS } from "@/contexts/StaffRightsContext";

export type RegistryFindingKind =
  | "duplicate_module"
  | "duplicate_submodule"
  | "duplicate_action"
  | "orphan_action" // action whose parent submodule isn't in the catalog
  | "orphan_legacy_bridge" // action.legacyAction not a known legacy key
  | "nav_module_unregistered" // NAV_CONFIG references a module the catalog lacks
  | "nav_submodule_unregistered" // NAV_CONFIG references an unknown submodule
  | "nav_action_unregistered" // NAV_CONFIG gates on an action no registry defines
  | "context_module_uncatalogued"; // StaffRightsContext module key absent from catalog

export interface RegistryFinding {
  severity: "error" | "warn";
  kind: RegistryFindingKind;
  id: string;
  detail: string;
}

export interface RegistryAuditReport {
  ok: boolean;
  counts: {
    modules: number;
    submodules: number;
    actions: number;
    navModuleRefs: number;
    navSubmoduleRefs: number;
    navActionRefs: number;
  };
  findings: RegistryFinding[];
  /** Grouped views for the diagnostics UI. */
  missingRegistrations: RegistryFinding[];
  orphans: RegistryFinding[];
  duplicates: RegistryFinding[];
}

// Modules that exist in the legacy MODULE_KEYS but are intentionally NOT in the
// RBAC catalog (they're dashboard/ops surfaces, not grantable feature modules).
const LEGACY_ONLY_MODULES = new Set<string>(["operations"]);

const dupes = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
};

/** Run the full cross-registry audit. Pure + synchronous. */
export const auditRbacRegistry = (): RegistryAuditReport => {
  const findings: RegistryFinding[] = [];

  // ── 1. Build the canonical id sets ──────────────────────────────────────────
  const moduleIds = MODULE_CATALOG.map((m) => m.id);
  const submoduleIds = MODULE_CATALOG.flatMap((m) => m.submodules.map((s) => s.id));
  const actionIds = ACTION_CATALOG.map((a) => a.id);
  const legacyActionKeys = new Set(ACTION_DEFS.map((a) => a.key));

  // An action key is "registered" if any registry defines it: a catalog action
  // id, a legacy ACTION_DEFS key, or a catalog action's legacyAction bridge.
  const registeredActionKeys = new Set<string>([
    ...actionIds,
    ...legacyActionKeys,
    ...ACTION_CATALOG.map((a) => a.legacyAction).filter(Boolean as unknown as (s?: string) => s is string),
  ]);

  // ── 2. Duplicates (a registry that defines the same id twice) ───────────────
  for (const id of dupes(moduleIds))
    findings.push({ severity: "error", kind: "duplicate_module", id, detail: `Module id "${id}" is defined more than once in MODULE_CATALOG.` });
  for (const id of dupes(submoduleIds))
    findings.push({ severity: "error", kind: "duplicate_submodule", id, detail: `Submodule id "${id}" is defined more than once in MODULE_CATALOG.` });
  for (const id of dupes(actionIds))
    findings.push({ severity: "error", kind: "duplicate_action", id, detail: `Action id "${id}" is defined more than once in ACTION_CATALOG.` });

  // ── 3. Orphan actions (parent submodule / legacy bridge missing) ────────────
  for (const a of ACTION_CATALOG) {
    if (!SUBMODULES_BY_ID[a.submoduleId])
      findings.push({ severity: "error", kind: "orphan_action", id: a.id, detail: `Action "${a.id}" points at submodule "${a.submoduleId}" which is not in MODULE_CATALOG.` });
    if (a.legacyAction && !legacyActionKeys.has(a.legacyAction))
      findings.push({ severity: "warn", kind: "orphan_legacy_bridge", id: a.id, detail: `Action "${a.id}" bridges to legacy key "${a.legacyAction}" which is not in StaffRightsContext.ACTION_DEFS.` });
  }

  // ── 4. Walk NAV_CONFIG — every module/submodule/action it gates on MUST be
  //      registered somewhere, or the sidebar shows something RBAC can't grant.
  const navModuleRefs = new Set<string>();
  const navSubmoduleRefs = new Set<string>();
  const navActionRefs = new Set<string>();

  for (const group of NAV_CONFIG) {
    if (group.module) navModuleRefs.add(group.module);
    for (const item of group.items) {
      if (item.module) navModuleRefs.add(item.module);
      if (item.submodule) navSubmoduleRefs.add(item.submodule);
      if (item.action) navActionRefs.add(item.action);
    }
  }

  for (const id of navModuleRefs)
    if (!MODULES_BY_ID[id as keyof typeof MODULES_BY_ID])
      findings.push({ severity: "error", kind: "nav_module_unregistered", id, detail: `Navigation references module "${id}" but MODULE_CATALOG has no such module — it cannot be granted in Manage Staff Role.` });

  for (const id of navSubmoduleRefs)
    if (!SUBMODULES_BY_ID[id])
      findings.push({ severity: "error", kind: "nav_submodule_unregistered", id, detail: `Navigation references submodule "${id}" but MODULE_CATALOG has no such submodule.` });

  for (const id of navActionRefs)
    if (!registeredActionKeys.has(id))
      findings.push({ severity: "error", kind: "nav_action_unregistered", id, detail: `Navigation gates on action "${id}" but no registry (ACTION_CATALOG / ACTION_DEFS) defines it.` });

  // ── 5. Legacy module keys should be catalogued (so both module registries
  //      agree). Ops-only keys are exempt. Drift here is a warning, not fatal.
  for (const key of MODULE_KEYS)
    if (!LEGACY_ONLY_MODULES.has(key) && !MODULES_BY_ID[key as keyof typeof MODULES_BY_ID])
      findings.push({ severity: "warn", kind: "context_module_uncatalogued", id: key, detail: `StaffRightsContext.MODULE_KEYS has "${key}" but MODULE_CATALOG does not — the legacy and catalog module lists have drifted.` });

  const errors = findings.filter((f) => f.severity === "error");

  return {
    ok: errors.length === 0,
    counts: {
      modules: moduleIds.length,
      submodules: submoduleIds.length,
      actions: actionIds.length,
      navModuleRefs: navModuleRefs.size,
      navSubmoduleRefs: navSubmoduleRefs.size,
      navActionRefs: navActionRefs.size,
    },
    findings,
    missingRegistrations: findings.filter((f) =>
      f.kind === "nav_module_unregistered" ||
      f.kind === "nav_submodule_unregistered" ||
      f.kind === "nav_action_unregistered",
    ),
    orphans: findings.filter((f) => f.kind === "orphan_action" || f.kind === "orphan_legacy_bridge"),
    duplicates: findings.filter((f) =>
      f.kind === "duplicate_module" || f.kind === "duplicate_submodule" || f.kind === "duplicate_action",
    ),
  };
};
