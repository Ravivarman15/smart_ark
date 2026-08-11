# Tenant Branding Surface Audit — Phase 7

Phase 6 made salary slips and fee receipts tenant-aware. This phase asked the
next question: **where else does one customer's identity reach another
customer?**

The answer was eleven more places, and two of them were not branding bugs at
all — they were a live outage and a cross-tenant data write. Both are recorded
here in full, because the audit is only useful if it reports what it actually
found rather than what it set out to find.

---

## 1. Method

Every occurrence of a tenant-identifying string across `src/`, `supabase/`,
`public/`, `scripts/` and `index.html`:

```
ARK Learning Arena · ARK LEARNING ARENA · ARK ERP · ARK CRM · ARK School
arklearning.com · arktuition.com · thearktuition.com · The Ark Tuition
7358199217 · Mugappair · assets/ark-logo
```

**93 occurrences across 51 files.** Each was classified, not blanket-replaced:

| Cat | Meaning | Count | Action |
|---|---|---|---|
| **A** | Platform-owned — Smart ARK's own marketing site | 4 | keep |
| **B** | ARK tenant data, not customer-facing | 6 | documented, allowlisted with a reason |
| **C** | Test fixtures asserting ARK renders as ARK | 31 | keep |
| **D** | Comments explaining the bug being fixed | 19 | keep |
| **E** | Migrations intentionally seeding ARK's own row | 8 | keep |
| **F** | **Customer-facing hardcoded branding** | **25** | **fixed** |

Category D is worth stating plainly: a comment reading *"this used to say ARK
Learning Arena"* is the reason a fix survives its second refactor. The gate
strips comments rather than exempting files, so prose about the bug never trips
the check on the code that fixed it.

---

## 2. Surface table

| Surface | File | Hardcoded value | Tenant-facing? | Status |
|---|---|---|---|---|
| **Public enquiry form** | `leads/pages/PublicLeadFormPage.tsx` | logo, name, consent text | **YES — unauthenticated** | **FIXED** |
| **Public admission form** | `enquiries/pages/PublicAdmissionFormPage.tsx` | logo, name, consent text | YES (unrouted) | **FIXED** |
| **Lead welcome WhatsApp** | `functions/lead-intake/index.ts` | "interest in ARK Learning Arena" | **YES — to a prospect** | **FIXED** |
| **Counselor WhatsApp** | `functions/lead-intake/index.ts` | "ARK CRM" | YES — staff | **FIXED** |
| **SLA breach WhatsApp** | `functions/sla-checker/index.ts` | "ARK CRM" | YES — staff | **FIXED** |
| **Lead templates** | `leads/utils/leadWhatsappTemplates.ts` | "ARK CRM" ×2 | YES — staff | **FIXED** |
| **Email sender name** | `functions/_shared/brevo.ts` | `SENDER_NAME ?? "The Ark Tuition"` | **YES — every email** | **FIXED** |
| **Email default branding** | `functions/_shared/email-templates.ts` | `DEFAULT_BRANDING` = ARK | **YES — every email** | **FIXED** |
| **Fee receipt email** | `functions/_shared/email-templates.ts` | subject + text body | **YES — to a parent** | **FIXED** |
| **Report cards** | `exams/services/reportCard.service.ts` | header `<h1>` | YES | **FIXED** |
| **Result sheets** | `exams/services/resultSheet.service.ts` | footer | YES | **FIXED** |
| **Student 360° report** | `students/services/student360.service.ts` | brand + footer | YES | **FIXED** |
| **Parent reports** | `parent-portal/pages/ParentReportsPage.tsx` | brand + footer + indigo | **YES — to a parent** | **FIXED** |
| **Parent fee receipt** | `parent-portal/pages/ParentFeesPage.tsx` | brand + footer | **YES — to a parent** | FIXED (Phase 6) |
| **Marks WhatsApp** | `lib/aisensyApi.ts` | header + sign-off | **YES — to a parent** | **FIXED** |
| **Counselor PDF** | `leads/utils/leadExport.ts` | logo, name, "ARK CRM" | YES | **FIXED** |
| **Student list PDF** | `pages/admin/StudentControl.tsx` | logo, header, footer, filename | YES | **FIXED** |
| **Salary register** | `payroll/pages/SalaryRegisterPage.tsx` | `<h1>` | YES | **FIXED** |
| **All report exports** | `reports/utils/exportEngine.ts` | *(none — was unbranded)* | YES | **BRANDED** |
| **App chrome ×7** | sidebars, shells, teacher dashboard | `assets/ark-logo.jpeg` | **YES — every screen** | **FIXED** |
| **Staff form placeholder** | `staff/components/CreateStaffSheet.tsx` | `staff@thearktuition.com` | YES | **FIXED** |
| — | — | — | — | — |
| Marketing site | `marketing/{sections,ContentPages}.tsx` | ARK customer story | No — platform's own site | **A: keep** |
| Dead receipt renderer | `components/ReceiptGenerator.tsx` | everything | No — zero importers | **B: allowlisted** |
| Staff geofence | `contexts/AppDataContext.tsx` | ARK campus GPS | **see §4** | **B: documented** |
| Geo config | `core/constants/config.ts` | ARK campus GPS | No — feeds dead code | **B: allowlisted** |
| Daily report cron | `functions/send-daily-report/index.ts` | ARK management phone | No — platform ops | **B: allowlisted** |
| Certificates | `certificates/pages/CertificatePages.tsx` | *(none)* | — | **see §5** |

---

## 3. The two findings that were not branding bugs

### 3.1 The public enquiry form was DOWN — for both tenants

Tracing the form's branding led to its submit path, and the submit path could
not work:

```
leads.organization_id  NOT NULL  DEFAULT current_org_id()
current_org_id() = jwt_org_id() ?? fallback_org_id()
```

An anonymous visitor has no JWT. `fallback_org_id()` resolves **only while
exactly one organization exists** — a deliberate fail-closed design from Phase
1. A second organization was created on **2026-08-07**, so it began returning
NULL, and every public submission has failed the NOT NULL constraint since.

Verified against production:

```sql
select public.fallback_org_id(), (select count(*) from organizations where deleted_at is null);
-- fallback: null   orgs: 2
```

The anon RLS policy independently requires `organization_id = current_org_id()`,
which is also NULL — so the row would be rejected even if a value were supplied.
And `lead-intake`, the "preferred path", runs as service role and set no
`organization_id` either, so it hit the same NULL default.

**Both paths failed. The top of the sales funnel silently stopped accepting
enquiries for ARK and ABC Academi alike, the moment tenant #2 was created.**

Nothing surfaced it because the client already caught the error and showed
"Submissions are temporarily unavailable" — a message written for a transient
outage, displayed for a permanent one.

### 3.2 `lead-intake` wrote cross-tenant references

Its duplicate check ran unscoped under service role:

```ts
.from("leads").select("id").is("deleted_at", null).or(`phone.eq.${phone}…`)
```

Service role sees every tenant. An ABC Academi enquiry from a phone number ARK
already held would be flagged `is_duplicate` and have `duplicate_of` written
pointing at **a row in another organization** — a cross-tenant foreign key
inside ABC's own data. Now scoped with `.eq("organization_id", organizationId)`.

---

## 4. The finding deliberately NOT fixed

`AppDataContext.isNearCampus()` hardcodes ARK's two campus coordinates and is
live — `DailyControlBoard`, `CoordinatorDashboard` and `useTeacherWorkspace` all
call it for staff check-in geofencing. Every ABC Academi check-in is therefore
recorded `geoValid: false`, because the staff member is ~300 km from a Chennai
address they have never visited.

This is a genuine multi-tenancy defect and it is **not fixed here**, for a
specific reason rather than for scope:

```
hardcoded constant : 13.0059109, 80.1961798   (ARK Junior Campus)
campuses table     : 13.0827,    80.2707      (ARK "Senior Campus")
```

Those are **~9 km apart**. The `campuses` table is already org-scoped and
already has `geo_lat`/`geo_lng`, so switching to it is a small change — but it
would silently move ARK's live geofence by nine kilometres and break check-in
for every ARK staff member tomorrow morning. ABC Academi's campus row has no
coordinates at all.

Correcting this needs ARK's real campus coordinates confirmed by someone who
knows them. Making that call blind, inside a branding phase, is exactly the kind
of change that breaks production quietly. **Recorded as the highest-severity
open item.**

`features/staff/utils/geo.ts` holds a second copy reading `config.ts`; it has no
callers, and the gate asserts it stays that way.

---

## 5. Documents that could not be branded, and why

**Certificates are a stub.** `CertificatePages.tsx` is 94 lines of
`ModuleStarterPage` backed by `localStorage`. There is no certificate document,
no PDF path, no print view, and no organization identity anywhere in it. There
is nothing to brand.

Per the brief — *"if the certificate module is still only a stub, do not invent
a large certificate engine"* — no certificate engine was built. When one is
written it should render through `DocumentShell`, which now carries the
letterhead, signature block and contrast-safe theme it would need.

*(Separately: the `localStorage` key is not tenant-scoped, so two organizations
opened in one browser profile would share the list. Not a branding issue, but
worth knowing before the module goes real.)*

**ID cards do not exist as documents either.** `StudentIdCardReportPage` is a
data table exported through the shared report engine — the page description
("branch branding ready") describes an intention, not an implementation. It now
carries the organization letterhead because *every* report does, via
`exportEngine`. A physical card layout remains unbuilt.

---

## 6. Public tenant resolution

Migration `20260913_phase7b` adds two `SECURITY DEFINER` functions granted to
`anon`:

```
public_tenant_context(_host, _slug)  → public identity, or NULL
submit_public_lead(_slug, _payload)  → uuid
```

Resolution order is **host first, then slug**:

```
abcacademy.in/leads/apply       host matches a verified domain  → ABC
<platform>/leads/apply/abc      no host match, slug resolves    → ABC
<platform>/leads/apply          neither                         → NEUTRAL
```

A verified host is a stronger claim than a path segment anyone can type, so a
tenant on its own domain cannot be made to render a competitor by appending
someone else's slug.

### Why a slug is safe where an organization_id is not

The rule is *never trust an organization_id from the browser*, and this honours
it exactly. The browser supplies a **slug** — already the public subdomain — and
the **database** resolves it to an id. What must stay impossible is a caller
*choosing the id that gets written*, and `submit_public_lead` keeps it that way
by taking the slug too.

`SECURITY DEFINER` bypasses RLS, so every guard the anon policy enforced is
re-implemented explicitly inside the function: organization exists and is not
soft-deleted, not suspended, `status` forced to `'new'`, `assigned_to` forced
NULL, required fields validated, `source` clamped to a known set, text lengths
bounded.

An unknown slug returns NULL. Verified in the migration itself, which raises if
it ever does otherwise.

### ⚠ Operational change: the enquiry link has moved

The bare `/leads/apply` now resolves nothing on the shared platform host and
renders **"Institution not found"** rather than defaulting to a tenant. Each
organization's link is:

```
/leads/apply/ark            → ARK Learning Arena
/leads/apply/abc-academi    → ABC Academi
```

The bare path still works on a verified custom domain or subdomain.

This changes a published URL — but the old one has been rejecting every
submission since 2026-08-07, so there is no working link being broken.
`lead-intake` likewise now **requires** `org_slug`; any Meta Ads webhook must be
updated to send it, and returns a clear 422 rather than failing silently if not.

---

## 7. Platform identity vs tenant identity

The distinction is now enforced by test, because two of the worst leaks were
exactly this confusion:

| | Platform | Tenant |
|---|---|---|
| Email `DEFAULT_BRANDING` | `Smart ARK` | resolved from the verified caller |
| Brevo sender name | `Smart ARK` | `SENDER_NAME` / verified sender |
| Document footer | `Generated by Smart ARK` | `document_footer_note` |
| Unresolved public page | `Smart ARK` + "not found" | resolved by host/slug |
| Missing document branding | `NEUTRAL_DOCUMENT_BRANDING` | `organization_branding` |

`DEFAULT_BRANDING` was `orgName: "The Ark Tuition"` with an **empty** override
map and no caller ever passing one — so every transactional email the platform
sent, for every tenant, was signed with one customer's name and carried their
support address for replies. `send-email` now resolves branding from
`gate.caller.organizationId`, the same verified source it already used for
sender credentials.

---

## 8. Historical documents — unchanged semantics

Confirmed by inspection, not assumed. No table stores a rendered document or a
branding snapshot: `fee_installments`, `payroll_items`, `leads` and `exam_results`
hold data only, and every document is assembled from live rows at open time.

A reprinted receipt therefore shows **current** branding — which is what it did
before this change too, because the branding constant was also read at render
time. **Nothing about historical-document semantics moved.** Snapshot-at-issue
remains the open design question recorded in `DYNAMIC_DOCUMENT_BRANDING.md` §11.

---

## 9. Performance

| Surface | Branding lookups |
|---|---|
| 40 report cards | **1** — `resolveDocumentBranding` is session-cached and joins the existing `Promise.all` |
| Student list PDF (any size) | **1** — resolved once before generation |
| Every report export | **1 per session** — `ReportToolbar` holds one `useQuery` |
| SLA sweep over N leads | **1 per organization** — `ORG_NAME_CACHE` in `sla-checker` |
| Bulk payslip email | **1** — unchanged from Phase 6 |

`ReportToolbar` is where the leverage is: every export in the app funnels
through that one component, so a single hook brands ~20 report pages and every
future one, instead of each page growing its own letterhead and its own way to
get it wrong.

---

## 10. The permanent gate

`src/test/security/phase7.test.ts` — 18 assertions.

It scans `src/` and `supabase/functions/` for tenant markers, with each
exemption **classified and justified in code**. Unclassified files are scanned
by default: silence fails closed.

Mutation-tested, as required:

| Mutation | Expected | Result |
|---|---|---|
| `<h1>ARK Learning Arena</h1>` in customer-facing source | FAIL | ✓ detected |
| `import arkLogo from "@/assets/ark-logo.jpeg"` | FAIL | ✓ detected |
| `"ARK Learning Arena"` inside a comment | pass | ✓ not flagged |
| `"ABC Academy"` in a fixture | pass | ✓ not flagged |
| comment stripper emptying the file | FAIL | ✓ guarded |

Exemptions that rest on a fact are re-checked against that fact:
`ReceiptGenerator` must still have zero importers, and `staff/utils/geo.ts`
must still have zero callers. The moment either changes, the gate fails until
the file is branded or removed.

**The gate found four leaks I had missed by hand** — `ARK CRM` in the lead
templates and two edge functions, and `The Ark Tuition` as the Brevo sender
name. My manual grep had not included those two strings. That is the argument
for the gate in one sentence.

Its first version also reported line numbers computed on the *stripped* text,
pointing dozens of lines away from the real hit. Fixed to index the original
file — a gate that sends you to the wrong line is worse than no line at all.

---

## 11. Results

### Verification

| Gate | Baseline | After | Introduced |
|---|---|---|---|
| `vitest run` | 1407 | **1425 passed, 0 failed** | +18 |
| `tsc -p tsconfig.app.json` | 527 | **526** | **0** (one removed) |
| `eslint .` | 15 err / 289 warn | **15 err / 290 warn** | 0 errors, **+1 warning** |
| `npm run build` | passes | **passes, 44.7 s** | — |
| `deno check` (4 functions) | — | **passes** | — |

The +1 warning is `supabase: any` on the new `orgNameFor` helper in
`sla-checker`, matching that file's existing convention for the same parameter.

All existing phase gates (0, 1, 1E, 2, 3, 4, 5, 6) pass unchanged.

### Applied to production

Migration `20260913_phase7b` applied and verified:

```
public_tenant_context(null,'ark')          → "ARK Learning Arena"
public_tenant_context(null,'abc-academi')  → "ABC Academi"
public_tenant_context(null,'nope')         → null      ← no fallback
public_tenant_context(null,null)           → null
```

No data was deleted, reset or migrated. Both functions are additive; no table,
column, policy or trigger was dropped or altered.

### A bug I introduced and caught

Replacing `"ARK CRM"` with `${orgName}` in `sla-checker` referenced a variable
that did not exist there — a `ReferenceError` that would have thrown inside the
SLA cron. Caught by `deno check`, fixed by adding the memoised `orgNameFor`
resolver. Recorded because a mechanical find-and-replace across files with
different scopes is exactly how this happens.

### Deployment

1. `node scripts/deploy-migrations.mjs` — 7B already applied; the runner is
   idempotent.
2. Deploy the frontend.
3. **Redeploy four edge functions** — they carry real behaviour changes, not
   just strings:
   ```
   npx supabase functions deploy lead-intake     # now REQUIRES org_slug
   npx supabase functions deploy sla-checker
   npx supabase functions deploy send-email
   ```
   (`_shared/brevo.ts` and `_shared/email-templates.ts` ship with `send-email`
   and `invite-staff`; redeploy `invite-staff` too.)
4. **Update any Meta Ads webhook** to POST `org_slug`.
5. **Republish the enquiry link** as `/leads/apply/<slug>` — see §6.

### Open items

1. **Staff geofence** — §4. Highest severity. Needs ARK's real campus
   coordinates confirmed before it can be fixed safely.
2. **Meta template bodies** — the `ARK CRM` sign-off was removed from the local
   template bodies, but for templates with a positional spec **Meta renders its
   own approved body**. The counselor and SLA WhatsApp templates must be
   resubmitted with `{{org_name}}` before the change reaches WhatsApp. Local
   preview, queue payload and email already show the correct name.
3. **Certificates / ID cards** — §5. Nothing to brand until they exist.
4. **`ReceiptGenerator.tsx`** — still dead, still allowlisted. Deleting it is a
   cleanup task.
