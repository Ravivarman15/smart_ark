// ──────────────────────────────────────────────────────────────────────────────
// columnFallback — writes that survive a partially-migrated schema.
//
// PROBLEM
//   When the database is missing an extended column (a migration hasn't been
//   applied yet), Supabase rejects the whole write. The old defence was an
//   all-or-nothing strip: on ANY column error every "optional" field was
//   dropped, so a single missing column silently discarded a dozen present
//   ones.
//
// STRATEGY (intelligent, column-level)
//   1. Write the full payload.
//   2. On a missing-column error, parse the EXACT offending column out of the
//      error, drop only that key, and retry.
//   3. Repeat until the write succeeds or no further column can be identified.
//   Result: every column the schema DOES have is persisted; only the columns
//   that are genuinely absent get skipped — and the caller is told which.
//
// This is the schema-drift counterpart to `safeInsert` (which handles foreign
// key violations). Generic over any table, so students / staff / finance / fee
// and future modules share one implementation.
// ──────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PgLikeError } from "./safeInsert";

/** True when an error means a column is absent from the schema / PostgREST cache. */
export const isMissingColumnError = (err: PgLikeError | null | undefined): boolean => {
  if (!err) return false;
  // PGRST204 = column not in PostgREST schema cache; 42703 = Postgres undefined_column.
  if (err.code === "PGRST204" || err.code === "42703") return true;
  const m = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the") ||
    /column .* does not exist/.test(m)
  );
};

/**
 * Pull the offending column name out of a missing-column error.
 * Handles the three shapes Supabase/Postgres emit:
 *   • PGRST204 — Could not find the 'student_contact' column of 'students' …
 *   • 42703    — column "student_contact" does not exist
 *   • 42703    — column students.student_contact does not exist
 * Returns the bare (snake_case) column name, matching the payload keys.
 */
export const extractMissingColumn = (
  err: PgLikeError | null | undefined
): string | undefined => {
  const msg = `${err?.message ?? ""} ${err?.details ?? ""}`;
  let m = msg.match(/could not find the ['"]?([A-Za-z0-9_]+)['"]? column/i);
  if (m) return m[1];
  m = msg.match(/column "([A-Za-z0-9_]+)" does not exist/i);
  if (m) return m[1];
  m = msg.match(/column ([A-Za-z0-9_.]+) does not exist/i);
  if (m) return m[1].split(".").pop();
  return undefined;
};

export interface ColumnFallbackResult<T> {
  data: T | null;
  error: PgLikeError | null;
  /** Columns removed because the schema doesn't have them (in drop order). */
  droppedColumns: string[];
  /** How many write attempts were made (1 = succeeded first try). */
  attempts: number;
}

export interface ColumnFallbackOptions {
  /** Columns to return via `.select()` after the write. */
  returning?: string;
  /** Use `.maybeSingle()` rather than `.single()` for the returning select. */
  maybeSingle?: boolean;
  /** Label for diagnostics logs, e.g. "students.create". Defaults to the table. */
  label?: string;
  /** Fired once (only when something was dropped) with the full dropped list. */
  onColumnsDropped?: (columns: string[]) => void;
}

const selectMaybe = async (
  builder: { select: (cols: string) => { single: () => unknown; maybeSingle: () => unknown } },
  opts: ColumnFallbackOptions
) => {
  if (!opts.returning) return await (builder as unknown as Promise<unknown>);
  const sel = builder.select(opts.returning);
  return opts.maybeSingle ? await sel.maybeSingle() : await sel.single();
};

type WriteResult = { data: unknown; error: PgLikeError | null };

const logDrop = (opts: ColumnFallbackOptions, table: string, col: string, attempt: number) =>
  console.warn(
    `[columnFallback] ${opts.label ?? table}: column "${col}" not in schema — ` +
      `dropping it and retrying (attempt ${attempt}).`
  );

const announce = (
  opts: ColumnFallbackOptions,
  table: string,
  dropped: string[],
  finalPayload: Record<string, unknown>,
  attempts: number
) => {
  if (dropped.length === 0) return;
  console.warn(
    `[columnFallback] ${opts.label ?? table}: wrote after dropping ` +
      `${dropped.length} missing column(s) [${dropped.join(", ")}] over ${attempts - 1} retr` +
      `${attempts - 1 === 1 ? "y" : "ies"}. Final columns: [${Object.keys(finalPayload).join(", ")}].`
  );
  opts.onColumnsDropped?.(dropped);
};

// Shared retry loop for both insert and update. `run` performs one write of the
// current payload and returns Supabase's { data, error }.
async function withColumnFallback<T>(
  table: string,
  payload: Record<string, unknown>,
  opts: ColumnFallbackOptions,
  run: (current: Record<string, unknown>) => Promise<WriteResult>
): Promise<ColumnFallbackResult<T>> {
  const dropped: string[] = [];
  const current = { ...payload };
  const maxAttempts = Object.keys(payload).length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await run(current);
    if (!res.error) {
      announce(opts, table, dropped, current, attempt);
      return { data: (res.data as T) ?? null, error: null, droppedColumns: dropped, attempts: attempt };
    }
    if (!isMissingColumnError(res.error)) {
      return { data: null, error: res.error, droppedColumns: dropped, attempts: attempt };
    }
    const col = extractMissingColumn(res.error);
    // Can't identify a droppable column that's actually in the payload → stop,
    // so we never loop forever on an unrelated schema-cache error.
    if (!col || !(col in current)) {
      return { data: null, error: res.error, droppedColumns: dropped, attempts: attempt };
    }
    delete current[col];
    dropped.push(col);
    logDrop(opts, table, col, attempt);
  }
  return {
    data: null,
    error: { message: `columnFallback: exhausted retries for ${table}` },
    droppedColumns: dropped,
    attempts: maxAttempts,
  };
}

/** Insert a row, dropping only the columns the schema is actually missing. */
export async function safeInsertWithColumnFallback<T = unknown>(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  opts: ColumnFallbackOptions = {}
): Promise<ColumnFallbackResult<T>> {
  return withColumnFallback<T>(table, row, opts, async (current) => {
    const builder = db.from(table as never).insert(current as never);
    return (await selectMaybe(builder as never, opts)) as WriteResult;
  });
}

/**
 * Update rows matched by `match` (column → value, applied as `.eq`), dropping
 * only the columns the schema is actually missing.
 */
export async function safeUpdateWithColumnFallback<T = unknown>(
  db: SupabaseClient,
  table: string,
  patch: Record<string, unknown>,
  match: Record<string, unknown>,
  opts: ColumnFallbackOptions = {}
): Promise<ColumnFallbackResult<T>> {
  return withColumnFallback<T>(table, patch, opts, async (current) => {
    let q = db.from(table as never).update(current as never);
    for (const [k, v] of Object.entries(match)) q = q.eq(k as never, v as never);
    return (await selectMaybe(q as never, opts)) as WriteResult;
  });
}
