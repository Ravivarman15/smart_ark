import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 6 GATES — WHITE LABEL
//
// Three properties carry the risk, and none is visible on a settings screen:
//
//   1. PLATFORM CREDENTIALS BY DEFAULT. Every existing tenant — ARK included —
//      must keep sending exactly as before. A regression here silently changes
//      who a school's parents receive messages from.
//   2. SECRETS ARE NEVER TENANT-READABLE. organization_secrets has RLS enabled
//      and ZERO policies; a single policy added by mistake exposes every
//      customer's API key over PostgREST.
//   3. BRANDING INPUT IS VALIDATED. Colours land in CSS custom properties and
//      HTML fields would land in a parent-facing email.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const SRC = join(ROOT, "src");

const read = (p: string) => readFileSync(p, "utf8");
const P6A = "20260901_phase6a_white_label_core.sql";
const P6B = "20260901_phase6b_marketplace_and_defaults.sql";
const a = read(join(MIGRATIONS, P6A));
const b = read(join(MIGRATIONS, P6B));

const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");
const stripDynamicSql = (s: string) => s.replace(/'[^']*%[IL][^']*'/g, "''");
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Memoised src/ traversal — three gates walk it and vitest runs them in parallel. */
let _files: string[] | null = null;
function allSourceFiles(): string[] {
  if (_files) return _files;
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(SRC);
  _files = out;
  return out;
}

const integrations = read(join(FUNCTIONS, "_shared", "integrations.ts"));
const brevo = read(join(FUNCTIONS, "_shared", "brevo.ts"));
const sendEmail = read(join(FUNCTIONS, "send-email", "index.ts"));
const sendAisensy = read(join(FUNCTIONS, "send-aisensy", "index.ts"));
const domainVerify = read(join(FUNCTIONS, "domain-verify", "index.ts"));

// ─────────────────────────────────────────────────────────────────────────────
describe("INVARIANT 1 — platform credentials by default", () => {
  it("falls back to platform for EVERY non-custom case", () => {
    // No row, mode=platform, inactive, unverified, or a missing secret — each
    // must fall back. A half-configured custom SMTP must never silently
    // swallow a school's absence alerts.
    const fn = integrations.slice(integrations.indexOf("function usesCustom"));
    expect(fn.slice(0, 400)).toMatch(
      /i\.mode === "custom" && i\.is_active && !!i\.verified_at/,
    );
    expect(integrations).toMatch(/"no integration configured"/);
    expect(integrations).toMatch(/custom SMTP password missing/);
    expect(integrations).toMatch(/custom AiSensy key missing/);
    expect(integrations).toMatch(/custom integration has no sender address/);
    // Every one of those exits returns the PLATFORM object, not a partial.
    const exits = [...integrations.matchAll(/return \{ \.\.\.platform, reason:/g)];
    expect(exits.length).toBeGreaterThanOrEqual(5);
  });

  it("sendBrevoEmail's override is OPTIONAL — existing callers unchanged", () => {
    // invite-staff, payroll payslips and every other existing send must keep
    // working with no edit at all.
    expect(brevo).toMatch(/override\?: \{ apiKey\?: string; senderEmail\?: string; senderName\?: string \}/);
    expect(brevo).toMatch(/override\?\.apiKey \?\? Deno\.env\.get\("BREVO_API_KEY"\)/);
    expect(brevo).toMatch(/override\?\.senderEmail \?\? Deno\.env\.get\("SENDER_EMAIL"\)/);
  });

  it("send-email passes an override ONLY for a custom sender", () => {
    // Passing a half-resolved override for a platform send would bypass the
    // env defaults and break every existing tenant.
    expect(sendEmail).toMatch(/creds\.mode === "custom"[\s\S]{0,200}?: undefined/);
  });

  it("send-email takes the organization from the VERIFIED caller, not the body", () => {
    // A body-supplied org would let one tenant send under another's verified
    // sender identity.
    expect(sendEmail).toMatch(/resolveEmailCredentials\(supabase, gate\.caller\.organizationId\)/);
    expect(stripTsComments(sendEmail)).not.toMatch(/body\.organizationId|body\?\.organization_id/);
  });

  it("send-aisensy resolves per ROW and keeps the platform key as fallback", () => {
    // The queue spans organizations; one key for the whole drain would send a
    // tenant's messages from another tenant's WhatsApp account.
    expect(sendAisensy).toMatch(/resolveWhatsappCredentials\(supabase, rowOrg\)/);
    expect(sendAisensy).toMatch(/apiKey: rowCreds\.apiKey \|\| apiKey/);
    expect(sendAisensy).toMatch(/orgCredsCache/);
  });

  it("provisioning seeds every new organization onto PLATFORM credentials", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.provision_step_white_label"));
    expect(fn).toMatch(/'whatsapp', 'aisensy', 'platform'/);
    expect(fn).toMatch(/'email',\s+'brevo',\s+'platform'/);
  });

  it("resolve_integration returns platform when unverified", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.resolve_integration"));
    expect(fn.slice(0, 1400)).toMatch(
      /i\.mode = 'platform' OR NOT i\.is_active OR i\.verified_at IS NULL/,
    );
  });

  it("a failed provider test leaves the tenant on the platform sender", () => {
    // Otherwise a typo in an API key silently stops a school's mail.
    const block = domainVerify.slice(domainVerify.indexOf("} else {"), domainVerify.indexOf('action === "ssl_status"'));
    expect(block).toMatch(/mode: "platform"/);
    expect(block).toMatch(/stay on ours until it verifies/);
  });
});

describe("INVARIANT 2 — secrets are never tenant-readable", () => {
  it("organization_secrets has RLS enabled and NO policies", () => {
    // RLS on + zero policies = deny-all to every authenticated role. Only the
    // service role (the edge functions) can read it.
    expect(a).toMatch(/organization_secrets/);
    expect(a).toMatch(/organization_secrets gets NO POLICY AT ALL/);
    const policies = [...a.matchAll(/CREATE POLICY \w+ ON public\.organization_secrets/g)];
    expect(policies, "a policy was added to organization_secrets").toEqual([]);
  });

  it("it is in the FORCE RLS loop", () => {
    const loop = a.slice(a.indexOf("FOREACH t IN ARRAY ARRAY[\n    'organization_integrations','organization_secrets'"));
    expect(loop.slice(0, 600)).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("resolve_integration returns config but NEVER a secret", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.resolve_integration"),
                       a.indexOf("PART 2 — DOMAINS"));
    expect(fn).not.toMatch(/organization_secrets/);
  });

  it("branding_bundle exposes the MODE only", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.branding_bundle"),
                       b.indexOf("PUBLIC branding for a hostname"));
    expect(fn).toMatch(/'mode', CASE WHEN i\.mode = 'custom'/);
    expect(fn).not.toMatch(/organization_secrets/);
    expect(fn).not.toMatch(/api_key|password/i);
  });

  it("no client code reads organization_secrets", () => {
    // Comments naming the table are fine — and the branding service has one
    // explaining precisely why it does not query it. Strip them, then look
    // for real code.
    const offenders = allSourceFiles()
      .filter((p) => !p.includes(join("test", "security")))
      .filter((p) => /organization_secrets/.test(stripTsComments(read(p))))
      .map((p) => p.replace(ROOT, ""));
    expect(offenders, `client reads secrets: ${offenders.join(", ")}`).toEqual([]);
  }, 20_000);

  it("only a hint is stored for display, never the value", () => {
    expect(domainVerify).toMatch(/hint: `••••\$\{secretValue\.slice\(-4\)\}`/);
  });

  it("the public login-branding RPC exposes no configuration", () => {
    // It is callable by anon. An unauthenticated caller must learn nothing
    // about how the tenant is set up.
    const fn = b.slice(b.indexOf("FUNCTION public.public_branding_for_host"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    for (const leak of ["integrations", "organization_secrets", "domains", "entitlements"]) {
      expect(body, `public branding leaks ${leak}`).not.toMatch(new RegExp(`'${leak}'`));
    }
  });
});

describe("INVARIANT 3 — branding input is validated", () => {
  it("theme tokens are validated by a trigger before storage", () => {
    expect(a).toMatch(/FUNCTION public\.validate_theme_tokens/);
    expect(a).toMatch(/BEFORE INSERT OR UPDATE ON public\.organization_themes/);
    expect(a).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/);
  });

  it("unknown token keys are DROPPED, not stored", () => {
    // An unvalidated key becomes a hole in the allow-list the moment the
    // renderer learns to read it.
    const fn = a.slice(a.indexOf("FUNCTION public.validate_theme_tokens"));
    expect(fn.slice(0, 2500)).toMatch(/Unknown keys are DROPPED/);
    expect(fn.slice(0, 2500)).toMatch(/ELSE\s*\n\s*--[\s\S]{0,200}?CONTINUE;/);
  });

  it("fonts and styles are allow-listed", () => {
    expect(a).toMatch(/'system','inter','roboto','poppins','lora','sans','serif','mukta','noto'/);
    expect(a).toMatch(/'default','compact','floating','bordered','flat','elevated','pill','square'/);
  });

  it("certificate colours are validated too", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.save_certificate_branding"));
    expect(fn.slice(0, 1200)).toMatch(/\^#\[0-9a-fA-F\]\{6\}\$/);
  });

  it("HTML branding fields are still rendered NOWHERE", () => {
    // They need an allowlist sanitiser. Rendering them before that exists is
    // stored XSS reaching parents.
    const offenders = allSourceFiles()
      .filter((p) => !p.includes(join("test", "security")))
      .filter((p) => {
        const src = stripTsComments(read(p));
        return /dangerouslySetInnerHTML/.test(src)
          && /email_header_html|report_header_html|email_footer_html/.test(src);
      })
      .map((p) => p.replace(ROOT, ""));
    expect(offenders, `unsanitised branding HTML rendered: ${offenders.join(", ")}`).toEqual([]);
  }, 20_000);

  it("a tenant cannot claim a smartark.ai hostname", () => {
    // Otherwise a tenant could stand up "platform.smartark.ai" as a phishing
    // surface that we host.
    const fn = a.slice(a.indexOf("FUNCTION public.request_domain_verification"));
    expect(fn).toMatch(/smartark\.ai/);
    expect(fn).toMatch(/managed by the platform/);
  });
});

describe("Tenant isolation of branding", () => {
  it.each([
    "organization_integrations", "brand_assets", "organization_themes",
    "domain_verifications", "branding_audit",
  ])("%s is scoped to the caller's organization", (t) => {
    // Match on the TABLE, not the policy name — a renamed policy must not
    // quietly drop the table out of this gate. Stop at the statement
    // terminator: a fixed-width window runs into the NEXT policy, whose
    // scoping clause would satisfy the assertion for a policy that lost its
    // own. (That exact mutation survived this gate before the bound.)
    const m = new RegExp(`CREATE POLICY \\w+ ON public\\.${t}\\s+FOR SELECT[\\s\\S]*?;`)
      .exec(a);
    expect(m, `no SELECT policy found on ${t}`).not.toBeNull();
    expect(m![0]).toMatch(/organization_id = public\.current_org_id\(\)/);
  });

  it("marketplace INSTALLS are per-tenant, unlike the catalogue", () => {
    // Which branding a competitor uses is their business.
    const pol = b.slice(b.indexOf("CREATE POLICY marketplace_installs_read"));
    expect(pol.slice(0, 300)).toMatch(/organization_id = public\.current_org_id\(\)/);
  });

  it("email templates expose platform defaults but only own overrides are writable", () => {
    const readPol = a.slice(a.indexOf("CREATE POLICY org_email_templates_read"));
    expect(readPol.slice(0, 400)).toMatch(/organization_id IS NULL/);
    const writePol = a.slice(a.indexOf("CREATE POLICY org_email_templates_write"));
    expect(writePol.slice(0, 400)).toMatch(/organization_id = public\.current_org_id\(\)/);
    expect(writePol.slice(0, 400)).not.toMatch(/organization_id IS NULL/);
  });

  it("domain-verify refuses to act on another organization's domain", () => {
    expect(domainVerify).toMatch(/Domain belongs to another organization/);
  });
});

describe("Marketplace", () => {
  it("installing COPIES the payload rather than referencing it", () => {
    // A tenant's customisation must survive our publishing v2, and an item we
    // unpublish must not vanish from the organizations using it.
    expect(b).toMatch(/COPIES the payload into the tenant's own rows/);
    const fn = b.slice(b.indexOf("FUNCTION public.install_marketplace_item"));
    expect(fn).toMatch(/INSERT INTO public\.organization_themes/);
    // No FK from the tenant's theme back to the catalogue row.
    expect(fn).not.toMatch(/REFERENCES public\.marketplace_items/);
  });

  it("paid tiers are gated by the PLAN, in the database", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.install_marketplace_item"));
    expect(fn).toMatch(/IF it\.tier <> 'free' THEN/);
    expect(fn).toMatch(/Your plan does not include this item/);
  });

  it("only admin or management may install", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.install_marketplace_item"));
    expect(fn.slice(0, 900)).toMatch(/has_any_role\(ARRAY\['admin','management'\]\)/);
  });

  it("kinds with no consumer are stored, not silently dropped", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.install_marketplace_item"));
    expect(fn).toMatch(/installed, not yet used/);
  });
});

describe("Domain verification is real", () => {
  it("queries DNS over HTTPS rather than trusting the client", () => {
    expect(domainVerify).toMatch(/cloudflare-dns\.com\/dns-query/);
    expect(domainVerify).toMatch(/application\/dns-json/);
  });

  it("uses an unguessable per-domain token", () => {
    // Without it, anyone could point a CNAME at us and claim a hostname.
    const fn = a.slice(a.indexOf("FUNCTION public.request_domain_verification"));
    expect(fn).toMatch(/encode\(gen_random_bytes\(16\), 'hex'\)/);
  });

  it("verified DNS does NOT claim an active certificate", () => {
    expect(domainVerify).toMatch(/ssl_status: allVerified \? "provisioning" : "pending"/);
  });

  it("SSL status is observed, not assumed", () => {
    const block = domainVerify.slice(domainVerify.indexOf('action === "ssl_status"'));
    expect(block).toMatch(/Observe rather than assume/);
    expect(block).toMatch(/fetch\(`https:\/\/\$\{domain\.host\}/);
  });

  it("says plainly that certificate issuance is not automated", () => {
    expect(domainVerify).toMatch(/Certificate ISSUANCE is not performed here/);
  });

  it("SMTP testing does not fake a handshake it cannot perform", () => {
    // Deno's edge runtime cannot open a raw socket to port 587.
    expect(domainVerify).toMatch(/cannot open a raw TCP socket/);
    expect(domainVerify).toMatch(/A live SMTP handshake is not possible from this runtime/);
  });
});

describe("ERP and platform are untouched", () => {
  it("Phase 6 alters no tenant table", () => {
    for (const [name, sql] of [[P6A, a], [P6B, b]] as const) {
      const body = stripDynamicSql(stripSqlComments(sql));
      const alters = [...body.matchAll(/ALTER TABLE public\.(\w+)/gi)].map((m) => m[1]);
      const bad = alters.filter(
        (t) => !t.startsWith("organization_") && !t.startsWith("brand_")
          && !t.startsWith("domain_") && !t.startsWith("marketplace_")
          && !t.startsWith("branding_"),
      );
      expect(bad, `${name} alters tenant tables: ${bad.join(", ")}`).toEqual([]);
    }
  });

  it("Phase 6 truncates nothing and drops no column", () => {
    for (const [name, sql] of [[P6A, a], [P6B, b]] as const) {
      const body = stripSqlComments(sql);
      expect(/\bTRUNCATE\b/i.test(body), `${name} truncates`).toBe(false);
      expect(/DROP COLUMN/i.test(body), `${name} drops a column`).toBe(false);
      expect(/DROP TABLE/i.test(body), `${name} drops a table`).toBe(false);
    }
  });

  it("new tables are excluded from tenant scoping", () => {
    const excl = a.slice(a.indexOf("SELECT _table NOT IN"));
    for (const t of ["organization_integrations", "organization_secrets", "brand_assets",
                     "organization_themes", "domain_verifications",
                     "organization_email_templates", "marketplace_items",
                     "marketplace_installs", "branding_audit"]) {
      expect(excl, `${t} missing from is_tenant_scoped_table`).toContain(`'${t}'`);
    }
  });

  it("extends the Phase 4 provisioning catalogue rather than forking it", () => {
    expect(b).toMatch(/INSERT INTO public\.provisioning_step_catalog/);
    expect(b).toMatch(/'white_label'/);
  });

  it("earlier phase gates still exist", () => {
    for (const f of ["phase0.test.ts", "phase1.test.ts", "phase1e.test.ts", "phase2.test.ts",
                     "phase3.test.ts", "phase4.test.ts", "phase5.test.ts"]) {
      expect(existsSync(join(__dirname, f)), `${f} was removed`).toBe(true);
    }
  });
});

describe("Rollbacks", () => {
  it.each([P6A, P6B])("%s has a paired rollback", (m) => {
    expect(existsSync(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")))).toBe(true);
  });

  it("the 6A rollback refuses while any tenant uses custom credentials", () => {
    // Dropping then would silently divert their mail back to OUR sender —
    // messages still send, from the wrong identity, and nobody notices.
    const rb = read(join(ROLLBACKS, P6A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Refusing to drop white-label core/);
    expect(rb).toMatch(/silently start sending from our sender/);
  });

  it("the 6B rollback keeps the platform email defaults", () => {
    // Without them, resolve_email_template returns nothing and transactional
    // email silently stops for every tenant that never wrote its own.
    const rb = read(join(ROLLBACKS, P6B.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Platform-default email templates[\s\S]{0,120}?are KEPT/);
  });

  it("the 6A rollback keeps branding columns and the audit trail", () => {
    const rb = read(join(ROLLBACKS, P6A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/branding_audit is KEPT/);
    expect(rb).toMatch(/Columns added to organization_branding[\s\S]{0,80}?are KEPT/);
  });

  it("the 6B rollback removes the provisioning step first", () => {
    // Otherwise a queued job invokes a handler that no longer exists.
    const rb = read(join(ROLLBACKS, P6B.replace(".sql", "_rollback.sql")));
    expect(rb.indexOf("provisioning_step_catalog"))
      .toBeLessThan(rb.indexOf("DROP TABLE"));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE SIGN-IN SCREEN IS NOT ONE CUSTOMER'S
//
// Login is the highest-traffic unauthenticated page in the product and the one
// place every tenant's staff and parents look at daily. It hardcoded ARK's logo
// and name, which meant every new customer typed their password under a
// competitor's brand, and the platform's own domain advertised one customer to
// every prospect. Nothing failed — it just quietly stopped being a SaaS.
// ══════════════════════════════════════════════════════════════════════════════

describe("Login is tenant-neutral", () => {
  const login = readFileSync(
    join(__dirname, "..", "..", "pages", "Login.tsx"), "utf8",
  );
  const code = login.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("imports no tenant-specific asset", () => {
    expect(code, "login imports a specific customer's logo file").not.toMatch(/from "@\/assets\//);
    expect(code).not.toMatch(/arkLogo/);
  });

  it("hardcodes no tenant name in rendered output", () => {
    // The platform's own name is fine and expected; a customer's is not.
    expect(code, "a customer name is hardcoded on the sign-in screen")
      .not.toMatch(/ARK Learning Arena|Institutional Intelligence System/);
  });

  it("resolves branding from the hostname before authentication", () => {
    expect(code).toMatch(/public_branding_for_host/);
    expect(code).toMatch(/window\.location\.hostname/);
  });

  it("falls back to the PLATFORM on any failure, never to a tenant", () => {
    // An unreachable lookup means we do not know whose door this is. Defaulting
    // to the last-known tenant would show a stranger someone else's brand.
    const fallback = code.slice(code.indexOf("catch {"), code.indexOf("finally"));
    expect(fallback).toMatch(/setBranding\(null\)/);
    expect(code).toMatch(/name:\s*"Smart ARK"/);
  });

  it("offers self-serve signup on the platform host, and not inside a tenant", () => {
    // A trial link on a customer's own portal is an invitation for their staff
    // to leave; on the platform domain its absence is a dead end.
    expect(code).toMatch(/!isTenant[\s\S]{0,400}to="\/signup"/);
  });

  it("cannot paint an unvalidated colour into the page", () => {
    // primary_color is tenant-controlled input reaching a style attribute.
    // hexToHslTriple returns null for anything that is not #rrggbb.
    expect(code).toMatch(/hexToHslTriple/);
    expect(code).toMatch(/if \(primary\) style\["--primary"\]/);
  });

  it("keeps the authentication call unchanged", () => {
    // This page was restyled, not rewired. If these three lines move, the
    // change stopped being cosmetic and needs a different review.
    expect(code).toMatch(/const success = await login\(email, password\)/);
    expect(code).toMatch(/navigate\("\/"\)/);
    expect(code).toMatch(/Invalid credentials\. Please try again\./);
  });

  it("the white-label opt-out is entitlement-gated in the database", () => {
    // powered_by_hidden is a plain boolean column; the RPC ANDs it with the
    // plan's allow_white_label so a tenant cannot remove attribution by
    // editing a row on a plan that does not include it.
    const fn = b.slice(b.indexOf("FUNCTION public.public_branding_for_host"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/powered_by_hidden[\s\S]{0,200}allow_white_label/);
  });
});
