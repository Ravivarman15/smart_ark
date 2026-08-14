# Platform Module Governance — Super Admin entitlement control

How Smart ARK decides whether an organization may use a module, who can change
that, and what happens when they do.

> **Entitlements gate the PRODUCT, never the DATA.** Revoking a module hides it
> from the portal. Every record it manages stays exactly where it is, and
> reappears intact when the module is switched back on. RLS remains the tenant
> data boundary and is untouched by anything in this document.

---

## 1. The layers

One resolver decides, and both sides run it:

```
audience              is this a customer-facing module at all?
    ↓
global governance     withdrawn platform-wide by Smart ARK
    ↓
organization status   suspended / hold / archived / cancelled
    ↓
essential             core modules are never revocable
    ↓
override              an explicit, unexpired per-organization decision
    ↓
plan                  what the subscription includes
    ↓
default               nothing said anything → INCLUDED
```

`resolveEntitlements()` in `src/features/platform/modules/entitlements.ts` is
the only place precedence is decided. SQL returns raw **layers**
(`entitlement_layers(uuid)`); the TypeScript resolves them. Implementing it
twice — once for tenants, once for the console — guarantees the worst kind of
support call: the customer sees a module the platform believes they do not have.

**The default is INCLUDED.** Plans in this product differ by capacity and
support, not by withheld modules, and `plan_features` is sparsely populated.
Defaulting to "no" would have switched every module off for every existing
customer the moment it shipped.

### Fail-open, deliberately

If the entitlement RPC fails, `useModuleEntitlements` returns `undefined` and
the RBAC resolver reads that as "no information" and allows everything. One
failed request must not black out a paying school's portal mid-lesson. The
downside is a customer briefly seeing a module they have not paid for; the
downside of failing closed is an outage. Those are not comparable.

---

## 2. Enforcement — where a revoke actually bites

| Surface | Mechanism |
|---|---|
| Sidebar | `useSidebarAccess` → `resolveAccess()` — the module and all its submodules resolve to `entitlementDenied()` |
| Submodules & actions | Applied in the resolver, **not** by inheritance, so a per-user override cannot resurrect an unentitled module |
| **Direct URL** | `LayoutAccessGate` resolves the path's owning module and blocks it |
| API / data | Unchanged — RLS, as always |

### The hole that was closed (2026-08-14)

`LayoutAccessGate` used to open with:

```ts
if (data.isSuper) return { allow: true };
```

`SUPER_ROLES` is exactly `["management"]` — a school's own administrator. So a
Super Admin could revoke Payroll, watch the sidebar link disappear, and a
management user typing `/management/payroll/dashboard` still got the entire
module. `ProtectedRoute` above it checks the role name and nothing else.

The resolver was never wrong; it had been returning `entitlementDenied()` all
along. The gate simply never asked.

The bypass was not removed — it was **delegated**. `resolveAccess()` applies the
entitlement gate *above* its own super-role branch, so consulting it gives
management its bypass over permission rows while still honouring the commercial
boundary. Pinned by `entitlementRouteGate.test.tsx` at two levels: rendering the
gate and asserting the outcome, and asserting the short-circuit never returns.

A path resolves to a module by **root** (`/role/module/*`), not by menu-item
prefix — a revoke is a fact about the module, so nested tabs and detail routes
nobody listed are covered too. A root claimed by two modules is recorded
ambiguous and never used: blocking on a guess would take away a module the
customer does have.

### What the customer sees

`ModuleUnavailable` — rendered in place, not a silent redirect. It names the
module, says the data is retained, and points at their own administrator. It
deliberately does **not** name the plan, the override, or the platform: a
tenant-facing screen that leaks commercial posture tells anyone who can type a
URL which plan they are on and what the upsell is.

---

## 3. Audience — internal modules that must never ship to a school

`category` groups modules for a human reading a list. `audience` answers a
different question: may a customer ever see this?

| Value | Meaning |
|---|---|
| `customer` | Sold to institutes. Governed by plans and overrides normally. |
| `platform` | Smart ARK staff only. Visible in the console, never to a tenant. |
| `internal` | Engineering only. Not surfaced to customers or operators. |

Required, with no default — a new module must state who it is for, because the
failure mode of guessing is a developer tool rendered in a school's sidebar.

Enforced in `resolveEntitlements` as layer 0, **above governance**, so the menu,
the route guard and the RBAC resolver all inherit one answer. There is no
surface left where a non-customer module could appear, and no override can hand
one over.

All 19 catalog modules are currently `customer`. The mechanism exists so that
internal tooling can be added without deleting code or scattering exclusions.

### The four platform states

Derived, never stored — from the governance row and the audience:

| State | Derivation |
|---|---|
| `AVAILABLE` | customer-facing, not withdrawn |
| `DISABLED` | customer-facing, withdrawn platform-wide |
| `PLATFORM_ONLY` | `audience: platform` |
| `HIDDEN` | `audience: internal` |

No fifth place for a module's state to live, so nothing can drift.

---

## 4. Operations

All of them go through `platform_set_module_entitlement()` — one function,
`SECURITY DEFINER`, which upserts `organization_features` and always writes a
`feature_flag_assignments` history row.

| Operation | Route |
|---|---|
| Grant / revoke, one organization | Organization detail → Module Entitlements |
| Grant / revoke, selected | Control Center → module → select → action |
| Grant / revoke, **all** | Control Center → module → Grant/Revoke to all |
| Clear an override | `platform_clear_module_override()` — returns to the plan |
| Withdraw platform-wide | Catalog tab → global switch |

### Everything is planned before it is executed

"Revoke Payroll from all organizations" is four operations wearing one button.
`planBulkOperation()` (pure, in `modules/bulkPlan.ts`) splits them:

```
Considered      25
Will change     11      ← the only ids sent
Already off     12      ← writing these creates rows that say nothing
Protected        1      ← ARK, excluded by policy
Blocked          1      ← would strand a dependent module
```

Only `plan.targets` is sent. An unnecessary write is still a write, and it lands
in the entitlement history as a decision somebody made.

**Idempotent by construction**: "already" is judged on the *resolved* state, not
on the presence of an override row — an organization whose plan already grants
the module does not need an override saying the same thing. Re-running the same
operation moves nobody and reports `changed: false`.

### Temporary access

Any grant may carry `expires_at`. `expire_organization_features()` **deletes**
the lapsed row rather than flipping it to `false`, so the module falls back to
the plan default rather than becoming permanently off. Nothing has to remember
to switch it back.

---

## 5. Dependencies

Declared in `MODULE_METADATA.dependsOn` as a **product** fact ("a fee receipt
names a student"), not a bundler fact — the code would still compile with
Students off.

- **Enabling** with a dependency missing is a **warning**. Refusing "grant
  Payroll" because Staff is not on yet turns a two-click fix into a support
  ticket.
- **Disabling** something another enabled module reads is a **refusal**. It
  leaves the customer with screens that load, query a table they can no longer
  reach, and show nothing — which reads as data loss.

Evaluated **per organization**, against that tenant's own resolved state.
Revoking Students is safe for a customer running neither Fees nor Exams, and
refusing on the strength of a different tenant's configuration would block a
legitimate change.

### The preview is not the control

The console previews this before asking for confirmation. A dependency check
that exists only in the browser is *advice* — the edge function is reachable
directly. So `supabase/functions/_shared/moduleGraph.ts` mirrors the graph and
the resolution order server-side, and **both** revoke paths (single and the bulk
loop) consult it. `moduleGovernance.test.ts` reads both files and fails the
build if the edges or the essential set drift apart.

---

## 6. Protected organizations

ARK Learning Arena is the production reference tenant.

- `organization_protections.block_bulk` excludes it from **every** bulk
  operation. Reaching ARK requires opening ARK.
- A database **trigger** (`guard_protected_organization`) is the real boundary —
  not the disabled buttons, not the confirmation dialogs. A compromised console
  still cannot alter protected state without the transaction-local
  acknowledgement.
- ARK is identified by its stable slug **once**, then by uuid forever after.

Nothing in this phase weakens any of it. Verified by re-running
`scripts/ark-baseline.mjs` before and after: **no count decreased.**

---

## 7. Audit

Every mutation writes two records:

| Record | Contains |
|---|---|
| `feature_flag_assignments` | organization, module, enabled, reason, note, actor, `expires_at`, `source` (`manual`/`bulk`), `batch_id` |
| `platform_audit_log` | actor, action, target, organization, detail, payload, IP |

A bulk change generates **one `batch_id`** and writes a per-organization row for
each affected tenant **plus** one summary row. "We changed 23 schools" is not an
auditable record of anything — each customer gets its own entry, and the batch
id ties them together.

A reason is required for every bulk operation and every global withdrawal;
the note is recorded against every organization in the batch.

Never one statement across many organizations. Each tenant is applied
individually against an explicit id, so a protected organization can be refused
without aborting the other 22. There is no `WHERE true` on an entitlement
mutation anywhere, and a test asserts it.

---

## 8. Authorization

Server-side, always. The final decision is never the browser's.

| Capability | Gates |
|---|---|
| `modules.grant` | enabling for an organization |
| `modules.revoke` | disabling, and clearing an override |
| `modules.bulk` | any multi-organization operation |
| `modules.govern` | platform-wide withdrawal |

Each edge action checks its own capability. `auditor` and `support` hold no
mutating capability; `customer_success` is deliberately kept away from bulk.
Tenant roles — management, admin, coordinator, teacher, parent — have no path to
these functions at all: the privileged RPCs are revoked from `authenticated` and
granted to `service_role`, and `entitlement_layers` is not directly callable by
a client.

---

## 9. Test coverage

| Area | File |
|---|---|
| Layers, dependencies, RLS, ARK protection, capabilities, audit, idempotency | `src/test/security/phase9.test.ts` |
| Planning, audience, mirror drift, bulk scoping | `src/features/platform/testing/moduleGovernance.test.ts` |
| Direct-URL enforcement, fail-open, leak-free messaging | `src/features/rbac/testing/entitlementRouteGate.test.tsx` |

Mutation-tested: restoring the `isSuper` short-circuit, drifting the server
dependency graph, and removing the bulk guard each fail the suite.

### Live verification (2026-08-14, ABC Academi, rolled back)

```
revoke                    changed: true
revoke again              changed: false      ← idempotent
temporary grant 2h        expires_at set      ← lapses on its own
clear override            removed: true
after clear               override null, plan enabled  ← reversible
history rows written      4
ARK payroll overrides     0                   ← untouched
ARK students              135                 ← untouched
```

---

## 10. Known limitations

- **The catalog is TypeScript, not a table.** Adding a module is a deploy, not a
  configuration change. That is deliberate — the catalog is read by the
  permission matrix, the sidebar resolver and the route guard, and a typed
  constant gives compile-time safety. A Super Admin governs *availability*, not
  the catalog's contents.
- **`audience` is a code-level classification.** Reclassifying a module to
  `platform` requires a deploy. There is no UI to change it, because doing so
  would let an operator hide a module a customer is paying for.
- The dependency graph is mirrored into Deno by hand. Gated for drift, but it is
  duplication.
