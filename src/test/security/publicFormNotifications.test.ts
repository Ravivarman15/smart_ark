// ──────────────────────────────────────────────────────────────────────────────
// PUBLIC FORM NOTIFICATIONS — the gate
//
// The requirement this file exists to hold: the system must work unchanged for
// ONE super admin, or five, or twenty. Every assertion below is ultimately
// about that — that recipients are a SET resolved from data, that no admin's
// contact detail is written down anywhere in code, and that one admin's
// missing phone or email cannot suppress the others.
//
// Section 6 is the mutation test the specification asks for by name: it proves
// the resolver would FAIL if someone replaced the fan-out with "the first
// super admin".
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  FORM_TYPES, FORM_TYPE_DEFS, FIELD_LIMITS, MAX_PAYLOAD_BYTES,
  collectedFields, isValidEmail, normalizePhone, present, sanitizeText, NOT_PROVIDED,
} from "../../../supabase/functions/_shared/publicForms";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const FN = "supabase/functions/public-form/index.ts";
const MIGRATION = "supabase/migrations/20261004_phase11a_public_form_notifications.sql";

// ── 1 ────────────────────────────────────────────────────────────────────────
describe("recipients are resolved dynamically, never hardcoded", () => {
  const fn = read(FN);
  const sql = read(MIGRATION);

  it("the resolver returns every active capability holder, with no LIMIT", () => {
    // A LIMIT 1 here is the exact bug this whole phase is about.
    const body = sql.slice(sql.indexOf("platform_form_recipients"), sql.indexOf("COMMENT ON FUNCTION"));
    expect(body).toMatch(/FROM public\.platform_users/);
    expect(body).toMatch(/WHERE u\.is_active/);
    expect(body).toMatch(/capability = 'platform\.leads\.notify'/);
    expect(body, "the recipient query must never be limited").not.toMatch(/\bLIMIT\b/i);
  });

  it("suspended platform users are excluded by the resolver, not by the caller", () => {
    // If `is_active` were filtered in TypeScript instead, every future caller
    // would have to remember to do it.
    const body = sql.slice(sql.indexOf("platform_form_recipients"), sql.indexOf("COMMENT ON FUNCTION"));
    expect(body).toMatch(/u\.is_active/);
  });

  it("the edge function iterates the whole recipient set", () => {
    expect(fn).toMatch(/const recipients = \(recipientRows \?\? \[\]\) as Recipient\[\]/);
    // Two independent fan-out loops: email and WhatsApp.
    expect([...fn.matchAll(/for \(const r of recipients\)/g)].length).toBeGreaterThanOrEqual(2);
  });

  it("no admin email address or phone number appears anywhere in the code", () => {
    for (const [label, src] of [["function", fn], ["migration", sql], ["registry", read("supabase/functions/_shared/publicForms.ts")]] as const) {
      // A real address or an Indian mobile sitting in source is a hardcoded
      // recipient by another name.
      const emails = (src.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])
        .filter((e) => !e.includes("example.com") && !e.endsWith(".ts"));
      expect(emails, `${label} contains a literal email address: ${emails.join(", ")}`).toEqual([]);
      const phones = src.match(/\b[6-9]\d{9}\b/g) ?? [];
      expect(phones, `${label} contains a literal phone number`).toEqual([]);
    }
  });

  it("no environment variable is used as a recipient list", () => {
    // `ADMIN_EMAIL=...` is a hardcoded recipient wearing a config hat: adding
    // a second super admin would still require an operator action per deploy.
    expect(fn).not.toMatch(/Deno\.env\.get\(["'][A-Z_]*(ADMIN|NOTIFY|RECIPIENT|ALERT)[A-Z_]*["']\)/);
  });
});

// ── 2 ────────────────────────────────────────────────────────────────────────
describe("a visitor cannot influence who is notified", () => {
  const fn = read(FN);

  it("only formType, data, utm and source are read from the request body", () => {
    const used = [...fn.matchAll(/body\.([A-Za-z_]+)/g)].map((m) => m[1]);
    expect([...new Set(used)].sort()).toEqual(["data", "formType", "source", "utm"]);
  });

  it("fields are allow-listed from the registry, not copied from the body", () => {
    // `{...input}` would carry organization_id, status or assigned_to straight
    // into the insert.
    expect(fn).toMatch(/for \(const field of def\.fields\)/);
    expect(fn).not.toMatch(/\.\.\.input\b/);
  });

  it("recipients come from the RPC and never from the payload", () => {
    expect(fn).toMatch(/supabase\.rpc\("platform_form_recipients"\)/);
    expect(fn).not.toMatch(/body\.(recipients?|to|admin|email_to)/);
  });

  it("the response tells the visitor counts, never identities", () => {
    const start = fn.indexOf("return jsonResponse(200");
    const ret = fn.slice(start, fn.indexOf("});", start));
    expect(ret.length, "success response not found — the test is stale").toBeGreaterThan(40);
    expect(ret).toMatch(/notified,/);
    // No name, address or number of any administrator may cross the boundary.
    for (const leak of ["recipients", "email:", "phone", "platform_user"]) {
      expect(ret, `the success response leaks ${leak}`).not.toContain(leak);
    }
  });
});

// ── 3 ────────────────────────────────────────────────────────────────────────
describe("the submission is stored before anyone is notified", () => {
  const fn = read(FN);

  it("persists first, then notifies", () => {
    const insertAt = fn.indexOf(".insert(row)");
    const notifyAt = fn.indexOf("await notify(supabase");
    expect(insertAt).toBeGreaterThan(0);
    expect(notifyAt).toBeGreaterThan(insertAt);
  });

  it("a provider failure never fails the submission", () => {
    // The notification pass is wrapped, and the only 500 for a saved
    // submission would be a bug. Assert the catch exists and records.
    expect(fn).toMatch(/catch \(e\) \{[\s\S]{0,400}?notification pass failed/);
    expect(fn).toMatch(/await ledger\(supabase, \{[\s\S]{0,300}?status: "failed"/);
  });

  it("provider errors are recorded, not swallowed", () => {
    expect(fn).toMatch(/error: \(e as Error\)\.message/);
    // The ledger keeps the provider's own words.
    expect(read(MIGRATION)).toMatch(/error\s+text/);
  });

  it("only a failed persist returns an error to the visitor", () => {
    expect(fn).toMatch(/if \(saveErr \|\| !saved\)[\s\S]{0,300}?jsonResponse\(500/);
  });
});

// ── 4 ────────────────────────────────────────────────────────────────────────
describe("one recipient's missing detail does not stop the others", () => {
  const fn = read(FN);

  it("a missing email is recorded and skipped with `continue`", () => {
    expect(fn).toMatch(/if \(!r\.email \|\| !isValidEmail\(r\.email\)\)[\s\S]{0,600}?continue;/);
  });

  it("a missing phone is recorded and skipped with `continue`", () => {
    expect(fn).toMatch(/const phone = normalizePhone\(r\.phone\);[\s\S]{0,600}?continue;/);
  });

  it("neither skip path throws", () => {
    const emailLoop = fn.slice(fn.indexOf("// ── 5a."), fn.indexOf("// ── 5b."));
    const waLoop = fn.slice(fn.indexOf("// ── 5b."), fn.indexOf("// ── 5c."));
    for (const [name, loop] of [["email", emailLoop], ["whatsapp", waLoop]] as const) {
      expect(loop, `${name} fan-out must not throw on one bad recipient`).not.toMatch(/throw new Error/);
    }
  });
});

// ── 5 ────────────────────────────────────────────────────────────────────────
describe("emails go to admins individually", () => {
  const fn = read(FN);

  it("never batches platform administrators into one recipient list", () => {
    // Privacy: a shared To/Cc discloses every administrator's personal address
    // to all the others and to anyone they forward it to.
    expect(fn).toMatch(/to: \[\{ email: r\.email, name: r\.name \?\? undefined \}\]/);
    expect(fn).not.toMatch(/bcc/i);
    expect(fn).not.toMatch(/to: recipients\.map/);
  });
});

// ── 6 ── THE MUTATION TEST ───────────────────────────────────────────────────
describe("MUTATION — replacing the fan-out with a single recipient must fail", () => {
  // The specification names this case: changing getAllActiveSuperAdmins() to
  // getFirstSuperAdmin() must break the suite. There is no such function name
  // here — the resolver is SQL — so the mutation is applied where it would
  // actually be made, and the same assertions that guard the real code are run
  // against the mutant.
  const sql = read(MIGRATION);
  const fn = read(FN);

  const resolverBody = () => sql.slice(sql.indexOf("platform_form_recipients"), sql.indexOf("COMMENT ON FUNCTION"));

  it("a LIMIT 1 in the resolver is caught", () => {
    const mutant = resolverBody().replace(/ORDER BY u\.created_at;/, "ORDER BY u.created_at LIMIT 1;");
    expect(mutant).not.toEqual(resolverBody()); // the mutation applied
    expect(() => {
      expect(mutant).not.toMatch(/\bLIMIT\b/i);
    }).toThrow();
  });

  it("dropping the is_active filter is caught", () => {
    const mutant = resolverBody().replace(/WHERE u\.is_active/, "WHERE true");
    expect(mutant).not.toEqual(resolverBody());
    expect(() => {
      expect(mutant).toMatch(/u\.is_active/);
    }).toThrow();
  });

  it("taking only the first recipient in the function is caught", () => {
    const mutant = fn.replace(
      /const recipients = \(recipientRows \?\? \[\]\) as Recipient\[\];/,
      "const recipients = ((recipientRows ?? []) as Recipient[]).slice(0, 1);",
    );
    expect(mutant).not.toEqual(fn);
    expect(() => {
      expect(mutant).toMatch(/const recipients = \(recipientRows \?\? \[\]\) as Recipient\[\];\n/);
    }).toThrow();
  });

  it("the assertions pass against the REAL source (guards a vacuous mutation test)", () => {
    // Without this, a mutation test that always throws would look green.
    expect(resolverBody()).not.toMatch(/\bLIMIT\b/i);
    expect(resolverBody()).toMatch(/u\.is_active/);
    expect(fn).toMatch(/const recipients = \(recipientRows \?\? \[\]\) as Recipient\[\];/);
  });
});

// ── 7 ────────────────────────────────────────────────────────────────────────
describe("input is sanitised against injection", () => {
  it("strips control characters — email header injection", () => {
    const attack = "Ravi\r\nBcc: victim@example.com";
    const clean = sanitizeText(attack, 200);
    expect(clean).not.toMatch(/[\r\n]/);
    expect(clean).toBe("Ravi Bcc: victim@example.com");
  });

  it("strips angle brackets — HTML injection into the email body", () => {
    expect(sanitizeText("<script>alert(1)</script>", 200)).toBe("scriptalert(1)/script");
    expect(sanitizeText("<img src=x onerror=y>", 200)).not.toMatch(/[<>]/);
  });

  it("strips braces — WhatsApp parameter injection", () => {
    // A visitor typing {{2}} must not reach the provider's substitution.
    expect(sanitizeText("hello {{2}} world", 200)).toBe("hello 2 world");
  });

  it("enforces a length limit on every field", () => {
    expect(sanitizeText("x".repeat(9000), FIELD_LIMITS.message)).toHaveLength(FIELD_LIMITS.message);
    for (const key of Object.keys(FIELD_LIMITS)) {
      expect(FIELD_LIMITS[key], `${key} has no sane limit`).toBeGreaterThan(0);
      expect(FIELD_LIMITS[key]).toBeLessThanOrEqual(4000);
    }
  });

  it("rejects an email carrying a newline", () => {
    expect(isValidEmail("a@b.com\nBcc: c@d.com")).toBe(false);
    expect(isValidEmail("a@b.com\r\nX-Header: y")).toBe(false);
  });

  it("accepts real addresses and rejects malformed ones", () => {
    for (const good of ["a@b.co", "first.last+tag@sub.domain.in"]) {
      expect(isValidEmail(good), good).toBe(true);
    }
    for (const bad of ["", "no-at", "a@b", "a b@c.com", "a@b .com", "<a@b.com>", "x".repeat(250) + "@b.com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("bounds the whole payload", () => {
    expect(MAX_PAYLOAD_BYTES).toBeGreaterThan(0);
    expect(MAX_PAYLOAD_BYTES).toBeLessThanOrEqual(64 * 1024);
    expect(read(FN)).toMatch(/raw\.length > MAX_PAYLOAD_BYTES/);
  });

  it("reads the body as text and measures it BEFORE parsing", () => {
    const fn = read(FN);
    expect(fn.indexOf("await req.text()")).toBeLessThan(fn.indexOf("JSON.parse(raw"));
  });
});

// ── 8 ────────────────────────────────────────────────────────────────────────
describe("phone normalisation", () => {
  it.each([
    ["9876543210", "919876543210"],
    ["+91 98765 43210", "919876543210"],
    ["09876543210", "919876543210"],
    ["91-9876543210", "919876543210"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("returns null rather than guessing at an unusable number", () => {
    // A bad number burns a provider call and lands in the ledger looking like
    // an outage.
    for (const bad of ["", "   ", "123", "abcd", "1234567", null, undefined]) {
      expect(normalizePhone(bad as string)).toBeNull();
    }
  });
});

// ── 9 ────────────────────────────────────────────────────────────────────────
describe("templates render no placeholder garbage", () => {
  it("never renders undefined, null or [object Object]", () => {
    for (const v of [undefined, null, {}, [], "", "   ", "undefined", "null"]) {
      expect(present(v)).toBe(NOT_PROVIDED);
    }
    expect(present("Ravi")).toBe("Ravi");
    expect(present(0)).toBe("0");
  });

  it("omits fields the form does not collect", () => {
    // The contact form never asks for a preferred date, so a contact alert
    // must not contain the row at all — not even as "Not provided".
    const fields = collectedFields("contact", {
      name: "Ravi", email: "a@b.com", message: "Hello", preferred_date: "2026-09-01",
    });
    expect(fields.map((f) => f.key)).toEqual(["name", "email", "message"]);
  });

  it("omits empty values instead of rendering an empty row", () => {
    const fields = collectedFields("demo", { name: "Ravi", email: "a@b.com", phone: "", message: "   " });
    expect(fields.map((f) => f.key)).toEqual(["name", "email"]);
  });

  it("declares only fields the form actually collects", () => {
    // demo is the only form with scheduling preferences.
    expect(FORM_TYPE_DEFS.demo.fields).toContain("preferred_date");
    for (const t of ["contact", "career", "general_enquiry"] as const) {
      expect(FORM_TYPE_DEFS[t].fields).not.toContain("preferred_date");
      expect(FORM_TYPE_DEFS[t].fields).not.toContain("preferred_time");
    }
  });
});

// ── 10 ───────────────────────────────────────────────────────────────────────
describe("no tenant branding on platform forms", () => {
  const sources = [FN, "supabase/functions/_shared/publicForms.ts"];
  const BANNED = ["ARK Learning Arena", "ARK CRM", "The Ark Tuition", "arktuition", "ABC Academi"];

  it.each(sources)("%s carries no tenant identity", (path) => {
    const src = read(path);
    for (const b of BANNED) {
      expect(src.toLowerCase(), `${path} mentions ${b}`).not.toContain(b.toLowerCase());
    }
  });

  it("branding is read from platform_settings, not a constant", () => {
    const fn = read(FN);
    expect(fn).toMatch(/from\("platform_settings"\)[\s\S]{0,200}?"platform_branding"/);
  });

  it("no organization branding is loaded for a platform form", () => {
    // Loading a tenant's branding here is how one school's name ends up on
    // another's mail.
    const fn = read(FN);
    expect(fn).not.toMatch(/organization_branding/);
    expect(fn).not.toMatch(/from\("organizations"\)/);
  });
});

// ── 11 ───────────────────────────────────────────────────────────────────────
describe("idempotency", () => {
  const sql = read(MIGRATION);
  const fn = read(FN);

  it("the unique key is (submission, recipient, channel)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]{0,200}?\(submission_id, recipient_ref, channel\)/,
    );
  });

  it("the database decides, not a prior SELECT", () => {
    // A read-then-write check races with a concurrent retry.
    expect(fn).toMatch(/23505/);
    expect(fn).toMatch(/if \(!claimed\) continue;/);
  });

  it("the slot is claimed BEFORE the provider call", () => {
    const emailLoop = fn.slice(fn.indexOf("// ── 5a."), fn.indexOf("// ── 5b."));
    expect(emailLoop.indexOf("const claimed = await ledger")).toBeLessThan(
      emailLoop.indexOf("await sendBrevoEmail"),
    );
  });
});

// ── 12 ───────────────────────────────────────────────────────────────────────
describe("unapproved WhatsApp templates cannot send and cannot break a submission", () => {
  const fn = read(FN);

  it("both campaigns are declared unapproved", () => {
    expect(fn).toMatch(/smartark_platform_lead_alert: "READY_FOR_SUBMISSION"/);
    expect(fn).toMatch(/smartark_public_form_ack: "READY_FOR_SUBMISSION"/);
  });

  it("only ACTIVE may send", () => {
    expect(fn).toMatch(/const SENDABLE = "ACTIVE"/);
    expect(fn).toMatch(/if \(status !== SENDABLE\)/);
  });

  it("an unapproved template is recorded as skipped, never thrown", () => {
    const block = fn.slice(fn.indexOf("if (status !== SENDABLE)"), fn.indexOf("// Never let a blank"));
    expect(block).toMatch(/status: "skipped"/);
    expect(block).not.toMatch(/throw/);
  });

  it("refuses to send an empty positional parameter", () => {
    expect(fn).toMatch(/a\.params\.some\(\(p\) => !String\(p \?\? ""\)\.trim\(\)\)/);
  });

  it("reuses the existing send-aisensy engine rather than calling the provider", () => {
    expect(fn).toMatch(/functions\.invoke\("send-aisensy"/);
    expect(fn, "must not talk to AiSensy directly").not.toMatch(/api\.aisensy|backend\.aisensy/);
  });
});

// ── 13 ───────────────────────────────────────────────────────────────────────
describe("no secret reaches the browser", () => {
  it("the frontend never holds a provider secret", () => {
    // Naming a vendor is fine and sometimes required — the privacy policy has
    // to disclose its sub-processors, and a comment may explain why the key
    // cannot live here. What must never appear is a KEY: an env var holding
    // one, or a literal in the shape of one.
    for (const p of [
      "src/features/marketing/services/marketing.service.ts",
      "src/features/marketing/pages/ContentPages.tsx",
    ]) {
      const src = read(p);
      expect(src, `${p} reads a provider secret from the environment`)
        .not.toMatch(/import\.meta\.env\.[A-Z_]*(BREVO|AISENSY|SERVICE_ROLE|SECRET|API_KEY)/i);
      expect(src, `${p} contains a Brevo key literal`).not.toMatch(/xkeysib-/);
      expect(src, `${p} contains a service-role key literal`).not.toMatch(/service_role/);
      expect(src, `${p} posts to a provider directly`).not.toMatch(/api\.brevo\.com|aisensy\.com/);
    }
  });

  it("the frontend posts to the edge function instead of inserting directly", () => {
    const svc = read("src/features/marketing/services/marketing.service.ts");
    expect(svc).toMatch(/functions\.invoke\("public-form"/);
    // The anon-insert path is what left submissions unnotified.
    expect(svc).not.toMatch(/from\("platform_demo_requests"[\s\S]{0,200}?\.insert/);
    expect(svc).not.toMatch(/from\("platform_enquiries"[\s\S]{0,200}?\.insert/);
  });

  it("the visitor is never shown a notification failure", () => {
    // Scoped to the two confirmation blocks, because the same file also holds
    // the privacy policy, which legitimately names Brevo and AiSensy as
    // sub-processors. The rule is about what a SUBMITTER is told, not about
    // whether a vendor may be named anywhere in the app.
    const page = read("src/features/marketing/pages/ContentPages.tsx");
    const blocks = [
      page.slice(page.indexOf("Request received"), page.indexOf("Start free trial instead")),
      page.slice(page.indexOf("Enquiry received"), page.indexOf("get back to you.")),
    ];
    // Comments are stripped first: the rule is about what a visitor READS on
    // screen, and a `{/* … */}` explaining why we do not surface provider
    // failures is the opposite of the defect.
    const rendered = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const block of blocks) {
      expect(block.length, "confirmation block not found — the test is stale").toBeGreaterThan(50);
      for (const leak of ["Brevo", "AiSensy", "WhatsApp", "notification", "failed", "error"]) {
        expect(rendered(block).toLowerCase(), `the confirmation screen mentions ${leak}`)
          .not.toContain(leak.toLowerCase());
      }
    }
  });
});

// ── 14 ───────────────────────────────────────────────────────────────────────
describe("the ledger stores no more than it needs", () => {
  const sql = read(MIGRATION);

  it("does not copy the submission body into a second table", () => {
    // A career application may carry personal detail; one copy under the
    // existing retention rules is enough.
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.platform_form_notifications"), sql.indexOf("CREATE UNIQUE INDEX"));
    for (const col of ["body", "message", "payload", "resume", "cv"]) {
      expect(table, `ledger must not store ${col}`).not.toMatch(new RegExp(`\\n\\s+${col}\\s+text`));
    }
  });

  it("is readable only by platform admins, never by anon", () => {
    expect(sql).toMatch(/USING \(public\.is_platform_admin\(\)\)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it("the resolver is not executable by anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.platform_form_recipients\(\) FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.platform_form_recipients\(\) TO service_role/);
  });
});

// ── 15 ───────────────────────────────────────────────────────────────────────
describe("one pipeline, not one per form", () => {
  it("every form type resolves to a definition", () => {
    for (const t of FORM_TYPES) {
      const def = FORM_TYPE_DEFS[t];
      expect(def, `${t} has no definition`).toBeTruthy();
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.confirmation.length).toBeGreaterThan(20);
      expect(def.fields.length).toBeGreaterThan(0);
      expect(def.adminCampaign).toMatch(/^smartark_/);
      expect(def.submitterCampaign).toMatch(/^smartark_/);
    }
  });

  it("all four share the same campaigns — the renderer varies, not the engine", () => {
    const admin = new Set(FORM_TYPES.map((t) => FORM_TYPE_DEFS[t].adminCampaign));
    const ack = new Set(FORM_TYPES.map((t) => FORM_TYPE_DEFS[t].submitterCampaign));
    expect(admin.size).toBe(1);
    expect(ack.size).toBe(1);
  });

  it("every form stores into a table that already existed", () => {
    for (const t of FORM_TYPES) {
      expect(["platform_demo_requests", "platform_enquiries"]).toContain(FORM_TYPE_DEFS[t].table);
    }
  });

  it("career wording differs from generic wording", () => {
    // "We will confirm your slot" to a job applicant is the failure mode.
    expect(FORM_TYPE_DEFS.career.confirmation).not.toEqual(FORM_TYPE_DEFS.contact.confirmation);
    expect(FORM_TYPE_DEFS.career.confirmation.toLowerCase()).toContain("application");
  });

  it("no confirmation promises a response time the system cannot keep", () => {
    for (const t of FORM_TYPES) {
      const c = FORM_TYPE_DEFS[t].confirmation.toLowerCase();
      for (const promise of ["within one working day", "within 24 hours", "in 24 hours", "same day"]) {
        expect(c, `${t} promises "${promise}" with no SLA behind it`).not.toContain(promise);
      }
    }
  });
});

// ── 16 ───────────────────────────────────────────────────────────────────────
describe("the function is registered as public and documented as such", () => {
  it("config.toml declares verify_jwt = false with a reason", () => {
    const cfg = read("supabase/config.toml");
    expect(cfg).toMatch(/\[functions\.public-form\]\s*\nverify_jwt = false/);
    expect(cfg).toMatch(/public-form: PUBLIC marketing form intake/);
  });

  it("the migration exists and was written additively", () => {
    expect(existsSync(join(ROOT, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS phone text/);
    // No destructive verb anywhere in the forward migration.
    for (const v of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
      expect(sql, `forward migration contains ${v}`).not.toContain(v);
    }
  });

  it("has a rollback", () => {
    const p = "supabase/rollback/20261004_phase11a_public_form_notifications_rollback.sql";
    expect(existsSync(join(ROOT, p))).toBe(true);
    // The phone column is kept when an operator has actually entered a number.
    expect(read(p)).toMatch(/phone IS NOT NULL/);
  });
});
