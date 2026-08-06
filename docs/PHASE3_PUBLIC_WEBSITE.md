# Phase 3 — Public Website & Organization Onboarding

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 15 August 2026
**Migration:** `20260815_phase3a_marketing_and_onboarding.sql` (+ rollback)
**Prerequisites:** Phases 0, 1, 1E, 2 deployed

---

## 1. Executive Summary

The front door exists: **25 public routes, a working self-service trial that provisions a real ERP, demo booking, a CMS-backed content engine, a public status page, and prerendered SEO that actually reaches crawlers.**

The ERP, the control plane and ARK's data are untouched — Phase 3 adds new tables and new routes, and changes exactly one existing behaviour (`/` now shows the marketing home to signed-out visitors instead of bouncing them to a login form).

| Delivered | Detail |
|---|---|
| Public website | 25 routes, responsive, dark/light, accessible |
| Trial signup | Verified email → `provision_organization()` (Phase 1D, reused) |
| Demo booking | Stored to `platform_demo_requests`, visible in the control plane |
| Content engine | `content_posts` powering blog, help centre and docs |
| Status page | Curated component status, deliberately separate from internal health |
| SEO | Prerendered HTML shells, sitemap, robots, JSON-LD, canonicals |
| Demo mode | `is_demo` organizations are read-only, enforced in RLS |

---

## 2. New Pages (25 routes)

`/` · `/features` · `/solutions` · `/modules` · `/pricing` · `/compare` · `/demo` · `/customers` · `/security` · `/status` · `/about` · `/contact` · `/careers` · `/partners` · `/resources` · `/blog` (+`/:slug`) · `/help` (+`/:slug`) · `/docs` (+`/:slug`) · `/marketplace` · `/developers` · `/privacy` · `/terms` · `/cookies` · `/signup`

**Two pages are generated, not written.** `/modules` renders from `MODULE_CATALOG` — the same constant the RBAC system and the sidebar read. `/pricing` and `/compare` render from the `plans` table the control plane manages. A hand-written marketing copy of either would drift from the product within one release, and the drift is invisible until a prospect asks for something the page promised.

## 3. New Components

`MarketingShell` (header, footer, `Section`, `SectionHeading`, `FeatureCard`, `CheckList`, `CtaBand`, `ComingSoon`), `DashboardPreview`, `RootRoute`.

**`DashboardPreview` is a CSS mock, not a screenshot.** A screenshot of a real institute's dashboard shows real student counts and fee figures; publishing that is a disclosure with no upside. A mock also cannot drift out of date and start advertising a UI that no longer exists. It carries a visible "figures shown are examples, not customer data" caption and `aria-hidden`.

## 4. New Services · 5. New Hooks

`marketing.service.ts` — the only data layer the public site touches. `useSeo()` — a ~60-line hook rather than `react-helmet-async`: that dependency exists to solve SSR head collection, which a Vite SPA does not do, and adding a package to a security-audited bundle should clear a higher bar than saving forty lines.

---

## 6. Database Changes

Nine new tables, all with RLS enabled and forced:

`platform_demo_requests` · `platform_trial_signups` · `platform_enquiries` · `content_authors` · `content_categories` · `content_posts` · `status_components` · `status_incidents` · `marketing_events`

Plus `organizations.is_demo`, and `public_status()` for the status page.

### Why not reuse `public.leads`

That table is tenant-scoped (`organization_id NOT NULL` since Phase 1B). A demo request is a prospect for **Smart ARK**, which is not an organization and has no tenant to attribute the row to. Forcing one would mean inventing a fake "platform tenant" that every tenant policy then has to special-case. Different entity, different table — this is not duplication.

### A latent bug this migration fixes

Migration 1B does not list tables; it **iterates `pg_catalog`** and adds `organization_id` to everything `is_tenant_scoped_table()` does not exclude. That is what makes it robust to unapplied migrations — and it means every new platform-owned table must be added to the exclusion list.

Without PART 0, re-running 1B (which is idempotent, and re-running is the documented recovery step) would give `marketing_events` an `organization_id NOT NULL DEFAULT current_org_id()`. Anonymous visitors have no organization context, so **every page-view insert would fail a NOT NULL violation** and the website would silently stop recording anything. The same for the CMS tables, which would hide every blog post from anonymous readers.

Phase 3A therefore replaces `is_tenant_scoped_table()` with the full, current exclusion list, and a new gate asserts every table a phase creates appears in it.

---

## 7. Modified Files

| File | Change |
|---|---|
| `src/App.tsx` | Marketing route tree + `RootRoute` at `/` |
| `src/core/routing/RootRoute.tsx` | **New** — chooses marketing home vs. `AuthRedirect` |
| `package.json` | `build` now runs the prerenderer |
| `vercel.json` | `cleanUrls: true` so prerendered shells are served |
| `supabase/config.toml` | `[functions.public-onboarding] verify_jwt = false` |
| `src/test/security/phase2.test.ts` | Platform-table list now **derived**, not hardcoded (§12) |

**No ERP module, service, hook or policy was modified.** `AuthRedirect` is untouched — `RootRoute` only decides whether to invoke it, keeping the role→home logic in one place.

---

## 8. SEO Report

### The problem, stated honestly

Smart ARK is a Vite SPA. Meta tags applied by JavaScript are enough for Google, which renders JS. They are **not** enough for the crawlers that matter most here: **WhatsApp, LinkedIn, Twitter/X, Slack and Facebook do not run JavaScript.** They fetch the URL, read the raw HTML and stop. A JS-injected `og:image` produces a bare grey link preview — on WhatsApp, which is exactly where this product gets shared in India.

### What was built

`scripts/prerender-marketing.mjs` runs after every build and emits a **real static HTML file per route**, each with its own `<title>`, description, Open Graph, Twitter Card, canonical and JSON-LD. Verified on a real build:

```
Prerendered 25 route(s); sitemap lists 23 indexable URL(s); robots.txt written.

$ grep -oE '<title>[^<]*</title>' dist/pricing/index.html
<title>Pricing — Smart ARK</title>
```

| Item | Status |
|---|---|
| Per-route `<title>` + description | ✅ 25 routes, static HTML |
| Open Graph + Twitter Card | ✅ static |
| Canonical URLs | ✅ static, kills `?utm_*` duplicates |
| JSON-LD | ✅ Organization, SoftwareApplication, FAQPage, BreadcrumbList, Article |
| `sitemap.xml` | ✅ 23 indexable URLs, noindex excluded |
| `robots.txt` | ✅ every authenticated surface disallowed |
| Funnel pages noindex | ✅ `/signup`, `/welcome` |
| Semantic HTML + heading order | ✅ |

### Honest limits

- **This prerenders metadata, not page content.** Bots that read body copy still see the SPA shell. Good enough for link previews and indexing signals; not equivalent to server rendering.
- **Blog posts published between builds get no shell** until the next deploy.
- The real fix for both is moving the marketing site to its own SSG/SSR app. That is its own piece of work and I have not smuggled it into a phase about building pages.

The route metadata lives in **one place** (`seo.ts`); the runtime hook and the prerenderer both read it, and a gate asserts the prerenderer parses it rather than keeping a copy. It also refuses to run if it parses fewer than 10 routes, so a broken parser fails loudly instead of shipping 25 identical pages.

---

## 9. Performance Report

| Item | Result |
|---|---|
| Route splitting | Every marketing page lazy-loaded — a signed-in ERP user never downloads it |
| Main bundle | 623.82 kB / **159.09 kB gzipped** |
| Images | **Zero.** The hero preview is CSS/markup — no image bytes, no CDN, scales to any DPI, theme-aware |
| Fonts | System stack — no webfont request, no FOIT |
| Third-party scripts | **None.** No GTM, no analytics tag, no chat widget |
| Data fetching | Plans and status cached 5–10 min; status polls at 60s |
| Loading states | Skeletons on pricing, compare and content lists |
| Prerendered HTML | First paint does not wait for the JS bundle to parse route metadata |

I have **not** run Lighthouse — that needs the site deployed and is step 9 of the deployment guide. The structural work that drives the score (no images, no webfonts, no third-party JS, code-split routes) is done; the number is unverified and I am not going to claim one.

---

## 10. Accessibility Report

| Item | Status |
|---|---|
| Skip-to-content link | ✅ first focusable element |
| Landmarks | ✅ `header` / `main#main` / `footer`, labelled `nav` |
| Mobile menu | ✅ `aria-label`, `aria-expanded`, body-scroll lock |
| Billing toggle | ✅ real `role="switch"` + `aria-checked` |
| Tables | ✅ `<caption class="sr-only">`, `scope="col"` / `scope="row"` |
| Icon-only meaning | ✅ tick/dash cells carry `aria-label`; `sr-only` "included / not included" |
| Decorative mock | ✅ `aria-hidden="true"` |
| Filter chips | ✅ `aria-pressed` |
| Live result counts | ✅ `role="status"` |
| Forms | ✅ every input has a `<label htmlFor>` |
| Colour independence | ✅ status uses shape + text, never colour alone |
| Reduced motion | ✅ no autoplay, no parallax; transitions only on state change |

**Not verified:** contrast ratios were not measured with a tool, and no screen-reader pass was done. Both need the deployed site. Listed in the verification checklist rather than claimed here.

---

## 11. Security Review

| Control | Implementation |
|---|---|
| **Anonymous writes are never readable back** | `platform_demo_requests`, `platform_enquiries`, `marketing_events` grant anon `INSERT` and **no `SELECT`**. A competitor cannot enumerate the sales pipeline with the anon key that ships in the bundle. |
| Trial signups | **No anon policy at all** — even INSERT. Only the edge function writes; a self-service insert would let anyone probe which emails are registered. |
| Anon reads | Limited to published content, status and **public** plans. Negotiated plans stay hidden. |
| Provisioning | Requires a **verified email**, blocks disposable domains, one org per account, reuses Phase 1D so the readiness guard still applies. |
| Signup inertness | The wizard sends **no `role`** in user metadata, so Phase 0's `handle_new_user()` creates no profile. The account is inert until provisioning attaches it. |
| Demo mode | Every tenant WRITE policy gains `AND NOT is_demo_org()`, using the Phase 1C wrap-and-snapshot technique. UI-only read-only would be one fetch away from vandalism. |
| Analytics | No cookie, no IP, no user agent, no fingerprint — nothing that needs consent, and nothing identifying even if the table leaked. |
| Markdown rendering | Post bodies render as **pre-wrapped text**, not `dangerouslySetInnerHTML`. An HTML pipeline for operator-authored content is a stored-XSS surface that needs a sanitiser chosen deliberately, not added with a blog page. |
| Internal routes | `/platform`, `/admin`, `/management`, `/coordinator`, `/teacher`, `/parent`, `/impersonate` all disallowed in robots and unreachable without a session. |

**Residual risks, stated plainly:**
- There is **no CAPTCHA or server-side rate limit** on demo/contact submissions. The tables are write-only so the exposure is spam, not disclosure — but a determined script can fill them. Adding a rate limit to `public-onboarding` and a challenge on the public forms is the first hardening item for Phase 4.
- The disposable-domain list is short and high-signal, not exhaustive. A 50,000-entry blocklist has to be maintained and still fails open.
- Email verification depends on Supabase's email delivery being configured. If it is not, nobody can complete signup — checked in the deployment guide.

---

## 12. PASS / FAIL Matrix

| Gate | Baseline | Phase 2 | **Phase 3** | Verdict |
|---|---|---|---|---|
| Tests | 71 / 777 | 76 / 956 | **77 / 1000** | ✅ **PASS** (+44, 0 regressions) |
| Production build | exit 0 | exit 0 | exit 0 + prerender | ✅ **PASS** |
| TypeScript | 527 | 527 | **527** | ✅ **PASS** — per-file **and** per-code identical |
| ESLint errors | 15 | 15 | **15** | ✅ **PASS** |
| ESLint warnings | 259 | 269 | **271** | ⚠️ **PASS** — +2, both `react-hooks/exhaustive-deps` in `useSeo` (the dep array serialises JSON-LD deliberately) |
| Phase 0/1/1E/2 gates | — | 169 | 170 pass | ✅ no regression |
| Phase 3 gates | — | — | **44 pass** | ✅ **PASS** |
| Anon read-back invariant | — | — | mutation-tested | ✅ **PASS** |
| SEO output | — | — | verified on real build | ✅ **PASS** |
| Runtime verification | — | — | **not run** | ⏳ **PENDING DEPLOY** |

### The Phase 2 gate caught Phase 3

The full run failed on `no policy on any tenant table references is_platform_admin()` — flagging `content_posts` and `marketing_events`. Those are platform-owned, so the policies are correct, but the gate's classification list was **hardcoded** and did not know about them.

Two fixes, both better than adding names to a list:
1. The gate now **derives** platform-owned tables from `is_tenant_scoped_table()` in the migrations — the same function migration 1B uses. It cannot drift again.
2. Investigating *why* they were missing surfaced the latent 1B re-run bug documented in §6.

I then re-ran the mutation test (adding a real bypass to `students`) to confirm the derived list **widened** the gate rather than weakening it. It still fails.

---

## 13. Deployment Guide

- [ ] **1.** Verified backup / PITR restore point.
- [ ] **2.** Apply `20260815_phase3a_marketing_and_onboarding.sql`. Read the output — `demo write-guard applied to N policy/policies` should be non-zero.
- [ ] **3. Configure Supabase email templates and SMTP.** Without working delivery nobody can verify their address, and **the signup funnel is dead at step 2**. Test with a real address before announcing anything.
- [ ] **4.** Set the signup redirect: Dashboard → Authentication → URL Configuration → add `https://smartark.ai/signup` to redirect URLs.
- [ ] **5. Verify anon signup is ENABLED.** Phases 0–2 assumed it was off. It must now be on — and it is safe precisely because Phase 0 made a role-less signup create no profile. Confirm that fix is deployed before enabling.
- [ ] **6.** `npx supabase functions deploy public-onboarding`.
- [ ] **7.** Deploy the frontend (`npm run build` now runs the prerenderer).
- [ ] **8.** Confirm the shells are served: `curl -s https://smartark.ai/pricing | grep '<title>'` must return the pricing title, **not** the generic one.
- [ ] **9.** Run Lighthouse on `/`, `/pricing`, `/features`. Target ≥ 95.
- [ ] **10.** Paste a link into WhatsApp and LinkedIn — the preview card must show the right title and image. This is the check the whole prerenderer exists for.
- [ ] **11.** Submit `sitemap.xml` to Google Search Console.
- [ ] **12. End-to-end signup test with a real email**: sign up → verify → provision → sign in → confirm the new organization is empty, has one branch, an academic year, four roles, and **every communication automation OFF**.
- [ ] **13.** Confirm ARK is unaffected: sign in as an ARK admin, mark attendance, collect a fee, open a report.
- [ ] **14.** Add the first status components / an incident to prove `/status` renders live data.

## 14. Rollback Guide

| Symptom | Action |
|---|---|
| Signup stalls at "check your email" | SMTP not configured — fix step 3, no rollback needed |
| Provisioning refuses | Read the message: the readiness guard names the unmet flag |
| Link previews still generic | `cleanUrls` not applied, or the prerenderer did not run — check the build log |
| Marketing pages 404 | Vercel is serving the SPA fallback; confirm `dist/<route>/index.html` exists |
| ERP users land on the marketing page | `RootRoute` regression — check `loading` handling before rolling anything back |

Full rollback: `20260815_phase3a_marketing_and_onboarding_rollback.sql`. It **restores the pre-Phase-3 write policies from the snapshot** (not a regex) and **refuses to run while a demo organization exists** — removing the guard then would make it writable by every visitor who can reach a login. It does **not** drop `is_demo`; a nullable defaulted boolean costs nothing, and dropping a column is the one irreversible act the file could commit.

The ERP is unaffected either way — nothing in it reads a Phase 3 table.

## 15. Production Verification Checklist

- [ ] `curl https://smartark.ai/pricing | grep og:title` → the pricing title in static HTML
- [ ] `curl https://smartark.ai/sitemap.xml` → 23 URLs, no `/signup`
- [ ] `curl https://smartark.ai/robots.txt` → `Disallow: /platform`
- [ ] WhatsApp + LinkedIn link previews render correctly
- [ ] Anon `SELECT` on `platform_demo_requests` → **0 rows / denied**
- [ ] Anon `SELECT` on `platform_trial_signups` → **denied**
- [ ] Anon `SELECT` on an unpublished `content_posts` row → **0 rows**
- [ ] Demo booking submits; the row appears in the control plane
- [ ] Provisioning with an **unverified** account → refused with `email_unverified`
- [ ] Provisioning twice from one account → refused
- [ ] Reserved slug (`admin`, `www`) → refused
- [ ] Lighthouse ≥ 95 on `/`, `/pricing`, `/features`
- [ ] Keyboard-only pass: skip link works, mobile menu traps and releases focus
- [ ] Contrast check with a real tool (not verified in this phase)
- [ ] ARK smoke test: attendance, fees, payroll, parent document access

---

## 16. What Phase 3 does NOT do

- **No `login.smartark.ai` subdomain.** Login stays at `/login` on the main app. A separate auth subdomain means separate cookie scope and a cross-origin session handoff — real work, and it belongs with the organization-switcher UI rather than being half-done here.
- **No demo ERP data.** `is_demo` and the read-only enforcement are built and tested; **seeding a demo organization with realistic data is an operator task** and there is no seeded demo tenant yet. `/demo` currently books a call rather than opening a sandbox.
- **No welcome tour.** The signup completion screen lists the first three things to do; an in-product guided tour is Phase 10 (Customer Success).
- **No CAPTCHA or rate limiting** on public forms — see §11.
- **No blog content.** The engine works; there are zero posts. Empty pages say so rather than showing filler.
- **No Lighthouse or contrast verification** — both need the deployed site.
