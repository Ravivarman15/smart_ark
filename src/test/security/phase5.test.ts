import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 5 GATES — BILLING & RAZORPAY
//
// Billing bugs are money bugs. Four properties carry essentially all the risk,
// and none of them is visible in the UI:
//
//   1. NOTHING is activated from the frontend. A checkout success callback
//      runs in the customer's browser and can be forged in one line.
//   2. Webhook signatures are verified over the RAW body, in constant time.
//   3. Webhooks are IDEMPOTENT. Razorpay retries; a double-activation or a
//      double-refund is real money.
//   4. Suspension NEVER deletes. It is a status, and it reverses instantly.
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
const P5A = "20260825_phase5a_billing_core.sql";
const P5B = "20260825_phase5b_billing_lifecycle.sql";
const a = read(join(MIGRATIONS, P5A));
const b = read(join(MIGRATIONS, P5B));

const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");
const stripDynamicSql = (s: string) => s.replace(/'[^']*%[IL][^']*'/g, "''");
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const webhook = read(join(FUNCTIONS, "razorpay-webhook", "index.ts"));
const checkout = read(join(FUNCTIONS, "billing-checkout", "index.ts"));
const rzpLib = read(join(FUNCTIONS, "_shared", "razorpay.ts"));

// ─────────────────────────────────────────────────────────────────────────────
describe("INVARIANT 1 — nothing activates from the frontend", () => {
  it("the checkout function never activates a subscription", () => {
    // billing-checkout runs with the caller's identity and returns data to a
    // browser. If it could activate, a crafted request would be free service.
    const code = stripTsComments(checkout);
    expect(code).not.toMatch(/rpc\("activate_subscription"/);
    expect(code).not.toMatch(/rpc\("restore_organization"/);
    expect(code).not.toMatch(/status:\s*["']active["']/);
  });

  it("verify_payment explicitly reports activated:false", () => {
    // A valid signature proves the handshake, NOT that money settled. Saying
    // otherwise is how a customer gets an active badge with no payment.
    const block = checkout.slice(checkout.indexOf('action === "verify_payment"'));
    expect(block).toMatch(/activated:\s*false/);
  });

  it("only the webhook calls activate_subscription", () => {
    const callers: string[] = [];
    for (const d of readdirSync(FUNCTIONS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const f = join(FUNCTIONS, d.name, "index.ts");
      if (!existsSync(f)) continue;
      if (/rpc\("activate_subscription"/.test(stripTsComments(read(f)))) callers.push(d.name);
    }
    expect(callers).toEqual(["razorpay-webhook"]);
  });

  it("the tenant billing service cannot activate either", () => {
    const svc = stripTsComments(read(join(SRC, "features", "billing", "services", "billing.service.ts")));
    expect(svc).not.toMatch(/activate_subscription|restore_organization/);
  });

  // Explicit timeout: this gate walks the whole src/ tree, and under
  // full-suite parallel load it exceeded vitest's 5s default. A gate that
  // flakes intermittently is a gate someone eventually disables.
  it("the browser never sees the Razorpay key SECRET", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        // Skip the security tests: they necessarily NAME the identifier they
        // forbid, and a gate that flags its own assertion teaches people to
        // delete the assertion.
        if (p.includes(join("test", "security"))) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /RAZORPAY_KEY_SECRET|keySecret/.test(read(p))) {
          offenders.push(p.replace(ROOT, ""));
        }
      }
    };
    walk(SRC);
    expect(offenders, `key secret referenced in client code: ${offenders.join(", ")}`).toEqual([]);
  }, 20_000);
});

describe("INVARIANT 2 — signature verification", () => {
  it("hashes the RAW body, never a re-serialised object", () => {
    // JSON.stringify(JSON.parse(x)) is not byte-identical to x — key order and
    // whitespace change, and the HMAC will never match.
    expect(webhook).toMatch(/const raw = await req\.text\(\)/);
    expect(webhook).toMatch(/verifyWebhookSignature\(raw,/);
    const code = stripTsComments(webhook);
    expect(code).not.toMatch(/verifyWebhookSignature\(JSON\.stringify/);
  });

  it("compares in constant time", () => {
    // `===` on hex leaks the signature a byte at a time under timing analysis.
    expect(rzpLib).toMatch(/export function timingSafeEqual/);
    expect(rzpLib).toMatch(/diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/);
    const verify = rzpLib.slice(rzpLib.indexOf("export async function verifyWebhookSignature"));
    expect(verify.slice(0, 1200)).toMatch(/timingSafeEqual\(expected, signature\)/);
  });

  it("rejects an unsigned or wrongly-signed request with 401", () => {
    expect(webhook).toMatch(/if \(!valid\)/);
    expect(webhook).toMatch(/jsonResponse\(401, \{ error: "Invalid signature" \}\)/);
  });

  it("refuses to run at all without a configured webhook secret", () => {
    // Answering 200 while unconfigured would make Razorpay discard real events.
    expect(webhook).toMatch(/Webhook not configured/);
    expect(webhook).toMatch(/jsonResponse\(500/);
  });

  it("uses HMAC-SHA256, matching Razorpay's scheme", () => {
    expect(rzpLib).toMatch(/name: "HMAC", hash: "SHA-256"/);
  });
});

describe("INVARIANT 3 — idempotency", () => {
  it("the event id is UNIQUE", () => {
    expect(a).toMatch(/UNIQUE \(provider, provider_event_id\)/);
  });

  it("a duplicate delivery is acknowledged without re-processing", () => {
    expect(webhook).toMatch(/duplicate key\|unique/);
    expect(webhook).toMatch(/jsonResponse\(200, \{ ok: true, duplicate: true \}\)/);
  });

  it("the raw payload is stored BEFORE it is acted on", () => {
    // A handler bug must leave a replayable record, not a lost event.
    const insertIdx = webhook.indexOf('from("billing_webhook_events").insert');
    const switchIdx = webhook.indexOf("switch (eventType)");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(switchIdx);
  });

  it("payments and refunds upsert on the provider id", () => {
    expect(webhook).toMatch(/onConflict: "provider,provider_payment_id"/);
    expect(webhook).toMatch(/onConflict: "provider,provider_refund_id"/);
    expect(a).toMatch(/UNIQUE \(provider, provider_payment_id\)/);
    expect(a).toMatch(/UNIQUE \(provider, provider_refund_id\)/);
  });

  it("a processing failure returns 5xx so Razorpay retries", () => {
    const tail = webhook.slice(webhook.indexOf("} catch (e) {"));
    expect(tail).toMatch(/markProcessed\("failed"/);
    expect(tail).toMatch(/jsonResponse\(500/);
  });
});

describe("INVARIANT 4 — suspension never deletes", () => {
  it("suspend_organization only changes status", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.suspend_organization"),
                       b.indexOf("FUNCTION public.restore_organization"));
    expect(/\bDELETE FROM\b/i.test(stripSqlComments(fn))).toBe(false);
    expect(/\bTRUNCATE\b/i.test(fn)).toBe(false);
    expect(fn).toMatch(/status = 'suspended'/);
  });

  it("restoration is a single status change", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.restore_organization"));
    expect(fn.slice(0, 900)).toMatch(/status = 'active'/);
    expect(fn.slice(0, 900)).toMatch(/suspended_at = NULL/);
  });

  it("enforcement reuses the snapshot-then-wrap technique", () => {
    const part = a.slice(a.indexOf("PART 6"));
    expect(part).toMatch(/INSERT INTO public\.tenancy_policy_backup/);
    expect(part).toMatch(/NOT public\.is_org_suspended\(\)/);
    expect(part.indexOf("tenancy_policy_backup")).toBeLessThan(part.indexOf("ALTER POLICY"));
  });

  it("billing tables are NOT wrapped, so a suspended tenant can still pay", () => {
    // If suspension hid the billing page, the customer could not settle the
    // invoice that lifts it — which would make suspension self-defeating.
    const part = a.slice(a.indexOf("PART 6"));
    expect(part).toMatch(/is_tenant_scoped_table\(p\.tablename\)/);
    const excl = a.slice(a.indexOf("SELECT _table NOT IN"));
    for (const t of ["invoices", "payments", "subscriptions", "billing_profiles"]) {
      expect(excl, `${t} is not excluded from tenant scoping`).toContain(`'${t}'`);
    }
  });

  it("grace precedes suspension — never an immediate cut-off", () => {
    const fn = b.slice(b.indexOf("FUNCTION public.mark_payment_failed"));
    expect(fn.slice(0, 1200)).toMatch(/status = 'past_due'/);
    expect(fn.slice(0, 1200)).toMatch(/grace_until/);
    expect(fn.slice(0, 1200)).not.toMatch(/'suspended'/);
  });
});

describe("GST & invoicing", () => {
  it("invoice numbers come from a locked sequence table, not a count", () => {
    // count(*)+1 breaks under concurrency and again after a void; a Postgres
    // SEQUENCE leaks on rollback, which is the gap GST forbids.
    // Bound to THIS function: the migration contains count(*) elsewhere, and
    // an unbounded slice would be testing the rest of the file.
    const start = a.indexOf("FUNCTION public.next_invoice_number");
    const fn = a.slice(start, a.indexOf("$$;", start));
    expect(fn).toMatch(/INSERT INTO public\.invoice_sequences/);
    expect(fn).toMatch(/DO UPDATE SET last_number = public\.invoice_sequences\.last_number \+ 1/);
    expect(fn).not.toMatch(/count\(\*\)/);
  });

  it("numbering is scoped per organization and financial year", () => {
    expect(a).toMatch(/PRIMARY KEY \(organization_id, financial_year\)/);
    expect(a).toMatch(/FUNCTION public\.financial_year/);
  });

  it("a number is drawn only at ISSUANCE, so drafts create no gaps", () => {
    const issue = b.slice(b.indexOf("FUNCTION public.issue_invoice"));
    expect(issue).toMatch(/number := public\.next_invoice_number\(_org\)/);
  });

  it("CGST/SGST vs IGST is decided by state code, not state name", () => {
    // Matching "Tamilnadu" against "Tamil Nadu" is how tax gets computed wrong.
    const fn = a.slice(a.indexOf("FUNCTION public.compute_gst"));
    expect(fn).toMatch(/bp\.state_code IS NOT DISTINCT FROM supplier_state/);
    expect(fn).toMatch(/'cgst_sgst'/);
    expect(fn).toMatch(/'igst'/);
  });

  it("CGST and SGST are half the rate each", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.compute_gst"));
    expect(fn).toMatch(/cgst := round\(_taxable \* _rate \/ 200\.0, 2\)/);
    expect(fn).toMatch(/sgst := round\(_taxable \* _rate \/ 200\.0, 2\)/);
    expect(fn).toMatch(/igst := round\(_taxable \* _rate \/ 100\.0, 2\)/);
  });

  it("handles export, SEZ and reverse charge as distinct treatments", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.compute_gst"));
    for (const t of ["export", "sez", "reverse_charge"]) {
      expect(fn, `${t} treatment missing`).toContain(`'${t}'`);
    }
  });

  it("money is numeric, never float", () => {
    expect(a).toMatch(/amount\s+numeric\(14,2\)/);
    expect(/amount\s+(float|double precision|real)/i.test(a)).toBe(false);
  });

  it("amounts convert to paise in exactly one place", () => {
    expect(rzpLib).toMatch(/export const toMinorUnits/);
    // Ad-hoc `* 100` at a call site is how a rupee goes missing.
    const checkoutCode = stripTsComments(checkout);
    expect(checkoutCode).not.toMatch(/amount:\s*\w+\s*\*\s*100/);
  });
});

describe("Usage limits", () => {
  it("absolute limits are enforced by a database trigger", () => {
    // A limit enforced only in the UI is a suggestion — PostgREST is one fetch away.
    expect(a).toMatch(/FUNCTION public\.enforce_plan_limit/);
    expect(a).toMatch(/BEFORE INSERT ON public\.%I/);
  });

  it("metered credits never block — they bill as overage", () => {
    // Cutting off a school's absence alerts mid-term to enforce a message
    // quota is the wrong trade every time.
    const fn = a.slice(a.indexOf("FUNCTION public.enforce_plan_limit"));
    const metrics = fn.slice(0, fn.indexOf("lim := public.plan_limit"));
    expect(metrics).toMatch(/WHEN 'students' THEN 'students'/);
    expect(metrics).not.toMatch(/'whatsapp'/);
    expect(metrics).not.toMatch(/'email'/);
  });

  it("NULL limit means unlimited and short-circuits", () => {
    const fn = a.slice(a.indexOf("FUNCTION public.enforce_plan_limit"));
    expect(fn).toMatch(/IF lim IS NULL THEN RETURN NEW/);
  });
});

describe("ARK is protected", () => {
  it("is pinned to the internal plan with a far-future period end", () => {
    const part = b.slice(b.indexOf("PART 6"));
    expect(part).toMatch(/slug = 'ark'/);
    expect(part).toMatch(/code = 'internal'/);
    expect(part).toMatch(/CURRENT_DATE \+ 3650/);
  });

  it("the internal plan has no limits, so the triggers are inert for ARK", () => {
    const seed = read(join(MIGRATIONS, "20260810_phase2c_plans_and_commerce.sql"));
    expect(seed).toMatch(/\('internal','Internal'[\s\S]{0,200}?NULL,NULL,NULL,NULL/);
  });

  it("the lifecycle sweep cannot pick ARK up", () => {
    // It looks for current_period_end < CURRENT_DATE; ARK's is a decade out.
    const fn = b.slice(b.indexOf("FUNCTION public.run_billing_lifecycle"));
    expect(fn).toMatch(/current_period_end < CURRENT_DATE/);
  });
});

describe("ERP and platform are untouched", () => {
  it("Phase 5 alters no tenant table", () => {
    for (const [name, sql] of [[P5A, a], [P5B, b]] as const) {
      const body = stripDynamicSql(stripSqlComments(sql));
      const alters = [...body.matchAll(/ALTER TABLE public\.(\w+)/gi)].map((m) => m[1]);
      const allowed = new Set(["subscriptions", "invoices", "invoice_lines"]);
      const bad = alters.filter(
        (t) => !allowed.has(t) && !t.startsWith("billing_") && !t.startsWith("payment")
          && !t.startsWith("refund") && !t.startsWith("referral")
          && !t.startsWith("usage_") && !t.startsWith("invoice_"),
      );
      expect(bad, `${name} alters tenant tables: ${bad.join(", ")}`).toEqual([]);
    }
  });

  it("Phase 5 truncates nothing and drops no column", () => {
    for (const [name, sql] of [[P5A, a], [P5B, b]] as const) {
      const body = stripSqlComments(sql);
      expect(/\bTRUNCATE\b/i.test(body), `${name} truncates`).toBe(false);
      expect(/DROP COLUMN/i.test(body), `${name} drops a column`).toBe(false);
      expect(/DROP TABLE/i.test(body), `${name} drops a table`).toBe(false);
    }
  });

  it("billing tables are excluded from tenant scoping", () => {
    const excl = a.slice(a.indexOf("SELECT _table NOT IN"));
    for (const t of ["billing_profiles", "billing_customers", "payments", "refunds",
                     "billing_webhook_events", "invoice_sequences", "billing_events",
                     "referrals", "referral_credits", "usage_counters"]) {
      expect(excl, `${t} missing from is_tenant_scoped_table`).toContain(`'${t}'`);
    }
  });

  it("a tenant reads its billing history but never writes it", () => {
    for (const t of ["payments", "refunds", "billing_events"]) {
      const pol = a.slice(a.indexOf(`CREATE POLICY ${t}_read`));
      expect(pol.slice(0, 250), `${t} read policy missing`).toMatch(/FOR SELECT/);
    }
    // Writes are platform-only. The manage policies are created in a DO loop
    // via format(), so the literal `payments_manage` never appears in the
    // source — assert on the loop that generates them instead.
    const loop = a.slice(a.indexOf("FOREACH t IN ARRAY ARRAY['payments','refunds'"));
    expect(loop.slice(0, 900)).toMatch(/platform_can\(''billing\.manage''\)/);
    for (const t of ["payments", "refunds", "usage_counters", "billing_webhook_events"]) {
      expect(loop.slice(0, 400), `${t} is not in the manage loop`).toContain(`'${t}'`);
    }
  });

  it("the webhook log and provider ids are platform-only", () => {
    const wpol = a.slice(a.indexOf("CREATE POLICY webhook_events_read"));
    expect(wpol.slice(0, 250)).toMatch(/platform_can\('billing\.read'\)/);
    expect(wpol.slice(0, 250)).not.toMatch(/current_org_id/);
  });

  it("invoice_sequences has NO tenant policy — numbers cannot be forged", () => {
    expect(a).toMatch(/invoice_sequences gets NO policy/);
    const policies = [...a.matchAll(/CREATE POLICY \w+ ON public\.invoice_sequences/g)];
    expect(policies).toEqual([]);
  });

  it("earlier phase gates still exist", () => {
    for (const f of ["phase0.test.ts", "phase1.test.ts", "phase1e.test.ts",
                     "phase2.test.ts", "phase3.test.ts", "phase4.test.ts"]) {
      expect(existsSync(join(__dirname, f)), `${f} was removed`).toBe(true);
    }
  });
});

describe("Rollbacks", () => {
  it.each([P5A, P5B])("%s has a paired rollback", (m) => {
    expect(existsSync(join(ROLLBACKS, m.replace(".sql", "_rollback.sql")))).toBe(true);
  });

  it("the 5A rollback refuses to destroy financial records", () => {
    // GST invoices carry statutory retention. Dropping them to undo a
    // migration is not a rollback.
    const rb = read(join(ROLLBACKS, P5A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Refusing to drop billing/);
    expect(rb).toMatch(/statutory financial records/);
  });

  it("the 5A rollback restores policies from the snapshot", () => {
    const rb = read(join(ROLLBACKS, P5A.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/FROM public\.tenancy_policy_backup/);
    expect(rb).not.toMatch(/regexp_replace/);
  });

  it("the 5B rollback warns that the webhook must be disabled", () => {
    // Otherwise money comes in and nothing is granted.
    const rb = read(join(ROLLBACKS, P5B.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/Deregister or disable the Razorpay webhook/);
  });

  it("keeps ARK's subscription untouched", () => {
    const rb = read(join(ROLLBACKS, P5B.replace(".sql", "_rollback.sql")));
    expect(rb).toMatch(/ARK's subscription row is deliberately LEFT as-is/);
  });
});

describe("Razorpay is allowed through the CSP", () => {
  it("checkout script, frames and API are permitted", () => {
    // Without these the payment window silently fails to render — the most
    // expensive possible CSP mistake.
    const v = JSON.parse(read(join(ROOT, "vercel.json")));
    const csp = v.headers.find((h: { source: string }) => h.source === "/(.*)")
      .headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value;
    expect(csp).toContain("https://checkout.razorpay.com");
    expect(csp).toMatch(/frame-src[^;]*razorpay\.com/);
    expect(csp).toMatch(/connect-src[^;]*razorpay\.com/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
