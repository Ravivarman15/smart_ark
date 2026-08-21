#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// TENANT WRITE AUDIT
//
// Fails when an edge function inserts into a tenant table without naming the
// tenant.
//
// ┌── THE BUG THIS EXISTS TO PREVENT ──────────────────────────────────────┐
// │ Every tenant table is `organization_id uuid NOT NULL DEFAULT           │
// │ current_org_id()`, where current_org_id() = jwt_org_id() ?? fallback_  │
// │ org_id(). Edge functions use the SERVICE ROLE, which carries no JWT,   │
// │ so jwt_org_id() is NULL and the value comes from fallback_org_id().    │
// │                                                                        │
// │ fallback_org_id() returns the single organization while exactly one    │
// │ exists, and NULL forever after. So an unstamped insert works perfectly │
// │ through the entire single-tenant period and starts failing — with a    │
// │ NOT NULL violation — the moment a second tenant is created.            │
// │                                                                        │
// │ That is exactly what happened on 2026-08-07: forty inserts across ten  │
// │ functions broke at once. Several sat inside `try { } catch { }` blocks │
// │ and failed SILENTLY for six days while their functions returned 200.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// A write satisfies the gate when its payload either names `organization_id`
// explicitly or is built with stampOrg()/stampOrgAll() from _shared/auth.ts —
// which throw when the tenant is unknown rather than falling back to a guess.
//
// Usage:
//   node scripts/tenant-write-audit.mjs           # human report, exit 1 on findings
//   node scripts/tenant-write-audit.mjs --json    # machine readable
//
// Regenerate the table list after a migration adds a tenant table:
//   supabase db query --linked "select distinct table_name from
//     information_schema.columns where column_name='organization_id'
//     and table_schema='public' and is_nullable='NO' order by table_name;"
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const FUNCTIONS = join(REPO, "supabase", "functions");

const TENANT_TABLES = new Set(
  JSON.parse(readFileSync(join(HERE, "tenant-tables.json"), "utf8")),
);

// ── Allowlist ────────────────────────────────────────────────────────────────
// ONLY for generic helpers that receive an already-built row, where the tenant
// is stamped by every caller. Each entry names the caller that stamps it, so a
// reviewer can check the claim instead of trusting the exemption.
//
// This is deliberately keyed by file + table + reason and NOT by line number:
// a line number silently stops matching when the file shifts, which would turn
// an exemption into invisible coverage loss.
const ALLOWLIST = [
  {
    file: "invite-staff/index.ts",
    table: "profiles",
    reason:
      "upsertProfile() is a generic helper taking a pre-built row. Its only " +
      "caller builds profileRow with an explicit organization_id from the " +
      "verified caller (see the block comment there).",
  },
  {
    file: "razorpay-webhook/index.ts",
    table: "payments",
    reason:
      "upsertPayment(db, org, ...) takes the tenant as a parameter and sets " +
      "organization_id: org on the row it builds; resolveOrg() derives it from " +
      "the subscription/customer because a provider webhook has no caller.",
  },
];

const isAllowed = (rel, table) =>
  ALLOWLIST.some((a) => rel.endsWith(a.file) && a.table === table);

// ── Scan ─────────────────────────────────────────────────────────────────────
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})(FUNCTIONS);

/** Slice the balanced argument expression starting at the `(` index. */
/**
 * The first argument of a call, given its full argument text.
 *
 * Splits on the first top-level comma — one inside `{...}`, `[...]`, `(...)` or
 * a string belongs to the argument, not between arguments.
 */
function firstArg(args) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) depth--;
    else if (c === "," && depth === 0) return args.slice(0, i);
  }
  return args;
}

function argAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/** Slice a balanced `{...}` or `[...]` literal starting at `start`. */
function literalAt(src, start) {
  const open = src[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

const STAMPED = /organization_id|stampOrg(?:All)?\s*\(/;

const findings = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = file.slice(FUNCTIONS.length + 1).replace(/\\/g, "/");
  const re = /\.from\(\s*"([a-z_]+)"\s*\)\s*(?:\r?\n\s*)?\.(insert|upsert)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const [, table, verb] = m;
    if (!TENANT_TABLES.has(table)) continue;

    const open = m.index + m[0].length - 1;
    // Only the FIRST argument is the payload. upsert() takes options as a
    // second argument — `upsert(rows, { onConflict: "..." })` — and reading the
    // whole argument list meant the payload could never be resolved back to its
    // declaration, because `rows, { onConflict }` is not a bare identifier.
    // Such a write was reported as unstamped even when it was stamped, and the
    // fix people would reach for is an allowlist entry.
    let payload = firstArg(argAt(src, open));

    // A bare identifier: resolve its declaration and any `.push({...})` into it.
    if (!STAMPED.test(payload) && /^\s*[A-Za-z_$][\w$]*\s*[,)]?\s*$/.test(payload)) {
      const name = payload.trim().replace(/[,)]$/, "");
      // A declaration whose right-hand side IS a stampOrg call is stamped, and
      // it does not matter what the call wraps. The pattern below additionally
      // demands a `{` or `[` right after it, which misses stamping applied to a
      // chained expression — stampOrgAll(rows.filter(...).map(...), org) — and
      // reports a correctly-stamped write as a violation. The fix someone
      // reaches for when a gate accuses them wrongly is an allowlist entry,
      // which is how a gate stops meaning anything.
      if (
        new RegExp(
          `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*stampOrg(?:All)?\\s*\\(`,
        ).test(src)
      ) {
        continue;
      }
      const decl = new RegExp(
        `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(stampOrg(?:All)?\\s*\\()?\\s*([{[])`,
      ).exec(src);
      if (decl) {
        payload += decl[1]
          ? decl[0]
          : literalAt(src, decl.index + decl[0].length - 1);
      }
      for (const push of src.matchAll(new RegExp(`${name}\\.push\\(`, "g"))) {
        payload += argAt(src, push.index + push[0].length - 1);
      }
    }

    if (STAMPED.test(payload)) continue;

    const line = src.slice(0, m.index).split("\n").length;
    findings.push({
      file: rel,
      line,
      table,
      verb,
      allowed: isAllowed(rel, table),
    });
  }
}

const violations = findings.filter((f) => !f.allowed);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ scanned: files.length, findings, violations }, null, 2));
} else {
  console.log(`tenant-write-audit — scanned ${files.length} edge function files`);
  console.log(`allowlisted: ${findings.length - violations.length}`);
  if (violations.length === 0) {
    console.log("\nPASS — every tenant-table write names its organization.");
  } else {
    console.log(`\nFAIL — ${violations.length} tenant write(s) with no organization_id:\n`);
    for (const v of violations) {
      console.log(`  ${v.file}:${v.line}  ${v.verb} into ${v.table}`);
    }
    console.log(
      "\nFix: build the row with stampOrg(row, orgId, \"what\") from " +
        "../_shared/auth.ts.\nResolve orgId from the verified caller " +
        "(gate.caller.organizationId), from the row being processed (a webhook), " +
        "\nor from the per-organization loop (a cron sweep) — never from the " +
        "request body.",
    );
  }
}

process.exit(violations.length === 0 ? 0 : 1);
