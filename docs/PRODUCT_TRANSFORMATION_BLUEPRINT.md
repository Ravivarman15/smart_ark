# Smart ARK — Product Transformation Blueprint
## From single-tenant ERP to global education SaaS platform

**Document type:** Founder / CTO strategic blueprint (pre-implementation)
**Date:** 5 August 2026
**Status:** DRAFT — requires approval before Phase 0
**Companion document:** `docs/MULTI_TENANT_ARCHITECTURE_REVIEW.md` (deep technical review — 30 sections)

> **Relationship between the two documents.** The companion document is the *engineering* review: 167 tables, 362 policies, the isolation model, the migration mechanics. This document is the *company* blueprint: what we sell, to whom, at what price, on what infrastructure, in what order. Where a topic is already settled in the companion document, this one **references it rather than restating it** — duplicating an architecture decision across two documents is how they drift apart.

---

## 0. Correcting the inventory before we price against it

The brief lists the module inventory. Before any of it becomes a pricing page or a sales deck, I measured every feature module in the repository. Most of the inventory is real and substantial. **Four items are not, and two of those are load-bearing in the proposed revenue model.**

### Measured module maturity (`src/features/*`)

| Module | LOC | Files | Reality |
|---|---:|---:|---|
| exams | 23,203 | 102 | Deep — manual + MCQ engines, mark entry, result sheets, report cards |
| students | 15,307 | 89 | Deep — 360, import engine, lifecycle |
| attendance | 12,350 | 115 | Deep — governance, locks, automation |
| rbac | 10,810 | 79 | Deep — roles, actions, overrides, diagnostics |
| payroll | 9,862 | 57 | Deep — rates, shifts, approvals, payslips |
| leads | 8,998 | 79 | Deep — CRM, SLA, automation, bulk import |
| communication | 8,761 | 78 | Deep — campaigns, templates, queue |
| allocation | 8,522 | 51 | Deep — coordinator↔staff, timetable |
| finance | 8,472 | 67 | Deep — ledger, budgets, attachments |
| parent-portal | 7,423 | 37 | Solid |
| fee | 6,954 | 43 | Solid |
| reports | 6,142 | 61 | Solid |
| staff / help / setup / tasks | 3.9k–5.0k | 42–46 | Solid |
| auth-accounts | 3,741 | 15 | Solid |
| **fees** (duplicate of `fee`) | 2,978 | 35 | **Debt** |
| live-classes | 2,937 | 21 | Moderate |
| settings / dashboard | 2.2k–2.8k | 36–39 | Moderate |
| estudy | 1,633 | 6 | **Thin** |
| enquiries | 1,535 | 25 | Moderate |
| **liveclass** (dead duplicate) | 129 | 1 | **Debt** |
| **certificates** | **94** | **1** | **Stub, not a module** |

### The four corrections

| Brief claims | Repository says | Commercial consequence |
|---|---|---|
| **"Website CMS"** | **Does not exist.** Zero files matching CMS/page/landing-builder patterns. | Remove from the feature list until built. A school evaluating us *will* click it. |
| **"AI Insights", "AI Credits" as a metered SKU** | **There is no AI in the product.** No OpenAI/Anthropic/Gemini/any LLM SDK in `package.json`, no provider key in `.env.example`, no inference call anywhere. `examInsights.service.ts` and `facultyInsights.service.ts` are deterministic analytics. The "AI question paper import" is a **local deterministic parser** — no model, no OCR. | **You cannot meter and bill AI credits for a capability that does not exist.** Either build real AI (§5.4) or remove the SKU. Selling it as-is is a refund event and a reputational one. |
| **"Certificates"** module | **94 lines, one file.** | Feature-flag it OFF for all plans until built. Do not list it on the pricing page. |
| **"5 mobile apps"** | **One Capacitor Android wrapper**, `appId: 'com.example.app'` — a placeholder bundle ID that cannot be submitted to any store. No iOS project. | Mobile is a Phase-10 build, not a repackage. Budget accordingly. |

**Why I am opening with this.** A CTO's first duty to a founder is an accurate inventory. Everything downstream — pricing, the website, the sales deck, the roadmap, the infrastructure bill — compounds off this list. Correcting it now costs a paragraph. Correcting it after the pricing page is live costs customers.

**The good news dominates:** ~145,000 lines across 20+ genuinely deep modules, in daily production use at a real institution. That is a *product*, and it is the part that cannot be bought or rushed. What's missing is platform plumbing, which is well-understood, tractable work.

---

## 1. Current Architecture Assessment

Measured, not estimated (full method in the companion document §0):

| | |
|---|---|
| Source | 1,401 TS/TSX files, ~198,800 LOC, 26 feature modules |
| Services / hooks / tests | 207 / 202 / 71 |
| Database | 167 tables, 87 migrations, 362 RLS policies, ~330 indexes |
| Backend | 14 Deno edge functions (13 use the service role), 10 storage buckets |
| Client DB call sites | 1,243 `.from()` across 201 files, no DAL |
| **Tenant column** | **0 occurrences of `organization_id` anywhere** |

**Shape:** a browser-to-PostgREST SPA with no server tier. There is no middleware where authorization could live. **RLS is not a layer of defence — it is the only one.** Every decision in both documents follows from that single fact.

**What is genuinely strong and must be preserved:**
1. **Multi-principal identity.** Staff (`profiles`), parents (`parent_auth_accounts`), students (`student_auth_accounts`) are cleanly separated, and `AuthContext` makes staff portals *structurally incapable* of rendering for a parent. This is the correct pattern and it generalises directly to tenancy.
2. **`sharedRoutes.tsx`.** One declaration per shared route, carrying its RBAC submodule and role layouts. This is the single hook point that makes feature flags and white-label cheap.
3. **The RBAC catalog** (19 module IDs in TypeScript) — already the exact vocabulary the feature-flag system needs.
4. **A culture of build gates.** The RBAC registry gate and coordinator-route gate already exist and work. This is the discipline that will hold tenant isolation together at 167 tables.

**What is structurally absent:** tenancy, billing, platform administration, observability, a public website, an API, and a real mobile story.

---

## 2. SaaS Readiness Score

| Dimension | Score | Basis |
|---|---:|---|
| Product depth / feature completeness | **9/10** | 145k LOC of deep, production-proven modules |
| Domain fit for education | **9/10** | Built by operators, encodes how institutions actually run |
| Multi-tenancy | **0/10** | Zero tenant column, zero tenant policies |
| Security posture for SaaS | **3/10** | 102 `USING (true)` policies; open storage; service-role edge functions |
| Billing & monetisation | **0/10** | No concept exists |
| Self-service onboarding | **0/10** | Provisioning is manual/developer-led |
| Platform administration | **0/10** | No concept exists |
| Public web presence | **0/10** | No marketing site, no SEO surface |
| Observability | **1/10** | No metrics, error tracking, or health checks |
| API / extensibility | **0/10** | No public API |
| Mobile | **1/10** | One placeholder-ID Android wrapper |
| Compliance readiness | **2/10** | Audit tables exist; no framework, DPA, or policy set |
| Documentation | **6/10** | 15 strong internal docs; nothing customer-facing |
| **Composite SaaS readiness** | **2.6 / 10** | |

**Interpretation.** This is the *favourable* asymmetry. Companies usually fail the other way — platform plumbing with no product, chasing a domain they don't understand. Smart ARK has a proven product and needs plumbing. Plumbing is schedulable; product-market fit is not.

---

## 3. Multi-Tenant Readiness

Settled in the companion document (§3, §4, §5). Summary of the decision:

- **Model: shared schema + `organization_id` + RLS.** Schema-per-tenant (1.67M relations at 10k orgs) and project-per-tenant (10k migration targets, violates 2-minute onboarding) are both rejected with reasoning.
- **Tenant resolution: a JWT `app_metadata` claim**, read by a table-free `STABLE` function. Never a table lookup — that turns one comparison into a per-policy subquery across 167 tables.
- **The pivot that makes this affordable:** `organization_id ... NOT NULL DEFAULT public.current_org_id()`. Postgres stamps the tenant on every INSERT; RLS filters every SELECT. **All 1,243 call sites, 207 services and 26 feature modules stay unmodified.**
- **Enforcement is a CI gate reading `pg_catalog`,** not review discipline. 167 tables and 362 policies exceed what human review can reliably cover.

**Readiness: 22%** — with the important qualifier that the application layer is far readier than the data layer, which is the cheap failure mode.

---

## 4. Business Architecture

### 4.1 What business are we actually in

Not "school software." **We sell operational certainty to institutions that currently run on spreadsheets, WhatsApp groups, and paper registers.** The buyer's pain is not "I lack an ERP" — it is "I don't know my fee collection number, I lose enquiries between the call and the admission, and I calculate salaries by hand."

That framing matters because it sets the competitive frame: we are not displacing a competitor's ERP, we are displacing *chaos*. Chaos has no salesperson, but it also has no switching cost.

### 4.2 Ideal customer profile

**Primary ICP — private coaching institutes and tuition centres, India, 200–3,000 students, 1–5 branches.**

This is not a guess. It is ARK Learning Arena's own profile, which means every workflow in the product was designed against a real instance of this ICP. That is the strongest possible starting position and the reason to resist the temptation to sell up-market immediately.

| Segment | Fit | When |
|---|---|---|
| Coaching / tuition institutes (200–3,000 students) | **Primary** | Launch |
| K-12 private schools (500–3,000) | Strong — needs transport, hostel, library | Year 1 H2 |
| Multi-branch chains (5–50 branches) | Strong — branch isolation is our differentiator | Year 2 |
| Colleges / universities | Weak today — needs credits, semesters, SSO, accreditation reporting | Year 2–3 |
| Corporate training centres | Adjacent — attendance/exams/certificates transfer well | Opportunistic |

### 4.3 Revenue model

**Per-student, per-month, billed annually, tiered by feature depth.** Rationale: per-student aligns price to the customer's own revenue driver (they charge per student), scales naturally, and is how this market already thinks. Per-seat pricing punishes exactly the multi-role usage that makes the product sticky.

| Line | Type | Notes |
|---|---|---|
| Subscription | Recurring | 85–90% of revenue. The business. |
| WhatsApp / SMS / Email overage | Metered pass-through | **Low margin — this is COGS resale, not profit.** Price at cost + 20–30% and be transparent about it. |
| Storage overage | Metered | Small |
| Onboarding / data migration | One-time services | 10–15% of Year-1 revenue; **deliberately capped** — services revenue that grows faster than subscription revenue means the product isn't self-serve |
| Marketplace revenue share | Recurring | Year 3+. Zero until an ecosystem exists. |
| **AI features** | **Add-on** | **Zero until §5.4 is built.** Do not price it before it exists. |

### 4.4 Unit economics (targets, India market)

| Metric | Target | Note |
|---|---|---|
| ARPA | ₹3,000–₹12,000/mo | ~1,000-student institute at Growth tier |
| Gross margin | **≥ 78%** | After Supabase/Vercel + WhatsApp/email COGS |
| CAC | ≤ ₹25,000 | Blended, inbound-weighted |
| CAC payback | ≤ 8 months | |
| Gross logo churn | ≤ 12%/yr | Education has strong seasonality — churn concentrates at academic year end |
| Net revenue retention | ≥ 105% | Via student growth + tier upgrades |
| LTV:CAC | ≥ 4:1 | |

**The seasonality fact that shapes everything:** Indian institutions buy in **March–June**, before the academic year. A launch that misses that window waits a full year for the next one. This single constraint drives the roadmap dates in §26 harder than any engineering estimate.

### 4.5 Competitive position

| Competitor | Their strength | Our wedge |
|---|---|---|
| Teachmint | Distribution, freemium, brand | We are an *operations* ERP (payroll, finance, governance); they are teaching-first |
| Classplus | Content + app monetisation | We run the back office; they run the storefront |
| Entab / Fedena / legacy | Installed base, school relationships | Modern UX, real automation, self-serve, no implementation project |
| Zoho / Salesforce EDU | Platform breadth | Depth in Indian coaching-institute workflows they will never build |
| Spreadsheets + WhatsApp | Free, zero switching cost | **The actual incumbent.** Beat it on time saved, not features. |

**Defensible differentiator:** granular RBAC (10,810 LOC — genuinely rare in this segment), attendance governance with locks and audit, real payroll, and WhatsApp automation that is already wired to a live provider. Most competitors have one of these; few have all four.

---

## 5. Product Architecture

### 5.1 Two products, one codebase

```
                        ┌───────────────────────────────────────┐
  smartark.ai           │  PRODUCT 0 — Public Website           │  Next.js (separate app)
  (marketing, SEO)      │  marketing · pricing · docs · blog     │  SSG/ISR
                        └────────────────┬──────────────────────┘
                                         │ Start free trial
                        ┌────────────────▼──────────────────────┐
  login.smartark.ai     │  Identity & org selector              │  shared auth
                        └────────────────┬──────────────────────┘
                 ┌───────────────────────┴──────────────────────┐
                 ▼                                              ▼
  ┌──────────────────────────────┐          ┌──────────────────────────────────┐
  │ PRODUCT 1 — Platform Console │          │ PRODUCT 2 — Organization ERP     │
  │ platform.smartark.ai         │          │ {org}.smartark.ai                │
  │ orgs · billing · usage       │          │ the existing 26 modules,         │
  │ flags · support · health     │          │ now org-scoped + branded         │
  │ NEW — ~15k LOC               │          │ EXISTING — ~199k LOC, unchanged  │
  └──────────────────────────────┘          └──────────────────────────────────┘
                 └──────────────┬───────────────────────────────┘
                                ▼
                   Supabase — one Postgres, RLS-isolated
```

**One codebase, three route trees, one database.** The platform console shares the design system and nothing else — it is a separate route tree with its own protected route, because the blast radius of a mistake there is every customer.

**The website is a separate application** (Next.js), not a route in the SPA. A marketing site needs SSG/ISR, server-rendered SEO, and a content pipeline; a 1,400-file authenticated SPA needs none of that and would be catastrophic for Core Web Vitals. Different jobs, different tools.

### 5.2 Product surface map

| Surface | Audience | Auth | Status |
|---|---|---|---|
| `smartark.ai` | Prospects | Public | **NEW** — Phase 3 |
| `login.smartark.ai` | All users | Public → authed | **NEW** — Phase 4 |
| `{org}.smartark.ai` | Staff, parents, students | Tenant JWT | **EXISTS** — needs scoping |
| `platform.smartark.ai` | Us | Platform JWT + MFA | **NEW** — Phase 2 |
| `docs.smartark.ai` | Customers, developers | Public | **NEW** — Phase 3 |
| `status.smartark.ai` | Everyone | Public | **NEW** — Phase 3 |
| `api.smartark.ai` | Integrators | API key / OAuth | **NEW** — Phase 9 |

### 5.3 Packaging — what goes in which tier

Five tiers as briefed. The architecture point is that **tier composition is data (`plan_features` rows), never code branches.** Sales must be able to invent a custom plan without a deploy.

Modules gated OFF at launch regardless of tier, because they are not built: `certificates` (94 LOC), `cms` (absent), `ai` (absent). Honest gating is cheaper than a support queue.

### 5.4 AI — the honest plan

There is no AI in the product today. The brief wants AI credits as a billable meter. Both can be true, in this order:

**Do not** bolt a chatbot onto the sidebar. Every education SaaS is shipping that and none of it retains.

**Do** build three AI features where the data we already hold creates genuine, defensible value:

| Feature | Why we can do it and others can't | Phase |
|---|---|---|
| **At-risk student prediction** | We hold attendance + marks + fee history + behaviour on one timeline. This is a real model on real longitudinal data. `student_risk` and `spi` columns already exist as heuristics — replace the heuristic with a model. | Y1 H2 |
| **Natural-language reporting** ("show me Class 10 fee defaulters with attendance below 70%") | Text→SQL over a schema we control, executed **under the user's RLS context** so the model cannot leak across tenants. | Y2 |
| **True AI question-paper generation** | The deterministic parser already normalises papers into `mcq_*`. Generation is the natural next layer on a corpus we already have. | Y2 |

**Architectural requirements before any of it:** per-org AI credit ledger, per-org opt-in for data use, model calls server-side only (never a key in the browser), full prompt/response audit, and a hard rule that **generated SQL executes under the caller's RLS context, never the service role.** That last rule is the difference between a feature and a breach.

---

## 6. Technical Architecture

Settled in the companion document (§4–§15). The additions this brief introduces:

### 6.1 Website stack

| Choice | Decision | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router), separate repo/app** | SSG/ISR + server-rendered SEO; the SPA cannot do this |
| Hosting | Vercel | Already the deploy target; edge CDN included |
| CMS | **Sanity or Payload** for blog/case studies | Marketing must ship content without engineering. This — not a CMS inside the ERP — is what "Website CMS" should mean. |
| Animation | Framer Motion, restrained | The brief cites Linear/Framer. Their quality comes from **typography, spacing and restraint**, not animation volume. Animation must never block LCP. |
| Analytics | Plausible or PostHog | GDPR/DPDP-friendly, no cookie banner needed |
| Perf budget | LCP < 1.5s, CLS < 0.1, Lighthouse ≥ 95 | Enforced in CI. A slow site selling operational efficiency is an argument against itself. |

### 6.2 Domain and routing

- `{org}.smartark.ai` — wildcard subdomain (requires a Vercel wildcard domain config, not just the current catch-all rewrite in `vercel.json`)
- `{custom-domain}` — enterprise, via `organization_domains` + automated cert issuance
- **The subdomain is a routing hint; the JWT claim is authoritative.** Mismatch ⇒ sign out and re-authenticate. Never silently trust either.

### 6.3 Async work

Three cron edge functions (`kpi-engine`, `sla-checker`, `comms-scheduler`) become "for each active org." At 10,000 orgs a single invocation blows the timeout. **Write them batch-shaped in Phase 1** — a `job_queue` table with claim/lease semantics and idempotent workers — rather than discovering it in Phase 11.

### 6.4 Environments

`local → preview (per PR) → staging (production clone, anonymised) → production`. Today there is effectively one environment. Migrating 167 tables without a rehearsal environment is not acceptable risk.

---

## 7. Security Architecture

Full findings in the companion document §27 (12 findings, S1–S12). The four criticals:

| | Finding |
|---|---|
| **S1** | 102 policies are `USING (true)` — `students`, `profiles`, `student_fees`, `system_settings` readable by any authenticated user |
| **S2** | `handle_new_user()` defaults new auth users to role `teacher`; `is_staff()` = "holds a profiles row". **Combined with S1, anyone who can call `signUp()` gains read access to the entire database.** |
| **S3** | All 10 storage buckets scope by `bucket_id` only — payslips and student documents included |
| **S4** | 13 of 14 edge functions use the service role (bypassing RLS) with body-supplied object IDs — textbook BOLA |

> **S2 requires action this week, independent of this programme.** If anon signup is enabled on project `vxyshcucwdbpxrhddaeh`, it is live today. This is the one item in either document with a deadline measured in days.

### Defence model

**Layer 1 — structural.** Composite foreign keys (`FOREIGN KEY (organization_id, student_id) REFERENCES students (organization_id, id)`) make cross-tenant reference *impossible*, not merely *disallowed*. Applied to the ~25 core relationships.

**Layer 2 — RLS.** Every policy carries `organization_id = current_org_id()`; `FORCE ROW LEVEL SECURITY` on all 167 tables so even the owner cannot bypass.

**Layer 3 — claims.** Org in `app_metadata` (server-controlled), never `user_metadata` (user-writable — a tenant could forge its own org).

**Layer 4 — CI gate.** Enumerates from `pg_catalog` and fails the build on any table without a tenant column, any policy without a tenant conjunct, any unique constraint or index missing the tenant column.

**Layer 5 — probe suite.** A synthetic tenant #2 with seeded data; for every table, authenticate as org B and assert zero org-A rows. Permanent CI job.

### Platform access — a deliberate disagreement with the brief

The brief implies super-admin sees everything. **I am designing no global RLS bypass for platform staff.** A global bypass makes one compromised support account equal to a total platform breach and makes all 362 policies harder to reason about.

Instead: the platform console reads only `platform_*`/`billing_*` tables and **aggregate rollup views** — never raw student rows. Touching a tenant's actual data requires an explicit, time-boxed, customer-visible, audited **impersonation grant**. Mandatory MFA on every platform user.

This is how Stripe and Salesforce handle support access. It is the single decision most likely to be questioned and the one I would least like to reverse in year two.

### Compliance roadmap

| | When | Why |
|---|---|---|
| India DPDP Act 2023 compliance | Before launch | Legally required; we hold minors' data |
| DPA + sub-processor list + privacy policy | Before launch | Every enterprise deal asks |
| Third-party penetration test | Before GA | Non-negotiable given we hold children's PII |
| Cyber insurance | Before GA | |
| ISO 27001 | Year 2 | Unlocks larger schools |
| SOC 2 Type II | Year 2–3 | Unlocks international |

**We hold data about children.** That raises the floor on every security decision above what a normal B2B SaaS would accept, and it should be said explicitly in every design review.

---

## 8. Organization Lifecycle

```
VISITOR → TRIAL → ONBOARDING → ACTIVE → (GROWING | AT-RISK) → RENEWED
                                   ↓                               ↓
                              PAST DUE → GRACE (7d) → READ-ONLY → SUSPENDED
                                   ↓                                  ↓
                              RECOVERED                    EXPORT (90d) → DELETED
```

| State | System behaviour |
|---|---|
| `trialing` | Full features, 14 days, capped at 50 students; day 7/11/13/14 nudges |
| `active` | Normal |
| `past_due` | Full access, in-app banner, dunning emails on d1/d3/d5/d7 |
| `grace` | Read-only writes blocked except fee collection (never block a customer's cash flow) |
| `suspended` | Login permitted; only export and billing accessible |
| `cancelled` | 90-day retention, export available, then hard delete with certificate |

**Three principles I will not compromise on:**
1. **Never delete data for non-payment.** Retention is a trust product and the cheapest reactivation channel we have.
2. **Always allow export.** A customer who can leave easily is a customer who trusts us enough to stay.
3. **Downgrade never destroys.** Over-limit records go read-only, never deleted.

---

## 9. Customer Journey

| Stage | Touchpoint | Success signal | Owner |
|---|---|---|---|
| Awareness | SEO, comparison pages, YouTube demos, referrals | Site visit | Marketing |
| Consideration | Pricing page, interactive demo, case studies | Trial start | Product |
| **Trial** | Wizard → provisioned ERP in < 2 min | **First student imported** | Product |
| **Activation** | Guided setup checklist | **10 students + 1 staff + 1 attendance mark within 72h** | CS |
| Purchase | Plan selection, payment | First payment | Sales |
| Onboarding | Data migration, training | 80% of staff logged in within 14d | CS |
| Adoption | Feature discovery, health score | 3+ modules in weekly use | CS |
| Expansion | Student growth, tier upgrade | NRR > 105% | CS |
| Renewal | Annual, Feb–May | Renewed | CS |

**The activation metric is the whole business.** "First student imported within 72 hours" is the leading indicator of retention in every ERP category. It is the number the entire onboarding flow should be optimised against — and it is why the bulk import engine (already built, family-aware dedup, rollback) is our most strategically valuable existing asset. It should be step 2 of onboarding, not buried in a menu.

---

## 10. Public Website Information Architecture

```
/                          Home
/features                  overview → /features/{module}   ← SEO surface, one page per module
/solutions/{coaching|k12|multi-branch|college}             ← ICP landing pages
/pricing                   plans + per-student calculator + FAQ
/demo                      interactive sandbox + book-a-demo
/customers                 case studies (start with ARK's own numbers)
/marketplace               "coming soon" until real  ⚠
/developers  /docs  /api   ← Phase 9
/security                  posture, sub-processors, DPA  ← enterprise deals need this
/status                    public uptime
/blog  /resources  /help   content engine
/about  /careers  /contact
/login → login.smartark.ai
/signup → trial wizard
```

**SEO is the primary acquisition channel for this ICP** — institute owners search "school management software India", "fee management software for coaching classes". That argues for: one indexable page per module (~20 pages), one per ICP solution (~4), comparison pages ("Smart ARK vs Teachmint"), and a genuine content engine. This is why the website must be SSG, not an SPA route.

**Do not ship a `/marketplace` page describing an empty marketplace.** Either omit it or label it a roadmap item. A prospect who clicks through to nothing has learned we oversell.

---

## 11. Landing Page UX

**Above the fold — one job: state who it's for and what changes.**

```
┌────────────────────────────────────────────────────────────┐
│  Smart ARK          Features  Solutions  Pricing  Docs     │
│                              [Sign in]  [Start free trial] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   Run your entire institute on one platform.               │
│   Admissions to attendance to fees to payroll —            │
│   without the spreadsheets.                                │
│                                                            │
│   [Start free trial — no card]     [Book a 20-min demo]    │
│   14-day trial · setup in 2 minutes · export anytime       │
│                                                            │
│   ┌──────────────────────────────────────────────────┐    │
│   │   Live, interactive product preview               │    │
│   │   (real UI with seeded demo data — not a video)   │    │
│   └──────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

Then, in order: social proof → the four problem/solution pairs (enquiries lost, fees in spreadsheets, salaries by hand, management flying blind) → module grid → outcome metrics from ARK's real usage → security & data-residency strip → pricing preview → FAQ → final CTA.

**Craft notes, because the brief cites Linear and Framer:** their quality is typography, spacing, restraint and speed — not animation volume. Two typefaces maximum. Motion only to explain state change, never decoration. `prefers-reduced-motion` honoured. Every claim on the page must be a number we can defend. **Mobile-first: a majority of Indian institute owners will first see this page on a phone.**

---

## 12. Registration Flow

```
Start free trial
  → Email + password (or Google)          [30s]
  → Verify email (6-digit code, not a link — better mobile completion)
  → Organization: name, type, size, city, subdomain (live availability check)
  → Admin: name, mobile (WhatsApp OTP — this is India, mobile is the identity)
  → Choose plan (trial pre-selected, no card)
  → Branding: logo + colour  [SKIPPABLE — never block activation on aesthetics]
  → Provisioning (animated progress, ~40s)
  → Land in the ERP on a guided setup checklist
```

**Target: under 2 minutes, ≤ 6 fields before provisioning starts.** Every additional field costs measurable conversion. Branding, plan detail and billing all come *after* the customer has seen value.

**Security requirements at this door** (this is the exact flow that makes S2 exploitable): email verification before provisioning, disposable-domain blocking, rate limiting per IP and per email, CAPTCHA on abuse signal, and **`handle_new_user()` fixed so a signup creates no `profiles` row** — the wizard creates the org, membership and profile transactionally, server-side.

---

## 13. Login Flow

```
login.smartark.ai
  → email
  → [password | Google | SSO if org has it]
  → resolve organization_members for this user
       0 orgs  → "no organization — create one?"
       1 org   → straight in
       n orgs  → ORGANIZATION SELECTOR (Slack/Notion pattern)
  → token issued WITH organization_id claim
  → redirect to {org}.smartark.ai
```

- Org switching **re-issues the token server-side**. A client-side claim change is a tenancy bypass by definition.
- Parents and students land in their own portals from the same door — the existing three-principal model already supports this cleanly.
- `platform_users` require MFA before a platform claim is issued.
- **Every switch must clear the TanStack Query cache.** Per the companion document §14, a missed org-namespaced cache key is a cross-tenant leak *that RLS cannot catch*, because the data never leaves the browser.

---

## 14. Organization Provisioning Flow

A single transactional edge function, `platform-provision-org`:

```
BEGIN
  organizations                    ← slug, name, timezone, currency, locale
  subscriptions                    ← trial plan, 14-day expiry
  organization_features            ← plan defaults (certificates/cms/ai = OFF)
  organization_branding            ← defaults or supplied
  auth.users + profiles + organization_members   ← the admin, atomically
  rbac_roles × 4                   ← per-org copies of the system roles
  rbac_role_permissions            ← seeded from plan features
  academic_years                   ← current year, from locale
  campuses                         ← "Main Branch"
  standards / course_types / subjects   ← country-appropriate template
  comms_templates                  ← 12 defaults in the org's language
  comms_automation_settings        ← all OFF (never message a customer's parents by default)
  system_settings                  ← defaults
COMMIT
→ welcome email + WhatsApp
→ activation checklist created
```

**Non-negotiables:** fully transactional (a half-provisioned org is worse than a failed signup); idempotent by request key; < 30s; **every automation defaults OFF** — auto-messaging a new customer's parents on day one is the fastest way to lose them; and a `provisioning_failures` table with alerting, because this is the flow where a silent failure costs a paying customer.

**Templates by institution type** (coaching / K-12 / college) so a new org opens with a sensible academic structure rather than an empty shell. This is the difference between a 2-minute setup and a 2-hour one.

---

## 15. Billing Architecture

Full schema in the companion document §18. Key decisions:

| Decision | Rationale |
|---|---|
| **Razorpay primary, Stripe secondary** | India-first: UPI, NACH mandates, GST invoicing. Stripe for international from day one of that expansion. |
| Abstract behind a `PaymentGateway` interface **from day one** | Dual-gateway retrofits are brutal |
| Webhooks are the source of truth | Never client callbacks; idempotent on `gateway_event_id` |
| **Per-org gapless invoice numbering** (`{prefix}/{FY}/{seq}`) | Indian GST requirement — a sequence, not a count |
| GST: CGST/SGST vs IGST by state, SAC code, reverse charge on exports | Get this wrong and it is a legal problem, not a bug |
| `numeric(14,2)` + explicit currency | Never floats for money |
| Dunning: past_due → 7d grace → read-only → suspended → 90d retention | See §8 |

**COGS to model from day one** — WhatsApp conversation fees (~₹0.65–0.90 each), email, storage, compute. At high message volume these compress gross margin materially. Meter per org from Phase 5, not Phase 11, or the first big customer will be unprofitable and invisible.

---

## 16. Subscription Architecture

Tier structure in the companion document §19. The architectural rules:

1. **Limits enforced at the database** via `BEFORE INSERT` triggers calling `check_plan_limit()`. A UI-only limit is a suggestion.
2. **Plans are data, not code.** A custom enterprise plan is a row.
3. **Downgrade never destroys** — over-limit records go read-only.
4. **Trial expiry → read-only + export**, never a wall.
5. **Proration on mid-cycle change**, credit-note on downgrade.
6. **Per-student counting must be unambiguous.** Define it once — active enrolled students on the billing date, not admissions ever created — and use the same definition in the product, the invoice and the pricing page. Billing disputes in this category are almost always definitional.

---

## 17. White Label Architecture

Full schema in the companion document §20. What this brief adds:

**Four tiers of white-labelling, sold up the plan ladder:**

| Level | What | Plan |
|---|---|---|
| 1 | Logo + brand name | Starter |
| 2 | + colour theme, login screen, favicon | Growth |
| 3 | + email/certificate/report templates, custom sender domain | Professional |
| 4 | + custom domain, "powered by" removed | Enterprise |

**Three engineering realities the brief should price in:**
- **`index.html` hardcodes ARK** (title, favicon) and the theme localStorage key is `ark-theme` — two orgs on one browser will fight over it. 64 source files reference ARK; the geofencing code has **two ARK campuses at literal GPS coordinates**.
- **Every colour must be validated server-side and every HTML template sanitised with an allowlist.** Unvalidated branding input is the most likely XSS hole in the entire product, and "it's only their own tenant" is wrong the moment a parent views the page.
- **Custom domains need automated certificate provisioning**, which is consistently underestimated. Enterprise tier only, and budget real time for it.

---

## 18. Marketplace Architecture

**Strategic position: design the seams now, build the marketplace in Year 3.**

A marketplace with no third-party developers is a menu of our own features with extra steps. The prerequisites are a stable public API (Phase 9), 500+ paying customers (the audience that makes building worthwhile), and developer relations capacity we will not have before Year 3.

**What to do in the meantime — and this is the valuable part:** every extension point the marketplace will eventually need is a *good architecture decision today*.

| Seam | Build now | Marketplace use later |
|---|---|---|
| `organization_features` | Phase 6 | Installed apps are feature grants |
| Webhooks out | Phase 9 | Integration triggers |
| Report definitions as data | Phase 6 | Sellable report packs |
| Theme tokens as data | Phase 7 | Sellable themes |
| Question banks as data | Exists (`mcq_*`) | **The highest-value marketplace asset we already own** |
| Payment gateway interface | Phase 5 | Regional gateway plugins |

**First-party "marketplace" at launch:** curated integrations we build (Tally, Razorpay, Google Workspace, Zoom, BigBlueButton). Same shelf, no ecosystem required.

---

## 19. API Platform Architecture

```
api.smartark.ai/v1
  auth      API key (server-to-server) | OAuth 2.0 (third-party apps)
  scoping   every key bound to ONE organization_id — non-negotiable
  limits    per-plan rate limits, 429 + Retry-After
  format    REST + JSON, cursor pagination, RFC-7807 errors
  events    webhooks out, HMAC-signed, exponential backoff, replayable
  docs      OpenAPI 3.1 → auto-generated reference + SDKs (TS, Python, PHP)
```

**Do not expose PostgREST directly as the public API.** It leaks the schema, couples the public contract to internal table design, and makes every future refactor a breaking change. Build a thin gateway (Deno/Hono on edge functions) that enforces the key→org binding, rate limits, quotas and versioning.

**Versioning commitment:** `/v1` supported 24 months minimum after `/v2` ships. Published deprecation policy. This is the promise that makes integrators build on us.

---

## 20. Feature Flag Architecture

Full design in the companion document §21. The three-layer resolution:

```
plan_features  →  organization_features (sales overrides, betas, incident kill-switches)
                          ↓ intersected with
                  rbac permissions (what this user may do)
```

Two rules that matter most:
- **`feature_key` == RBAC `ModuleId`.** One vocabulary. 19 keys already exist and already drive the sidebar — inventing a second vocabulary guarantees drift.
- **Enforce in the database too**, not only the UI. A disabled module must return zero rows from PostgREST, or it is a UI convention the API doesn't know about.

The **incident kill-switch** (`reason = 'incident'`) — disabling a misbehaving module for one tenant without a deploy — will pay for itself the first time it's used.

---

## 21. Monitoring Architecture

Currently absent: no metrics, no error tracking, no health checks, no slow-query visibility. Full table in the companion document §22.

**The one rule:** every log line, metric, span and error event carries `organization_id`. Retrofitting that dimension means re-instrumenting everything, and "which customer is affected?" is the first question in every incident.

**Minimum viable set before the first external customer:** Sentry with org tags, uptime monitoring, `pg_stat_statements` + a nightly slow-query report, edge-function failure alerts, `message_queue` depth-and-age alerting (the existing "empty body" failure mode belongs here), and a public status page.

**Tenant health score** — logins, feature adoption, support tickets, payment status — feeds the CS view in §22 and is the earliest churn signal available.

---

## 22. Customer Success Architecture

| Component | Detail |
|---|---|
| Activation checklist | In-app, per-org progress, drives the §9 activation metric |
| Health score | 0–100 from login frequency, module adoption, data volume, tickets, payment |
| Playbooks | Score < 40 → CS outreach; unused module → in-app education; trial d10 no import → intervention |
| Knowledge base | `docs.smartark.ai` — searchable, indexed (doubles as SEO) |
| In-app help | Contextual, reusing the existing `help` module (4,569 LOC — extend, don't rebuild) |
| Video library | One 3-minute video per module; the single highest-ROI CS asset in this category |
| Support tiers | Community → email (48h) → priority (8h) → SLA + named CSM |
| QBRs | Enterprise only |

**Reuse note:** the `support_tickets` / `support_feedback` tables and the `help` module already exist. Customer-facing support is an org-scoped extension of them, not a new system.

---

## 23. Migration Strategy

Eight stages, fully specified in the companion document §23. Summary:

`0` pre-flight & verified restore → `1` additive tenant tables → `2` nullable column + batched backfill → `3` constrain (NOT NULL, DEFAULT, composite keys, `CREATE INDEX CONCURRENTLY`) → `4` token hook with fallback → `5` policy cutover → `6` storage relocation → `7` **remove fallback (point of no return)** → `8` verification + cross-tenant probe suite.

The three things most likely to be skipped and most costly to skip: **batched backfill** (a single UPDATE locks a large table into an outage), **copy-verify-soak-delete for storage** (the one non-transactional step), and **rehearsal on a production clone** before touching production.

---

## 24. Risk Analysis

Thirteen engineering risks in the companion document §24 (R1–R13). The business risks that document does not cover:

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| B1 | **Missing the Mar–Jun buying season** | **High** | **High** | Roadmap in §26 is built backwards from March 2027. Ship narrow rather than late. |
| B2 | **Building platform while ARK operations depend on the same codebase** | **High** | High | Every phase additive and revertible; ARK becomes tenant #1 and its workflows are the regression suite |
| B3 | **Single-founder-engineer key-person risk** | **High** | **Critical** | Documentation (already strong), then hire before Phase 5. This is the biggest non-technical risk in the entire plan. |
| B4 | Selling features that don't exist (§0) | Medium | High | Corrected inventory; honest feature gating |
| B5 | Scope creep across 12 phases | **High** | High | Phase gates; no phase starts before the prior gate is green |
| B6 | Price too low to fund the business | Medium | High | Model unit economics before the pricing page ships; raising price later is far harder than starting right |
| B7 | Support load scales with customers | High | Medium | Self-serve docs and in-app help *before* customer #10, not after |
| B8 | Competitor with more capital moves first | Medium | Medium | Compete on depth in a narrow ICP, not breadth |
| B9 | A breach involving children's data | Low | **Existential** | §7 in full; pen test before GA; cyber insurance |

**B3 deserves emphasis.** One person holds the entire architecture of a 199k-line system that a real institution depends on daily. That is acceptable for an internal ERP and not acceptable for a platform with paying customers. The hiring plan is part of the architecture.

---

## 25. Rollback Strategy

Per-stage reversibility table in the companion document §25. Standing rules:

- **Every migration ships with a paired rollback file.** No exceptions.
- **Policy rewrites ship with their exact prior definition** — per-table granularity means a bad policy is a one-table revert, not a platform revert.
- **No `DROP COLUMN` on tenant data until 30 days after the phase is stable.**
- Website, platform console and each Phase 3–11 feature sit behind flags and can be dark-launched and killed without a deploy.
- **Stage 7 is the only irreversible step** and requires all prior gates green plus a 7-day soak.

---

## 26. Development Roadmap

**Anchor date: the Indian buying season opens March 2027.** Everything is scheduled backwards from there. Assumes 1 senior engineer (you) through Phase 4, +1 from Phase 5, +1 designer/marketing part-time from Phase 3.

| Phase | Deliverable | Gate | Duration | Ends |
|---|---|---|---|---|
| **0** | **Security hardening** — verify anon signup, resolve S2, remove root scripts & credentials, security headers, staging environment | Audit clean | **1 wk** | Aug '26 |
| **1** | **Multi-tenant foundation** — `organization_id` on 167 tables, 362 policies, composite keys/indexes, storage relocation, token hook, edge-function tenant assertions, **CI gate + cross-tenant probe suite** | **Probe suite: 0 cross-tenant rows** | **6 wk** | Sep '26 |
| **2** | **Platform console** — org CRUD, impersonation + audit, aggregate analytics, health | Support operable without raw tenant reads | 3 wk | Oct '26 |
| **3** | **Public website** — Next.js, SEO, pricing, docs, status, content engine | Lighthouse ≥ 95 | 4 wk | Nov '26 |
| **4** | **Provisioning + login** — wizard, `login.smartark.ai`, org selector, templates | **New org usable in < 2 min, zero manual steps** | 3 wk | Nov '26 |
| **5** | **Subscriptions & billing** — Razorpay, GST invoices, dunning, metering | Idempotent webhook replay passes | 4 wk | Dec '26 |
| **6** | **Feature flags** — three-layer resolution, DB-enforced | Disabled module returns 0 rows | 2 wk | Jan '27 |
| **7** | **White label** — branding, runtime theming, sanitised templates | XSS suite on branding inputs passes | 3 wk | Jan '27 |
| — | **Design partners** — 5 friendly institutes, free, heavy feedback | 5 orgs live | 4 wk | Feb '27 |
| — | **Pen test + fixes + commercial launch checklist (§34)** | All P0/P1 closed | 3 wk | Feb '27 |
| **🚀** | **Commercial launch** | | | **Mar '27** |
| **8** | Marketplace seams (not the marketplace) | | Y2 | |
| **9** | Developer platform / public API | | Y2 | |
| **10** | Mobile ecosystem | | Y2 | |
| **11** | Global / international expansion | | Y3 | |

**~7 months to commercial launch.** Two deliberate deviations from the brief's ordering:

1. **Website (Phase 3) before billing (Phase 5).** SEO takes 3–6 months to compound. Publishing in November means organic traffic exists by the March season. Publishing in February wastes the season.
2. **Design partners before launch.** Five friendly institutes running free for a month will find more isolation bugs, onboarding friction and pricing objections than any internal test plan. This is the highest-ROI four weeks in the entire roadmap.

**The line I will hold:** Phase 1 gets its full six weeks. Compressing it is the single decision most likely to produce a data-breach headline, and a breach involving children's data is not a setback — it is the end of the company.

---

## 27. Deployment Strategy

| | |
|---|---|
| Environments | local → PR preview → staging (anonymised prod clone) → production |
| Frontend | Vercel, atomic deploys, instant rollback. `lazyWithRetry` already handles stale chunks — good foundation. |
| Migrations | Forward-only, additive, backward-compatible. **Expand → migrate → contract**, never a breaking change in one deploy. |
| Edge functions | Versioned, canary to 5% of orgs first |
| Feature rollout | Flag → internal → 5 design partners → 10% → 100% |
| Release cadence | Weekly, Tue/Wed. **Never Friday. Never during Mar–Jun for anything touching fees or admissions** — that is the customer's highest-stakes window. |
| Maintenance windows | Sunday 02:00–04:00 IST, announced 72h ahead on the status page |
| DR | PITR verified monthly (a restore that has not been tested is not a backup). RPO 5 min, RTO 4h. |

---

## 28. Testing Strategy

Today: **71 test files for 198,800 LOC.** That ratio is a real risk during a 167-table migration.

The right response is **not** a coverage-percentage target — it is targeted tests where failure is unrecoverable:

| Priority | Suite | Why |
|---|---|---|
| **1** | **Cross-tenant probe suite** — for every table, authenticate as org B, assert zero org-A rows | The one test that prevents the company-ending failure |
| **2** | **Schema gate** (`pg_catalog`-driven) — every table has a tenant column, forced RLS, tenant conjunct in every policy, tenant-leading indexes | Prevents regression as 167 tables evolve |
| 3 | Billing: proration, dunning, webhook idempotency/replay, GST calculation | Money bugs erode trust fastest |
| 4 | Provisioning: transactional rollback on partial failure | A half-provisioned org is worse than a failed signup |
| 5 | Auth: org switching, cache clearing, claim forgery attempts | Cache leaks bypass RLS entirely |
| 6 | E2E (Playwright): signup→provision→import→attendance→fee→report | The activation path |
| 7 | Load: 10k orgs / 1M students simulated | Before, not after, we sell it |
| 8 | Existing module regression | ARK's real workflows are the suite |

**Extend the existing build gates rather than inventing new machinery.** The RBAC registry gate and coordinator-route gate already prove the pattern works in this codebase.

---

## 29. Enterprise Readiness Score

| Dimension | Now | Launch (Mar '27) | Year 3 |
|---|---:|---:|---:|
| Product functionality | 9 | 9 | 10 |
| Multi-tenancy | 0 | 9 | 9 |
| Security | 3 | 8 | 9 |
| Scalability | 3 | 7 | 9 |
| Billing & subscriptions | 0 | 8 | 9 |
| Self-service onboarding | 0 | 9 | 9 |
| White label | 1 | 8 | 9 |
| Web presence & SEO | 0 | 8 | 9 |
| Observability | 1 | 7 | 9 |
| API / extensibility | 0 | 1 | 8 |
| Mobile | 1 | 2 | 8 |
| Compliance | 2 | 6 | 9 |
| Test coverage | 4 | 7 | 8 |
| Customer success | 1 | 6 | 9 |
| **Composite** | **2.6** | **7.3** | **8.9** |

**7.3 at launch is the right target** — deliberately not 9. Chasing 9 before the first paying customer means missing the March window and learning nothing from real usage. API, mobile and marketplace are correctly deferred; they serve customers we do not have yet.

---

## 30. SaaS Go-To-Market Strategy

### Positioning
> **"The operating system for your institute."**
> Not a teaching app. Not a parent app. The system that runs admissions, attendance, fees, exams, payroll and reporting — so the founder can stop running the place from a spreadsheet.

### Channels, in priority order

| Channel | Why | Investment |
|---|---|---|
| **1. SEO + content** | This ICP searches before it buys. Compounds. Cheapest CAC at scale. | High, starts Phase 3 |
| **2. Founder-led sales** | First 50 customers must be sold personally. Non-negotiable — it is where the product learns. | High, Y1 |
| **3. Referrals** | Institute owners know other institute owners. The `settings_referrals` table already exists. | Low, high yield |
| **4. YouTube demos** | This audience watches before buying | Medium |
| **5. Regional partners/resellers** | India is regional; a Chennai reference sells Chennai | Medium, Y1 H2 |
| **6. Education conferences** | Concentrated buyers | Medium, seasonal |
| **7. Paid ads** | Only after organic CAC is known | Low until Y2 |

### Pricing (India, launch — validate with design partners)

| | Starter | Growth | Professional | Enterprise |
|---|---|---|---|---|
| Students | 300 | 1,000 | 5,000 | unlimited |
| Branches | 1 | 1 | 5 | unlimited |
| Modules | core | + fees, exams, comms | + payroll, CRM, live classes | all |
| **₹/month, billed annually** | **₹2,999** | **₹6,999** | **₹14,999** | custom |
| Monthly billing | +25% | +25% | +25% | — |

Rationale: undercuts legacy per-student pricing while sitting well above free/freemium, so we attract institutes that will actually pay and support. **Annual billing default** — critical for cash flow and it matches the academic year the customer already thinks in.

### Launch sequence
Design partners (5, free) → soft launch (20 paying, referral + founder-led) → **public launch March 2027** → scale (target 100 orgs by Aug 2027, 500 by Mar 2028).

### The unfair advantage to lead with
**We run a real institute on this software every day.** That is not a marketing line — it is why the workflows are right, and no competitor whose founders have not run an institute can copy it. Every case study, demo and sales call should start there.

---

## 31. Estimated Infrastructure Requirements

Order-of-magnitude estimates for planning. Validate against actual usage from ~50 orgs.

| Orgs | Students | Supabase | Vercel | Comms (COGS) | Tools | **Total/mo** |
|---:|---:|---|---|---|---|---:|
| 10 | 5k | Pro, small compute ~$60 | $20 | ~$50 | $50 | **~$180** |
| 100 | 60k | Medium + PITR + storage ~$500 | $50 | ~$600 | $200 | **~$1,350** |
| 1,000 | 600k | Large/XL + read replica ~$3,000 | $200 | ~$6,000 | $800 | **~$10,000** |
| 10,000 | 6M | **Cell architecture**, 6–10 projects ~$25,000 | $1,000 | ~$60,000 | $3,000 | **~$89,000** |

**Three things this table makes visible:**
1. **Comms is the dominant variable cost at scale** — it overtakes database spend around 1,000 orgs. WhatsApp/SMS must be metered and billed as pass-through from Phase 5, or margin silently disappears into the largest customers.
2. **Gross margin holds at ~78–82%** across all four rows *if* comms is billed through. It collapses below 60% if it isn't.
3. **The cell transition happens around 1,000–2,000 orgs.** Design for it now (§33); execute it then.

Add: Sentry (~$30–300), status page (~$30), CDN for assets, and backup/DR storage.

---

## 32. Database Evolution Strategy

| Horizon | Move |
|---|---|
| Now | Single Postgres, shared schema, `organization_id` + RLS |
| ~1k orgs | Read replicas for reporting; move analytics off the primary |
| ~2k orgs / >50M rows | **Partition the hot tables by `organization_id` hash** — `student_attendance`, `message_queue`, `exam_results`, `mcq_answers`. Design partition-compatible PKs **now**; execute then. |
| ~5k orgs | **Cell architecture** — N Supabase projects, each holding a disjoint set of orgs, with a global routing directory mapping org → cell. **This is only possible because every row carries `organization_id`** — the cell split is a filtered export, not a re-architecture. |
| Year 3 | Cells by geography for data residency (India / EU / US) |
| Ongoing | Archive graduated academic years to cold storage per the org's retention policy |

**Migration hygiene that becomes load-bearing under cells:** consistent naming, forward-only, expand→migrate→contract, and every migration replayable from zero. The current chain mixes UUID-suffixed Lovable exports with hand-named files, and `schema_migration.sql` sits outside it entirely. Normalise this in Phase 1 while it costs a day.

---

## 33. Scaling Strategy — 10 → 100 → 1,000 → 10,000

| | **10 orgs** | **100 orgs** | **1,000 orgs** | **10,000 orgs** |
|---|---|---|---|---|
| **Focus** | Does isolation hold? | Does onboarding self-serve? | Does it stay fast? | Does it stay cheap? |
| Database | Single, default config | + read replica, tuned indexes | + partitioning, connection pooling | **Cells** (6–10 projects) |
| Cron/async | Direct iteration | Batched | **Queue-driven fan-out** (mandatory — a single invocation times out here) | Distributed workers |
| Realtime | Table-wide publication | **Org-namespaced channels** | Broadcast-from-DB, per-org topics | Dedicated realtime tier |
| Storage | Single bucket set | Per-org paths + quotas | CDN + lifecycle rules | Regional buckets |
| Support | Founder | 1 CS | CS team + tiering | Regional teams |
| Onboarding | Hand-held | Self-serve + checklist | Fully automated | Automated + partner-led |
| Observability | Sentry + uptime | + APM, slow queries | + per-org SLOs | + capacity forecasting |
| Deploys | Weekly | Weekly + canary | Progressive by cohort | Cell-by-cell |
| **Key risk** | Cross-tenant leak | Support load | Query performance | Cost per org |

**The two transitions that require real engineering, not tuning:** cron→queue (~1,000 orgs) and single-DB→cells (~5,000). Both are anticipated in the Phase-1 design so neither becomes a rewrite. Everything else on this table is configuration and headcount.

---

## 34. Commercial Launch Checklist

**Security & compliance**
- [ ] Cross-tenant probe suite green across all 167 tables
- [ ] Third-party penetration test complete, all P0/P1 closed
- [ ] Anon signup verified disabled; S1–S4 resolved
- [ ] All ~39 `SECURITY DEFINER` functions audited for tenant scoping (`get_financial_summary` is a confirmed leak)
- [ ] DPDP compliance reviewed by counsel; DPA, privacy policy, sub-processor list published
- [ ] Cyber insurance bound
- [ ] Incident response plan written and rehearsed once

**Product**
- [ ] Provisioning < 2 min, transactional, alerting on failure
- [ ] Unbuilt modules (certificates, CMS, AI) flag-gated OFF and absent from the pricing page
- [ ] Data export working for every entity
- [ ] Billing: proration, dunning, GST invoices, refunds tested end to end
- [ ] 5 design partners live and renewed

**Operations**
- [ ] Status page live; on-call rotation defined (even if it is one person)
- [ ] PITR restore tested successfully within the last 30 days
- [ ] Support SLAs published and staffable
- [ ] Knowledge base covers the top 20 questions; one video per module

**Commercial**
- [ ] Pricing validated with design partners
- [ ] T&Cs, SLA, refund policy published
- [ ] GST registration and invoicing verified with an accountant
- [ ] 3 case studies (ARK + 2 design partners) with real numbers
- [ ] Website: Lighthouse ≥ 95, ~25 pages indexed, analytics live

---

## 35. Future Vision — Three Years

**Year 1 (Mar 2027 – Mar 2028) — Prove the model.**
India, coaching institutes. Target 500 orgs, ~₹4 Cr ARR. Team of 5–7. Ship mobile apps and the public API. The goal is not scale — it is proof that a stranger can sign up, self-onboard, pay, and renew without us.

**Year 2 (2028–29) — Widen the wedge.**
K-12 schools and multi-branch chains. Transport, hostel, library, inventory modules. Real AI: at-risk prediction, natural-language reporting. Marketplace opens with first-party integrations. Partner/reseller channel. Target 2,500 orgs, ~₹25 Cr ARR. ISO 27001. Team of 20–25.

**Year 3 (2029–30) — Become the platform.**
International: UAE, SEA, Africa — markets with similar private-education economics. Data residency via cells. Third-party marketplace with revenue share. Higher-education module (semesters, credits, accreditation). SOC 2 Type II. Target 8,000–10,000 orgs, ~₹100 Cr ARR. Team of 60–80.

**The long-term moat.** Not features — features get copied. The moat is: (1) **data network effects** — cross-institution benchmarking that only the largest network can offer, built on genuine consent; (2) **workflow lock-in** — an institute that runs payroll, fees and compliance on us cannot leave mid-year; (3) **ecosystem** — every integration raises switching cost; (4) **operator credibility** — we run an institute on this, and that is not something a funded competitor can acquire.

**What would make this fail.** Not competition. The three real failure modes are: selling before isolation is proven (§7 S1–S4), building breadth before the first 50 customers are genuinely happy, and one person holding the whole architecture (§24 B3). All three are within our control.

---

## Decision Register

| # | Decision | Reversibility |
|---|---|---|
| **D1** | Shared schema + `organization_id` + RLS — not schema-per-tenant, not project-per-tenant | Very hard |
| **D2** | Tenant resolved from a JWT `app_metadata` claim via a table-free `STABLE` function | Hard |
| **D3** | `DEFAULT current_org_id()` so 1,243 call sites and 199k LOC stay unmodified | Moderate |
| **D4** | **No global RLS bypass for platform staff**; support access is time-boxed, audited impersonation | Hard |
| **D5** | Isolation enforced by a `pg_catalog`-driven CI gate, never review discipline | Easy |
| **D6** | Public website is a **separate Next.js app**, not an SPA route | Moderate |
| **D7** | Per-student pricing, annual-default, India-first, Razorpay primary | Moderate |
| **D8** | **Do not sell AI or certificates until built**; flag them OFF | Easy |
| **D9** | Marketplace deferred to Year 3; build only the seams now | Easy |
| **D10** | Launch target **March 2027**, scheduled backwards from the Indian buying season | — |
| **D11** | Website (Phase 3) ships before billing (Phase 5) so SEO compounds into the season | Easy |
| **D12** | 5 design partners run free for a month before commercial launch | Easy |
| **D13** | Existing 207 services and 26 feature modules are **not** refactored | Easy |

---

## What I need from you before Phase 0

**1. Confirm the inventory correction (§0).** Certificates, CMS, AI and mobile are not what the brief describes. If you disagree with any of the four, tell me where to look — I may have missed a directory. If you agree, the pricing page and sales deck must reflect it.

**2. The one time-sensitive item.** Is anon signup enabled on Supabase project `vxyshcucwdbpxrhddaeh`? If yes, S2 is live today and Phase 0 starts this week. I can check directly if you grant access.

**3. Approve or challenge D4** — no global platform bypass. It is the decision most likely to feel restrictive in year one and most likely to save the company in year two.

**4. Approve the March 2027 launch anchor and the ~7-month runway.** If that date must move earlier, the honest lever is **scope** (drop white-label and feature flags to post-launch), never Phase 1's six weeks.

**5. Two business inputs that change architecture, not copy:** international from launch or India-only for Year 1 (changes billing, residency and cell design), and whether cross-institution benchmarking is a product goal (changes the consent and data-governance model from day one).

**6. Acknowledge B3.** One person holds this architecture. A hiring plan before Phase 5 is part of the technical plan, not separate from it.

No code will be written until this blueprint and the companion architecture review are approved.
