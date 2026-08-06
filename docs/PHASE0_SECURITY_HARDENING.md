# Phase 0 — Security Hardening

**Status:** Code complete, all quality gates green. **Not yet deployed.**
**Date:** 5 August 2026
**Migration:** `20260805_phase0_security_hardening.sql`
**Rollback:** `20260805_phase0_security_hardening_rollback.sql`

---

## 1. Summary

Phase 0 closes the security findings that are exploitable **today**, on the single-tenant database, before any multi-tenant work begins. Nothing here depends on `organization_id`.

| ID | Finding | Fix |
|---|---|---|
| **S2** | `handle_new_user()` gave every new auth user a **staff** profile (`COALESCE(meta_role, 'teacher')`). With `is_staff()` = "holds a profiles row" and 102 policies at `USING (true)`, anyone who reached GoTrue's signup endpoint gained read access to every student, fee, payroll and staff record. | No role in metadata → no profile. Deny by default. |
| **S3a** | `payslips` bucket was `public = true` **and** had a `TO public` read policy — every salary slip ever emailed was readable by anyone on the internet, forever. | Bucket private; admin/management read; emailed links are now 30-day signed URLs. |
| **S3b** | `finance-attachments` bucket was `public = true`; reads gated on `bucket_id` alone. | Private; admin/management only. |
| **S3c** | `support-attachments` bucket was `public = true`; read **and write** open to any authenticated principal. | Private; staff only. |
| **S3d** | `question-papers` readable **and DELETABLE** by any authenticated user — students and parents hold authenticated sessions. | Staff read/write; admin/management delete. |
| **S3e** | `task-attachments` read/write open to any authenticated principal. | Staff only. |
| **S3f** | `profile-pictures` writable by any authenticated principal — anyone could overwrite any staff member's avatar. | Own folder, or admin/management. |
| **S6** | Six edge functions identified their caller by base64-decoding the JWT payload **without verifying the signature**. | Verified via `auth.getUser()` in `_shared/auth.ts`. |
| **S10** | 15 root scripts committed to git, several holding **real staff emails with plaintext passwords**. | Deleted; `.gitignore` blocks the pattern returning. |
| **S11** | No security response headers. | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. |
| **—** | `seed-users` resets ten real staff accounts to hardcoded passwords, on a permanently-live endpoint. | Disabled unless `SEED_USERS_ENABLED=true`. |

### Two corrections to the earlier architecture review

The review was written from static analysis. Reading the code closely during implementation corrected two claims:

- **`get_financial_summary()` is not a leak vector.** The review called it "a confirmed leak". It already raises `Access denied: 403 Forbidden` for every role except `management`; `p_campus_id` is a filter, not an authorization bypass. It needs an org conjunct in Phase 1 — it did not need a Phase 0 fix.
- **`student-documents` was already correctly scoped.** `20260727_parent_portal.sql` had replaced the open policy with staff-only plus a path-checked parent-of-that-student grant. The review's S3 was over-broad on this bucket.

Both were over-statements in the safe direction, but they misallocated priority, so they are recorded here rather than quietly dropped.

### One finding worse than the review stated

The review said the buckets were readable by "any authenticated user". Four were marked **`public = true`**, which is materially worse: a public Supabase bucket is readable by **anyone on the internet** with the URL — no auth, no RLS evaluation at all. `payslips`, `finance-attachments` and `support-attachments` were all in that state.

---

## 2. Architecture changes

No structural change. Phase 0 is deliberately narrow: tighten what exists, add no new concepts, so it can ship independently and be reverted cleanly.

Two additions, both extension points reused in Phase 1:

- **`public.has_any_role(TEXT[])`** — "does the caller hold an *active* staff profile with one of these roles?" Existing helpers were close but insufficient: `get_user_role()` returns `app_role` (forcing a cast at every call site) and, importantly, **has no `is_active` filter**, so a deactivated staff member still passes it. `has_any_role()` filters on `is_active`.
- **`supabase/functions/_shared/auth.ts`** — `resolveCaller()` / `requireRole()`. Verifies the JWT against GoTrue and resolves the caller's profile in one step, replacing the decode *and* the separate profile lookup each function was doing. Phase 1 extends `Caller` with `organizationId`, which is why every function now funnels through one place.

---

## 3. Modified files

| File | Change |
|---|---|
| `supabase/functions/student-parent-accounts/index.ts` | Verified caller via `requireRole` |
| `supabase/functions/verify-credentials/index.ts` | Verified caller via `requireRole` |
| `supabase/functions/send-email/index.ts` | Verified caller via `requireRole` |
| `supabase/functions/invite-staff/index.ts` | Verified caller via `requireRole` |
| `supabase/functions/seed-users/index.ts` | Verified caller **+ disabled by default** |
| `supabase/functions/end-of-day-check/index.ts` | Verified caller via `resolveCaller` |
| `src/features/payroll/services/payrollEmail.service.ts` | `getPublicUrl` → 30-day signed URL |
| `src/features/finance/services/financeAttachment.service.ts` | Stores path; signs on read; `objectPath()` for deletes |
| `src/features/help/services/attachments.service.ts` | Same pattern |
| `vercel.json` | Security headers |
| `.gitignore` | Blocks root scripts and `.env` |

**Deleted (credentials in git):** `add_students.mjs`, `apply_final_checklist.mjs`, `check_schema.mjs`, `fetch_profiles.mjs`, `fix_refresh.js`, `fix_updates.py`, `query_overrides.mjs`, `scratch.mjs`, `scratch_perms.mjs`, `scratch_query_no_auth.mjs`, `scratch_try_all.mjs`, `test_db.mjs`, `try_logins.mjs`, `update_archana_db.mjs`, `update_profile.mjs`, and 2 stale Vite timestamp artifacts.

## 4. New files

| File | Purpose |
|---|---|
| `supabase/migrations/20260805_phase0_security_hardening.sql` | The migration |
| `supabase/migrations/20260805_phase0_security_hardening_rollback.sql` | Paired rollback |
| `supabase/functions/_shared/auth.ts` | Verified caller resolution |
| `src/lib/storageUrl.ts` | Signed URLs + legacy-URL path recovery |
| `src/lib/storageUrl.test.ts` | 10 tests |
| `src/test/security/phase0.test.ts` | 24 regression gates |
| `scripts/security-audit.sql` | Runtime DB audit |
| `docs/PHASE0_SECURITY_HARDENING.md` | This document |

---

## 5. Database migrations

Five parts, each independently revertible. PARTs 3, 4 and 5 are wrapped in `EXCEPTION WHEN insufficient_privilege` because on a hosted project the migration runner may not own `storage.objects` — failing loudly there would abort PARTs 1–2, which *do* apply. **If the notice fires, PART 4 must be re-run from the SQL editor as owner; section 9 of the audit script detects this.**

1. **`handle_new_user()`** — no role ⇒ no profile.
2. **`has_any_role()`** — new helper.
3. **Bucket visibility** — three buckets flipped private.
4. **Storage policies** — 11 policies replacing bucket-id-only grants.
5. **Audit block** — reports public buckets, unscoped policies, and parent/student accounts holding staff profiles. Reports rather than fixes: a genuine staff member may also be a parent, and auto-deleting their profile would revoke their job access.

### Backward compatibility with existing storage rows

Flipping the buckets private turns every stored public URL into a dead link. Rather than migrate those rows (the URL is the only record of the object path), `objectPath()` recovers the path from either shape:

```
https://<ref>.supabase.co/storage/v1/object/public/receipts/a/b.pdf?download=x  →  a/b.pdf
a/b.pdf                                                                          →  a/b.pdf
```

New uploads store the bare path, so the URL form ages out naturally. **No data migration is required.** This is the highest-risk logic in the phase, so it carries 10 dedicated tests including query strings, signed-URL shapes, nested folders and near-miss bucket names.

---

## 6. Security review

| Threat | Before | After |
|---|---|---|
| Anonymous signup → staff access | **Open** (subject to project signup setting) | Closed at DB level, independent of that setting |
| Internet reads salary slips | **Open** | Closed; 30-day signed URLs |
| Internet reads financial documents | **Open** | Closed |
| Student reads/deletes exam papers | **Open** | Closed |
| Parent reads staff support attachments | **Open** | Closed |
| Any user overwrites another's avatar | **Open** | Closed |
| Forged JWT `sub` → impersonation | Mitigated only by `config.toml` | Verified in code |
| Credentials in repo | **Present** | Removed (see caveat below) |
| Clickjacking / MIME sniffing / mixed content | No headers | Headers set |
| **Cross-tenant access** | N/A | **Still open — Phase 1** |

### Honest caveats

1. **Deleting the scripts does not remove the passwords from git history.** They remain in every clone and in the remote. **The only real fix is rotating those credentials** — `management123` and `Ark@2026` for the ten accounts in `seed-users`. This is an operator action; the code cannot do it. It is item 1 of the deployment checklist.
2. **CSP includes `'unsafe-inline'` and `'unsafe-eval'`.** Required by the inline theme-boot script in `index.html` and by `pdfjs-dist`. This is weaker than ideal; tightening it to nonce-based CSP is a follow-up, not a blocker. The valuable directives (`frame-ancestors 'none'`, `object-src 'none'`, scoped `connect-src`) are effective regardless.
3. **The 102 `USING (true)` policies are untouched, deliberately.** They are correct while ARK is the only tenant, and the fix requires `organization_id`. Section 7 of the audit script tracks the count; it must reach 0 in Phase 1.
4. **Nothing here has been verified against the live database.** All verification below is repository-level. Runtime verification is the deployment checklist.

---

## 7. Performance review

| Change | Impact |
|---|---|
| `has_any_role()` in storage policies | One indexed `profiles` lookup per storage request. `STABLE`, so evaluated once per statement. Negligible. |
| Signed URLs on attachment lists | `signedUrlMap()` uses `createSignedUrls` (batch) — **one** request per list regardless of length, not N. |
| `resolveCaller()` in edge functions | One GoTrue round-trip added, but it **folds in the profile lookup** each function did separately. Net: roughly neutral. |
| Security headers | None (edge-applied). |
| Bundle size | `storageUrl.ts` is ~1 KB. Build output unchanged: `index` chunk 584.09 → 584.17 kB. |

---

## 8. PASS / FAIL

Baseline captured **before** any change, on commit `3563ede`.

| Gate | Baseline | After | Verdict |
|---|---|---|---|
| **Tests** | 71 files / 777 tests pass | **73 files / 811 tests pass** | ✅ **PASS** (+34, 0 regressions) |
| **Production build** | exit 0 | exit 0, 22.45s | ✅ **PASS** |
| **TypeScript** | **527 errors** | **527 errors** | ⚠️ **PASS (delta)** — set-diff confirms **zero introduced** |
| **ESLint** | 15 errors, 259 warnings | 15 errors, 259 warnings | ⚠️ **PASS (delta)** — zero in new/changed files |
| **Regression gates** | — | 24 new gates, mutation-tested | ✅ **PASS** |
| **RBAC audit** | passing | passing (unchanged) | ✅ **PASS** |
| **Migration review** | — | Idempotent, paired rollback | ✅ **PASS** |
| **Security audit (repo)** | 12 findings | 10 closed, 2 deferred to Phase 1 with reason | ✅ **PASS** |
| **Security audit (runtime)** | — | **Not run — needs a live DB** | ⏳ **PENDING DEPLOY** |

### Why TypeScript and ESLint are delta gates, not absolute

**The repository has never passed `tsc --noEmit`.** The baseline is 527 errors and 15 lint errors, all pre-existing — the production build succeeds because Vite/SWC strips types without checking them. An absolute gate would require fixing 527 unrelated errors before any security work could ship, which is the wrong trade against a live vulnerability.

The delta gate is enforced by set-diff of the error lists, not by comparing counts (identical counts could still hide a swap). Result: **zero errors introduced**.

Clearing the 527-error baseline is real, worthwhile work — and it is its own task, not a rider on Phase 0.

### Mutation test

A gate that has never failed is unproven. The `atob` gate was verified by reintroducing the vulnerability into `send-email/index.ts`:

```
→ these functions still decode a JWT unverified: send-email: expected [ 'send-email' ] to deeply equal []
```

The file was restored and confirmed clean (0 occurrences).

---

## 9. Deployment checklist

Ordered. Steps 1 and 2 are operator actions that code cannot perform.

- [ ] **1. ROTATE THE LEAKED CREDENTIALS.** `management123` and `Ark@2026` for the ten `seed-users` accounts are in git history and must be treated as compromised. **Do this first** — it is the only step that addresses an exposure already in the wild.
- [ ] **2. Verify anon signup is disabled** — Supabase Dashboard → Authentication → Providers → Email → "Enable signup". The S2 fix makes an unauthorised signup harmless (no profile, no access), but defence in depth.
- [ ] 3. Confirm a verified backup / PITR restore point exists.
- [ ] 4. Apply the migration: `npx supabase db push` (or paste into the SQL editor).
- [ ] 5. **Read the migration output.** If `insufficient_privilege` notices appear, re-run PARTs 3 and 4 from the SQL editor **as owner** — otherwise the buckets are still public.
- [ ] 6. Review PART 5 warnings; resolve any privilege-escalation findings.
- [ ] 7. Deploy the frontend. **Must go out with or after the migration** — the build replaces `getPublicUrl` with signed URLs. Signed URLs work against a public bucket, so migration-first is safe; frontend-first against private buckets is not.
- [ ] 8. Deploy edge functions: `npx supabase functions deploy` (all six changed).
- [ ] 9. Run `scripts/security-audit.sql`. Sections 1–6, 9, 10 must be clean. Section 7 is expected to show ~102 (the Phase 1 backlog).
- [ ] 10. **Smoke test, as a real user:** open a finance attachment; open a support attachment; email a payslip and click the link from the inbox; upload a profile picture; import a question paper; log in as a teacher and confirm normal access.
- [ ] 11. Confirm `SEED_USERS_ENABLED` is **not** set.
- [ ] 12. Verify headers: `curl -I https://<app-url>` shows CSP and HSTS.

---

## 10. Rollback checklist

Each PART is independent — **revert only the one causing a problem**, never the whole migration by reflex.

| Symptom | Targeted fix | Full revert? |
|---|---|---|
| New staff accounts get no profile | Confirm the creator sends `user_metadata.role`. `invite-staff` does. | No |
| Attachments 404 / won't open | Frontend not deployed, or PART 4 skipped on privilege. Deploy frontend; re-run PART 4. | No |
| Emailed payslip link dead | Links minted **before** deploy were public URLs against a now-private bucket. Re-send. | No |
| Staff can't upload avatars | Object key must start with their `profiles.id`. Check `storage.service.ts` key format. | No |
| Widespread storage failure | Run PART 4 of the rollback only. | Partial |

Full revert: `psql -f supabase/migrations/20260805_phase0_security_hardening_rollback.sql` **and** redeploy the previous frontend build.

⚠️ **The rollback re-opens every hole, including world-readable payslips and the signup path that mints staff profiles.** It exists because the contract requires one, not because reverting is ever the right first move.

---

## 11. What Phase 0 does NOT do

Stated plainly so nobody reads a green gate table as "we are secure":

- **No tenant isolation.** 167 tables still have no `organization_id`; 102 policies remain `USING (true)`. A second organization today would see everything. → **Phase 1**
- **No fix for the 527 TypeScript errors.** Pre-existing; separate task.
- **No penetration test.** Repository-level analysis only.
- **No runtime verification.** Every claim here is provable from the repo; the database has not been touched.
- **No credential rotation.** Code cannot do it. Checklist item 1.
