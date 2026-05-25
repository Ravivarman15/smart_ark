// ──────────────────────────────────────────────────────────────────────────────
// safeInsert — defensive Postgres insert that survives foreign-key violations.
//
// Originally lived under `src/features/communication/utils/safeInsert.ts`;
// promoted here so any feature (help, communication, finance, future modules)
// can use it without cross-feature imports.
//
// Strategy
//   1. Insert the row with all fields.
//   2. On Postgres 23503 (foreign key violation), parse the constraint name to
//      find the offending column, strip it to NULL, and retry — up to
//      `fallbackFields.length` times.
//   3. Any other error bubbles up unchanged.
//
// Belt-and-suspenders: the caller should still pass valid FK values, but a
// bad value never tanks the request.
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
