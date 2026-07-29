import { BaseService, AppError } from "@/shared/services";
import type {
  ClassStudentAssignment,
  ClassStudentCandidate,
} from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Per-class student assignment.
//
// A class used to mean "whoever happens to be in the batch". It now means an
// explicit list: the coordinator picks standards (one or more), the eligible
// students load pre-selected, and whoever is left selected is written to
// class_students. The teacher's attendance sheet then shows exactly those
// students — see classAttendance.roster().
//
// A class with NO rows here keeps the old batch-roster behaviour, so every
// class scheduled before this existed still works.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

/** A students row as read for the picker (only the columns that exist live). */
interface StudentRow {
  id: string;
  name?: string | null;
  roll_number?: string | null;
  standard_id?: string | null;
  batch_id?: string | null;
  section?: string | null;
}

interface AssignmentRow {
  id: string;
  class_schedule_id: string;
  student_id: string;
  student_name?: string | null;
  roll_number?: string | null;
  standard_id?: string | null;
  standard_name?: string | null;
  batch_id?: string | null;
  batch_name?: string | null;
  assigned_by?: string | null;
  assigned_at?: string | null;
}

export interface CandidateFilters {
  standardIds: string[];
  /** Optional narrowing — a class can be "Std 9 + 10, morning batch only". */
  batchId?: string;
}

const toAssignment = (r: AssignmentRow): ClassStudentAssignment => ({
  id: String(r.id),
  classScheduleId: String(r.class_schedule_id),
  studentId: String(r.student_id),
  studentName: r.student_name ?? "",
  rollNumber: r.roll_number ?? undefined,
  standardId: r.standard_id ?? undefined,
  standardName: r.standard_name ?? undefined,
  batchId: r.batch_id ?? undefined,
  batchName: r.batch_name ?? undefined,
  assignedBy: r.assigned_by ?? undefined,
  assignedAt: r.assigned_at ?? undefined,
});

class ClassStudentsService extends BaseService {
  private table() {
    return this.db.from("class_students" as never);
  }

  // ── The picker ────────────────────────────────────────────────────────────
  /**
   * Every active student in the given standards (optionally narrowed to one
   * batch), name-ordered, ready to be shown pre-selected.
   *
   * `students.section` is queried separately from the main select: it is an
   * optional column on some installs, and naming a missing column in a select
   * fails the WHOLE query rather than just that field.
   */
  async candidates(filters: CandidateFilters): Promise<ClassStudentCandidate[]> {
    const standardIds = filters.standardIds.filter(Boolean);
    if (standardIds.length === 0) return [];

    let q = this.db
      .from("students")
      .select("id, name, roll_number, standard_id, batch_id")
      .in("standard_id", standardIds)
      .eq("is_active", true);
    if (filters.batchId) q = q.eq("batch_id", filters.batchId);

    const res = await q.order("name");
    if (res.error) throw AppError.fromSupabase(res.error, "students");
    const rows = (res.data ?? []) as unknown as StudentRow[];
    if (rows.length === 0) return [];

    const [standardNames, batchNames] = await Promise.all([
      this.nameMap("standards", rows.map((r) => r.standard_id)),
      this.nameMap("batches", rows.map((r) => r.batch_id)),
    ]);

    return rows.map((r) => ({
      studentId: String(r.id),
      studentName: r.name ?? "",
      rollNumber: r.roll_number ?? undefined,
      standardId: r.standard_id ?? undefined,
      standardName: r.standard_id ? standardNames.get(r.standard_id) : undefined,
      batchId: r.batch_id ?? undefined,
      batchName: r.batch_id ? batchNames.get(r.batch_id) : undefined,
    }));
  }

  /** id → name for a lookup table, in one round-trip. */
  private async nameMap(
    table: "standards" | "batches",
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const res = await this.db.from(table).select("id, name").in("id", unique);
    if (res.error) return map; // labels are cosmetic — never fail the picker
    for (const r of (res.data ?? []) as unknown as { id: string; name?: string }[]) {
      if (r.name) map.set(String(r.id), r.name);
    }
    return map;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────
  /** The students assigned to one class (empty ⇒ batch fallback applies). */
  async listAssigned(classScheduleId: string): Promise<ClassStudentAssignment[]> {
    const res = await this.table()
      .select("*")
      .eq("class_schedule_id", classScheduleId)
      .order("student_name");
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_students");
    }
    return ((res.data as unknown as AssignmentRow[]) ?? []).map(toAssignment);
  }

  /** How many students each class has assigned — for list/badge rendering. */
  async countsFor(classScheduleIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (classScheduleIds.length === 0) return counts;
    const res = await this.table()
      .select("class_schedule_id")
      .in("class_schedule_id", classScheduleIds);
    if (res.error) return counts; // missing table / no access → no badges
    for (const r of (res.data as unknown as { class_schedule_id: string }[]) ?? []) {
      const k = String(r.class_schedule_id);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  /**
   * Replace the roster of one or more classes with `studentIds`.
   *
   * Student details are re-read from `students` rather than taken from the
   * caller: the denormalised name/roll/batch are what the attendance sheet and
   * the batch grouping run on, so they must come from the database, not from
   * whatever the browser happened to be holding.
   *
   * A recurrence creates many rows for one intent, so this applies the same
   * roster to every occurrence.
   */
  async setRoster(
    classScheduleIds: string[],
    studentIds: string[],
    assignedBy?: string,
  ): Promise<void> {
    const scheduleIds = classScheduleIds.filter(Boolean);
    if (scheduleIds.length === 0) return;

    const del = await this.table().delete().in("class_schedule_id", scheduleIds);
    if (del.error) {
      if (isMissingTable(del.error)) return; // migration not applied yet
      throw AppError.fromSupabase(del.error, "class_students");
    }

    const unique = [...new Set(studentIds.filter(Boolean))];
    if (unique.length === 0) return; // cleared on purpose → batch fallback

    const details = await this.studentDetails(unique);
    const rows = scheduleIds.flatMap((classScheduleId) =>
      details.map((d) => ({
        class_schedule_id: classScheduleId,
        student_id: d.studentId,
        student_name: d.studentName,
        roll_number: d.rollNumber ?? null,
        standard_id: d.standardId ?? null,
        standard_name: d.standardName ?? null,
        batch_id: d.batchId ?? null,
        batch_name: d.batchName ?? null,
        assigned_by: assignedBy ?? null,
      })),
    );
    const ins = await this.table().insert(rows as never);
    if (ins.error) throw AppError.fromSupabase(ins.error, "class_students");
  }

  /** Authoritative details for the students being assigned. */
  private async studentDetails(studentIds: string[]): Promise<ClassStudentCandidate[]> {
    const res = await this.db
      .from("students")
      .select("id, name, roll_number, standard_id, batch_id")
      .in("id", studentIds);
    if (res.error) throw AppError.fromSupabase(res.error, "students");
    const rows = (res.data ?? []) as unknown as StudentRow[];
    const [standardNames, batchNames] = await Promise.all([
      this.nameMap("standards", rows.map((r) => r.standard_id)),
      this.nameMap("batches", rows.map((r) => r.batch_id)),
    ]);
    return rows.map((r) => ({
      studentId: String(r.id),
      studentName: r.name ?? "",
      rollNumber: r.roll_number ?? undefined,
      standardId: r.standard_id ?? undefined,
      standardName: r.standard_id ? standardNames.get(r.standard_id) : undefined,
      batchId: r.batch_id ?? undefined,
      batchName: r.batch_id ? batchNames.get(r.batch_id) : undefined,
    }));
  }
}

export const classStudentsService = new ClassStudentsService();
