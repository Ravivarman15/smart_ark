#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1E — RELOCATE LEGACY STORAGE OBJECTS UNDER {organization_id}/
//
//   node scripts/relocate-storage-to-org.mjs --dry-run     # inspect, change nothing
//   node scripts/relocate-storage-to-org.mjs               # perform the move
//   node scripts/relocate-storage-to-org.mjs --bucket=payslips
//
// Requires (never commit these):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ┌── WHY THIS IS A SCRIPT AND NOT A MIGRATION ────────────────────────────┐
// │ Moving objects is thousands of HTTP calls against the Storage API, not │
// │ SQL. It cannot join the migration's transaction, cannot be rolled back │
// │ by the paired rollback file, and can fail halfway. Pretending          │
// │ otherwise — by wrapping it in a DO block that shells out — would hand  │
// │ you a "rollback" that silently does nothing for the one step that      │
// │ actually touches customer files.                                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// SAFETY PROPERTIES
//   • COPY-VERIFY-then-DELETE. `storage.move` is atomic per object, but this
//     script uses copy + verify + remove so a crash mid-run leaves the
//     original readable rather than nothing at all.
//   • RESUMABLE. Already-prefixed objects are skipped, so re-running after a
//     failure continues where it stopped.
//   • DB PATHS REWRITTEN IN THE SAME PASS. finance_attachments.file_url and
//     support_ticket_attachments.url store the object path; moving the file
//     without updating the row would produce a dead link that no error
//     surfaces until a user clicks it.
//   • profile-pictures is SKIPPED: that bucket is deliberately public (avatars
//     render in <img> across the app) and its objects are referenced by
//     absolute URLs already persisted in profiles rows.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  export SUPABASE_URL=https://<ref>.supabase.co\n" +
      "  export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>",
  );
  process.exit(1);
}

const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--bucket="))?.split("=")[1];

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/** Buckets to relocate. profile-pictures excluded — see header. */
const BUCKETS = [
  "student-documents",
  "payslips",
  "receipts",
  "finance-attachments",
  "question-papers",
  "lead-imports",
  "support-attachments",
  "task-attachments",
  "study-materials",
];

/** Rows whose stored value is an object path and must follow the file. */
const PATH_COLUMNS = [
  { bucket: "finance-attachments", table: "finance_attachments", column: "file_url" },
  { bucket: "support-attachments", table: "support_ticket_attachments", column: "url" },
];

/** Recursively list every object in a bucket. The API pages at 100 by default. */
async function listAll(bucket, prefix = "", acc = []) {
  const { data, error } = await db.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) {
    console.error(`  ! list ${bucket}/${prefix}: ${error.message}`);
    return acc;
  }
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder has no id/metadata; a file always does.
    if (entry.id === null || entry.metadata === null) await listAll(bucket, full, acc);
    else acc.push(full);
  }
  return acc;
}

async function main() {
  const { data: orgs, error: orgErr } = await db
    .from("organizations")
    .select("id, slug")
    .is("deleted_at", null);

  if (orgErr) {
    console.error("Could not read organizations:", orgErr.message);
    process.exit(1);
  }
  if (!orgs?.length) {
    console.error("No organizations found — run migration 1A first.");
    process.exit(1);
  }
  if (orgs.length > 1) {
    // With several tenants there is no way to infer which one owns an
    // unprefixed legacy object. Guessing here would mis-file customer
    // documents across tenants — the worst possible outcome.
    console.error(
      `Refusing to run: ${orgs.length} organizations exist. Legacy objects carry no\n` +
        "tenant marker, so ownership cannot be inferred. This script is only valid\n" +
        "while ARK is the sole tenant — i.e. BEFORE organization #2 is created.",
    );
    process.exit(1);
  }

  const org = orgs[0];
  console.log(`Relocating storage under ${org.id} (${org.slug})${DRY ? "  [DRY RUN]" : ""}\n`);

  let moved = 0, skipped = 0, failed = 0, rowsFixed = 0;

  for (const bucket of BUCKETS) {
    if (ONLY && bucket !== ONLY) continue;
    const objects = await listAll(bucket);
    if (!objects.length) {
      console.log(`${bucket}: empty`);
      continue;
    }

    const legacy = objects.filter((p) => !UUID_PREFIX.test(p));
    console.log(`${bucket}: ${objects.length} object(s), ${legacy.length} to relocate`);
    skipped += objects.length - legacy.length;

    for (const from of legacy) {
      const to = `${org.id}/${from}`;
      if (DRY) {
        console.log(`  would move  ${from}  →  ${to}`);
        moved++;
        continue;
      }

      // 1. COPY (leaves the original in place).
      const { error: copyErr } = await db.storage.from(bucket).copy(from, to);
      if (copyErr && !/exists/i.test(copyErr.message)) {
        console.error(`  ! copy ${from}: ${copyErr.message}`);
        failed++;
        continue;
      }

      // 2. VERIFY the destination is actually readable before destroying the
      //    source. A copy that reported success but produced nothing would
      //    otherwise cost the customer the file.
      const dir = to.split("/").slice(0, -1).join("/");
      const base = to.split("/").pop();
      const { data: check } = await db.storage.from(bucket).list(dir, { search: base, limit: 1 });
      if (!check?.length) {
        console.error(`  ! verify ${to}: destination missing after copy — original kept`);
        failed++;
        continue;
      }

      // 3. Rewrite any DB row pointing at the old path, BEFORE deleting it.
      //    Ordering matters: if this fails we still have both copies and can
      //    retry, whereas deleting first would strand the row.
      for (const pc of PATH_COLUMNS) {
        if (pc.bucket !== bucket) continue;
        const { error: upErr, count } = await db
          .from(pc.table)
          .update({ [pc.column]: to }, { count: "exact" })
          .eq(pc.column, from);
        if (upErr) console.error(`  ! ${pc.table}.${pc.column}: ${upErr.message}`);
        else rowsFixed += count ?? 0;

        // Legacy rows may hold a full public URL rather than a bare path.
        const { count: c2 } = await db
          .from(pc.table)
          .update({ [pc.column]: to }, { count: "exact" })
          .like(pc.column, `%/${bucket}/${from}`);
        rowsFixed += c2 ?? 0;
      }

      // 4. Remove the original.
      const { error: rmErr } = await db.storage.from(bucket).remove([from]);
      if (rmErr) {
        console.error(`  ! remove ${from}: ${rmErr.message} (duplicate left behind)`);
        failed++;
        continue;
      }
      moved++;
    }
  }

  console.log(
    `\nmoved ${moved} · already-prefixed ${skipped} · failed ${failed} · db rows rewritten ${rowsFixed}`,
  );

  if (DRY) {
    console.log("\nDry run — nothing changed. Re-run without --dry-run to apply.");
    return;
  }
  if (failed > 0) {
    console.error("\nFailures occurred. Fix them and re-run (the script is resumable).");
    process.exit(1);
  }

  // Ask the database to VERIFY and set the readiness flag. It re-counts
  // un-prefixed objects itself rather than trusting this script's tally.
  const { data: ok, error } = await db.rpc("mark_storage_partitioned", {
    _note: `Relocated by scripts/relocate-storage-to-org.mjs on ${new Date().toISOString()}`,
  });
  if (error) console.error("\nCould not set readiness flag:", error.message);
  else if (ok) console.log("\nstorage_org_partitioned → READY");
  else console.error("\nDatabase still sees un-prefixed objects — flag NOT set.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
