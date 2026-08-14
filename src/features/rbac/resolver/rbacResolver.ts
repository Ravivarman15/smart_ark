// ──────────────────────────────────────────────────────────────────────────────
// rbacResolver — single source of truth for every permission decision
// ──────────────────────────────────────────────────────────────────────────────
// Pure function. No React, no Supabase, no side effects. The hook layer
// (`useEffectiveAccess`) wires up the inputs from React Query; this file is
// only the math + the trace.
//
// Why centralized:
//   Before this file, three call sites computed permissions independently:
//     - useEffectivePermissions   (module/submodule layer, v2 only)
//     - useEffectiveActions       (action layer, v2 only)
//     - usePermissions            (combined v2 + legacy via AND-bridge)
//   The AND-bridge mismatched module key spaces (legacy: 8 modules; catalog:
//   14) and the matrix UI showed configurations that didn't match what users
//   actually got. Funneling everything through one resolver eliminates the
//   class of bug where sidebar/route/action gates disagree.
//
// Resolution order (most specific wins):
//   1. super_role               — management sees everything, full stop
//   2. user_override            — explicit per-user grant/deny
//   3. role_grant               — explicit per-role grant/deny (from matrix)
//   4. parent_submodule         — action denied if its submodule is hidden
//   5. catalog_default          — module catalog says "default-visible for role"
//   6. legacy_module/action     — ONLY for keys the new catalog doesn't model;
//                                 protects existing checks like "operations"
//                                 that pre-date the v2 catalog
//   7. unknown_permissive       — neither catalog nor legacy knows the key —
//                                 default-allow so we don't lock users out of
//                                 features RBAC hasn't been updated for yet
//
// The trace (`AccessEntry.layers`) records every layer consulted in order, so
// the diagnostics panel can show "denied at user_override; would have been
// allowed by role_grant" without re-running the resolver.
// ──────────────────────────────────────────────────────────────────────────────

import { SUPER_ROLES, type Role } from "@/core/constants/roles";
import { MODULE_CATALOG, MODULES_BY_ID } from "../constants/catalog";
import {
  ACTION_CATALOG,
  ACTIONS_BY_ID,
  isCatalogAction,
} from "../constants/actionCatalog";
import type {
  AccessEntry,
  AccessLayer,
  AccessSource,
  EffectiveAccess,
  ResolverInput,
} from "./types";

const isSuper = (role: Role | string | undefined): boolean =>
  !!role && SUPER_ROLES.includes(role as Role);

const decide = (layers: AccessLayer[], fallback: boolean): AccessEntry => {
  for (const layer of layers) {
    if (layer.outcome !== null) {
      return { allowed: layer.outcome, source: layer.source, layers };
    }
  }
  return {
    allowed: fallback,
    source: "unknown_permissive",
    layers: [...layers, { source: "unknown_permissive", outcome: fallback }],
  };
};

const superEntry = (): AccessEntry => ({
  allowed: true,
  source: "super_role",
  layers: [{ source: "super_role", outcome: true, note: "management bypass" }],
});

const noRoleEntry = (): AccessEntry => ({
  allowed: false,
  source: "no_role",
  layers: [{ source: "no_role", outcome: false, note: "unauthenticated" }],
});

/** Submodule id → its owning module id, built once from the catalog. */
const MODULE_OF_SUBMODULE = new Map<string, string>(
  MODULE_CATALOG.flatMap((m) => m.submodules.map((s) => [s.id, m.id] as const)),
);

const entitlementDenied = (): AccessEntry => ({
  allowed: false,
  source: "entitlement",
  layers: [
    {
      source: "entitlement",
      outcome: false,
      note: "organization is not entitled to this module",
    },
  ],
});

export const resolveAccess = (input: ResolverInput): EffectiveAccess => {
  const role = input.role;

  // ── Entitlement gate ─────────────────────────────────────────────────────
  //
  // Sits ABOVE the super-role bypass, and that ordering is the whole point.
  // `management` is the most powerful role a TENANT has, but it is still a
  // tenant role: it can hand out permissions the organization already owns, not
  // buy Payroll. If a school's plan excludes a module, or a Super Admin has
  // withdrawn it, or the organization is suspended, then nobody inside that
  // organization sees it — management included.
  //
  // Fail-open on absence. `moduleEntitlements` undefined (still loading, RPC
  // failed, entitlements never resolved) means every module stays visible. The
  // alternative — deny while loading — would flash an empty sidebar on every
  // page load and would black out every portal on a single failed request. A
  // billing boundary is not worth an outage.
  const ents = input.moduleEntitlements;
  const notEntitled = (moduleId: string): boolean => ents?.[moduleId] === false;

  // ── Unauthenticated → deny everything ────────────────────────────────────
  if (!role) {
    return {
      role,
      isSuper: false,
      modules: emptyDeniedMap(MODULE_CATALOG.map((m) => m.id)),
      submodules: emptyDeniedMap(
        MODULE_CATALOG.flatMap((m) => m.submodules.map((s) => s.id))
      ),
      actions: emptyDeniedMap(ACTION_CATALOG.map((a) => a.id)),
    };
  }

  // ── Super-role bypass ────────────────────────────────────────────────────
  if (isSuper(role)) {
    const modules: Record<string, AccessEntry> = {};
    const submodules: Record<string, AccessEntry> = {};
    const actions: Record<string, AccessEntry> = {};
    for (const m of MODULE_CATALOG) {
      const denied = notEntitled(m.id);
      modules[m.id] = denied ? entitlementDenied() : superEntry();
      // A submodule is denied by its own entitlement as well as its module's.
      // Checking only the module would make a submodule revoke a no-op for the
      // one role most likely to notice.
      for (const s of m.submodules) {
        submodules[s.id] = denied || notEntitled(s.id) ? entitlementDenied() : superEntry();
      }
    }
    for (const a of ACTION_CATALOG) {
      const owner = MODULE_OF_SUBMODULE.get(a.submoduleId);
      const blocked =
        (owner && notEntitled(owner)) || notEntitled(a.submoduleId);
      actions[a.id] = blocked ? entitlementDenied() : superEntry();
    }
    return { role, isSuper: true, modules, submodules, actions };
  }

  // ── Indexed lookups for O(1) per check ───────────────────────────────────
  const roleModuleGrant = new Map<string, boolean>();
  const roleSubmoduleGrant = new Map<string, boolean>();
  for (const r of input.rolePermissions) {
    if (r.role !== role) continue;
    if (r.submoduleId) roleSubmoduleGrant.set(r.submoduleId, r.canView);
    else roleModuleGrant.set(r.moduleId, r.canView);
  }

  const userModuleOverride = new Map<string, boolean>();
  const userSubmoduleOverride = new Map<string, boolean>();
  for (const o of input.userOverrides) {
    if (o.submoduleId) userSubmoduleOverride.set(o.submoduleId, o.canView);
    else userModuleOverride.set(o.moduleId, o.canView);
  }

  const roleActionGrant = new Map<string, boolean>();
  for (const r of input.roleActions) {
    if (r.role !== role) continue;
    roleActionGrant.set(r.actionId, r.isAllowed);
  }

  const userActionOverride = new Map<string, boolean>();
  for (const o of input.userActionOverrides) {
    userActionOverride.set(o.actionId, o.isAllowed);
  }

  // "Has management configured *anything* for this role?" — when no rows
  // exist anywhere we stay maximally permissive (initial state). Once a single
  // grant lands, the catalog's defaultRoles becomes the answer for everything
  // else, so management's configuration is the source of truth.
  const roleHasAnyConfiguration =
    roleModuleGrant.size > 0 ||
    roleSubmoduleGrant.size > 0 ||
    roleActionGrant.size > 0;

  const legacyModules = input.legacyModules ?? {};
  const legacyActions = input.legacyActions ?? {};

  // ── Module layer ─────────────────────────────────────────────────────────
  const modules: Record<string, AccessEntry> = {};
  for (const m of MODULE_CATALOG) {
    if (notEntitled(m.id)) {
      modules[m.id] = entitlementDenied();
      continue;
    }
    const userOv = userModuleOverride.get(m.id);
    const roleGrant = roleModuleGrant.get(m.id);
    const catalogDefault = m.defaultRoles.includes(role as Role);

    const layers: AccessLayer[] = [
      {
        source: "user_override",
        outcome: userOv ?? null,
        note: userOv === undefined ? "no user override" : `override=${userOv}`,
      },
      {
        source: "role_grant",
        outcome: roleGrant ?? null,
        note: roleGrant === undefined ? "no role grant" : `grant=${roleGrant}`,
      },
      {
        source: "catalog_default",
        outcome: roleHasAnyConfiguration ? catalogDefault : true,
        note: roleHasAnyConfiguration
          ? `defaultRoles includes ${role}? ${catalogDefault}`
          : "no grants configured — permissive",
      },
    ];

    modules[m.id] = decide(layers, true);
  }

  // ── Submodule layer ──────────────────────────────────────────────────────
  const submodules: Record<string, AccessEntry> = {};
  for (const m of MODULE_CATALOG) {
    const moduleEntry = modules[m.id];
    // An entitlement denial must not be recoverable by a per-user override, so
    // it is applied here rather than left to inheritance — `decide()` would let
    // an explicit user_override outrank the parent module and hand back a
    // module the organization does not have.
    const moduleDenied = notEntitled(m.id);
    for (const s of m.submodules) {
      // Either the module or the submodule itself may be unentitled, and
      // neither is recoverable by a per-user override — `decide()` below would
      // let an explicit user_override outrank the parent and hand back a
      // feature the organization does not have.
      if (moduleDenied || notEntitled(s.id)) {
        submodules[s.id] = entitlementDenied();
        continue;
      }
      const userOv = userSubmoduleOverride.get(s.id);
      const roleGrant = roleSubmoduleGrant.get(s.id);

      const layers: AccessLayer[] = [
        {
          source: "user_override",
          outcome: userOv ?? null,
          note: userOv === undefined ? "no user override" : `override=${userOv}`,
        },
        {
          source: "role_grant",
          outcome: roleGrant ?? null,
          note: roleGrant === undefined ? "no role grant" : `grant=${roleGrant}`,
        },
      ];

      // Submodules inherit from parent module unless an explicit grant/override
      // says otherwise (handled by `decide`'s short-circuit above).
      layers.push({
        source: "catalog_default",
        outcome: moduleEntry.allowed,
        note: `inherits parent module (${m.id}=${moduleEntry.allowed})`,
      });

      submodules[s.id] = decide(layers, true);
    }
  }

  // ── Action layer ─────────────────────────────────────────────────────────
  const actions: Record<string, AccessEntry> = {};
  for (const a of ACTION_CATALOG) {
    const owner = MODULE_OF_SUBMODULE.get(a.submoduleId);
    // An action inside a revoked submodule is revoked with it. Without this an
    // organization could lose "Fee Refund" and keep the button that performs
    // one, which is worse than not revoking it at all.
    if ((owner && notEntitled(owner)) || notEntitled(a.submoduleId)) {
      actions[a.id] = entitlementDenied();
      continue;
    }
    const userOv = userActionOverride.get(a.id);
    const roleGrant = roleActionGrant.get(a.id);
    const parentSub = submodules[a.submoduleId];

    const layers: AccessLayer[] = [
      {
        source: "user_override",
        outcome: userOv ?? null,
        note: userOv === undefined ? "no user override" : `override=${userOv}`,
      },
      {
        source: "role_grant",
        outcome: roleGrant ?? null,
        note: roleGrant === undefined ? "no role grant" : `grant=${roleGrant}`,
      },
    ];

    if (parentSub && !parentSub.allowed) {
      layers.push({
        source: "parent_submodule",
        outcome: false,
        note: `denied by submodule visibility (${a.submoduleId})`,
      });
    } else {
      layers.push({
        source: "parent_submodule",
        outcome: parentSub?.allowed ?? null,
        note: `submodule ${a.submoduleId} = ${parentSub?.allowed ?? "unknown"}`,
      });
    }

    actions[a.id] = decide(layers, true);
  }

  // ── Legacy bridge for catalog-unknown keys ───────────────────────────────
  // Legacy gates ONLY apply to keys the v2 catalog doesn't model. v2 is
  // authoritative for everything it knows — this is the fix for the AND-bridge
  // bug where the matrix and the actual user view disagreed.
  applyLegacyFallback({
    modules,
    actions,
    legacyModules,
    legacyActions,
  });

  return { role, isSuper: false, modules, submodules, actions };
};

const emptyDeniedMap = (ids: string[]): Record<string, AccessEntry> => {
  const out: Record<string, AccessEntry> = {};
  for (const id of ids) out[id] = noRoleEntry();
  return out;
};

/**
 * Bridges keys that exist in legacy but NOT in the v2 catalog. The legacy
 * tables still drive a handful of old modules (e.g. "operations") and ad-hoc
 * action checks (e.g. "ops.daily_control") that pre-date the catalog. We
 * don't merge them — we only consult legacy when v2 has no opinion.
 */
const applyLegacyFallback = (args: {
  modules: Record<string, AccessEntry>;
  actions: Record<string, AccessEntry>;
  legacyModules: Record<string, boolean>;
  legacyActions: Record<string, boolean>;
}) => {
  for (const [moduleKey, value] of Object.entries(args.legacyModules)) {
    if (moduleKey in MODULES_BY_ID) continue;
    args.modules[moduleKey] = legacyEntry("legacy_module", value, moduleKey);
  }
  for (const [actionKey, value] of Object.entries(args.legacyActions)) {
    if (isCatalogAction(actionKey)) continue;
    args.actions[actionKey] = legacyEntry("legacy_action", value, actionKey);
  }
};

const legacyEntry = (
  source: Extract<AccessSource, "legacy_module" | "legacy_action">,
  outcome: boolean,
  key: string
): AccessEntry => ({
  allowed: outcome,
  source,
  layers: [
    {
      source,
      outcome,
      note: `${source} fallback for catalog-unknown key "${key}"`,
    },
  ],
});

/**
 * Boolean shortcut for the common "do I have access?" path. Tries module,
 * submodule, then action — useful when a caller has a string key and doesn't
 * know which dimension it belongs to.
 */
export const lookup = (
  effective: EffectiveAccess,
  key: string
): AccessEntry | undefined => {
  return (
    effective.modules[key] ??
    effective.submodules[key] ??
    effective.actions[key]
  );
};

/**
 * Diagnostics helper used by the "Why was this allowed/denied?" panel.
 * Returns a human-readable explanation along with the underlying entry.
 */
export const explain = (
  effective: EffectiveAccess,
  key: string
): { entry: AccessEntry | undefined; summary: string } => {
  const entry = lookup(effective, key);
  if (!entry) {
    return {
      entry: undefined,
      summary: `Key "${key}" is not in the RBAC catalog. Treated as permissive.`,
    };
  }
  const catalogLabel =
    ACTIONS_BY_ID[key]?.label ??
    MODULES_BY_ID[key as keyof typeof MODULES_BY_ID]?.label ??
    key;
  const verdict = entry.allowed ? "allowed" : "denied";
  return {
    entry,
    summary: `${catalogLabel} is ${verdict} via "${entry.source}".`,
  };
};

void ACTIONS_BY_ID; // referenced for the explain() helper
