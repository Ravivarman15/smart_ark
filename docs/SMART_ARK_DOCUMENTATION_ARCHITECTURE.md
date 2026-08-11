# Smart ARK Documentation Center — Architecture

**Status: audit complete, implementation not started.** This document is the
deliverable of step 38 of the brief ("do not start by writing documentation —
first audit the repository and build the coverage matrix"). It records what the
audit found, what that means for the documentation, and the plan.

---

## 1. The finding that changes the whole plan

`node scripts/docs-inventory.mjs`, generated from the registries the app itself
reads:

```
modules ................. 19
submodules .............. 184
  SHIPPED ............... 80    ← has a route, and that route is mounted
  LEGACY_ONLY ............ 1
  ROUTE NOT MOUNTED ...... 0
  ASPIRATIONAL .......... 103    ← permission-only, renders nothing
sidebar menu items ...... 11
feature directories ..... 30
existing docs/*.md ...... 37
```

**Only 80 of 184 RBAC submodules are things a user can actually open.**

The RBAC catalog is not a feature list, and says so in its own header:

> *"Submodules without a `route` or `legacyAction` are aspirational features the
> UI doesn't render yet; they stay in the catalog so management can
> pre-configure permissions."*

Had the documentation been generated from the catalog — the obvious approach,
and the one the brief's suggested tree implies — **56% of it would have
described screens that do not exist.** Every one of those pages would have
looked plausible, carried a route, and sent a customer hunting for a menu item
that was never built. That is precisely the failure mode rule 0 forbids, and it
is invisible without this audit.

**Documentation may be written for the 80 SHIPPED submodules and the real
surfaces in §3. Nothing else may be described as existing.**

Full per-submodule breakdown: `docs/generated/DOCUMENTATION_COVERAGE_MATRIX.md`.
Machine-readable: `docs/generated/documentation-inventory.json`.

### Secondary finding

**4 of 15 sidebar menu paths carry no `submodule` mapping.** They are reachable
but not RBAC-gated through the catalog, so a catalog-driven doc would miss them
entirely. They must be picked up from the router, not the catalog.

---

## 2. Content model

```ts
type DocumentationArticle = {
  slug: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  roles: Role[];              // drives the role filter
  permissions: string[];      // RBAC submodule ids — the coverage link
  keywords: string[];
  steps?: Step[];
  warnings?: string[];
  tips?: string[];
  faq?: { q: string; a: string }[];
  screenshots?: { src: string; caption: string }[];
  relatedArticles: string[];  // slugs
  sourceModules: string[];    // real file paths — what makes it auditable
  lastVerified: string;       // ISO date, set when checked against the code
  status: "published" | "draft";
};
```

`permissions` and `sourceModules` are the load-bearing fields. They are what let
a gate ask *"does this article describe something that still exists?"* — the
question that keeps documentation honest six months later.

`lastVerified` is per-article metadata, never `new Date()` at render time. A
page that always claims to have been verified today is worse than one with no
date at all.

---

## 3. Real surfaces outside the RBAC catalog

Not every documentable thing is a submodule. These are real, reachable, and
must be documented from the router rather than the catalog:

| Surface | Route | Audience |
|---|---|---|
| Public enquiry form | `/leads/apply/:orgSlug` | prospective parents, unauthenticated |
| Signup wizard | `/signup` | prospective customers |
| Login | `/login` | everyone |
| Parent portal | `src/features/parent-portal` | parents |
| Platform control plane | `src/features/platform` | platform staff only |
| Marketing site | `src/features/marketing` | public |

The platform control plane must be documented **separately and never surfaced
to organization users** — §29 of the brief, and a genuine disclosure boundary.

---

## 4. Route → documentation coverage gate

`scripts/docs-inventory.mjs --check` is the CI gate. Following the same
philosophy as the Phase 7/8 security gates, it enforces **both directions**:

| Rule | Failure |
|---|---|
| A SHIPPED submodule with no article | **warning** — coverage gap |
| An article whose `permissions` name a submodule that no longer exists | **failure** — documents a removed feature |
| An article whose `sourceModules` name a deleted file | **failure** — stale |
| An article referencing a missing screenshot | **failure** |
| An article claiming a role the submodule does not grant | **failure** |

The asymmetry is deliberate. A missing page is a gap; a page describing
something that no longer exists is a lie, and lies fail the build.

---

## 5. Screenshots

Real screenshots only. The brief is explicit and it is the right call — an
AI-drawn mockup of the Student Import screen is worse than no image, because a
customer will trust it and then not find the button.

**Capture is blocked today.** Screenshots require an authenticated session in
each role (admin, management, coordinator, teacher, parent, platform), and I
have credentials for none of them. Options, in order of preference:

1. **You capture them** — I supply an exact shot list with route, role and state
   per image, and the naming convention.
2. **Browser automation with a session you provide**, same as the Phase 8A ARK
   harness.
3. **Ship without screenshots initially**, using structural diagrams generated
   from the real route tree, and add them later.

Nothing will be fabricated under any of these. Where an image cannot be
captured, the page carries a diagram or nothing — never a mockup.

---

## 6. Role matrix

| Role | Source of truth |
|---|---|
| Admin | catalog + `menu.config.ts` `roles: adminMgmt` etc. |
| Management | same |
| Coordinator | same, plus `sharedRoutes.tsx` (coordinator is 100% shared-route driven) |
| Teacher | same |
| Parent | `src/features/parent-portal` routes — not RBAC-gated |
| Platform Admin | `src/features/platform` + `platform_can()` policies |

Role assignment per article is **derived from the registries**, not hand-typed.
A hand-typed role list is a second source of truth that drifts.

---

## 7. Search

Client-side index built at build time from the article model — title,
description, headings, keywords, FAQ, role, module. No search backend: the
corpus is a few hundred articles, and adding infrastructure for that would be
the "duplicate service" §35 forbids.

---

## 8. What is NOT yet built

Everything after the audit. Specifically: the documentation route and UI shell,
the article model implementation, the content itself, search, role filtering,
contextual help links, screenshots, and the CI gate wiring.

The audit and the inventory generator are what exist today. That was the
required first step and it has already paid for itself by catching the
103-aspirational-submodule trap before a single page was written.

---

## 9. Verification methodology

Every article must be traceable to code:

```
Article: "Import students"
  permissions:   ["students.import"]        → exists in catalog, SHIPPED
  sourceModules: ["src/features/students/pages/StudentImportPage.tsx",
                  "src/features/students/services/duplicateEngine.ts"]
  lastVerified:  2026-08-11
```

The gate re-checks all three on every commit. Field names, button labels and
step order must be read from the implementation, never assumed — the audit
already found the settings page had a label mismatch nobody noticed.
