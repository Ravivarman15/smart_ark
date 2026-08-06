// ──────────────────────────────────────────────────────────────────────────────
// TENANT-PARTITIONED STORAGE PATHS
//
// Step 7 of the Phase 1 brief: every uploaded file must belong to an
// organization. Storage has no RLS on row data — the only thing a policy can
// inspect is the object's NAME. So the tenant has to live in the path:
//
//     {organization_id}/{existing/path/as/before}
//
// public.storage_path_org_ok(name) in migration 1C checks the first segment
// against current_org_id().
//
// ┌── WHY EXISTING FILES ARE NOT MOVED ────────────────────────────────────┐
// │ ARK has thousands of live objects with no org prefix. Relocating them  │
// │ is a non-transactional, multi-thousand-request operation that cannot   │
// │ be rolled back with the migration — precisely the kind of step that    │
// │ goes wrong at 2am and loses a customer's documents.                    │
// │                                                                        │
// │ Instead storage_path_org_ok() ALSO accepts un-prefixed paths, but only │
// │ while EXACTLY ONE organization exists. The tolerance disappears by     │
// │ itself the moment a second tenant is created — fail closed, no         │
// │ checklist item to forget. Relocation becomes a background job before   │
// │ tenant #2, tracked by the `storage_org_partitioned` readiness flag.    │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

import { currentOrganizationId, requireOrganization } from "@/core/tenant/tenant";

/** Matches a leading `{uuid}/` segment. */
const ORG_PREFIX_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\//;

/**
 * Prefix a bucket-relative path with the active organization.
 *
 * Idempotent: a path that already starts with an org segment is returned
 * unchanged, so callers that pass an already-prefixed value (a retry, a
 * re-upload of a listed object) cannot produce `{org}/{org}/…`.
 *
 * Throws when there is no active organization. That is deliberate — writing to
 * an unprefixed path once multiple tenants exist would create an object no
 * policy can attribute, and a loud failure at upload time is far cheaper than
 * an unreachable or cross-readable file discovered later.
 */
export function orgPath(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (ORG_PREFIX_RE.test(clean)) return clean;
  return `${requireOrganization()}/${clean}`;
}

/**
 * Best-effort variant for read paths.
 *
 * Returns the path unchanged when no organization is resolved yet, so a render
 * that races the provider degrades to "try the legacy path" rather than
 * throwing inside a component tree.
 */
export function orgPathSafe(path: string): string {
  const clean = (path ?? "").replace(/^\/+/, "");
  if (!clean || ORG_PREFIX_RE.test(clean)) return clean;
  const org = currentOrganizationId();
  return org ? `${org}/${clean}` : clean;
}

/**
 * Strip a leading organization segment.
 *
 * Used when displaying a filename, and when comparing a stored value against a
 * freshly-built path where one side may predate Phase 1.
 */
export function stripOrgPrefix(path: string): string {
  return (path ?? "").replace(ORG_PREFIX_RE, "");
}

/** True when the path carries an organization prefix. */
export function hasOrgPrefix(path: string): boolean {
  return ORG_PREFIX_RE.test((path ?? "").replace(/^\/+/, ""));
}
