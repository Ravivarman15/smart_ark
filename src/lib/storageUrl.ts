// ──────────────────────────────────────────────────────────────────────────────
// SIGNED STORAGE URLS
//
// Phase 0 security hardening flipped four buckets from `public = true` to
// private (`payslips`, `finance-attachments`, `support-attachments`). A public
// Supabase bucket is readable by ANYONE on the internet who has the URL — no
// auth, no RLS, no expiry. Salary slips and financial documents cannot live
// behind "the path is a UUID so nobody will guess it".
//
// Flipping a bucket private breaks `getPublicUrl()`, which is what those
// features used. This module is the replacement.
//
// THE BACKWARD-COMPATIBILITY PROBLEM
// ----------------------------------
// `finance_attachments.file_url` and `support_ticket_attachments.url` store the
// FULL public URL of every file uploaded before this change. Those strings are
// now dead links. We cannot rewrite the rows (the public URL is the only record
// of the object path), so instead every read path runs the stored value through
// `objectPath()`, which recovers the bucket-relative path from either shape:
//
//   "https://<ref>.supabase.co/storage/v1/object/public/receipts/a/b.pdf"  → "a/b.pdf"
//   "a/b.pdf"                                                              → "a/b.pdf"
//
// New uploads store the bare path, so the URL form disappears naturally as
// old rows age out. Nothing needs migrating.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

/** One hour — plenty for a click-through from a list the user is looking at. */
export const SIGNED_URL_TTL_SHORT = 60 * 60;

/**
 * Thirty days — for URLs that get emailed. The recipient may open the mail days
 * later, so a short TTL would hand them a dead link. Still finite and
 * revocable, which is the whole point: a public bucket never expires.
 */
export const SIGNED_URL_TTL_EMAIL = 60 * 60 * 24 * 30;

/**
 * Recover the bucket-relative object path from a stored value that may be
 * either a bare path or a legacy full public URL.
 *
 * Returns "" for empty/garbage input so callers can skip signing rather than
 * firing a request that is guaranteed to fail.
 */
export function objectPath(bucket: string, stored: string | null | undefined): string {
  if (!stored) return "";
  const marker = `/${bucket}/`;
  const idx = stored.indexOf(marker);
  const path = idx >= 0 ? stored.slice(idx + marker.length) : stored;
  // A legacy URL may carry a query string (?download=…) — the object path never does.
  return path.split("?")[0].replace(/^\/+/, "");
}

/**
 * Sign a single object. Returns null on failure (missing object, no read
 * permission) so callers can degrade to "no link" instead of throwing — a
 * broken attachment must never take down the page that lists it.
 */
export async function signedUrl(
  bucket: string,
  stored: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SHORT,
  options?: { download?: string },
): Promise<string | null> {
  const path = objectPath(bucket, stored);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, options?.download ? { download: options.download } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Sign many objects in ONE request.
 *
 * Signing a 40-row attachment list one call at a time is 40 round trips; this
 * is the reason `createSignedUrls` (plural) exists. Returns a map keyed by the
 * ORIGINAL stored value, so callers can look up by whatever they already hold
 * without re-deriving the path.
 */
export async function signedUrlMap(
  bucket: string,
  stored: (string | null | undefined)[],
  expiresIn: number = SIGNED_URL_TTL_SHORT,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Keep every stored value that maps to a given path — two rows can legitimately
  // reference the same object, and both need an entry in the result.
  const pathToStored = new Map<string, string[]>();
  for (const s of stored) {
    const p = objectPath(bucket, s);
    if (!p || !s) continue;
    const list = pathToStored.get(p);
    if (list) list.push(s);
    else pathToStored.set(p, [s]);
  }
  if (pathToStored.size === 0) return out;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls([...pathToStored.keys()], expiresIn);
  if (error || !data) return out;

  for (const row of data) {
    // Supabase reports per-object failures inline rather than failing the batch.
    if (!row.signedUrl || row.error) continue;
    // `row.path` echoes the requested path; fall back to matching by order is
    // unsafe because failed entries still occupy a slot.
    for (const s of pathToStored.get(row.path ?? "") ?? []) out.set(s, row.signedUrl);
  }
  return out;
}
