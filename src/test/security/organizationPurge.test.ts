import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ════════════════════════════════════════════════════════════════════════════
// PERMANENT ERASURE OF A TENANT
//
// The only irreversible operation in the product. Everything below is a
// constraint on it, and most of them live in the database rather than in the
// console, because every platform mutation is a service-role call that walks
// straight past anything the UI believes.
//
// ┌── WHAT CHANGED ────────────────────────────────────────────────────────┐
// │ Phase 9A shipped the honest placeholder: request → cooling-off →       │
// │ approval by someone else, and approval deleted nothing. Archive was    │
// │ the terminal state. This makes erasure real and keeps every one of     │
// │ those gates in front of it.                                            │
// └────────────────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");

const MIGRATION = read("supabase/migrations/20261010_organization_purge.sql");
const SQL = stripSql(MIGRATION);
const FN = read("supabase/functions/platform-admin/index.ts");
const DIALOG = read("src/features/platform/components/PurgeOrganizationDialog.tsx");
const DETAIL = read("src/features/platform/pages/OrganizationDetailPage.tsx");
const HOOKS = read("src/features/platform/hooks/usePlatform.ts");

/** The purge function body, without the surrounding migration. */
const purgeBody = SQL.slice(
  SQL.indexOf("FUNCTION public.platform_purge_organization"),
  SQL.indexOf("COMMENT ON FUNCTION public.platform_purge_organization"),
);

describe("A protected organization can never be erased", () => {
  it("is refused by the same predicate the trigger uses", () => {
    // Not a copy of the rule — the same function. Two spellings of "is this
    // protected" is how one of them ends up not matching ARK.
    expect(purgeBody).toMatch(/is_protected_organization\(_org\)/);
  });

  it("is checked before anything is read or deleted", () => {
    const protectedAt = purgeBody.indexOf("is_protected_organization");
    // The LOOKUP, not the `_req … %ROWTYPE` declaration, which necessarily
    // names the table first and says nothing about execution order.
    const requestAt = purgeBody.indexOf("SELECT * INTO _req");
    const deleteAt = purgeBody.indexOf("DELETE FROM");
    expect(protectedAt).toBeGreaterThan(-1);
    expect(requestAt).toBeGreaterThan(-1);
    expect(protectedAt, "the request lookup happens first").toBeLessThan(requestAt);
    expect(protectedAt, "something is deleted before the protection check").toBeLessThan(deleteAt);
  });

  it("keeps the protection trigger and its table in place", () => {
    expect(SQL).toMatch(/the protected-organization trigger is missing/);
    expect(SQL).toMatch(/organization_protections is empty/);
    // The migration must never remove a protection to make a purge possible.
    expect(SQL).not.toMatch(/DELETE FROM public\.organization_protections/);
    expect(SQL).not.toMatch(/DROP TRIGGER/i);
  });
});

describe("Erasure needs a reviewed request that belongs to this tenant", () => {
  it("matches the request to the organization, not just to itself", () => {
    // Passing another tenant's approved request id must not authorise a purge.
    expect(purgeBody).toMatch(/WHERE id = _request AND organization_id = _org/);
  });

  it("requires the request to be approved", () => {
    expect(purgeBody).toMatch(/_req\.status <> 'approved'/);
  });

  it("refuses a tenant that is still live", () => {
    expect(purgeBody).toMatch(/_status NOT IN \('archived', 'cancelled'\)/);
  });

  it("does not weaken the existing review rules", () => {
    // Cooling-off and the two-person rule live in platform_review_delete_request
    // and must not be redefined here.
    expect(SQL).not.toMatch(/eligible_at/);
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION public\.platform_review_delete_request/);
  });
});

describe("The sweep discovers the schema instead of assuming it", () => {
  it("finds target tables from the catalog", () => {
    expect(purgeBody).toMatch(/information_schema\.columns/);
    expect(purgeBody).toMatch(/c\.column_name = 'organization_id'/);
    // A view would break format('DELETE FROM %I').
    expect(purgeBody).toMatch(/t\.table_type = 'BASE TABLE'/);
  });

  it("retries what a child row blocks rather than giving up", () => {
    expect(purgeBody).toMatch(/EXCEPTION WHEN foreign_key_violation/);
    expect(purgeBody).toMatch(/_progress/);
  });

  it("rolls back entirely when it cannot finish", () => {
    // A half-purged tenant — no students but still billed — is worse than a
    // refusal, so the failure path is an exception, not a partial report.
    expect(purgeBody).toMatch(/Purge stopped after % passes/);
    expect(purgeBody).toMatch(/Nothing was deleted/);
  });

  it("cannot loop forever holding locks on every tenant table", () => {
    expect(purgeBody).toMatch(/_pass > 50/);
  });

  it("proves the tenant is gone rather than trusting its own row count", () => {
    // The sweep counts only what IT deleted; cascades remove more underneath
    // it (measured: 123 counted, 118 deleted). Completeness is re-counted.
    expect(purgeBody).toMatch(/Purge incomplete: % still holds/);
    const verifyAt = purgeBody.indexOf("Purge incomplete");
    const deleteOrgAt = purgeBody.indexOf("DELETE FROM public.organizations");
    expect(deleteOrgAt, "the check runs before the organization row goes").toBeLessThan(verifyAt);
  });
});

describe("The evidence outlives the tenant", () => {
  it("drops the audit log's foreign key rather than weakening immutability", () => {
    // platform_audit_log is append-only: the ON DELETE SET NULL cascade is an
    // UPDATE, so the trigger aborted every organization delete. Removing the
    // FK lets the row KEEP the organization id instead of nulling it.
    expect(SQL).toMatch(/ALTER TABLE public\.platform_audit_log\s+DROP CONSTRAINT IF EXISTS platform_audit_log_organization_id_fkey/);
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION public\.platform_audit_immutable/);
    expect(SQL).toMatch(/the append-only trigger on platform_audit_log is gone/);
  });

  it("records the erasure inside the same transaction", () => {
    // organization_delete_requests is ON DELETE CASCADE, so the request row
    // disappears with the tenant. This is what remains.
    expect(purgeBody).toMatch(/INSERT INTO public\.platform_audit_log/);
    expect(purgeBody).toMatch(/'organization\.purged'/);
    expect(purgeBody).toMatch(/'reason', _req\.reason/);
  });

  it("does not double-log the same event from the edge function", () => {
    // The trap the entitlement history fell into. File cleanup is a separate
    // event that happens after the transaction commits and can fail alone.
    expect(FN).toMatch(/action: "organization\.purge_storage"/);
    const purgeAction = FN.slice(FN.indexOf('action === "purge_organization"'));
    expect(purgeAction.slice(0, 4000)).not.toMatch(/action: "organization\.purged"/);
  });
});

describe("Only an owner can execute an erasure", () => {
  it("grants the capability to owner and to nobody else", () => {
    expect(SQL).toMatch(/VALUES \('owner', 'organizations\.purge'\)/);
    expect(SQL).toMatch(/expected exactly one role with organizations\.purge/);
  });

  it("does not grant it to admin, who can already open the request", () => {
    // No single platform account may request, approve AND execute.
    expect(SQL).not.toMatch(/'admin',\s*'organizations\.purge'/);
  });

  it("is checked by the edge function before anything else", () => {
    expect(FN).toMatch(/need\("organizations\.purge"\)/);
  });

  it("is not reachable from a browser at all", () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.platform_purge_organization[\s\S]{0,120}FROM PUBLIC, anon, authenticated/);
    expect(SQL).toMatch(/the purge function is callable from a client role/);
  });
});

describe("The console shows the damage before it asks for confirmation", () => {
  it("previews from the same function that does the deleting", () => {
    expect(HOOKS).toMatch(/dryRun: true/);
    expect(HOOKS).toMatch(/dryRun: false/);
    expect(DIALOG).toMatch(/usePurgePreview/);
  });

  it("cannot be confirmed before the preview arrives", () => {
    expect(DIALOG).toMatch(/const ready = !!report && !preview\.isPending/);
    expect(DIALOG).toMatch(/disabled=\{!ready \|\| !matches \|\| purge\.isPending\}/);
  });

  it("re-verifies the typed slug server-side, on the destructive call only", () => {
    expect(FN).toMatch(/!isDryRun && confirmSlug !== org\.slug/);
    expect(DIALOG).toMatch(/confirm\.trim\(\) === organizationSlug/);
  });

  it("hides the button unless the tenant is archived and the user is an owner", () => {
    expect(DETAIL).toMatch(/can\("organizations\.purge"\)/);
    expect(DETAIL).toMatch(/\["archived", "cancelled"\]\.includes\(status\)/);
  });

  it("no longer claims erasure is impossible", () => {
    // The old copy said so, correctly at the time. Leaving it would make the
    // button beside it read as a bug.
    expect(DETAIL).not.toMatch(/does not support one-click tenant erasure/);
    expect(DETAIL).not.toMatch(/Archive is the terminal state this platform supports/);
    expect(DETAIL).toMatch(/irreversible/i);
  });
});

describe("Storage is cleaned up without pretending the purge failed", () => {
  it("deletes database rows BEFORE files", () => {
    const body = FN.slice(FN.indexOf('action === "purge_organization"'));
    const rpcAt = body.indexOf("platform_purge_organization");
    const storageAt = body.indexOf("listStoragePaths");
    expect(rpcAt).toBeGreaterThan(-1);
    expect(storageAt).toBeGreaterThan(-1);
    // Files first would leave a live tenant with its documents gone if the
    // transaction then failed.
    expect(rpcAt).toBeLessThan(storageAt);
  });

  it("walks nested folders", () => {
    // storage.list() returns one level; folders come back with a null id.
    expect(FN).toMatch(/entry\.id === null \|\| entry\.id === undefined/);
    expect(FN).toMatch(/depth > 6/);
  });

  it("reports file failures instead of throwing", () => {
    expect(FN).toMatch(/storage\.errors\.push/);
    expect(HOOKS).toMatch(/The database records are erased/);
  });

  it("admits it cannot find pre-prefix objects", () => {
    expect(FN).toMatch(/HONEST LIMIT/);
  });
});
