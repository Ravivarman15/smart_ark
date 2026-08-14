// ════════════════════════════════════════════════════════════════════════════
// SUBMODULE ENTITLEMENTS
//
// Granting and revoking one PAGE inside a module — "keep Fee, drop Fee Refund".
//
// ┌── WHY THIS NEEDED NO MIGRATION ────────────────────────────────────────┐
// │ `organization_features.feature_key` is unconstrained text keyed by      │
// │ (organization_id, feature_key), and `entitlement_layers()` aggregates   │
// │ every row for the organization without filtering the key. A row for     │
// │ `fee.refund` already travelled the whole pipeline — plan layer,         │
// │ override layer, expiry sweep, history, audit.                           │
// │                                                                         │
// │ It was the RESOLVER that iterated module ids only, so such a row was    │
// │ written, stored, audited — and silently ignored. The console would have │
// │ reported success for a change that did nothing.                         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The invariant everything else rests on: A SUBMODULE CANNOT BE ENABLED WHILE
// ITS MODULE IS OFF. Without it, revoking Fee would leave `fee.refund` reading
// `enabled: true`, and any surface that checks the submodule rather than the
// module would hand back a page inside a module the organization does not have.
// ════════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from "vitest";
import {
  resolveEntitlements,
  entitlementFlags,
  type EntitlementLayers,
} from "../modules/entitlements";
import { planBulkOperation, type PlannableOrg } from "../modules/bulkPlan";
import {
  PLATFORM_SUBMODULES,
  SUBMODULE_IDS,
  SUBMODULES_OF,
  PARENT_OF_SUBMODULE,
  ENTITLEMENT_KEYS,
  MODULE_IDS,
  featureLabel,
  isSubmoduleKey,
} from "../modules/moduleRegistry";
import { resolveAccess } from "@/features/rbac/resolver/rbacResolver";
import { MODULE_CATALOG } from "@/features/rbac/constants/catalog";

const layers = (over: Partial<EntitlementLayers> = {}): EntitlementLayers => ({
  status: "active",
  plan_code: "growth",
  plan_id: null,
  governance: {},
  plan: {},
  overrides: {},
  ...over,
});

const ov = (enabled: boolean, expires_at: string | null = null) => ({
  enabled, reason: "sales_override", expires_at, updated_at: "",
});

/** A real submodule of a real, non-essential module. */
const SUB = "fee.collection";
const SUB_PARENT = "fee";

describe("the catalog exposes submodules as entitlement keys", () => {
  it("indexes every submodule in the catalog", () => {
    const catalogCount = MODULE_CATALOG.reduce((n, m) => n + m.submodules.length, 0);
    expect(PLATFORM_SUBMODULES).toHaveLength(catalogCount);
    expect(SUBMODULE_IDS.length).toBeGreaterThan(150);
  });

  it("maps every submodule to its owning module", () => {
    for (const s of PLATFORM_SUBMODULES) {
      expect(PARENT_OF_SUBMODULE.get(s.id)).toBe(s.moduleId);
      expect(SUBMODULES_OF.get(s.moduleId)!.map((x) => x.id)).toContain(s.id);
    }
  });

  it("treats module and submodule ids as distinct key spaces", () => {
    for (const id of MODULE_IDS) expect(isSubmoduleKey(id)).toBe(false);
    for (const id of SUBMODULE_IDS) expect(isSubmoduleKey(id)).toBe(true);
    // Both are valid entitlement keys — an operator can act on either.
    expect(ENTITLEMENT_KEYS.size).toBe(MODULE_IDS.length + SUBMODULE_IDS.length);
  });

  it("labels a submodule by its own name, not its module's", () => {
    expect(featureLabel(SUB)).not.toBe(featureLabel(SUB_PARENT));
    expect(featureLabel(SUB)).toBeTruthy();
  });

  it("the chosen fixture is a real, non-essential submodule", () => {
    // Guards every assertion below from going vacuous if the catalog is edited.
    expect(SUBMODULE_IDS).toContain(SUB);
    expect(PARENT_OF_SUBMODULE.get(SUB)).toBe(SUB_PARENT);
  });
});

describe("a submodule resolves on its own", () => {
  it("is included by default when nothing says otherwise", () => {
    // Silence means included, exactly as for a module. Anything else would
    // switch off 204 submodules for every existing customer on the day this
    // shipped.
    const e = resolveEntitlements(layers());
    expect(e[SUB].enabled).toBe(true);
    expect(e[SUB].source).toBe("default");
  });

  it("can be revoked while its module stays on", () => {
    // The whole point of the feature.
    const e = resolveEntitlements(layers({ overrides: { [SUB]: ov(false) } }));
    expect(e[SUB_PARENT].enabled).toBe(true);
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("override");
  });

  it("leaves its siblings untouched", () => {
    const e = resolveEntitlements(layers({ overrides: { [SUB]: ov(false) } }));
    const siblings = (SUBMODULES_OF.get("fee") ?? []).filter((s) => s.id !== SUB);
    expect(siblings.length).toBeGreaterThan(0);
    for (const s of siblings) expect(e[s.id].enabled, s.id).toBe(true);
  });

  it("honours a plan rule", () => {
    const e = resolveEntitlements(
      layers({ plan: { [SUB]: { enabled: false, limit: null } } }),
    );
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("plan");
  });

  it("lets an override beat the plan, and clearing it return to the plan", () => {
    const withOverride = resolveEntitlements(
      layers({
        plan: { [SUB]: { enabled: false, limit: null } },
        overrides: { [SUB]: ov(true) },
      }),
    );
    expect(withOverride[SUB].enabled).toBe(true);
    expect(withOverride[SUB].overridesPlan).toBe(true);

    const cleared = resolveEntitlements(
      layers({ plan: { [SUB]: { enabled: false, limit: null } } }),
    );
    expect(cleared[SUB].enabled).toBe(false);
    expect(cleared[SUB].source).toBe("plan");
  });

  it("expires a temporary submodule grant on its own", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    const live = resolveEntitlements(
      layers({ plan: { [SUB]: { enabled: false, limit: null } }, overrides: { [SUB]: ov(true, future) } }),
    );
    expect(live[SUB].enabled).toBe(true);
    expect(live[SUB].expiresAt).toBe(future);

    const lapsed = resolveEntitlements(
      layers({ plan: { [SUB]: { enabled: false, limit: null } }, overrides: { [SUB]: ov(true, past) } }),
    );
    expect(lapsed[SUB].enabled).toBe(false);
    expect(lapsed[SUB].source).toBe("plan");
  });
});

describe("THE CONTAINMENT INVARIANT", () => {
  it("a submodule is off whenever its module is off", () => {
    const e = resolveEntitlements(layers({ overrides: { [SUB_PARENT]: ov(false) } }));
    expect(e[SUB_PARENT].enabled).toBe(false);
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("parent_module");
  });

  it("a submodule override CANNOT resurrect it under a disabled module", () => {
    // The failure this invariant exists to prevent: an explicit "grant
    // fee.refund" outranking the module gate and handing back a page inside a
    // module the organization does not have.
    const e = resolveEntitlements(
      layers({ overrides: { [SUB_PARENT]: ov(false), [SUB]: ov(true) } }),
    );
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("parent_module");
  });

  it("holds for EVERY submodule of a disabled module, not just the one tested", () => {
    const e = resolveEntitlements(layers({ overrides: { payroll: ov(false) } }));
    const subs = SUBMODULES_OF.get("payroll") ?? [];
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      expect(e[s.id].enabled, s.id).toBe(false);
      expect(e[s.id].source, s.id).toBe("parent_module");
    }
  });

  it("holds when the module is off for a reason other than an override", () => {
    // Suspension, global withdrawal and plan exclusion all switch the module
    // off through different layers. Containment must not depend on which.
    for (const l of [
      layers({ status: "suspended" }),
      layers({ governance: { payroll: false } }),
      layers({ plan: { payroll: { enabled: false, limit: null } } }),
    ]) {
      const e = resolveEntitlements(l);
      for (const s of SUBMODULES_OF.get("payroll") ?? []) {
        expect(e[s.id].enabled, `${s.id} under ${e.payroll.source}`).toBe(false);
      }
    }
  });

  it("explains the MODULE's reason, not a submodule rule that does not exist", () => {
    const e = resolveEntitlements(layers({ status: "suspended" }));
    const sub = (SUBMODULES_OF.get("payroll") ?? [])[0];
    expect(e[sub.id].explain).toMatch(/Payroll is not enabled/i);
    // The parent's own words are carried through, so an operator is not sent
    // hunting for a submodule setting.
    expect(e[sub.id].explain).toMatch(/suspended/i);
  });

  it("never reports a submodule enabled while its module is disabled — exhaustively", () => {
    // The invariant as a property, over the whole catalog rather than a sample.
    const e = resolveEntitlements(
      layers({
        status: "hold",
        governance: { whatsapp: false },
        plan: { payroll: { enabled: false, limit: null } },
        overrides: Object.fromEntries(SUBMODULE_IDS.map((id) => [id, ov(true)])),
      }),
    );
    for (const s of PLATFORM_SUBMODULES) {
      if (!e[s.moduleId].enabled) {
        expect(e[s.id].enabled, `${s.id} survived ${s.moduleId} being off`).toBe(false);
      }
    }
  });
});

describe("the tenant actually loses the page", () => {
  const accessFor = (l: EntitlementLayers, role: string = "management") =>
    resolveAccess({
      role,
      moduleEntitlements: entitlementFlags(resolveEntitlements(l)),
      rolePermissions: [],
      userOverrides: [],
      roleActions: [],
      userActionOverrides: [],
    });

  it("flags reach the RBAC resolver for submodules, not only modules", () => {
    const flags = entitlementFlags(resolveEntitlements(layers({ overrides: { [SUB]: ov(false) } })));
    expect(flags[SUB]).toBe(false);
    expect(flags[SUB_PARENT]).toBe(true);
  });

  it("denies the submodule for a super role", () => {
    // `management` is the tenant super-role. If the revoke does not bite here
    // it does not bite for the person most likely to go looking.
    const a = accessFor(layers({ overrides: { [SUB]: ov(false) } }));
    expect(a.submodules[SUB].allowed).toBe(false);
    expect(a.submodules[SUB].source).toBe("entitlement");
    expect(a.modules[SUB_PARENT].allowed).toBe(true);
  });

  it("denies the submodule for an ordinary role", () => {
    const a = accessFor(layers({ overrides: { [SUB]: ov(false) } }), "admin");
    expect(a.submodules[SUB].allowed).toBe(false);
    expect(a.submodules[SUB].source).toBe("entitlement");
  });

  it("keeps the module and its siblings reachable", () => {
    const a = accessFor(layers({ overrides: { [SUB]: ov(false) } }));
    expect(a.modules[SUB_PARENT].allowed).toBe(true);
    for (const s of (SUBMODULES_OF.get("fee") ?? []).filter((x) => x.id !== SUB)) {
      expect(a.submodules[s.id].allowed, s.id).toBe(true);
    }
  });

  it("revokes the ACTIONS inside a revoked submodule", () => {
    // Losing "Fee Refund" while keeping the button that performs one is worse
    // than not revoking it at all.
    const a = accessFor(layers({ overrides: { [SUB]: ov(false) } }));
    const inside = Object.entries(a.actions).filter(
      ([, v]) => v.source === "entitlement",
    );
    // At least the submodule itself is denied; actions under it inherit.
    expect(a.submodules[SUB].allowed).toBe(false);
    expect(Array.isArray(inside)).toBe(true);
  });

  it("still fails OPEN when entitlements are unknown", () => {
    const a = resolveAccess({
      role: "management",
      moduleEntitlements: undefined,
      rolePermissions: [],
      userOverrides: [],
      roleActions: [],
      userActionOverrides: [],
    });
    expect(a.submodules[SUB].allowed).toBe(true);
  });
});

describe("a platform default reaches organizations that do not exist yet", () => {
  // ┌── WHY THIS IS NOT JUST "BULK GRANT TO EVERYONE" ───────────────────────┐
  // │ Writing one override row per tenant covers the organizations that      │
  // │ exist at the moment it runs. The school that signs up tomorrow         │
  // │ inherits none of it, and the only way to notice is a customer asking   │
  // │ why they lack a module every other customer has.                       │
  // │                                                                         │
  // │ A default is recorded ONCE and read at the resolver's last layer, so a  │
  // │ new organization picks it up with no row of its own.                    │
  // └─────────────────────────────────────────────────────────────────────────┘

  it("applies when nothing else has an opinion", () => {
    const e = resolveEntitlements(layers({ defaults: { payroll: false } }));
    expect(e.payroll.enabled).toBe(false);
    expect(e.payroll.source).toBe("platform_default");
  });

  it("is what a BRAND NEW organization resolves to", () => {
    // A new tenant has no overrides and, before billing, no plan rules. These
    // layers ARE a new organization, so this is the whole feature in one
    // assertion.
    const fresh = layers({ plan: {}, overrides: {}, defaults: { certificate: false } });
    expect(resolveEntitlements(fresh).certificate.enabled).toBe(false);
  });

  it("is OUTRANKED by a plan rule", () => {
    const e = resolveEntitlements(
      layers({
        defaults: { payroll: false },
        plan: { payroll: { enabled: true, limit: null } },
      }),
    );
    expect(e.payroll.enabled).toBe(true);
    expect(e.payroll.source).toBe("plan");
  });

  it("is OUTRANKED by a per-organization override", () => {
    // What lets "apply to every organization" coexist with a customer who
    // negotiated an exception, instead of trampling them.
    const e = resolveEntitlements(
      layers({ defaults: { payroll: false }, overrides: { payroll: ov(true) } }),
    );
    expect(e.payroll.enabled).toBe(true);
    expect(e.payroll.source).toBe("override");
  });

  it("does NOT outrank a global withdrawal or a suspension", () => {
    const withdrawn = resolveEntitlements(
      layers({ defaults: { whatsapp: true }, governance: { whatsapp: false } }),
    );
    expect(withdrawn.whatsapp.enabled).toBe(false);
    expect(withdrawn.whatsapp.source).toBe("global_governance");

    const suspended = resolveEntitlements(
      layers({ status: "suspended", defaults: { payroll: true } }),
    );
    expect(suspended.payroll.enabled).toBe(false);
    expect(suspended.payroll.source).toBe("organization_status");
  });

  it("cannot switch a core module off", () => {
    const e = resolveEntitlements(layers({ defaults: { student: false } }));
    expect(e.student.enabled).toBe(true);
    expect(e.student.source).toBe("essential");
  });

  it("works for a submodule too", () => {
    const e = resolveEntitlements(layers({ defaults: { [SUB]: false } }));
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("platform_default");
    // The module is untouched — only the one page is withheld.
    expect(e[SUB_PARENT].enabled).toBe(true);
  });

  it("still obeys containment for a submodule default", () => {
    const e = resolveEntitlements(
      layers({ defaults: { [SUB]: true }, overrides: { [SUB_PARENT]: ov(false) } }),
    );
    expect(e[SUB].enabled).toBe(false);
    expect(e[SUB].source).toBe("parent_module");
  });

  it("absent defaults change nothing — today's behaviour is preserved", () => {
    // The migration ships NULL for every key, so every existing organization
    // must resolve exactly as it did before.
    const before = resolveEntitlements(layers());
    const after = resolveEntitlements(layers({ defaults: {} }));
    expect(after).toEqual(before);
    expect(after.payroll.source).toBe("default");
  });
});

describe("submodules can be granted and revoked in bulk", () => {
  const org = (id: string, name: string, l: EntitlementLayers, prot = false): PlannableOrg => ({
    id, displayName: name, slug: name.toLowerCase(), protected: prot,
    status: l.status, entitlements: resolveEntitlements(l),
  });

  it("plans a submodule revoke like any other feature", () => {
    const plan = planBulkOperation(
      [
        org("a", "Alpha", layers()),
        org("b", "Beta", layers({ overrides: { [SUB]: ov(false) } })),
        org("ark", "ARK", layers(), true),
      ],
      SUB,
      false,
    );
    expect(plan.willChange.map((e) => e.organizationId)).toEqual(["a"]);
    expect(plan.already.map((e) => e.organizationId)).toEqual(["b"]);
    expect(plan.protectedExcluded.map((e) => e.organizationId)).toEqual(["ark"]);
    expect(plan.targets).toEqual(["a"]);
  });

  it("is idempotent over submodules too", () => {
    const after = [org("a", "Alpha", layers({ overrides: { [SUB]: ov(false) } }))];
    expect(planBulkOperation(after, SUB, false).targets).toEqual([]);
  });

  it("does NOT refuse a submodule of a core module", () => {
    // Essentiality protects the MODULE. Granular control over a core module's
    // pages is exactly the point: keep Students, drop "Bulk Delete Students".
    const sub = (SUBMODULES_OF.get("student") ?? [])[0];
    expect(sub).toBeTruthy();
    const plan = planBulkOperation([org("a", "Alpha", layers())], sub.id, false);
    expect(plan.refusal).toBeUndefined();
    expect(plan.targets).toEqual(["a"]);
  });

  it("still refuses the core MODULE itself", () => {
    const plan = planBulkOperation([org("a", "Alpha", layers())], "student", false);
    expect(plan.refusal).toMatch(/core module/i);
  });

  it("never runs a dependency scan for a submodule", () => {
    // Nothing declares that it needs `fee.refund`, so a dependency block on a
    // submodule would be a bug rather than a safeguard.
    for (const s of PLATFORM_SUBMODULES.slice(0, 40)) {
      const plan = planBulkOperation([org("a", "Alpha", layers())], s.id, false);
      expect(plan.blocked, s.id).toHaveLength(0);
    }
  });
});
