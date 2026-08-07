import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 3 GATES — PUBLIC WEBSITE & SELF-SERVICE ONBOARDING
//
// Phase 3 opens the front door. Two properties matter more than everything
// else on the page, and both are invisible in a screenshot:
//
//   1. Anonymous visitors can WRITE a form and can never READ one back.
//      A readable-back demo table is how a competitor enumerates your entire
//      sales pipeline with one curl.
//   2. Self-service provisioning requires a VERIFIED email. That single
//      ordering is what stops scripted mass-provisioning — and it only works
//      because Phase 0 stopped signups minting staff profiles.
// ══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
/** Rollback scripts live OUTSIDE supabase/migrations: `supabase db push` applies
 *  every .sql file in that directory in name order, so a co-located
 *  `*_rollback.sql` would run immediately after the migration it undoes. */
const ROLLBACKS = join(ROOT, "supabase", "rollback");
const MARKETING = join(ROOT, "src", "features", "marketing");
const FUNCTIONS = join(ROOT, "supabase", "functions");

const read = (p: string) => readFileSync(p, "utf8");
const P3A = "20260815_phase3a_marketing_and_onboarding.sql";
const sql = read(join(MIGRATIONS, P3A));

const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");
const stripDynamicSql = (s: string) => s.replace(/'[^']*%[IL][^']*'/g, "''");
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

/** All `CREATE POLICY … TO … anon …` statements, as (table, cmd, roles). */
function anonPolicies(): { table: string; cmd: string }[] {
  const body = stripDynamicSql(stripSqlComments(sql));
  const out: { table: string; cmd: string }[] = [];
  const re = /CREATE POLICY\s+\S+\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)\s+TO\s+([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (/\banon\b/.test(m[3])) out.push({ table: m[1], cmd: m[2].toUpperCase() });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("THE CORE INVARIANT — anonymous writes are never readable back", () => {
  it("demand-capture tables give anon INSERT and never SELECT", () => {
    const capture = ["platform_demo_requests", "platform_enquiries", "marketing_events"];
    for (const t of capture) {
      const pols = anonPolicies().filter((p) => p.table === t);
      expect(pols.length, `${t} has no anon policy at all`).toBeGreaterThan(0);
      const cmds = pols.map((p) => p.cmd);
      expect(cmds, `${t} grants anon INSERT`).toContain("INSERT");
      expect(cmds, `${t} lets anon read submissions back`).not.toContain("SELECT");
      expect(cmds, `${t} grants anon ALL`).not.toContain("ALL");
    }
  });

  it("trial signups have NO anon policy at all", () => {
    // Even an INSERT would let anyone forge funnel records and, worse, probe
    // which emails are already registered. Only the edge function writes here.
    expect(anonPolicies().filter((p) => p.table === "platform_trial_signups")).toEqual([]);
  });

  it("anon reads are limited to published or public data", () => {
    const readable = anonPolicies().filter((p) => p.cmd === "SELECT").map((p) => p.table);
    const allowed = new Set([
      "content_posts", "content_authors", "content_categories",
      "status_components", "status_incidents", "plans", "plan_prices", "plan_features",
    ]);
    const unexpected = readable.filter((t) => !allowed.has(t));
    expect(unexpected, `anon can read: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("unpublished content is not readable by anon", () => {
    const pol = sql.slice(sql.indexOf("CREATE POLICY content_posts_public_read"));
    expect(pol.slice(0, 300)).toMatch(/USING \(is_published AND/);
  });

  it("only PUBLIC plans are exposed — negotiated plans stay hidden", () => {
    const pol = sql.slice(sql.indexOf("CREATE POLICY plans_anon_read"));
    expect(pol.slice(0, 200)).toMatch(/is_public AND is_active/);
  });
});

describe("The signup round-trip can actually complete", () => {
  // Signup depends on the browser picking the session out of the URL GoTrue
  // redirects back to. The client had `detectSessionInUrl: false` — correct for
  // the staff ERP, and silently fatal once self-serve signup shipped: the
  // confirmation link established no session, so the wizard could not tell a
  // verified user from a new one and "I have verified" dropped people back to
  // step 1. No organization could ever be created.
  const client = read(join(ROOT, "src/integrations/supabase/client.ts"));
  const page = read(join(ROOT, "src/features/marketing/pages/SignupPage.tsx"));

  it("the Supabase client reads the session out of the redirect URL", () => {
    expect(client).toMatch(/detectSessionInUrl:\s*true/);
  });

  it("signUp asks GoTrue to come back to /signup", () => {
    expect(page).toMatch(/emailRedirectTo:\s*`\$\{window\.location\.origin\}\/signup`/);
  });

  it("the verify step re-checks the session instead of blindly reloading", () => {
    // A reload discards wizard state; if the session is not there yet the mount
    // check falls through to step 1, which is what looked like a broken button.
    // Comments are stripped: the code explains the old behaviour by naming it.
    const code = stripTsComments(page);
    const verify = code.slice(code.indexOf('step === "verify"'));
    expect(verify.slice(0, 2000)).not.toMatch(/window\.location\.reload\(\)/);
    expect(verify.slice(0, 2000)).toMatch(/resume\(\)/);
  });

  it("a still-unverified re-check tells the user, rather than resetting", () => {
    expect(page).toMatch(/We still cannot see a verified session/);
  });

  it("the session arriving late still advances the wizard", () => {
    // The URL exchange resolves asynchronously and can land after mount.
    expect(page).toMatch(/onAuthStateChange/);
  });

  it("a reload mid-signup resumes on the verify step, not an empty form", () => {
    expect(page).toMatch(/PENDING_EMAIL_KEY/);
    expect(page).toMatch(/sessionStorage\.setItem\(PENDING_EMAIL_KEY/);
  });

  it("a failed confirmation link is explained, not swallowed", () => {
    // GoTrue reports failures in the URL FRAGMENT (#error=…&error_code=…).
    // Reading it in a useState initialiser matters: detectSessionInUrl strips
    // the fragment once supabase-js has looked at it, so an effect is too late.
    expect(page).toMatch(/window\.location\.hash/);
    expect(page).toMatch(/otp_expired/);
  });

  it("an already-registered email is reported instead of promising an email", () => {
    // GoTrue will not error for an existing account — it returns a decoy user
    // with identities: [] and sends nothing, to avoid user enumeration. Showing
    // "Check your email" there is a dead end with no recovery.
    expect(page).toMatch(/identities\?\.length \?\? 0\) === 0/);
    expect(page).toMatch(/An account already exists/);
  });

  it("a confirmed signup that has not named its organization is not stranded", () => {
    // `isAuthenticated` means "holds a profiles row". A confirmed signup has
    // none — Phase 0's handle_new_user() deliberately creates no profile for a
    // signup carrying no staff role — so RootRoute saw "signed out" and served
    // the MARKETING PAGE to someone who had just logged in successfully.
    // Reads as a silent login failure, with no route back to the wizard.
    const root = read(join(ROOT, "src/core/routing/RootRoute.tsx"));
    expect(root).toMatch(/hasSession/);
    expect(root).toMatch(/Navigate to="\/signup"/);
    // The flag must be real, not assumed present on the context.
    const ctx = read(join(ROOT, "src/contexts/AuthContext.tsx"));
    expect(ctx).toMatch(/hasSession: boolean/);
    expect(ctx).toMatch(/hasSession: !!session/);
  });

  it("the pending-signup redirect cannot fire before identity resolves", () => {
    // If it ran while the profile/parent lookups were still in flight, every
    // ARK staff member would be bounced to /signup on each hard refresh.
    const root = read(join(ROOT, "src/core/routing/RootRoute.tsx"));
    const loadingGuard = root.indexOf("if (loading)");
    const pendingRedirect = root.indexOf('Navigate to="/signup"');
    expect(loadingGuard).toBeGreaterThan(-1);
    expect(loadingGuard, "loading guard must precede the pending-signup redirect")
      .toBeLessThan(pendingRedirect);
    // And `loading` must actually cover the parent lookup, not just the profile.
    const ctx = read(join(ROOT, "src/contexts/AuthContext.tsx"));
    expect(ctx).toMatch(/noProfile && parentQuery\.isLoading/);
  });

  it("a profile-less session is never force-signed-out", () => {
    // AuthContext used to signOut() any session that mapped to neither a staff
    // profile nor a parent account. Self-serve signup creates exactly that
    // shape on purpose — handle_new_user() gives a signup with no staff role no
    // profile — so this destroyed the session moments after login and made
    // provisioning impossible for EVERY new customer. It presented as "login
    // does nothing", and no fix to the wizard could help, because the wizard
    // was handed a signed-out client.
    //
    // Safe to remove, verified against the live database: such a session reads
    // zero rows from every business table (is_staff() is false, and every
    // tenant policy carries a role check on top of the organization conjunct).
    const ctx = stripTsComments(read(join(ROOT, "src/contexts/AuthContext.tsx")));
    // The only legitimate signOut is the explicit logout() the user asks for.
    const signOuts = [...ctx.matchAll(/supabase\.auth\.signOut\(\)/g)];
    expect(signOuts.length, "unexpected signOut() in AuthContext").toBe(1);
    const logoutFn = ctx.slice(ctx.indexOf("const logout"));
    expect(logoutFn).toMatch(/supabase\.auth\.signOut\(\)/);
    // And nothing may eject a session merely for lacking a profile.
    expect(ctx).not.toMatch(/No profile or parent account/);
  });

  it("a role with no home route still cannot loop at /", () => {
    // Defence in depth behind the above: profiles.role is a DB string, so a
    // value outside ROLE_HOME_ROUTE would resolve home to "/" and bounce
    // between RootRoute and AuthRedirect forever.
    const redirect = read(join(ROOT, "src/core/routing/AuthRedirect.tsx"));
    expect(redirect).toMatch(/home === "\/"/);
    expect(redirect).toMatch(/Navigate to="\/signup"/);
  });
});

describe("Self-service onboarding", () => {
  const fn = read(join(FUNCTIONS, "public-onboarding", "index.ts"));

  it("refuses to provision without a verified email", () => {
    // The single check that stops scripted mass-provisioning.
    expect(fn).toMatch(/if \(!user\.email_confirmed_at\)/);
    expect(fn).toMatch(/email_unverified/);
  });

  it("verifies the token against GoTrue, never a local decode", () => {
    expect(fn).toMatch(/authClient\.auth\.getUser\(token\)/);
    expect(stripTsComments(fn)).not.toMatch(/atob\s*\(/);
  });

  it("allows only one organization per account through the public funnel", () => {
    expect(fn).toMatch(/already belongs to an organization/);
  });

  it("reuses the Phase 1D provisioning engine rather than creating tables", () => {
    expect(fn).toMatch(/rpc\("provision_organization"/);
    expect(fn).toMatch(/rpc\("provision_organization_admin"/);
    // A public endpoint writing directly to organizations would bypass both
    // the readiness guard and the seeded defaults.
    expect(stripTsComments(fn)).not.toMatch(/from\("organizations"\)\s*\.insert/);
  });

  it("blocks reserved slugs and disposable email domains server-side", () => {
    expect(fn).toMatch(/RESERVED_SLUGS/);
    expect(fn).toMatch(/DISPOSABLE/);
  });

  it("the signup wizard sends NO role in user metadata", () => {
    // Phase 0 made handle_new_user() create a profile only for an explicit
    // staff role. Passing one here would hand every visitor a staff account
    // and undo that fix from the front end.
    const page = read(join(MARKETING, "pages", "SignupPage.tsx"));
    const signUpCall = page.slice(page.indexOf("supabase.auth.signUp"), page.indexOf("if (signUpErr)"));
    expect(signUpCall).not.toMatch(/role\s*:/);
  });

  it("forces re-authentication after provisioning", () => {
    // The session token was issued BEFORE the membership existed, so it holds
    // no organization claim — without a fresh token the new admin sees zero rows.
    expect(fn).toMatch(/requiresReauth: true/);
    const page = read(join(MARKETING, "pages", "SignupPage.tsx"));
    expect(page).toMatch(/supabase\.auth\.signOut\(\)/);
  });
});

describe("Demo organization is read-only", () => {
  it("wraps WRITE policies only, leaving reads intact", () => {
    const block = sql.slice(sql.indexOf("PART 5"));
    expect(block).toMatch(/p\.cmd IN \('INSERT','UPDATE','DELETE','ALL'\)/);
    expect(block).toMatch(/NOT public\.is_demo_org\(\)/);
  });

  it("snapshots policies before wrapping so rollback is a restore", () => {
    // Same discipline as Phase 1C. Regex-unpicking a wrapper off live
    // authorization expressions is how a rule gets silently corrupted.
    const block = sql.slice(sql.indexOf("PART 5"));
    expect(block).toMatch(/INSERT INTO public\.tenancy_policy_backup/);
    expect(block.indexOf("tenancy_policy_backup")).toBeLessThan(block.indexOf("ALTER POLICY"));
  });

  it("the rollback refuses to run while a demo tenant is live", () => {
    const rb = read(join(ROLLBACKS, P3A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Refusing to remove the demo write-guard/);
  });
});

describe("Analytics collects nothing identifying", () => {
  it("the events table has no IP, user agent or cookie column", () => {
    // Comments are stripped first: the migration DOCUMENTS the omission
    // ("Deliberately NO ip_address, NO user_agent…"), and a gate that fails on
    // the explanation teaches people to delete the explanation.
    const clean = stripSqlComments(sql);
    const create = clean.slice(clean.indexOf("CREATE TABLE IF NOT EXISTS public.marketing_events"));
    const body = create.slice(0, create.indexOf(");"));
    for (const forbidden of ["ip_address", "user_agent", "cookie", "session_id", "visitor_id", "fingerprint"]) {
      expect(body, `marketing_events stores ${forbidden}`).not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("the client sends no identifier either", () => {
    const svc = read(join(MARKETING, "services", "marketing.service.ts"));
    const track = svc.slice(svc.indexOf("async trackEvent"));
    expect(track).not.toMatch(/navigator\.userAgent/);
    expect(track).not.toMatch(/document\.cookie/);
    expect(track).not.toMatch(/localStorage/);
  });

  it("no third-party analytics script is loaded", () => {
    const offenders: string[] = [];
    for (const f of walk(MARKETING)) {
      const src = stripTsComments(read(f));
      if (/googletagmanager|google-analytics|gtag\(|facebook\.net|hotjar|segment\.com|mixpanel/i.test(src)) {
        offenders.push(f.replace(ROOT, ""));
      }
    }
    expect(offenders, `third-party trackers found: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("SEO", () => {
  const seo = read(join(MARKETING, "seo", "seo.ts"));
  const prerender = read(join(ROOT, "scripts", "prerender-marketing.mjs"));
  const routes = read(join(MARKETING, "routes.tsx"));

  it("every marketing route has metadata", () => {
    const declared = [...routes.matchAll(/path="(\/[a-z-]*)"/g)]
      .map((m) => m[1])
      .filter((p) => !p.includes(":"));
    const missing = declared.filter((p) => !seo.includes(`"${p}":`));
    expect(missing, `routes with no SEO entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("funnel pages are noindex", () => {
    for (const p of ["/signup", "/welcome"]) {
      const entry = seo.slice(seo.indexOf(`"${p}":`), seo.indexOf(`"${p}":`) + 400);
      expect(entry, `${p} is indexable`).toMatch(/noindex:\s*true/);
    }
  });

  it("the prerenderer reads seo.ts rather than keeping its own copy", () => {
    // Two lists would drift, and the failure is silent: a wrong title in a
    // shared link, invisible on the page itself.
    expect(prerender).toMatch(/seo\.ts/);
    expect(prerender).toMatch(/ROUTE_SEO/);
  });

  it("the prerenderer refuses to run if it parses nothing", () => {
    expect(prerender).toMatch(/refusing to continue/i);
  });

  it("emits Open Graph, Twitter Card and canonical per route", () => {
    for (const tag of ["og:title", "og:image", "twitter:card", "rel=\"canonical\""]) {
      expect(prerender, `prerender omits ${tag}`).toContain(tag);
    }
  });

  it("robots.txt disallows every authenticated surface", () => {
    for (const p of ["/platform", "/admin", "/management", "/coordinator", "/teacher", "/parent", "/impersonate"]) {
      expect(prerender, `robots.txt allows ${p}`).toContain(`Disallow: ${p}`);
    }
  });

  it("the sitemap excludes noindex routes", () => {
    expect(prerender).toMatch(/filter\(\(p\) => !routes\[p\]\.noindex\)/);
  });

  it("build runs the prerenderer", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json")));
    expect(pkg.scripts.build).toContain("prerender-marketing");
  });

  // This gate used to assert `cleanUrls: true`, on the belief that Vercel needed
  // it to serve dist/features/index.html at /features. It does not — that is a
  // DIRECTORY INDEX, resolved natively. cleanUrls instead redirects every .html
  // path to its extensionless form, which made /index.html unservable and broke
  // the SPA fallback for every non-prerendered route in production.
  //
  // So the gate was not merely useless, it PROTECTED the outage: the correct
  // config failed CI. Asserting the real requirement — the prerenderer emits
  // directory indexes — instead of the mechanism someone assumed it implied.
  it("the prerenderer emits directory indexes, which Vercel serves without cleanUrls", () => {
    expect(prerender).toMatch(/writeFileSync\(join\(outDir, "index\.html"\), html\)/);
    expect(prerender).toMatch(/mkdirSync\(outDir, \{ recursive: true \}\)/);
  });

  it("the marketing shells are reachable without shadowing the app shell", () => {
    // Vercel checks the filesystem before rewrites, so a prerendered file wins
    // over the catch-all and the catch-all covers everything else. Both halves
    // have to hold: no cleanUrls, and a fallback that still points at a real file.
    const v = JSON.parse(read(join(ROOT, "vercel.json")));
    expect(v.cleanUrls ?? false).toBe(false);
    expect(v.rewrites?.find((r: { source: string }) => r.source === "/(.*)")?.destination)
      .toBe("/index.html");
  });
});

describe("Accessibility & UX basics", () => {
  const shell = read(join(MARKETING, "components", "MarketingShell.tsx"));

  it("provides a skip-to-content link", () => {
    expect(shell).toMatch(/Skip to content/);
    expect(shell).toMatch(/id="main"/);
  });

  it("the mobile menu button is labelled and reports state", () => {
    expect(shell).toMatch(/aria-label=\{open \? "Close menu" : "Open menu"\}/);
    expect(shell).toMatch(/aria-expanded=\{open\}/);
  });

  it("the pricing billing toggle is a real switch", () => {
    // Satisfied EITHER by the shared Radix <Switch> — which renders
    // role="switch" plus aria-checked itself, and is now what the page uses —
    // or by a hand-rolled control that sets both attributes explicitly.
    //
    // The page previously hand-rolled it, and the thumb was positioned
    // `absolute` with no horizontal anchor: it laid out from the button's
    // centre and translate-x threw it outside the track, over the "Annual"
    // label. The primitive centres with flex and reserves the travel with
    // border-2, so there is no absolute positioning to get wrong.
    const pricing = read(join(MARKETING, "pages", "PricingPage.tsx"));
    const usesPrimitive =
      /import \{ Switch \} from "@\/components\/ui\/switch"/.test(pricing) &&
      /<Switch\b[\s\S]{0,300}?checked=\{yearly\}/.test(pricing);
    const handRolled =
      /role="switch"/.test(pricing) && /aria-checked=\{yearly\}/.test(pricing);
    expect(usesPrimitive || handRolled, "billing toggle is not an accessible switch").toBe(true);
    // Either way it must be labelled — the control has no visible text of its own.
    expect(pricing).toMatch(/aria-label="Toggle annual billing"/);
  });

  it("a hand-rolled switch thumb is never positioned without a horizontal anchor", () => {
    // The exact regression: `absolute top-… h-5 w-5 … translate-x-[22px]` with
    // no left/right/inset. Cheap to re-introduce, and it looks fine at rest —
    // the thumb only escapes the track in the ON state.
    const pricing = read(join(MARKETING, "pages", "PricingPage.tsx"));
    for (const m of pricing.matchAll(/className=\{cn\(([\s\S]{0,300}?)\)\}/g)) {
      const cls = m[1];
      if (!/\babsolute\b/.test(cls) || !/translate-x-/.test(cls)) continue;
      expect(cls, "absolutely positioned thumb has no left/right/inset anchor")
        .toMatch(/\b(left-|right-|inset-)/);
    }
  });

  it("comparison tables have captions and row headers", () => {
    const pricing = read(join(MARKETING, "pages", "PricingPage.tsx"));
    expect(pricing).toMatch(/<caption className="sr-only">/);
    expect(pricing).toMatch(/scope="row"/);
  });

  it("the decorative dashboard mock is hidden from screen readers", () => {
    // Repointed from DashboardPreview.tsx, which LiveDashboard replaced. The
    // property is unchanged and the requirement is stronger than before: it is
    // now asserted against the component that actually renders, so renaming
    // the file again cannot quietly leave the gate reading a stale one.
    const preview = read(join(MARKETING, "components", "LiveDashboard.tsx"));
    expect(preview).toMatch(/aria-hidden="true"/);
    // The mock invents figures. It must say so on the page, not only in a
    // source comment — this line is what keeps illustrative numbers from
    // reading as customer data.
    expect(preview).toMatch(/not customer data/i);
  });
});

describe("Honesty about what is not built", () => {
  it("marketplace and developers are marked coming soon", () => {
    const product = read(join(MARKETING, "pages", "ProductPages.tsx"));
    expect(product).toMatch(/MarketplacePage[\s\S]{0,400}ComingSoon/);
    expect(product).toMatch(/DevelopersPage[\s\S]{0,400}ComingSoon/);
  });

  it("the pricing page states that unbuilt modules are unavailable", () => {
    const pricing = read(join(MARKETING, "pages", "PricingPage.tsx"));
    expect(pricing).toMatch(/still in development/);
  });

  it("the security page does not claim certifications we lack", () => {
    const product = read(join(MARKETING, "pages", "ProductPages.tsx"));
    const sec = product.slice(product.indexOf("SecurityPage"));
    expect(sec).toMatch(/not yet SOC 2 or ISO 27001 certified/);
  });
});

describe("ERP and platform are untouched", () => {
  it("Phase 3 alters no tenant table except adding is_demo to organizations", () => {
    const body = stripDynamicSql(stripSqlComments(sql));
    const alters = [...body.matchAll(/ALTER TABLE public\.(\w+)/gi)].map((m) => m[1]);
    const unexpected = alters.filter(
      (t) => t !== "organizations" && !t.startsWith("platform_") && !t.startsWith("content_")
        && !t.startsWith("status_") && !["marketing_events", "plans", "plan_prices", "plan_features"].includes(t),
    );
    expect(unexpected, `unexpected ALTER TABLE: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("every new platform table is excluded from tenant scoping", () => {
    // Migration 1B iterates pg_catalog and adds organization_id to everything
    // is_tenant_scoped_table() does not exclude. A platform table left out of
    // that list would get `organization_id NOT NULL DEFAULT current_org_id()`
    // on the next 1B re-run — and anonymous visitors have no organization, so
    // every page-view insert would fail a NOT NULL violation, silently.
    const excl = sql.slice(sql.indexOf("SELECT _table NOT IN"));
    const listed = new Set([...excl.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

    const created = [...stripSqlComments(sql).matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)]
      .map((m) => m[1]);
    expect(created.length).toBeGreaterThan(5);

    const missing = created.filter((t) => !listed.has(t));
    expect(missing, `platform tables missing from is_tenant_scoped_table: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("Phase 3 deletes nothing", () => {
    const body = stripSqlComments(sql);
    expect(/\bTRUNCATE\b/i.test(body)).toBe(false);
    expect(/\bDELETE FROM\b/i.test(body)).toBe(false);
    expect(/DROP COLUMN/i.test(body)).toBe(false);
    expect(/DROP TABLE/i.test(body)).toBe(false);
  });

  it("AuthRedirect behaviour is preserved for signed-in users", () => {
    const root = read(join(ROOT, "src", "core", "routing", "RootRoute.tsx"));
    expect(root).toMatch(/return <AuthRedirect \/>/);
    // A signed-in customer must never see the marketing page flash on refresh.
    expect(root).toMatch(/if \(loading\) return <Splash \/>/);
  });

  it("marketing routes are separate from sharedRoutes and platform routes", () => {
    const shared = read(join(ROOT, "src", "core", "routing", "sharedRoutes.tsx"));
    expect(shared).not.toMatch(/marketing/i);
    const platform = read(join(ROOT, "src", "features", "platform", "routes.tsx"));
    expect(platform).not.toMatch(/marketing/i);
  });

  it("marketing pages never import ERP or platform services", () => {
    const offenders: string[] = [];
    for (const f of walk(join(MARKETING, "pages"))) {
      const src = stripTsComments(read(f));
      if (/@\/features\/(platform|students|fee|payroll|attendance|exams|leads)\//.test(src)) {
        // The RBAC module catalogue is a shared CONSTANT, not a service, and is
        // deliberately reused so the module list cannot drift from the product.
        if (!/@\/features\/rbac\/constants\/catalog/.test(src)) offenders.push(f.replace(ROOT, ""));
      }
    }
    expect(offenders, `marketing imports ERP internals: ${offenders.join(", ")}`).toEqual([]);
  });

  it("earlier phase gates still exist", () => {
    for (const f of ["phase0.test.ts", "phase1.test.ts", "phase1e.test.ts", "phase2.test.ts"]) {
      expect(existsSync(join(__dirname, f)), `${f} was removed`).toBe(true);
    }
  });
});

describe("Rollback", () => {
  it("exists and restores from the policy backup", () => {
    const rb = join(ROLLBACKS, P3A.replace(".sql", "_rollback.sql"));
    expect(existsSync(rb)).toBe(true);
    expect(read(rb)).toMatch(/FROM public\.tenancy_policy_backup/);
  });

  it("does not drop the is_demo column", () => {
    // The one irreversible act this file could commit.
    const rb = read(join(ROLLBACKS, P3A.replace(".sql", "_rollback.sql")));
    expect(rb).not.toMatch(/DROP COLUMN is_demo/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LANDING REDESIGN GATES
//
// The redesign added a design-token stylesheet and an animation library to a
// repo whose portals are explicitly out of scope. Both are leak risks that
// produce no error when they leak:
//
//   • Vite concatenates all imported CSS into ONE global sheet. A rule that
//     escapes `.mk-root` retheme the admin, teacher and parent portals silently.
//   • Importing `motion` instead of `m` reinstates Framer Motion's full bundle
//     in the initial chunk, which nothing fails on — it just gets slower.
// ══════════════════════════════════════════════════════════════════════════════

describe("Marketing design system stays inside the marketing tree", () => {
  const css = read(join(MARKETING, "styles", "marketing.css"));

  it("declares no custom property outside the --mk- namespace", () => {
    const props = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]);
    const foreign = [...new Set(props)].filter((p) => !p.startsWith("--mk-"));
    expect(
      foreign,
      `these would overwrite app-wide tokens and retheme every portal: ${foreign.join(", ")}`,
    ).toEqual([]);
  });

  it("scopes every rule under .mk-root", () => {
    // Strip comments, at-rules and their braces, then check each selector.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...withoutComments.matchAll(/(^|\})\s*([^{}@]+)\{/g)]
      .map((m) => m[2].trim())
      .filter(Boolean)
      // Keyframe steps (`from`, `to`, `0%`, `50%, 100%`) are not selectors.
      .filter((s) => !/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(s));

    const escaped = selectors.filter((sel) =>
      sel.split(",").some((one) => !one.includes(".mk-root")),
    );
    expect(
      escaped,
      `unscoped selectors leak into the portals: ${escaped.join(" | ")}`,
    ).toEqual([]);
  });

  it("the layout applies the .mk-root scope", () => {
    // Without this class every token above resolves to nothing and the public
    // site silently loses its styling.
    const shell = read(join(MARKETING, "components", "MarketingShell.tsx"));
    expect(shell).toMatch(/className="mk-root/);
    expect(shell).toMatch(/import "\.\.\/styles\/marketing\.css"/);
  });

  it("honours prefers-reduced-motion for the infinite CSS animations", () => {
    // Framer Motion's reducedMotion setting never sees these — they are pure
    // CSS loops that would otherwise run forever.
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("mk-marquee-track");
    expect(block).toContain("mk-float");
    expect(block).toContain("animation: none !important");
  });
});

describe("Marketing motion stays cheap", () => {
  const marketingFiles = walk(MARKETING);

  it("uses LazyMotion's `m` rather than `motion`", () => {
    // `motion.div` statically pulls the whole feature set into the initial
    // chunk (~34 kB gz) and defeats the LazyMotion split entirely.
    const offenders = marketingFiles.filter((f) =>
      /\bmotion\.[a-z]/.test(stripTsComments(read(f))),
    );
    expect(
      offenders.map((f) => f.replace(ROOT, "")),
      "use <m.div> from ../components/motion, not <motion.div>",
    ).toEqual([]);
  });

  it("imports framer-motion only through the motion module", () => {
    // Two files may name the library: motion.tsx (the primitives) and
    // motionFeatures.ts (the code-split boundary). Anywhere else and the
    // component escapes MotionConfig, so prefers-reduced-motion stops applying
    // to it — the failure is silent and only affects the people it hurts.
    const posix = (p: string) => p.split("\\").join("/");
    const allowed = ["components/motion.tsx", "components/motionFeatures.ts"];
    const offenders = marketingFiles.filter(
      (f) =>
        /from "framer-motion"/.test(read(f)) &&
        !allowed.some((a) => posix(f).endsWith(a)),
    );
    expect(offenders.map((f) => f.replace(ROOT, "")), "import from ./motion instead").toEqual([]);
  });

  it("loads the animation features as a separate chunk", () => {
    const motion = read(join(MARKETING, "components", "motion.tsx"));
    const features = read(join(MARKETING, "components", "motionFeatures.ts"));

    // Must point at the boundary module. A dynamic import("framer-motion")
    // here would collapse into motion.tsx's own static import of the same
    // specifier — Rollup cannot put one module in two chunks — and the whole
    // feature set silently rejoins the eager bundle. Build output confirms the
    // split: motionFeatures lands in its own ~4.6 kB gzipped chunk.
    expect(motion).toMatch(/import\("\.\/motionFeatures"\)/);
    expect(motion).not.toMatch(/import\("framer-motion"\)/);
    expect(motion).toMatch(/reducedMotion="user"/);

    // The boundary only works while that file pulls in nothing else — one
    // extra import drags its whole graph into the lazy chunk.
    const imports = [...features.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["framer-motion"]);
    expect(features).toMatch(/domAnimation as default/);
  });

  it("every scroll reveal fires once", () => {
    // Re-animating on scroll-back makes a page unusable for anyone who scrolls
    // up to re-read something, and it is the fastest way to look cheap.
    const motion = read(join(MARKETING, "components", "motion.tsx"));
    const inViewCalls = [...motion.matchAll(/useInView\([^)]*\)/g)].map((m) => m[0]);
    expect(inViewCalls.length).toBeGreaterThan(2);
    for (const call of inViewCalls) {
      expect(call, `useInView without once: ${call}`).toContain("once: true");
    }
  });
});

describe("Landing page is mobile-first and reachable", () => {
  const files = walk(MARKETING);

  it("no fixed pixel width can force horizontal scroll", () => {
    // A `w-[420px]` on a 375px screen produces a horizontally scrolling page,
    // which is the single most common mobile defect on a desktop-led design.
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of stripTsComments(read(f)).matchAll(/\bw-\[(\d+)px\]/g)) {
        if (Number(m[1]) > 320) offenders.push(`${f.replace(ROOT, "")}: ${m[0]}`);
      }
    }
    expect(offenders, `fixed widths wider than the smallest supported screen`).toEqual([]);
  });

  it("the mobile drawer keeps its actions reachable", () => {
    const shell = read(join(MARKETING, "components", "MarketingShell.tsx"));
    // Sticky footer inside a scrollable sheet — otherwise the CTAs sit below
    // a long link list and are unreachable without scrolling a menu.
    expect(shell).toMatch(/sticky bottom-0/);
    // iOS home-indicator inset, or the last button sits under the gesture bar.
    expect(shell).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("the mega menu is operable by keyboard", () => {
    const shell = read(join(MARKETING, "components", "MarketingShell.tsx"));
    expect(shell).toMatch(/aria-expanded=\{open\}/);
    expect(shell).toMatch(/aria-haspopup/);
    expect(shell).toMatch(/e\.key === "Escape"/);
  });

  it("interactive marketing controls carry a visible focus ring", () => {
    const ui = read(join(MARKETING, "components", "ui.tsx"));
    expect(ui).toMatch(/focus-visible:ring-2/);
  });
});

describe("Hero headline stays stable and readable", () => {
  const hero = read(join(MARKETING, "components", "Hero.tsx"));
  const css = read(join(MARKETING, "styles", "marketing.css"));

  it("the CSS width sizer matches the longest rotating word", () => {
    // If ROTATING gains a longer word and the sizer is not updated, the
    // headline starts reflowing on every rotation — a CLS regression that is
    // invisible in review and only shows up in field data.
    const list = hero.slice(hero.indexOf("const ROTATING"), hero.indexOf("];", hero.indexOf("const ROTATING")));
    const words = [...list.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(words.length).toBeGreaterThan(2);
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a));

    const sizer = css.match(/\.mk-word-sizer::before \{[^}]*content:\s*"([^"]+)"/);
    expect(sizer, ".mk-word-sizer::before has no content declaration").toBeTruthy();
    expect(
      sizer![1].length,
      `sizer "${sizer![1]}" is narrower than the longest word "${longest}"`,
    ).toBeGreaterThanOrEqual(longest.length);
  });

  it("reserves that width with a pseudo-element, not a duplicate node", () => {
    // A hidden <span> works visually but its text joins document.textContent,
    // so the H1 read "…admissionsadmissions on one platform" to crawlers.
    // Measured in a headless browser, not assumed.
    expect(hero).toContain("mk-word-sizer");
    expect(hero).not.toMatch(/aria-hidden[\s\S]{0,80}ROTATING\.reduce/);
  });
});

describe("Navigation overlays escape the header's containing block", () => {
  const shell = read(join(MARKETING, "components", "MarketingShell.tsx"));
  const css = read(join(MARKETING, "styles", "marketing.css"));

  // Both defects below had ONE cause: the sticky header sets backdrop-blur, and
  // an element with a backdrop-filter becomes the containing block for its
  // fixed-position descendants AND breaks a descendant's own backdrop-filter.
  // Neither produces an error — the menu just renders wrong.

  it("the mobile drawer is portalled out of the header", () => {
    // Rendered inside <header>, `fixed inset-x-0 top-16 bottom-0` resolved
    // against the header's 64px box instead of the viewport, so the sheet
    // collapsed to a sliver and the menu looked like it never opened.
    expect(shell).toMatch(/import \{ createPortal \} from "react-dom"/);
    expect(shell).toMatch(/createPortal\(/);
    expect(shell).toMatch(/document\.body,\s*\n\s*\)\}/);
  });

  it("the portalled drawer re-applies the .mk-root token scope", () => {
    // The portal lands outside the layout's .mk-root, where every --mk-* token
    // resolves to nothing: the drawer keeps its layout and silently loses its
    // radii, shadows and easing.
    const portal = shell.slice(shell.indexOf("createPortal("), shell.indexOf("document.body,"));
    expect(portal).toMatch(/className="mk-root"/);
  });

  it("the mega menu panel is opaque, not glass", () => {
    // A navigation menu sits over arbitrary article text. At 0.72 alpha — and
    // with its backdrop-filter neutralised by the header's — the body copy
    // underneath showed straight through the labels.
    const menu = shell.slice(shell.indexOf("const MegaMenu"), shell.indexOf("// ── Header"));
    expect(menu).toMatch(/bg-popover/);
    expect(menu, "mega menu must not use translucent glass").not.toMatch(/mk-glass/);
  });

  it("glass degrades to an opaque fill where backdrop-filter is unsupported", () => {
    const glass = css.slice(css.indexOf(".mk-root .mk-glass"));
    // The base rule must be opaque; translucency only inside @supports.
    expect(glass.slice(0, 200)).toMatch(/background:\s*hsl\(var\(--card\)\)/);
    expect(glass).toMatch(/@supports \(\(backdrop-filter/);
  });

  it("no fixed-position element is rendered inside the blurred header", () => {
    // The general form of the bug, so the next overlay added to the header
    // fails here instead of shipping broken.
    const header = shell.slice(shell.indexOf("const Header"), shell.indexOf("// ── Footer"));
    const beforePortal = header.slice(0, header.indexOf("createPortal("));
    expect(
      /className=\{?["`][^"`]*\bfixed\b/.test(beforePortal),
      "a fixed element inside the backdrop-blurred header positions against the header, not the viewport",
    ).toBe(false);
  });
});
