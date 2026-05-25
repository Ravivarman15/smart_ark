// ──────────────────────────────────────────────────────────────────────────────
// safeInsert — defensive Postgres insert that survives foreign-key violations.
//
// Why this exists
// ───────────────
// Several comms tables (`message_queue`, `comms_campaigns`, `comms_audit`,
// `comms_campaign_recipients`) carry FK columns to `profiles.id` (created_by,
// actor_id, approved_by, ...). If a caller passes the wrong id (e.g. an auth
// user id instead of a profile id), Postgres rejects the row with
// `23503 — foreign key constraint`. Without this helper the entire campaign
// launch would fail.
//
// Strategy
//   1. Run the insert with all fields.
//   2. On FK error, parse the constraint name to find the offending column,
//      strip that column to NULL, and retry — up to `fallbackFields.length`
//      times. Eventually the row succeeds with nullable FK fields cleared.
//   3. On any other error, bubble it up unchanged.
//
// This is belt-and-suspenders: the caller should still pass the right id,
// but a bad id never tanks the request.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PgLikeError {
  code?: string;
  message?: string;
  details?: string;
}

export const isForeignKeyError = (err: PgLikeError | null | undefined): boolean => {
  if (!err) return false;
  if (err.code === "23503") return true;
  const m = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return m.includes("foreign key constraint") || m.includes("violates foreign key");
};

const findOffendingField = (
  err: PgLikeError,
  candidateFields: string[]
): string | undefined => {
  const txt = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return candidateFields.find((f) => txt.includes(`_${f}_fkey`) || txt.includes(`(${f})`));
};

export interface SafeInsertResult<T> {
  data: T | null;
  error: PgLikeError | null;
  /** Fields that ended up stripped to NULL because they failed FK. */
  strippedFields: string[];
}

/**
 * Insert a row into `table` with up-to-N retries that strip FK-violating
 * `fallbackFields` to NULL one at a time. Returns the final response and the
 * list of fields that were stripped.
 *
 * @param db          Supabase client (typically `this.db` inside a service)
 * @param table       Table name
 * @param row         Row object to insert
 * @param fallbackFields  Columns that may be cleared to NULL on FK failure
 * @param returning   Pass a select clause to chain `.select(...)` after insert
 */
export async function safeInsert<T = unknown>(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  fallbackFields: string[],
  returning?: string
): Promise<SafeInsertResult<T>> {
  const stripped: string[] = [];
  let current = { ...row };
  const maxAttempts = fallbackFields.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const builder = db.from(table as never).insert(current as never);
    const res = returning
      ? await builder.select(returning).maybeSingle()
      : await builder;
    if (!res.error) {
      return {
        data: (res.data as T) ?? null,
        error: null,
        strippedFields: stripped,
      };
    }
    if (!isForeignKeyError(res.error)) {
      return { data: null, error: res.error as PgLikeError, strippedFields: stripped };
    }
    const remaining = fallbackFields.filter((f) => !stripped.includes(f));
    const offending =
      findOffendingField(res.error as PgLikeError, remaining) ?? remaining[0];
    if (!offending) {
      return { data: null, error: res.error as PgLikeError, strippedFields: stripped };
    }
    current = { ...current, [offending]: null };
    stripped.push(offending);
  }
  return {
    data: null,
    error: { message: "safeInsert: exhausted FK fallback attempts" },
    strippedFields: stripped,
  };
}

/**
 * Same as `safeInsert` but for batches. If a batch insert fails with a FK
 * violation, every row has the offending field stripped — kept as one query
 * because mixed batches succeed/fail atomically in PG.
 */
export async function safeInsertBatch<T = unknown>(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  fallbackFields: string[],
  returning?: string
): Promise<SafeInsertResult<T[]>> {
  if (rows.length === 0) {
    return { data: [], error: null, strippedFields: [] };
  }
  const stripped: string[] = [];
  let current = rows.map((r) => ({ ...r }));
  const maxAttempts = fallbackFields.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const builder = db.from(table as never).insert(current as never);
    const res = returning ? await builder.select(returning) : await builder;
    if (!res.error) {
      return {
        data: (res.data as T[]) ?? null,
        error: null,
        strippedFields: stripped,
      };
    }
    if (!isForeignKeyError(res.error)) {
      return { data: null, error: res.error as PgLikeError, strippedFields: stripped };
    }
    const remaining = fallbackFields.filter((f) => !stripped.includes(f));
    const offending =
      findOffendingField(res.error as PgLikeError, remaining) ?? remaining[0];
    if (!offending) {
      return { data: null, error: res.error as PgLikeError, strippedFields: stripped };
    }
    current = current.map((r) => ({ ...r, [offending]: null }));
    stripped.push(offending);
  }
  return {
    data: null,
    error: { message: "safeInsertBatch: exhausted FK fallback attempts" },
    strippedFields: stripped,
  };
}
