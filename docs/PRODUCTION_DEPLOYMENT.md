# Production Deployment — Phases 0 → 6

**Date:** 6 August 2026 · **Project:** `vxyshcucwdbpxrhddaeh` · **PostgreSQL 17.6**

Everything below was **executed**, not planned. Where something is unverified it is
labelled as such.

---

## 1. Pending migrations — what was actually missing

The live database had **nothing** from Phases 0–6 before this deployment:
167 tables, 413 policies, **zero** `organization_id` columns, no `current_org_id()`.

`supabase migration list` was misleading: remote history stops at `20260421`
while the schema was applied through `20260730` (applied by hand, not by push).
So "untracked" ≠ "unapplied". Each untracked migration was checked against the
catalog for the tables it creates; **all were present except one**:

| Migration | Finding |
|---|---|
| `20260629_student_import_enterprise.sql` | `student_import_audit` genuinely absent — applied |
| `20260520_students_module.sql` | flagged by regex, false positive (match inside a comment) |
| 68 others | verified applied |

---

## 2. Validation — PASS / FAIL

| Check | Result |
|---|---|
| Duplicate tables / triggers / enums / indexes across phases | **PASS** — none |
| Duplicate functions | **PASS** — 5 redefinitions, all `CREATE OR REPLACE` (intentional) |
| Duplicate policies | **PASS** — every `CREATE POLICY` preceded by `DROP POLICY IF EXISTS` |
| Conflicting `ALTER TABLE` | **PASS** — all `ADD COLUMN IF NOT EXISTS` |
| Duplicate storage buckets | **PASS** — phases create none (Phase 0 only flips visibility) |
| Duplicate cron jobs | **PASS** — migrations schedule none |
| Duplicate edge-function registration | **PASS** |
| Rollback scripts inside `migrations/` | **FAIL → FIXED** (§3) |
| Migrations sharing a version prefix | **FAIL → mitigated** (§3) |

---

## 3. Two structural blockers found before touching the database

**a) 16 rollback scripts lived in `supabase/migrations/`.**
`supabase db push` runs every `.sql` in that directory in filename order, and
`…_rollback.sql` sorts *directly after* the migration it undoes. A push would
have applied Phase 0 and immediately reverted it, then done the same for all
eight phases. Moved to `supabase/rollback/`; the eight security gates were
repointed and a phase-0 gate now **fails the build** if one reappears.

**b) Many migrations share a version prefix.**
Four Phase-1 files are all `20260806`; the pre-SaaS history collides the same way
(`20260519` ×3, `20260521` ×4, `20260810` ×3). Supabase keys
`schema_migrations` by that prefix, so two files cannot both be recorded.

**Conclusion: `supabase db push` is not a usable deployment path for this repo.**

### The replacement: `scripts/deploy-migrations.mjs`

Applies an explicit dependency-ordered list, records each file under a synthetic
unique version, stops at the first error, and re-runs as a no-op.

```bash
node scripts/deploy-migrations.mjs --dry-run   # print the plan
node scripts/deploy-migrations.mjs            # apply
node scripts/deploy-migrations.mjs --verify   # post-deploy assertions only
```

A gate fails the build if a phase migration on disk is missing from its `ORDER`.

---

## 4. Deployment order (as executed)

| # | Migration | Why here | Time |
|---|---|---|---|
| 1 | `20260629_student_import_enterprise` | missing prerequisite table | 3.8s |
| 2 | `20260805_phase0_security_hardening` | no tenant dependency | 3.9s |
| 3 | `20260806_phase1a_tenant_foundation` | `organizations` + `current_org_id()` | 4.0s |
| 4 | `20260806_phase1b_organization_id` | needs 1A | 8.9s |
| 5 | `20260806_phase1c_tenant_rls` | needs 1B's column | 10.5s |
| 6 | `20260806_phase1d_provisioning_engine` | needs 1C | 3.8s |
| 7 | `20260807_phase1e_composite_unique_keys` | needs 1B + 1D | 4.1s |
| 8–10 | `phase2a/2b/2c` | platform plane, needs tenant spine | 12.5s |
| 11 | `phase3a_marketing_and_onboarding` | writes against 2C plans | 4.4s |
| 12–13 | `phase4a/4b` | consumes 3A signups | 8.7s |
| 14–15 | `phase5a/5b` | keyed to 2C subscriptions | 8.5s |
| 16–17 | `phase6a/6b` | needs 4B provisioning defaults | 8.2s |

**Total ≈ 90s.** All via CLI (`supabase db query --linked --file`), run as
`postgres`. None needed the SQL Editor. Storage changes ran as owner
successfully. No cron is created by any migration.

> `supabase db dump` / `db diff` require Docker and fail on this machine.
> `db query` does not — it uses the Management API.

---

## 5. Four real bugs the deployment exposed

Every one passed the file-scanning security gates, because a gate that greps
text cannot execute SQL.

**1. Phase 0 — all 8 storage policies were dead (42703).**
`staff_mgmt`/`staff_all` were PL/pgSQL `DECLARE` variables used inside
`CREATE POLICY`. plpgsql does **not** substitute variables into utility
statements, so Postgres parsed them as column names. Fixed by inlining the
literals; the gate now asserts the literal so it cannot regress.

**2. Phase 1E — syntax error (42601)**, one surplus `)`.

**3. Phase 1E — converted NOTHING while reporting success (42883).**
`array_agg(a.attname)` is `name[]`; comparing to `text[]` has no operator. The
per-row `EXCEPTION WHEN others` swallowed it as a "skip". Meanwhile the app
**already sent** `onConflict:"organization_id,…"` for these tables — so
settings saves, attendance locks, monthly closings and RBAC grants were failing
live with 42P10. Fixed with `a.attname::text`; 14 constraints converted.

**4. Detector blind spot — unique INDEXes were invisible.**
`unsafe_unique_constraints()` scanned only `pg_constraint`, reporting "0 unsafe"
while five real collisions sat in standalone indexes:

| Index | Consequence |
|---|---|
| `settings_whatsapp_config UNIQUE((true))` | **one WhatsApp config for the entire platform** |
| `academic_years UNIQUE(is_default) WHERE is_default` | one default year platform-wide |
| `lead_courses UNIQUE(lower(name))` | two schools could not both offer "NEET" |
| `student/parent_auth_accounts UNIQUE(lower(username))` | first tenant takes "raj" from everyone |
| `expense_transactions`, `message_queue` dedup keys | UUID-keyed, low risk, still unscoped |

Added `unsafe_unique_indexes()`; the readiness flag now sums both detectors and
**actively clears** a stale `true` instead of merely declining to set it.
Documented exceptions (referral codes, auth-identity uniqueness, ticket numbers)
are listed in the function with reasoning rather than silently skipped.

---

## 6. Edge functions

**Deployed this session (9):** `platform-admin`, `public-onboarding`,
`provisioning-worker`, `billing-checkout`, `razorpay-webhook`,
`billing-lifecycle`, `domain-verify` (new) · `kpi-engine`, `sla-checker`
(redeployed with the fail-closed fix).

**Already deployed (13):** `send-whatsapp`, `send-daily-report`, `kpi-engine`,
`end-of-day-check`, `sla-checker`, `invite-staff`, `send-email`, `lead-intake`,
`student-parent-accounts`, `verify-credentials`, `send-aisensy`,
`aisensy-webhook`, `comms-scheduler`.

**Not deployed — deliberate:** `seed-users`. One-time setup, gated by
`SEED_USERS_ENABLED`; deploying an unused privileged function is pure attack
surface.

### Security fix: two cron endpoints were open to the internet

`kpi-engine` and `sla-checker` ran their gate only `if (cronSecret)`. With
`CRON_SECRET` unset and `verify_jwt = false`, **any anonymous caller could
trigger them** — a read DoS and an unauthenticated write respectively. A missing
secret is a misconfiguration, not permission to skip authorization. Both now
fail closed. Verified live:

| Endpoint | no key | with key |
|---|---|---|
| kpi-engine | **401** | 200 |
| sla-checker | **401** | 200 |
| provisioning-worker | **401** | 200 |
| billing-lifecycle | **401** | 200 |
| platform-admin / domain-verify / billing-checkout | **401** | — |
| public-onboarding `check_slug` (must be anonymous) | **200** | — |

---

## 7. Secrets

**Set this session:** `CRON_SECRET` (32-byte random) — also mirrored into
Supabase Vault for cron.

**Already configured:** `AISENSY_API_KEY`, `AISENSY_CAMPAIGN_API`,
`AISENSY_PROJECT_NAME`, `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`, plus the
auto-provided `SUPABASE_*`.

**Still missing — you must supply:**

| Secret | Impact while unset |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | **Billing is entirely non-functional.** `razorpay-webhook` returns 500 by design so Razorpay retries rather than discarding real payment events. |
| `AISENSY_WEBHOOK_SECRET` | Fails **closed** — **all AiSensy delivery receipts are being rejected 401 right now**, so WhatsApp delivery status never updates. Set it *and* update the callback URL in the AiSensy dashboard. |
| `LEAD_INTAKE_SECRET` | Optional. **Do not set casually** — `lead-intake` is a public Meta-ads webhook; enabling the secret breaks any caller not updated to send it. |

`AISENSY_DEFAULT_CAMPAIGN` is genuinely optional (defaults to
`ark_broadcast_alert`). `SEED_USERS_ENABLED` should stay unset.

---

## 8. Storage

Phase 0 flipped three leaking buckets to private — verified live:

| Bucket | Before | After |
|---|---|---|
| `payslips` | **PUBLIC** | private |
| `finance-attachments` | **PUBLIC** | private |
| `support-attachments` | **PUBLIC** | private |
| `profile-pictures` | public | public (intentional — avatars) |
| 6 others | private | private |

No regression: `payrollEmail.service` mints a 30-day **signed** URL, and the only
remaining `getPublicUrl()` caller is `staff/storage.service.ts`, which targets
`profile-pictures`. Legacy objects stay readable while one organization exists;
relocation under `{organization_id}/` is handled by
`scripts/relocate-storage-to-org.mjs` (**not yet run** — not needed until org #2).

---

## 9. Cron

Five jobs. The shared secret lives in **Supabase Vault**, not inline in
`cron.job.command` — that table is readable by anyone with catalog access and
the value would also leak into `pg_stat_activity`. `public.invoke_edge_cron()`
is `SECURITY DEFINER` with `EXECUTE` revoked from `anon`/`authenticated`.

| Job | Schedule | Purpose |
|---|---|---|
| `daily-report-11pm` | `29 18 * * *` | pre-existing |
| `provisioning-worker` | `* * * * *` | **Phase 4** — without it a signup never provisions |
| `billing-lifecycle` | `15 2 * * *` | **Phase 5** — trial expiry, grace, suspension |
| `sla-checker` | `*/15 * * * *` | support SLA breaches |
| `kpi-engine` | `0 * * * *` | dashboard KPIs |

**Verified executing:** 20 runs, **all `succeeded`, all HTTP 200** in
`net._http_response`.

Not scheduled: `send-aisensy` and `comms-scheduler` use `verify_jwt = true`, so
cron would need a service-role JWT stored in the database. `send-aisensy` is
already nudged by the app after each enqueue, so the queue drains today.

---

## 10. Webhooks

| Endpoint | Auth | Verified |
|---|---|---|
| `/razorpay-webhook` | HMAC-SHA256 over the **raw** body vs `RAZORPAY_WEBHOOK_SECRET`; `verify_jwt=false` | 500 until the secret is set (deliberate — forces retry) |
| `/aisensy-webhook` | shared secret via `?secret=` or `x-webhook-secret`; fails closed | **currently rejecting everything 401** |
| `/lead-intake` | optional `LEAD_INTAKE_SECRET`; echoes Meta's `hub.challenge` | open today (unset) |
| `/domain-verify` | user JWT + org-admin/platform check | 401 unauthenticated ✓ |

---

## 11. Sample organization — **BLOCKED, deliberately not created**

`current_org_id()` = `jwt_org_id()` ?? `fallback_org_id()`, and the fallback
resolves **only while exactly one organization exists**. The Auth *Custom Access
Token* hook is **not enabled**, so no JWT carries `organization_id`.

Demonstrated inside a rolled-back transaction — with a second organization
present and no hook, an ARK management user sees:

```
orgs_now                 0
current_org_id_resolves  0
students_visible         0
profiles_visible         0
fees_visible             0
```

**Creating a demo organization today would black out ARK entirely.** I did not
do it. This is a 30-second dashboard action I cannot perform (no Management API
token locally; `supabase config push` would overwrite live Auth settings with
CLI defaults).

**Required first:** Dashboard → Authentication → Hooks → *Customize Access
Token* → select `public.custom_access_token_hook` → Save. The grant to
`supabase_auth_admin` already exists. Then sign out/in and confirm the JWT
carries `app_metadata.organization_id` before creating any second tenant.

---

## 12. Verification results

**Production data — before vs after, zero loss:**

| Table | Before | After |
|---|---|---|
| students | 133 | 133 |
| student_attendance | 6,590 | 6,590 |
| exam_results | 1,479 | 1,479 |
| student_fees | 132 | 132 |
| profiles / auth.users | 24 / 25 | 24 / 25 |
| batches, leads, message_queue, payroll_items, staff_attendance | unchanged | unchanged |

*(A real student, "Dhikshan S", was created through the app at 05:18 UTC —
mid-deployment. Live proof that writes work post-migration.)*

**Tenancy, verified by simulating real sessions under the `authenticated` role:**

- ARK admin, **no** org claim → full visibility (133 students, 6,590 attendance …), `current_org_id()` resolves via fallback ✓
- Same user with a **foreign** org claim → **0 rows in every table**, including `organization_secrets` ✓
- `INSERT` without `organization_id` → auto-stamped to the correct tenant, readable back ✓ (rolled back)
- `ON CONFLICT (organization_id, …)` upserts → succeed on `comms_automation_settings`, `attendance_locks`, `system_settings` ✓ (rolled back)

**Post-deploy assertions — 13/13 PASS**, including: every tenant table carries
`organization_id`; no ARK row lost its tenant; `organization_secrets` has RLS
forced with **zero** policies; both uniqueness detectors return 0; all readiness
flags set.

**Code gates:**

| Gate | Result |
|---|---|
| `npx vitest run` | **1151 passed / 0 failed**, 80 files |
| `src/test/security/` | **364 passed** (5 new gates added) |
| `tsc --noEmit -p tsconfig.app.json` | **527** — exactly baseline |
| `eslint .` | **15 errors** — exactly baseline |
| `npm run build` | passed |
| Phase 1E re-run twice | clean — idempotent |

---

## 13. Production readiness

| Area | Status |
|---|---|
| Schema, RLS, tenant isolation | **Ready** — verified against the live catalog |
| ARK single-tenant operation | **Ready** — data intact, reads/writes confirmed |
| Edge functions | **Ready** — 22 deployed, authorization verified live |
| Cron | **Ready** — executing, HTTP 200 |
| Storage | **Ready** — leaks closed, no broken links |
| Provisioning (Phase 4) | **Blocked** — needs the Auth hook |
| Billing (Phase 5) | **Blocked** — needs Razorpay secrets |
| WhatsApp delivery receipts | **Broken** — needs `AISENSY_WEBHOOK_SECRET` |
| Multi-tenant operation | **Blocked** — needs the Auth hook |

**Single-tenant production: ready. Multi-tenant: one dashboard toggle away.**

---

## 14. Remaining issues, in priority order

1. **Enable the Custom Access Token hook.** Gates everything multi-tenant. Until
   then a second organization takes ARK down.
2. **Set the three Razorpay secrets.** Billing cannot function.
3. **Set `AISENSY_WEBHOOK_SECRET` and update the AiSensy callback URL.**
   Delivery receipts are being dropped right now.
4. **Store `CRON_SECRET`** in your password manager — it is in Supabase secrets
   and Vault, but not recoverable in plaintext from either.
5. Decide on `LEAD_INTAKE_SECRET` — only alongside updating the Meta webhook URL.
6. Not run: `scripts/relocate-storage-to-org.mjs`. Only needed before org #2.

### Not verified here — no honest way to test without live third parties

- A real Razorpay payment, signature verification, or invoice issuance
- WhatsApp/email delivery through a **custom** (non-platform) tenant credential
- DNS/SSL against a real customer domain; certificate issuance is not implemented
- The provisioning worker completing a real signup end to end (needs the hook)
- Any browser-level UI walkthrough

---

## 15. Post-deployment: the SPA fallback was broken (fixed, needs redeploy)

**Symptom reported:** the landing page's *Sign in* button opened
`/login` and showed 404.

**Actual scope — far wider than the login button.** Every route without a
prerendered file on disk returned Vercel's own `NOT_FOUND`:

| Path | Before |
|---|---|
| `/login`, `/admin`, `/management`, `/parent`, `/exam`, `/admissions/apply` | **404** |
| any in-app page refresh | **404** |
| every credential link WhatsApp'd to staff/parents (`…/login`) | **404** |
| `/`, `/features`, `/pricing` and the other 24 prerendered routes | 200 |

Only the marketing site worked, which is exactly why it looked like a broken
button rather than a total outage.

**Cause.** `vercel.json` set `"cleanUrls": true`. That makes Vercel redirect
every `.html` path to its extensionless form — `/index.html` **308s to `/`** and
stops being a servable target. The catch-all rewrite's destination therefore
resolved to nothing, and Vercel fell through to 404. Proof:

```
GET /index.html  →  308      (destination is a redirect, not a file)
GET /login       →  404      X-Vercel-Error: NOT_FOUND
GET /features    →  200      (a real file on disk)
```

The `headers` block from the same `vercel.json` *was* applied, which confirmed
the config was deployed and narrowed the fault to `rewrites` alone.

**Fix.** Removed `cleanUrls`. It bought nothing: the prerenderer writes
`dist/<route>/index.html` — directory indexes, which Vercel resolves natively.

**Why CI did not catch it.** A Phase 3 gate *asserted* `cleanUrls: true`. The
gate encoded an assumption about the mechanism rather than the requirement, so
the correct configuration would have **failed** CI. It now asserts what actually
matters (the prerenderer emits directory indexes) plus the fallback invariant,
and a Phase 0 gate fails the build if `cleanUrls` returns or any rewrite
destination becomes unservable.

> **Not yet verified in production — this needs a redeploy.** The diagnosis is
> evidence-based (the 308 above is direct proof) and the local build is correct,
> but I have no Vercel credentials on this machine, so the live fix is unproven.
> After deploying, confirm:
>
> ```bash
> for p in /login /admin /parent /admissions/apply /features /pricing; do
>   printf "%-22s " "$p"
>   curl -s -o /dev/null -w "%{http_code}\n" "https://smart-ark-main.vercel.app$p"
> done
> ```
>
> Expected: **200 for all** — `/login` and friends from the SPA shell, `/features`
> and `/pricing` still from their prerendered files. Also confirm `/features`
> still returns its own `<title>`, proving the fallback did not shadow it.

---

## 16. Signup could never complete (fixed, needs redeploy)

**Symptom reported:** on "Check your email", clicking *I have verified — continue*
returned to the account-creation step.

**Cause — not the button.** `src/integrations/supabase/client.ts` set
`detectSessionInUrl: false`, on the rationale that the app has no OAuth or magic
links. True of the staff ERP; false the moment self-serve signup shipped.

`signUp()` passes `emailRedirectTo`, and GoTrue returns the confirmed user with
the session **in the URL** (`?code=` under PKCE). With detection off, supabase-js
discarded it, so no session was ever created — in any tab. `getSession()`
returned null, the wizard could not distinguish a verified user from a new one,
and the button's `window.location.reload()` fell through to step 1. **No
organization could ever be created by anyone.**

**Fixed:**
- `detectSessionInUrl: true`.
- The button now re-checks the session in place and, if still unverified, says
  so — instead of silently resetting. Added a *Resend verification email* action.
- `onAuthStateChange` advances the wizard when the URL exchange resolves after
  mount.
- The pending email is kept in `sessionStorage`, so a reload resumes on "Check
  your email" rather than an empty form.

Six gates in `phase3.test.ts` cover this.

### Before the first real signup — order matters

Provisioning creates organization #2, which switches `fallback_org_id()` off for
everyone (§11). Sequence:

1. **Enable the Auth hook** — Dashboard → Authentication → Hooks → *Customize
   Access Token* → `public.custom_access_token_hook`.
2. **Re-authenticate existing ARK staff.** Their current tokens were issued
   before the hook existed and carry no `organization_id`. The hook runs on every
   token issuance, so a sign-out/sign-in fixes it immediately; otherwise they
   inherit it on the next automatic refresh (≤1h). Verify one admin's JWT
   contains `app_metadata.organization_id` **before** proceeding.
3. **Check Auth → URL Configuration.** Site URL must be the production domain and
   the redirect allowlist must include `https://<domain>/signup`, or the
   confirmation link will not return to the wizard.
4. Only then run a real signup.

Verified safe: all 25 auth users already have an active `organization_users`
row, so the hook will emit a claim for every existing login.

> **Not verified end to end.** The client fix, the wizard logic and the DB guard
> are verified; a live signup-through-provisioning run is not, because completing
> it creates organization #2 and would black out ARK until step 2 above is done.

---

## 17. Google Fonts blocked by CSP — self-hosted instead (fixed, needs redeploy)

**Symptom:** console reported the stylesheet from `fonts.googleapis.com`
violating `style-src 'self' 'unsafe-inline'`. Fonts did not load.

**Audit — where CSP is generated.** Searched the whole repository. CSP is
defined in exactly **one** place: the global header block in `vercel.json`.
There is no middleware, no Express/nginx layer, no CSP utility, and no edge
function that sets it. The only other occurrences are assertions in
`phase0.test.ts` and `phase5.test.ts`.

**Root cause.** `src/index.css` line 1 was
`@import url('https://fonts.googleapis.com/css2?family=Inter:...&family=Space+Grotesk:...')`.
Phase 0 tightened CSP to `style-src 'self' 'unsafe-inline'` and
`font-src 'self' data:`. Both halves were blocked — the stylesheet *and* the
`.woff2` files it points at. Two families were affected, not one: **Inter**
(`font-sans`, body) and **Space Grotesk** (`font-display`, headings).

**Chosen: Option B — self-host.** Reasons, in order of weight:

1. **Security.** Option A grants `fonts.googleapis.com` the right to inject CSS
   into an authenticated document, forever. CSS is not inert — it can exfiltrate
   via selectors and attribute matching, and restyle UI into a convincing
   phishing surface. Self-hosting keeps `style-src` at `'self'`, which is
   strictly stronger than any allow-list.
2. **It removes a third-party runtime dependency** from first paint. An
   `@import` inside CSS is render-blocking *and* serialised — the browser must
   fetch and parse `index.css` before it even discovers the font request, then
   pay DNS + TLS to two more origins.
3. **Privacy.** Google Fonts discloses every visitor's IP to a third party. For
   an Indian education platform handling minors' data under DPDP, removing that
   is worth more than the CDN cache hit (which browser cache partitioning has
   largely eliminated anyway).
4. **The Capacitor Android build works offline.** A remote font does not.

**Implementation.** `scripts/fetch-fonts.mjs` downloads the woff2 files and
generates `src/styles/fonts.css`. It is a script, not a manual copy, because the
alternative rots: fonts get a new version, someone hand-edits one `@font-face`,
and a `unicode-range` drifts from the file it points at — then a Vietnamese or
Cyrillic name renders as tofu on one page and not another. `--check` verifies
disk against upstream without downloading.

- **10 variable-font files, 280 KB total**, in `public/fonts/`, covering all 7
  subsets Google served (latin, latin-ext, cyrillic, cyrillic-ext, greek,
  greek-ext, vietnamese). `unicode-range` is preserved verbatim, so a
  Latin-only page still downloads only ~70 KB.
- Variable fonts: one file per subset spans the whole weight range, replacing
  what would have been 10 static weights per subset.
- Filenames carry the font version (`inter-latin-v20.woff2`) because `public/`
  files get no content hash, and `vercel.json` now caches `/fonts/` for a year
  as `immutable`. A new version must be a new URL.
- **CSP is unchanged.** That is the point of Option B.

**Indic scripts unaffected.** Inter and Space Grotesk never covered
Devanagari/Tamil/Telugu/Kannada/Malayalam — Google did not serve those subsets
either, so Phase 6's multi-language surfaces fell back to system fonts before
and still do. No regression.

### Cross-origin headers

Added `Cross-Origin-Opener-Policy: same-origin-allow-popups` and
`Cross-Origin-Resource-Policy: same-origin`.

**COEP `require-corp` deliberately NOT added.** It demands an explicit CORP
header from every cross-origin subresource; Razorpay's checkout script, the QR
images from `chart.googleapis.com` and Supabase Storage objects send none, so it
would break payments, ID cards and every uploaded document. It buys nothing here
— the app uses no `SharedArrayBuffer`. COOP is `same-origin-allow-popups` rather
than `same-origin` for the same reason: Razorpay's bank/UPI popups talk back via
`window.opener`.

### Two findings NOT changed (flagged, not fixed)

- `script-src` still carries **`'unsafe-inline' 'unsafe-eval'`**, which is the
  real remaining XSS exposure — far more than fonts ever were. Removing it needs
  a nonce/hash strategy and a check of every dependency that evals. Out of scope
  here; worth its own pass.
- `Permissions-Policy` sets **`payment=()`**, which disables the Payment Request
  API for this document *and its iframes*. If Razorpay Checkout uses it for
  Google Pay / UPI intent, that will block it. Untestable until the Razorpay
  secrets are set — **test this explicitly on the first live payment.**

### Auth diagnostics page — `/platform/debug/auth`

Development builds only, verified by inspecting the production bundle:

- `routes.tsx` registers it only inside an `import.meta.env.DEV` branch, so the
  path string is **absent** from the production bundle.
- The module's default export collapses to `() => null` outside DEV, so the
  component tree-shakes away. The emitted chunk is **244 bytes** containing only
  `const e=()=>null` — no strings, no queries, no field names.
- It additionally requires an active MFA-enrolled platform user holding
  `settings.manage`.
- The **raw access token is never rendered** — it is a bearer credential. Only
  the decoded claim payload is shown, and that decode is display-only, never an
  authorization input.
- All reads go through RLS **as the current user**, deliberately: a service-role
  read would show data the session cannot actually see, making the page lie in
  exactly the situation it exists for. Phase 2's "no platform page queries
  supabase directly" gate was not relaxed — it now grants a narrow exemption
  that a page must *earn* by proving both halves of the dev-only guard.

**JWT claim audit result:** `organization_id` ✓ and `principal_kind` ✓ are
emitted (verified by invoking `custom_access_token_hook` against real ARK users
— all resolve to ARK Learning Arena). `platform_role` ✓ is emitted, MFA-gated.
`role` is present natively from GoTrue as `authenticated` — the Postgres role,
not an app role.

**`organization_role` does not exist, and should not.** `organization_users`
has no role column; the app role lives in `profiles.role` and is read
server-side by `get_user_role(auth.uid())` inside RLS. Baking it into the token
would mean a demoted user keeps elevated rights for up to an hour, until the
token refreshes. Reading it live from the table means a permission change
applies on the next query. The hook was **not modified.**

---

## 18. Command reference

```bash
node scripts/deploy-migrations.mjs --dry-run    # preview
node scripts/deploy-migrations.mjs             # apply (idempotent)
node scripts/deploy-migrations.mjs --verify    # 13 catalog assertions

supabase functions deploy <name>
supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
supabase secrets set AISENSY_WEBHOOK_SECRET=...

supabase db query --linked "select * from public.unsafe_unique_indexes();"
supabase db query --linked "select * from public.tenancy_readiness;"
```

**Rollback:** `supabase/rollback/*.sql`, applied in reverse phase order. Phase 1E's
rollback refuses to run once a second organization exists and warns that the
frontend must be reverted in the same deploy.
