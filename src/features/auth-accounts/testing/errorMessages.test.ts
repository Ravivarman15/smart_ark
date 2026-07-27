// Regression tests for the two helpers behind real reported failures:
//
//   1. "The account was not created  {}"  — an error BODY whose `error` key
//      held an object was assigned straight to `message`, so the UI rendered a
//      bare "{}" with no reason.
//   2. A parent provisioned with an email that is already an auth user (the
//      office's own address, or a parent who is also staff) failed outright,
//      because the edge function uses `body.email` as the LOGIN email.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asMessage, isEmailTaken } from "../services/authAccounts.service";

const EDGE_FN = readFileSync(
  join(process.cwd(), "supabase", "functions", "student-parent-accounts", "index.ts"),
  "utf8",
);

describe("generated password satisfies the strictest Supabase policy", () => {
  // ROOT CAUSE of a real, reproducible failure: Supabase Auth can be configured
  // to require "lowercase, uppercase, digits AND symbols". The generator drew
  // only from letters+digits, so auth.admin.createUser rejected EVERY password
  // and the console reported `create_failed` for every account — which looked
  // like an email problem because changing the email never helped.

  it("includes a symbol class in the charset", () => {
    expect(EDGE_FN).toMatch(/const symbols\s*=\s*"[^"]+"/);
  });

  it("seeds one character from every class before filling", () => {
    expect(EDGE_FN).toMatch(/pick\(upper\),\s*pick\(lower\),\s*pick\(digits\),\s*pick\(symbols\)/);
  });

  it("draws the remaining characters from all four classes", () => {
    expect(EDGE_FN).toMatch(/const all\s*=\s*upper \+ lower \+ digits \+ symbols/);
  });

  it("excludes characters that break shells, quoting or copy-paste", () => {
    const charset = EDGE_FN.match(/const symbols\s*=\s*"([^"]+)"/)?.[1] ?? "";
    expect(charset.length).toBeGreaterThan(0);
    for (const bad of ['"', "'", "\\", "<", ">", "`", "&", ";", " "]) {
      expect(charset.includes(bad), `symbol charset must not contain ${bad}`).toBe(false);
    }
  });

  it("is at least 12 characters long", () => {
    const len = Number(EDGE_FN.match(/i < (\d+); i\+\+\) chars\.push/)?.[1] ?? 0);
    expect(len).toBeGreaterThanOrEqual(12);
  });
});

describe("edge function reports WHY provisioning failed", () => {
  it("describes auth errors instead of forwarding a bare message", () => {
    expect(EDGE_FN).toContain("describeAuthError");
  });

  it("echoes the login email it actually attempted", () => {
    // Without this the client cannot diagnose a failure, because it never sees
    // the synthesised address the function built.
    expect(EDGE_FN).toContain("attemptedLoginEmail");
  });

  it("names the password-policy case explicitly", () => {
    expect(EDGE_FN).toMatch(/password policy/i);
  });
});

describe("asMessage — never render a raw object", () => {
  it("returns an empty string for an empty object, not \"{}\"", () => {
    // THE bug: "{}" reached the screen as the entire explanation.
    expect(asMessage({})).toBe("");
  });

  it("returns an empty string for null-ish input", () => {
    expect(asMessage(null)).toBe("");
    expect(asMessage(undefined)).toBe("");
  });

  it("passes strings through, trimmed", () => {
    expect(asMessage("  Forbidden  ")).toBe("Forbidden");
  });

  it("digs the message out of common nested shapes", () => {
    expect(asMessage({ message: "boom" })).toBe("boom");
    expect(asMessage({ error: "nested error" })).toBe("nested error");
    expect(asMessage({ detail: "detail text" })).toBe("detail text");
    expect(asMessage({ description: "described" })).toBe("described");
  });

  it("prefers message over other keys", () => {
    expect(asMessage({ message: "first", error: "second" })).toBe("first");
  });

  it("ignores blank nested values and serialises what is left", () => {
    expect(asMessage({ message: "   ", code: 42 })).toBe('{"message":"   ","code":42}');
  });

  it("unwraps an Error", () => {
    expect(asMessage(new Error("kaboom"))).toBe("kaboom");
  });

  it("handles primitives", () => {
    expect(asMessage(404)).toBe("404");
    expect(asMessage(false)).toBe("false");
  });

  it("never returns the literal \"[object Object]\"", () => {
    for (const v of [{}, { a: 1 }, [], new Date(0), { nested: { deep: true } }]) {
      expect(asMessage(v)).not.toContain("[object Object]");
    }
  });

  it("caps runaway payloads", () => {
    expect(asMessage({ blob: "x".repeat(5000) }).length).toBeLessThanOrEqual(300);
  });

  it("survives a circular structure", () => {
    const a: Record<string, unknown> = { name: "loop" };
    a.self = a;
    expect(() => asMessage(a)).not.toThrow();
  });
});

describe("isEmailTaken — detect a login-address collision", () => {
  it("matches the Supabase duplicate-user wording", () => {
    expect(
      isEmailTaken({
        ok: false,
        reason: "create_failed",
        message: "A user with this email address has already been registered",
      }),
    ).toBe(true);
  });

  it("matches other common phrasings", () => {
    for (const message of [
      "email_exists",
      "User already exists",
      "duplicate key value violates unique constraint",
      "Email already exists",
    ]) {
      expect(isEmailTaken({ ok: false, message }), message).toBe(true);
    }
  });

  it("matches on the reason code alone", () => {
    expect(isEmailTaken({ ok: false, reason: "email_exists" })).toBe(true);
  });

  it("does NOT match unrelated failures", () => {
    for (const message of [
      "Forbidden — management or admin role required",
      "The provisioning service is not deployed on this project",
      "Could not create login",
      "",
    ]) {
      expect(isEmailTaken({ ok: false, message }), message).toBe(false);
    }
  });

  it("does not throw on an empty result", () => {
    expect(isEmailTaken({ ok: false })).toBe(false);
  });
});
