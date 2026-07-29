import { BaseService, AppError } from "@/shared/services";
import type {
  AttendanceAuditEntry,
  AttendanceDraftRow,
  AttendanceMarker,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceTrendPoint,
  StudentAttendanceRecord,
} from "../types/student.types";

// Wire-shape of a `student_attendance` row. Every enterprise field is
// optional so the type matches both the pre- and post-migration database.
type AttRow = {
  id: string;
  student_id: string;
  batch_id: string | null;
  date?: string | null;
  attendance_date?: string | null;
  status: string;
  method?: string | null;
  notes?: string | null;
  remarks?: string | null;
  marked_by?: string | null;
  marked_by_name?: string | null;
  marked_by_role?: string | null;
  marked_at?: string | null;
  last_updated_by?: string | null;
  last_updated_at?: string | null;
  updated_at?: string | null;
  students?: { name?: string | null } | null;
};

const toRecord = (r: AttRow): StudentAttendanceRecord => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.students?.name ?? undefined,
  batchId: r.batch_id ?? undefined,
  // Prefer the new attendance_date column; fall back to the legacy `date`
  // column so reads work against pre-migration databases too.
  date: (r.attendance_date ?? r.date ?? "") as string,
  status: (r.status as AttendanceStatus) ?? "present",
  method: (r.method as StudentAttendanceRecord["method"]) ?? "manual",
  notes: r.notes ?? r.remarks ?? undefined,
  remarks: r.remarks ?? r.notes ?? undefined,
  markedBy: r.marked_by ?? undefined,
  markedByName: r.marked_by_name ?? undefined,
  markedByRole: r.marked_by_role ?? undefined,
  markedAt: r.marked_at ?? undefined,
  lastUpdatedBy: r.last_updated_by ?? undefined,
  lastUpdatedAt: r.last_updated_at ?? r.updated_at ?? undefined,
});

// Select list used for history / absent-list queries. Includes every
// enterprise field; Supabase silently omits missing columns from the result
// when PostgREST can't find them, so this string is migration-tolerant when
// paired with the catch-block defined in `readWithFallback` below.
const ATT_SELECT_FULL =
  "id, student_id, batch_id, date, attendance_date, status, method, notes, remarks, " +
  "marked_by, marked_by_name, marked_by_role, marked_at, " +
  "last_updated_by, last_updated_at, updated_at";

const ATT_SELECT_LEGACY =
  "id, student_id, batch_id, date, status, marked_by";

// PostgREST returns these codes/messages when the schema cache hasn't picked
// up a new column yet (migration not applied, or `notify pgrst, 'reload
// schema'` not fired). We use it to (a) downgrade writes, (b) surface a
// clear user-facing error instead of the raw Supabase message.
const isSchemaCacheMiss = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "PGRST204" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the") && msg.includes("column") ||
    msg.includes("does not exist")
  );
};

const SCHEMA_HELP =
  "Attendance schema update required. Run the latest migration " +
  "(20260528_attendance_enterprise.sql) and reload the PostgREST schema cache " +
  "(notify pgrst, 'reload schema').";

/**
 * Student attendance — daily marking, history, analytics and audit trail.
 *
 * Architecture
 *   • Every write records WHO marked the row, WHEN, by WHICH METHOD and the
 *     marker's role. The DB-level trigger snapshots the change into
 *     `student_attendance_audit` so management always has a tamper-resistant
 *     history.
 *   • Capture-method is a string column (`manual` today; `biometric`, `qr`,
 *     `mobile` later). New capture channels only need to write rows with a
 *     different `method` — readers, history, analytics and audit are
 *     channel-agnostic.
 *   • Migration safety: if the enterprise columns aren't in the schema cache
 *     yet, the write is automatically downgraded to the legacy column set
 *     and a clear "schema update required" error is surfaced if even the
 *     legacy write fails.
 */
class AttendanceService extends BaseService {
  // ── Read helpers ──────────────────────────────────────────────────────────

  /** Roster + that day's marks for a batch. Missing rows default to present. */
  async getDay(batchId: string, date: string): Promise<AttendanceDraftRow[]> {
    const studentsRes = await this.db
      .from("students")
      .select("id, name")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("name");
    if (studentsRes.error) throw AppError.fromSupabase(studentsRes.error, "students");
    const roster = (studentsRes.data ?? []) as { id: string; name: string }[];
    if (roster.length === 0) return [];

    const ids = roster.map((s) => s.id);
    // Try `attendance_date` first; fall back to legacy `date` for
    // pre-migration databases. We talk to PostgREST via the untyped
    // builder cast — the generated Supabase types lag the migration, so
    // narrowing here would force a type-only error on every column add.
    type Row = { student_id: string; status: string };
    type Res = { data: Row[] | null; error: { code?: string; message?: string } | null };
    const dbAny = this.db as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (k: string, v: string) => {
            in: (k: string, v: string[]) => Promise<Res>;
          };
        };
      };
    };
    let attRes: Res = await dbAny
      .from("student_attendance")
      .select("student_id, status")
      .eq("attendance_date", date)
      .in("student_id", ids);
    if (attRes.error && isSchemaCacheMiss(attRes.error)) {
      attRes = await dbAny
        .from("student_attendance")
        .select("student_id, status")
        .eq("date", date)
        .in("student_id", ids);
    }
    if (attRes.error) throw AppError.fromSupabase(attRes.error, "student_attendance");
    const marks = new Map(
      ((attRes.data ?? []) as { student_id: string; status: string }[]).map((r) => [
        r.student_id,
        r.status as AttendanceStatus,
      ])
    );
    return roster.map((s) => ({
      studentId: s.id,
      studentName: s.name,
      status: marks.get(s.id) ?? "present",
    }));
  }

  // ── Batch ownership / permission validation ───────────────────────────────

  /**
   * Throws AppError.permission unless the caller is allowed to mark
   * attendance for `batchId`. Admin/management/coordinator are always
   * allowed. A teacher qualifies through any ONE of four routes, checked in
   * order: they own the batch (`batches.teacher_id`), they're linked to it via
   * the `teacher_students` junction, they're **scheduled to teach a class for
   * it**, or a coordinator put students of this batch into a class of theirs
   * (`class_students`).
   *
   * The scheduled-class route matters most in practice: `batches.teacher_id`
   * is a legacy single-owner field that class scheduling never writes and the
   * junction is empty on installs that allocate work through the timetable —
   * so without it a teacher handed a class could see the sheet and be refused
   * on submit, which is exactly the dead end this guard is meant to prevent.
   *
   * Called by `saveDay` before any write happens — so an unauthorised
   * teacher can never insert a single audit row.
   */
  async assertBatchAccess(batchId: string, marker: AttendanceMarker): Promise<void> {
    const role = (marker.role ?? "").toLowerCase();
    if (role === "admin" || role === "management" || role === "coordinator") return;
    if (!marker.profileId) throw AppError.permission("Marker identity required");

    // Direct ownership.
    const own = await this.db
      .from("batches")
      .select("id, teacher_id")
      .eq("id", batchId)
      .maybeSingle();
    if (own.error && !isSchemaCacheMiss(own.error)) {
      throw AppError.fromSupabase(own.error, "batches");
    }
    if (own.data && (own.data as { teacher_id?: string }).teacher_id === marker.profileId) {
      return;
    }

    // Junction-table fallback (teacher_students).
    try {
      const j = await this.db
        .from("teacher_students" as never)
        .select("teacher_id")
        .eq("batch_id", batchId)
        .eq("teacher_id", marker.profileId)
        .limit(1);
      if (!j.error && (j.data ?? []).length > 0) return;
    } catch {
      // Junction table absent on some installs — fall through to deny.
    }

    // Scheduled-class fallback. A coordinator scheduling a class for this
    // batch IS the assignment; cancelled classes don't count, so revoking the
    // class revokes the access with it. Substitutes are covered because a
    // substitution swaps `teacher_id` on the row.
    try {
      const s = await this.db
        .from("class_schedules" as never)
        .select("id")
        .eq("batch_id", batchId)
        .eq("teacher_id", marker.profileId)
        .neq("status", "cancelled")
        .limit(1);
      if (!s.error && (s.data ?? []).length > 0) return;
    } catch {
      // Scheduling module absent on some installs — fall through.
    }

    // Per-class roster fallback. A multi-standard class deliberately mixes
    // batches, so the teacher of that class is authorised for each batch its
    // assigned students come from — the class's own batch (checked above) is
    // not necessarily the batch a visiting student belongs to.
    try {
      const c = await this.db
        .from("class_students" as never)
        .select("id, class_schedules!inner(teacher_id)")
        .eq("batch_id", batchId)
        .eq("class_schedules.teacher_id", marker.profileId)
        .limit(1);
      if (!c.error && (c.data ?? []).length > 0) return;
    } catch {
      // Table absent until the assignment migration is applied — deny as before.
    }

    throw AppError.permission(
      "You are not assigned to this batch. Ask your coordinator to schedule a " +
        "class for it, or to assign you its students.",
    );
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Upsert a whole day's marks for a batch in one round-trip.
   *
   * Lifecycle (per submission)
   *   1. validate marker identity
   *   2. validate batch ownership / access (admin override allowed)
   *   3. attach marker metadata (id, name, role, timestamp, method)
   *   4. upsert with conflict resolution on (student_id, date)
   *   5. fall back to legacy column set if the schema cache hasn't caught up
   *   6. audit row is written by the DB trigger — service doesn't need to
   *      touch the audit table directly
   */
  async saveDay(
    batchId: string,
    date: string,
    rows: AttendanceDraftRow[],
    marker?: AttendanceMarker | string,
    method: StudentAttendanceRecord["method"] = "manual",
  ): Promise<void> {
    if (rows.length === 0) return;

    // Back-compat: older call-sites pass a bare profileId string. Promote
    // it to a minimal marker so the write path below is uniform.
    const normalisedMarker: AttendanceMarker | null =
      typeof marker === "string"
        ? { profileId: marker, userId: marker, name: "", role: "" }
        : marker ?? null;

    if (normalisedMarker?.role) {
      await this.assertBatchAccess(batchId, normalisedMarker);
    }

    const nowIso = new Date().toISOString();
    const enterprisePayload = rows.map((r) => ({
      student_id: r.studentId,
      batch_id: batchId,
      attendance_date: date,
      date,
      status: r.status,
      method,
      remarks: null as string | null,
      marked_by: normalisedMarker?.profileId ?? null,
      marked_by_name: normalisedMarker?.name || null,
      marked_by_role: normalisedMarker?.role || null,
      marked_at: nowIso,
      last_updated_by: normalisedMarker?.profileId ?? null,
      last_updated_at: nowIso,
      updated_at: nowIso,
    }));

    // First attempt — full enterprise payload.
    const first = await this.db
      .from("student_attendance")
      .upsert(enterprisePayload as never, { onConflict: "student_id,date" });

    if (!first.error) return;

    // Schema cache miss → downgrade to legacy column set so writes still
    // succeed against a pre-migration database, then surface a clear hint.
    if (isSchemaCacheMiss(first.error)) {
      const legacyPayload = rows.map((r) => ({
        student_id: r.studentId,
        batch_id: batchId,
        date,
        status: r.status,
        marked_by: normalisedMarker?.profileId ?? null,
      }));
      const fallback = await this.db
        .from("student_attendance")
        .upsert(legacyPayload as never, { onConflict: "student_id,date" });
      if (!fallback.error) {
        // Write succeeded in degraded mode. Surface a soft warning via a
        // thrown AppError.validation so the UI can show a toast — caller
        // catches and translates.
        throw AppError.validation(
          `Attendance saved in legacy mode — marker identity not captured. ${SCHEMA_HELP}`,
        );
      }
      throw AppError.validation(SCHEMA_HELP, fallback.error);
    }

    throw AppError.fromSupabase(first.error, "student_attendance.saveDay");
  }

  // ── History / lookups ─────────────────────────────────────────────────────

  /** Recent attendance history for one student. Returns marker metadata. */
  async studentHistory(studentId: string, limit = 60): Promise<StudentAttendanceRecord[]> {
    const tryWith = async (cols: string) =>
      this.db
        .from("student_attendance")
        .select(cols)
        .eq("student_id", studentId)
        .order("attendance_date", { ascending: false, nullsFirst: false })
        .order("date", { ascending: false })
        .limit(limit);

    let res = await tryWith(ATT_SELECT_FULL);
    if (res.error && isSchemaCacheMiss(res.error)) res = await tryWith(ATT_SELECT_LEGACY);
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as unknown as AttRow[]).map(toRecord);
  }

  /** Per-day analytics for a batch over a date range. */
  async batchAnalytics(
    batchId: string,
    fromDate: string,
    toDate: string,
  ): Promise<{ summary: AttendanceSummary; trend: AttendanceTrendPoint[] }> {
    const tryWith = async (col: "attendance_date" | "date") =>
      this.db
        .from("student_attendance")
        .select(`${col}, status`)
        .eq("batch_id", batchId)
        .gte(col, fromDate)
        .lte(col, toDate);

    let res = await tryWith("attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await tryWith("date");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");

    const rows = ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      date: String(r.attendance_date ?? r.date ?? ""),
      status: String(r.status ?? ""),
    }));

    const byDay = new Map<string, AttendanceSummary>();
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    for (const r of rows) {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "late") late++;
      else if (r.status === "excused") excused++;
      const d =
        byDay.get(r.date) ??
        {
          date: r.date,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          presentPct: 0,
        };
      d.total++;
      if (r.status === "present") d.present++;
      else if (r.status === "absent") d.absent++;
      else if (r.status === "late") d.late++;
      else if (r.status === "excused") d.excused++;
      byDay.set(r.date, d);
    }
    const trend: AttendanceTrendPoint[] = [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        presentPct: d.total ? Math.round((d.present / d.total) * 100) : 0,
      }));
    const total = rows.length;
    return {
      summary: {
        date: `${fromDate} → ${toDate}`,
        total,
        present,
        absent,
        late,
        excused,
        presentPct: total ? Math.round((present / total) * 100) : 0,
      },
      trend,
    };
  }

  /** Students marked absent on a given date (absent tracking). */
  async absentList(date: string): Promise<StudentAttendanceRecord[]> {
    // Use the untyped builder cast (generated types lag schema migrations).
    type Envelope = {
      data: Record<string, unknown>[] | null;
      error: { code?: string; message?: string } | null;
    };
    const dbAny = this.db as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (k: string, v: string) => {
            in: (k: string, v: string[]) => { order: (k: string) => Promise<Envelope> };
          };
        };
      };
    };
    const tryWith = (cols: string, dateCol: "attendance_date" | "date") =>
      dbAny
        .from("student_attendance")
        .select(`${cols}, students(name)`)
        .eq(dateCol, date)
        .in("status", ["absent", "late"])
        .order("status");

    let res = await tryWith(ATT_SELECT_FULL, "attendance_date");
    if (res.error && isSchemaCacheMiss(res.error)) res = await tryWith(ATT_SELECT_LEGACY, "date");
    if (res.error) throw AppError.fromSupabase(res.error, "student_attendance");
    return ((res.data ?? []) as unknown as AttRow[]).map(toRecord);
  }

  // ── Audit / reporting helpers ─────────────────────────────────────────────

  /** Audit timeline for a batch+date — who marked, when, what changed. */
  async auditTimeline(filters: {
    batchId?: string;
    date?: string;
    fromDate?: string;
    toDate?: string;
    markerId?: string;
    limit?: number;
  }): Promise<AttendanceAuditEntry[]> {
    let q = this.db
      .from("student_attendance_audit" as never)
      .select(
        "id, attendance_id, student_id, batch_id, attendance_date, old_status, new_status, " +
        "method, remarks, changed_by, changed_by_name, changed_by_role, change_type, changed_at",
      )
      .order("changed_at", { ascending: false })
      .limit(filters.limit ?? 200);
    if (filters.batchId) q = q.eq("batch_id", filters.batchId);
    if (filters.date) q = q.eq("attendance_date", filters.date);
    if (filters.fromDate) q = q.gte("attendance_date", filters.fromDate);
    if (filters.toDate) q = q.lte("attendance_date", filters.toDate);
    if (filters.markerId) q = q.eq("changed_by", filters.markerId);

    const res = await q;
    if (res.error) {
      // Audit table missing (migration not applied) → empty timeline, no
      // crash. The save path already surfaces a schema-update warning.
      if (isSchemaCacheMiss(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_attendance_audit");
    }
    return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      attendanceId: String(r.attendance_id),
      studentId: (r.student_id as string) ?? undefined,
      batchId: (r.batch_id as string) ?? undefined,
      date: String(r.attendance_date ?? ""),
      oldStatus: (r.old_status as AttendanceStatus | null) ?? undefined,
      newStatus: r.new_status as AttendanceStatus,
      method: (r.method as StudentAttendanceRecord["method"]) ?? undefined,
      remarks: (r.remarks as string) ?? undefined,
      changedBy: (r.changed_by as string) ?? undefined,
      changedByName: (r.changed_by_name as string) ?? undefined,
      changedByRole: (r.changed_by_role as string) ?? undefined,
      changeType: r.change_type as "insert" | "update",
      changedAt: String(r.changed_at ?? ""),
    }));
  }

  /** Distinct markers active in a date range (for the report filter pickers). */
  async markerList(fromDate: string, toDate: string): Promise<
    { profileId: string; name: string; role: string }[]
  > {
    const res = await this.db
      .from("student_attendance" as never)
      .select("marked_by, marked_by_name, marked_by_role")
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate)
      .not("marked_by", "is", null);
    if (res.error) {
      if (isSchemaCacheMiss(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_attendance");
    }
    const seen = new Map<string, { profileId: string; name: string; role: string }>();
    for (const r of (res.data ?? []) as Record<string, unknown>[]) {
      const id = (r.marked_by as string) ?? "";
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        profileId: id,
        name: (r.marked_by_name as string) ?? "",
        role: (r.marked_by_role as string) ?? "",
      });
    }
    return [...seen.values()];
  }
}

export const attendanceService = new AttendanceService();
