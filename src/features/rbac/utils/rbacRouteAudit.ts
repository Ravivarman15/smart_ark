// ──────────────────────────────────────────────────────────────────────────────
// RBAC ROUTE CONSISTENCY AUDIT
//
// Companion to registryAudit.ts. Where that file checks module/submodule/action
// registration, THIS file checks the *route* layer: every reachable page should
// map to an RBAC submodule, every RBAC submodule that claims a route should be
// reachable, and the shared-route registry shouldn't double-register a path.
//
// Route sources in this app:
//   • SHARED_ROUTES (sharedRoutes.tsx) — structured registry, carries
//     path + submodule + action + layouts. Mounted for teacher/coordinator.
//   • NAV_CONFIG (menu.config.ts) — nav items carry absolute path + submodule.
//     `getNativeSubmoduleClaims(layout)` derives which submodules have a real
//     (non coming-soon) native page mounted under each role layout in App.tsx.
//
// A catalog submodule is "reachable" when it is served by a shared route OR
// natively claimed by some layout. A submodule that declares a `route` in the
// catalog but is reachable nowhere is a dead grant — the matrix offers it but
// clicking lands on coming-soon.
//
// PURE (no I/O) so it powers both the diagnostics UI and the build-gating test.
// ──────────────────────────────────────────────────────────────────────────────

import { MODULE_CATALOG, SUBMODULES_BY_ID } from "../constants/catalog";
import { ACTION_CATALOG } from "../constants/actionCatalog";
import { ACTION_DEFS } from "@/contexts/StaffRightsContext";
import {
  SHARED_ROUTES,
  getNativeSubmoduleClaims,
  type SharedRouteDef,
} from "@/core/routing/sharedRoutes";
import type { Role } from "@/core/constants/roles";

const ROLES: Role[] = ["admin", "management", "coordinator", "teacher"];

export type RouteFindingKind =
  | "shared_route_orphan_submodule" // shared route points at a submodule the catalog lacks
  | "shared_route_orphan_action" // shared route gates on an unregistered action
  | "submodule_route_unmounted" // catalog submodule declares a route but nothing mounts it
  | "duplicate_shared_route" // same (layout, path) registered more than once
  | "unprotected_route"; // route with neither submodule nor action (informational)

export interface RouteFinding {
  severity: "error" | "warn" | "info";
  kind: RouteFindingKind;
  id: string;
  detail: string;
}

export interface RouteAuditReport {
  ok: boolean;
  counts: {
    totalRoutes: number; // distinct (layout, path) mounts across shared + native
    protectedRoutes: number; // routes tied to a submodule or action
    sharedRoutes: number;
    missingRegistrations: number; // protected routes whose submodule/action is unregistered
    orphanRegistrations: number; // catalog submodules that declare a route but mount nowhere
    duplicateRegistrations: number;
  };
  findings: RouteFinding[];
  missingRegistrations: RouteFinding[];
  orphanRegistrations: RouteFinding[];
  duplicateRegistrations: RouteFinding[];
}

const matchesLayout = (def: SharedRouteDef, layout: Role): boolean =>
  !def.layouts || def.layouts.includes(layout);

/** Run the full route-consistency audit. Pure + synchronous. */
export const auditRbacRoutes = (): RouteAuditReport => {
  const findings: RouteFinding[] = [];

  // Registered action keys = catalog ids ∪ legacy keys ∪ legacy bridges.
  const registeredActionKeys = new Set<string>([
    ...ACTION_CATALOG.map((a) => a.id),
    ...ACTION_DEFS.map((a) => a.key),
    ...ACTION_CATALOG.map((a) => a.legacyAction).filter((s): s is string => !!s),
  ]);

  // Submodules reachable somewhere: served by a shared route, or natively
  // claimed (real nav path) under at least one role layout.
  const sharedRouteSubmodules = new Set(
    SHARED_ROUTES.map((r) => r.submodule).filter((s): s is string => !!s),
  );
  const nativeClaims = new Set<string>();
  for (const role of ROLES)
    for (const id of getNativeSubmoduleClaims(role)) nativeClaims.add(id);
  const reachable = (submoduleId: string): boolean =>
    sharedRouteSubmodules.has(submoduleId) || nativeClaims.has(submoduleId);

  // ── 1. Shared-route integrity ──────────────────────────────────────────────
  let protectedShared = 0;
  for (const r of SHARED_ROUTES) {
    if (r.submodule || r.action) protectedShared += 1;

    if (r.submodule && !SUBMODULES_BY_ID[r.submodule])
      findings.push({ severity: "error", kind: "shared_route_orphan_submodule", id: `${r.path} → ${r.submodule}`, detail: `Shared route "${r.path}" points at submodule "${r.submodule}" which is not in MODULE_CATALOG.` });

    if (r.action && !registeredActionKeys.has(r.action))
      findings.push({ severity: "error", kind: "shared_route_orphan_action", id: `${r.path} → ${r.action}`, detail: `Shared route "${r.path}" gates on action "${r.action}" which no registry defines.` });

    if (!r.submodule && !r.action)
      findings.push({ severity: "info", kind: "unprotected_route", id: r.path, detail: `Shared route "${r.path}" (${r.label}) has no submodule/action — public/utility page.` });
  }

  // ── 2. Catalog routability — every submodule that declares a route must mount ─
  for (const m of MODULE_CATALOG)
    for (const s of m.submodules)
      if (s.route && !reachable(s.id))
        findings.push({ severity: "error", kind: "submodule_route_unmounted", id: s.id, detail: `Catalog submodule "${s.id}" declares route "${s.route}" but no shared route or native nav path mounts it — the grant leads to coming-soon.` });

  // ── 3. Duplicate shared-route registration (per layout) ─────────────────────
  let duplicateCount = 0;
  for (const role of ROLES) {
    const seen = new Map<string, number>();
    for (const r of SHARED_ROUTES)
      if (matchesLayout(r, role)) seen.set(r.path, (seen.get(r.path) ?? 0) + 1);
    for (const [path, n] of seen)
      if (n > 1) {
        duplicateCount += 1;
        findings.push({ severity: "warn", kind: "duplicate_shared_route", id: `${role}:${path}`, detail: `Path "${path}" is registered ${n}× under /${role} — renderSharedRoutes dedupes, but the duplicate rows are redundant (usually intentional add/manage aliases).` });
      }
  }

  // ── Counts ──────────────────────────────────────────────────────────────────
  // Total distinct (layout, path) shared mounts + distinct native submodule pages.
  const sharedMounts = new Set<string>();
  for (const role of ROLES)
    for (const r of SHARED_ROUTES)
      if (matchesLayout(r, role)) sharedMounts.add(`${role}:${r.path}`);

  const missing = findings.filter((f) => f.kind === "shared_route_orphan_submodule" || f.kind === "shared_route_orphan_action");
  const orphans = findings.filter((f) => f.kind === "submodule_route_unmounted");
  const duplicates = findings.filter((f) => f.kind === "duplicate_shared_route");
  const errors = findings.filter((f) => f.severity === "error");

  return {
    ok: errors.length === 0,
    counts: {
      totalRoutes: sharedMounts.size + nativeClaims.size,
      protectedRoutes: protectedShared + nativeClaims.size,
      sharedRoutes: SHARED_ROUTES.length,
      missingRegistrations: missing.length,
      orphanRegistrations: orphans.length,
      duplicateRegistrations: duplicateCount,
    },
    findings,
    missingRegistrations: missing,
    orphanRegistrations: orphans,
    duplicateRegistrations: duplicates,
  };
};
