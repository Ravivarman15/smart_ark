# Phase 6 — White Label Domains, Custom Email & Branding Marketplace

**Status:** implemented, gated, built. Migrations **not yet applied** to the live database.
**Date:** 2026-09-01 migration stamp · authored 2026-08-05

---

## The rule that shapes this entire phase

> *"for defaults every organization use our credential like AiSensy, domain, email — if they want custom, allow that also."*

Everything below is a consequence of that sentence. **Platform credentials are the
default; custom credentials are an opt-in that takes effect only once verified.**

That ordering is not a convenience — it is what makes Phase 6 safe for ARK. An
organization with no integration row behaves *identically to today*: the same
`Deno.env` secrets, through the same code path, with no row anywhere. Nothing
changes until somebody opts in, and opting in badly falls back rather than fails.

It is also the correct product default. An institute that signs up on Tuesday
cannot have a verified WhatsApp Business account by Wednesday. Requiring one
before a single message sends would destroy activation. Tenants *grow into*
their own sender identity; they do not start there.

---

## 1. Deliverables index

| # | Deliverable | Where it lives |
|---|---|---|
| 1 | White label engine | `20260901_phase6a` PART 1 · `_shared/integrations.ts` |
| 2 | Custom domains | `domain_verifications` · `request_domain_verification()` |
| 3 | DNS verification | `domain-verify` edge fn (DNS-over-HTTPS) |
| 4 | SSL status | `domain-verify` action `ssl_status` — **observed, see §6** |
| 5 | Custom email providers | `resolveEmailCredentials()` — 7 providers |
| 6 | Email templates | `organization_email_templates` · `resolve_email_template()` |
| 7 | Branding marketplace | `20260901_phase6b` · `install_marketplace_item()` |
| 8 | Theme builder | `organization_themes` · `validate_theme_tokens()` |
| 9 | Certificate builder | `save_certificate_branding()` |
| 10 | Login experience | `public_branding_for_host()` |
| 11 | Portal branding | `branding_bundle()` · existing `OrganizationThemeProvider` |
| 12 | Live preview | `BrandingPage.tsx` Theme tab |
| 13 | Brand assets | `brand_assets` + Phase 4 org storage prefix |
| 14 | Multi-language | 6 languages on templates + certificates |
| 15 | Audit | `branding_audit` table + `branding_audit()` writer |
| 16 | Tenant isolation | §8 |
| 17 | Secret handling | §7 |
| 18 | Performance | §12 |
| 19 | Tests | `src/test/security/phase6.test.ts` — 50 gates |
| 20 | Provisioning integration | `provision_step_white_label` |
| 21 | Rollback | two paired `_rollback.sql` files |
| 22 | Verification report | §13 |

---

## 2. What was reused, not rebuilt

The instruction was explicit: *do not duplicate theme logic, email logic,
certificate logic, provisioning logic.* What Phase 6 did instead:

| Existing thing | How Phase 6 uses it |
|---|---|
| `_shared/brevo.ts` | Gained one **optional** third parameter. Every existing caller (invite-staff, payslips, fee receipts) is byte-for-byte unchanged and still reads `Deno.env`. |
| `send-email` / `send-aisensy` | Resolve credentials at the top, then run the same send. No parallel sender. |
| `message_queue` | Untouched. WhatsApp still drains through it. |
| `OrganizationThemeProvider` (Phase 4) | Consumes `organization_themes` tokens. No second theming path. |
| `reportWindow.ts` / certificate rendering | `save_certificate_branding()` writes config the *existing* renderer reads. |
| Phase 4 `provisioning_step_catalog` | Extended with one row (`white_label`, seq 165). No second provisioning path. |
| Phase 2 Secure Impersonation | The **only** way platform staff act on a tenant's branding — see §8. |
| Phase 5 plan entitlements | Gate the marketplace and custom domains. |

New tables: 9. New sender, queue, theme provider, certificate renderer or
provisioning engine: **zero**.

---

## 3. Credential resolution — the fallback ladder

`supabase/functions/_shared/integrations.ts` is the single resolver. It returns
platform credentials in **five** distinct situations:

1. no `organization_integrations` row at all;
2. `mode = 'platform'`;
3. `is_active = false`;
4. `verified_at IS NULL` — configured but never proven to work;
5. `mode = 'custom'`, verified, but the **secret is missing** from
   `organization_secrets`, or (for email) no sender address is set.

Case 5 is the one that matters most in practice. A half-configured SMTP that
threw instead of falling back would silently swallow a school's absence alerts —
messages queued, nothing delivered, nobody alerted. Every one of the five
returns `{ ...platform, reason }`, so the fallback is *logged* rather than
invisible.

```ts
function usesCustom(i: IntegrationRow | null): boolean {
  return !!i && i.mode === "custom" && i.is_active && !!i.verified_at;
}
```

The same ladder exists in SQL as `resolve_integration()`, for callers inside the
database.

**Provisioning writes the choice explicitly.** `provision_step_white_label`
inserts `('whatsapp','aisensy','platform')` and `('email','brevo','platform')`
for every new organization, rather than relying on the absence of a row. Support
can then *see* that a tenant is on platform credentials instead of inferring it.

---

## 4. Email providers

Seven, resolved by `resolveEmailCredentials()`:

| Provider | Mechanism | Secret key |
|---|---|---|
| Brevo | API (platform default) | `brevo_api_key` |
| SendGrid | API | `sendgrid_api_key` |
| Mailgun | API | `mailgun_api_key` |
| Amazon SES | API | `ses_api_key` |
| Custom SMTP | host/port/user | `smtp_password` |
| Google Workspace | SMTP profile | `smtp_password` |
| Microsoft 365 | SMTP profile | `smtp_password` |

Host, port, username, sender address and display name live in
`organization_integrations.config` (non-secret, tenant-readable). The password
or key never does — see §7.

---

## 5. Email templates & multi-language

`organization_email_templates` keyed `(organization_id, template_key, language)`,
where **`organization_id IS NULL` means the platform default**. `resolve_email_template()`
falls back organization override → platform default → English. So "use ours
unless you override" is a lookup, not a branch.

Languages: `en`, `ta`, `hi`, `kn`, `ml`, `te` (English, Tamil, Hindi, Kannada,
Malayalam, Telugu), enforced by CHECK constraint and offered in the UI in native
script.

**One subtlety worth recording.** The unique index is *total*, with
`NULLS NOT DISTINCT` (PG15+), not two partial indexes. Postgres can only infer a
**partial** index as an `ON CONFLICT` arbiter when the INSERT carries a WHERE
clause implying the predicate — and neither PostgREST's `.upsert()` nor the
seed's `INSERT … ON CONFLICT (cols)` emits one. The original two-partial-index
design would have failed at runtime with *"no unique or exclusion constraint
matching the ON CONFLICT specification"*, for both the seed and every template
save. The Phase 1E gate caught it; the gate's collector was then taught to
recognise unique indexes **and to deliberately not count partial ones**, so the
whole bug class is now covered rather than this one instance.

---

## 6. Domains, DNS and SSL — what is real and what is not

**Real.** `request_domain_verification()` issues an unguessable per-domain token
(`gen_random_bytes(16)`). The `domain-verify` edge function then queries DNS
over HTTPS against `cloudflare-dns.com/dns-query` and compares the *actual*
published records. Nothing is taken from the client. `check_email_dns` does the
same for SPF, DKIM and DMARC.

A tenant cannot claim any `smartark.ai` hostname — `request_domain_verification()`
rejects it. Without that, a tenant could stand up `platform.smartark.ai` as a
phishing surface that *we* host and serve a valid certificate for.

**Not real, and stated plainly rather than faked:**

- **Certificate issuance is not automated.** `ssl_status` *observes* — it fetches
  `https://{host}` and reports what the TLS handshake did. Verified DNS reports
  `ssl_status: "provisioning"`, never `"active"`. Issuing certificates requires a
  hosting-layer integration (Cloudflare for SaaS, or ACME at the edge) that does
  not exist yet.
- **SMTP is not handshaken.** Deno's edge runtime cannot open a raw TCP socket to
  port 587, so `test_smtp` validates API-key providers by calling their API and,
  for SMTP profiles, validates configuration shape and DNS only. The code says
  so in as many words.

A failed provider test **leaves the tenant on the platform sender**. A typo in
an API key must not stop a school's mail.

---

## 7. Secrets

`organization_secrets` has **RLS enabled, RLS forced, and zero policies**. That
is deny-all for every authenticated role; the service role — in practice, the
edge functions — is the only reader.

The reasoning: `organization_integrations` *is* tenant-readable, because an admin
needs to see which sender is configured. An API key in that table would be served
by PostgREST to every admin of the organization, and to anyone who later widens a
policy by accident. So the key is in a different table with no policy at all.

- What the UI shows instead: `hint` — `••••` plus the last four characters.
- What `branding_bundle()` returns: the integration **mode** and nothing else.
- What `public_branding_for_host()` returns (anon-callable): logo, colours, name.
  No integrations, no domains, no entitlements.
- `vault_secret_id` is reserved so the ciphertext can move to Supabase Vault
  later with no change at any call site.

A gate asserts no file under `src/` references `organization_secrets` in code.

---

## 8. Tenant isolation

Every Phase 6 table carries `organization_id` and a SELECT policy of
`organization_id = public.current_org_id()`. Writes additionally require
`has_any_role(ARRAY['admin','management'])`.

Deliberate asymmetries:

- **`marketplace_items`** (the catalogue) is readable by all authenticated users —
  it is our published content. **`marketplace_installs`** is org-scoped, because
  which branding a competitor uses is their business.
- **`organization_email_templates`** is readable where `organization_id = current_org_id()
  OR organization_id IS NULL` (so a tenant sees the platform defaults it inherits),
  but writable **only** where `organization_id = current_org_id()`. A tenant can
  read our defaults; it cannot edit them for everyone.
- **Platform staff have no bypass.** `domain-verify` originally accepted an
  `organizationId` from the request body for platform staff. That was removed:
  Phase 2's Secure Impersonation already places the tenant on the caller, so the
  body parameter was a second, unaudited path to the same capability. The Phase 1
  gate flagged it and the code was changed, not the gate.

---

## 9. Themes, certificates and input validation

Theme tokens are validated by a **BEFORE INSERT OR UPDATE trigger**, not by the
client:

- colours must match `^#[0-9a-fA-F]{6}$`;
- fonts are allow-listed (`system, inter, roboto, poppins, lora, sans, serif, mukta, noto`);
- component styles are allow-listed (`default, compact, floating, bordered, flat, elevated, pill, square`);
- **unknown keys are dropped, not stored.** An unvalidated key is a hole in the
  allow-list the moment the renderer learns to read it.

These values land in CSS custom properties, so validation is the boundary.
Certificate colours go through the same regex in `save_certificate_branding()`.

`organization_themes` has a partial unique index enforcing **one active theme per
organization**; `activate_theme()` flips atomically.

**HTML branding fields** (`email_header_html`, `report_header_html`,
`email_footer_html`) are stored but rendered **nowhere**. They need an allow-list
sanitiser first; rendering them before that exists is stored XSS reaching parents.
A gate fails the build if any component ever renders one through
`dangerouslySetInnerHTML`.

---

## 10. Marketplace

`install_marketplace_item()` **copies** the payload into the tenant's own rows.
It does not reference the catalogue item. Two reasons: a tenant's customisation
must survive us publishing v2, and an item we unpublish must not vanish from the
organizations already using it.

- Paid tiers are gated **in the database** against the plan, not in the UI.
- Only `admin` or `management` may install.
- Item kinds with no consumer yet are recorded as `installed, not yet used`
  rather than silently dropped.

Seeded items: theme packs, a certificate pack, and a warmer parent-facing email
pack.

---

## 11. Files

**Migrations** (both idempotent, both with paired rollbacks)
```
supabase/migrations/20260901_phase6a_white_label_core.sql            (+ _rollback)
supabase/migrations/20260901_phase6b_marketplace_and_defaults.sql    (+ _rollback)
```

**Edge functions**
```
supabase/functions/_shared/integrations.ts   NEW  resolve{Email,Whatsapp}Credentials
supabase/functions/_shared/brevo.ts          MOD  optional override param
supabase/functions/send-email/index.ts       MOD  per-org credential resolution
supabase/functions/send-aisensy/index.ts     MOD  per-ROW resolution + cache
supabase/functions/domain-verify/index.ts    NEW  DNS-over-HTTPS verification
```

**Frontend**
```
src/features/branding/pages/BrandingPage.tsx        5 tabs
src/features/branding/services/branding.service.ts
src/App.tsx                    /settings/branding + /settings/billing
src/core/navigation/menu.config.ts                  2 menu items
src/features/rbac/constants/catalog.ts              2 submodules
```

`BillingPage` (Phase 5) had never been routed. It is wired here alongside
`BrandingPage`, and both are registered in the RBAC catalog and menu config so
they appear in Manage Staff Role.

---

## 12. Performance

- **One RPC per portal boot.** `branding_bundle()` returns branding, assets,
  active theme, domains, integration modes and entitlements together — one round
  trip instead of six.
- **`public_branding_for_host()`** is a single indexed lookup on the domain host,
  callable before authentication so the login screen paints branded on first
  render.
- **`send-aisensy` caches per organization** (`orgCredsCache`) across a queue
  drain, so a 500-row batch spanning 3 organizations performs 3 credential
  resolutions, not 500.
- Both new pages are lazy chunks: `BrandingPage-BQV9pLdV.js`,
  `BillingPage-CElxVX2B.js`. The main bundle is unchanged and the build still
  prerenders 25 marketing routes.

---

## 13. Verification report

Everything below was executed. Nothing is asserted from reading the code alone.

| Gate | Result |
|---|---|
| `vitest run` (full suite) | **1144 passed, 0 failed**, 80 files |
| `phase6.test.ts` | **50 passed** |
| All security gates (phase0–6) | **357 passed**, 8 files |
| `tsc --noEmit -p tsconfig.app.json` | **527 errors — exactly baseline**, none in any Phase 6 file |
| `eslint .` | **15 errors / 282 warnings — errors at baseline** |
| `npm run build` | **succeeded**, 28.6s, 25 routes prerendered, both new chunks emitted |

### Bugs the gates caught during this phase

1. **Partial unique index could not serve as an `ON CONFLICT` arbiter**
   (Phase 1E gate). Every email-template save *and* the platform-default seed
   would have failed at runtime. Fixed to a total `NULLS NOT DISTINCT` index;
   the gate was then widened to cover the class.
2. **`domain-verify` accepted an organization id from the request body**
   (Phase 1 gate). Removed in favour of Secure Impersonation.

### Mutation testing — five deliberate regressions, each confirmed caught

| Mutation | Caught by |
|---|---|
| Drop `verified_at` from `usesCustom()` — unverified custom creds go live | *falls back to platform for EVERY non-custom case* |
| Add a read policy to `organization_secrets` | *organization_secrets has RLS enabled and NO policies* |
| `send-email` passes an override unconditionally | *passes an override ONLY for a custom sender* |
| Widen `org_themes_read` to `USING (true)` | *organization_themes is scoped to the caller's organization* |
| Restore the partial email-template index | *every organization_id-prefixed onConflict matches a real composite key* |

The theme-policy mutation **initially survived**: the gate's fixed-width window
ran past the end of the policy into the *next* one, whose scoping clause
satisfied the assertion. The window is now bounded at the statement terminator,
and the mutation is caught. Recording this because a gate that passes is not the
same as a gate that works.

### What has NOT been verified, and cannot be from here

- **The migrations have not been applied.** They are idempotent and additive by
  construction, and the SQL has not been executed against the live database.
- **No live send has used custom credentials** — no tenant has configured any.
  The fallback path (which is what ARK uses) is unchanged code on an unchanged
  path, but the custom path has been executed only in review, not in production.
- **DNS and SSL verification need a real domain.** The DoH queries are real code
  against a real resolver; no customer domain has been through the flow.
- **Certificate issuance does not exist** (§6).

---

## 14. Rollback

Both rollbacks are non-destructive by design.

- **6A refuses to run** while any organization has `mode = 'custom'` and active.
  Dropping then would silently divert that tenant's mail back to *our* sender —
  messages still send, from the wrong identity, and nobody notices. Loud refusal
  beats quiet misdelivery.
- **6A keeps** `branding_audit` (the trail must outlive the feature) and every
  column added to `organization_branding`.
- **6B keeps** the platform-default email templates. Without them
  `resolve_email_template()` returns nothing and transactional email stops for
  every tenant that never wrote its own.
- **6B removes the provisioning catalogue row first**, so no queued job invokes a
  handler that no longer exists.

---

## 15. Next

Phase 6 is complete and awaiting approval. Not started, and not implied by this
phase:

- automated certificate issuance (Cloudflare for SaaS or ACME at the edge);
- an HTML sanitiser, which is the precondition for rendering the branding HTML
  fields at all;
- a real SMTP handshake, which needs a runtime that can open port 587;
- consuming Phase 2/4 feature flags in the sidebar (still unconsumed).
