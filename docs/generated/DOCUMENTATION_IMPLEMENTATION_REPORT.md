# Documentation implementation report

> **Reclassified 2026-08-12.** The route detector was measuring the wrong thing.
> See "Classifier correction" below — the numbers moved a long way, and the
> earlier ones were wrong, not merely out of date.

## Inventory

| | Before correction | **Now** |
|---|---|---|
| Modules | 19 | 19 |
| Submodules | 203 | 203 |
| SHIPPED | 87 | **192** |
| ASPIRATIONAL | 115 | **11** |
| ROUTE_CLAIMED_NOT_MOUNTED | 0 | 0 |
| LEGACY_ONLY | 1 | 0 |

## Classifier correction

Classification started from the RBAC catalog's `route:` property alone. This
repository binds a route to a submodule **three** ways, and the other two were
invisible to the detector:

| Mechanism | Example | Entries |
|---|---|---|
| catalog `route:` | `{ id: "fee.collection", route: "/admin/fees" }` | the only one detected before |
| `sharedRoutes.tsx` `submodule:` | `{ path: "certificates", submodule: "certificate.manage" }` | 181 |
| `menu.config.ts` | `sub("certificate.add", …)` **and** `{ path: …, submodule: … }` | 119 |

A second bug compounded it: the menu parser matched only object literals, while
most entries are produced by the `sub()` helper — so the menu index was
effectively empty. Both bugs failed **silently**, because a missing binding only
made the classifier more conservative. Nothing ever went wrong loudly.

`certificate.add` and `certificate.manage` were the visible symptom: reported
ASPIRATIONAL while `App.tsx` mounted them, `sharedRoutes.tsx` mounted them, the
sidebar listed them, and ARK had granted them to management and coordinator in
RBAC.

**The gate's contract is unchanged.** `SHIPPED` still means "a user can open
this today", and only SHIPPED/LEGACY_ONLY may be documented. What changed is
that the detector now finds routes it was previously blind to. The 11 remaining
ASPIRATIONAL entries were re-checked by hand: each has **zero** bindings in
`sharedRoutes.tsx`, `menu.config.ts` and `App.tsx`.

## Four levels, recorded separately

The audit asked to distinguish catalog-only / mounted / mounted+menu / fully
functional. These are separate fields rather than one collapsed status, because
they answer different questions:

| Field | Question |
|---|---|
| `status` | May this be documented? |
| `mountedVia` | Which mechanism proves it is reachable? |
| `inMenu` | Can a user find it without typing a URL? |
| `backing` | `service` (database) or `starter` (localStorage)? |

### Starter-backed screens — 5

`live.add`, `live.manage`, `live.my`, `certificate.add`, `certificate.manage`

These render a working CRUD screen via `ModuleStarterPage`, but records live in
**one browser's localStorage** — not the database. They are genuinely usable and
therefore documentable, but any article covering them must say so: the data is
not multi-device, not multi-tenant, and not backed up.

## Coverage

| | Phase 1 | Phase 2 | **Now (corrected)** |
|---|---|---|---|
| Articles | 21 | 30 | **36** |
| Shipped submodules documented | 23 | 55 | **55** |
| Coverage | 26% | 63% *(against a wrong denominator)* | **29%** (55/192) |
| Aspirational documented | 0 | 0 | **0** |
| False feature references | 0 | 0 | **0** |
| Broken links | 0 | 0 | **0** |

The coverage percentage **fell from 63% to 29%** without a single article being
removed. The 63% was measured against 87 shipped submodules; there were always
192. The work did not regress — the denominator was wrong, and 137 shipped
submodules were being excluded from the coverage obligation entirely.

### Least-covered modules

| Module | Covered / shipped |
|---|---|
| live_class | 0/3 |
| exam | 0/13 |
| estudy | 0/3 |
| certificate | 0/2 |
| authentication | 0/2 |
| help | 0/6 |
| whatsapp | 1/16 |
| student | 2/15 |
| reports | 4/26 |
| attendance | 5/31 |

## Role coverage

| Role | Articles |
|---|---|
| management | 24 |
| admin | 22 |
| coordinator | 6 |
| teacher | 5 |
| platform | 5 |
| parent | 3 |

## Remaining gaps (32)

| Module | Undocumented |
|---|---|
| attendance | 26 |
| payroll | 5 |
| setup | 1 |

Reported as a **warning**, never a failure. Failing on coverage pushes people
to write filler pages to make CI green, which is worse than an honest gap.

## Gates

| Gate | Result |
|---|---|
| Documentation integrity (25 assertions) | **PASS** |
| Full suite | **1495 passed, 0 failed** |
| Search | **PASS** (5 query cases asserted) |
| Role filtering | **PASS** (metadata-driven, asserted) |
| Previous/next | **PASS** |
| Screenshots | **0 captured** — blocked, see screenshot report |
| Mobile | **NOT VERIFIED** — built to spec, not tested on a device |
| Accessibility | **NOT VERIFIED** — semantic markup and ARIA present, no tool audit |

## Contextual help

`DocsLink` renders nothing when a slug has no article, so a help link can
never point at a missing page. Wired on:

- Settings → Check-in & Check-out
- Settings → Branding & White Label
- Leads → Automation Config
