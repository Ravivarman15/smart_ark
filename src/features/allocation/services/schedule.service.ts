import { BaseService, AppError } from "@/shared/services";
import { commsDispatcherService } from "@/features/communication/services";
import { classStudentsService } from "./classStudents.service";
import type { RecipientCandidate } from "@/features/communication/types/communication.types";
import {
  academicYearOf,
  expandRecurrence,
  effectivePattern,
  monthOf,
} from "../utils/recurrence";
import { localContext } from "../utils/clientContext";
import type {
  ClassSchedule,
  ClassStandardPlanEntry,
  ClientContext,
  RepeatPattern,
  ScheduleFilters,
  ScheduleInput,
  ScheduleStatus,
} from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Class Scheduling service — the timetable engine.
//
//   • CRUD over class_schedules (RLS scopes coordinators to their own staff).
//   • Weekly-repeat expansion (one row per occurrence, so each can be completed
//     / cancelled / rescheduled independently and feed teaching-hour analytics).
//   • Status transitions: complete / cancel / miss / reschedule.
//   • Extra-class creation with instant teacher notification.
//
// Notifications reuse the existing comms dispatcher (settings-gated, best-effort)
// — a disabled event or missing comms table never blocks the schedule mutation.
// ─────────────────────────────────────────────────────────────────────────────

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
};

/**
 * A named column PostgREST can't resolve (42703 / stale schema cache). Distinct
 * from a missing table: the table is fine, one column isn't there yet.
 */
const isMissingColumn = (err: { message?: string; code?: string } | null | undefined): boolean => {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("could not find"));
};

/**
 * "This class covers standard X" — matching either the primary scalar or the
 * multi-standard array.
 *
 * The array literal MUST be inner-quoted: `cs.{uuid}` inside an `or(...)` makes
 * PostgREST hand the bare uuid to Postgres as an array literal and the whole
 * request 400s with `malformed array literal`. Verified against the live REST
 * endpoint, which is the only way to catch it — it type-checks either way.
 */
export const standardOrFilter = (standardId: string): string =>
  `standard_id.eq.${standardId},standard_ids.cs.{"${standardId}"}`;

const minutesBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
};

/**
 * Read `standard_plan` defensively.
 *
 * The column is jsonb, so nothing between here and Postgres guarantees the
 * shape — and a class whose plan came back malformed must still RENDER. An
 * entry with no standard id is dropped rather than passed on, because the plan
 * is consumed positionally and a hole in it mislabels every entry after it.
 */
const toPlan = (v: unknown): ClassStandardPlanEntry[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => {
      // Read multi-subject array; fall back to the scalar for old rows.
      const subjectIds: string[] = Array.isArray(e.subject_ids)
        ? (e.subject_ids as string[]).map(String).filter(Boolean)
        : e.subject_id
          ? [String(e.subject_id)]
          : [];
      const subjectNames: string[] = Array.isArray(e.subject_names)
        ? (e.subject_names as string[]).map(String).filter(Boolean)
        : e.subject_name
          ? [String(e.subject_name)]
          : [];
      return {
        standardId: String(e.standard_id ?? ""),
        standardName: (e.standard_name as string) ?? undefined,
        // Backward compat scalar: first subject.
        subjectId: subjectIds[0] ?? ((e.subject_id as string) ?? undefined),
        subjectName: subjectNames[0] ?? ((e.subject_name as string) ?? undefined),
        subjectIds,
        subjectNames,
        isTest: e.is_test === true || undefined,
        testName: (e.test_name as string) ?? undefined,
        batchId: (e.batch_id as string) ?? undefined,
        batchName: (e.batch_name as string) ?? undefined,
        sectionId: (e.section_id as string) ?? undefined,
        sectionName: (e.section_name as string) ?? undefined,
      };
    })
    .filter((e) => e.standardId);
};

const toSchedule = (r: Record<string, unknown>): ClassSchedule => ({
  id: String(r.id),
  teacherId: (r.teacher_id as string) ?? undefined,
  teacherName: (r.teacher_name as string) ?? undefined,
  coordinatorId: (r.coordinator_id as string) ?? undefined,
  standardId: (r.standard_id as string) ?? undefined,
  standardName: (r.standard_name as string) ?? undefined,
  // Pre-multi-standard rows have no array — fall back to the single standard so
  // consumers can read `standardIds` uniformly without a null check everywhere.
  standardIds: Array.isArray(r.standard_ids)
    ? (r.standard_ids as string[]).map(String)
    : r.standard_id
      ? [String(r.standard_id)]
      : [],
  standardNames: Array.isArray(r.standard_names)
    ? (r.standard_names as string[]).map(String).filter(Boolean)
    : r.standard_name
      ? [String(r.standard_name)]
      : [],
  // Left EMPTY for pre-20261012 rows rather than derived here: `effectivePlan()`
  // does that, and doing it in the mapper too would make `standardPlan.length`
  // stop meaning "this class was written with a plan" — which is exactly the
  // question `isSplitSubject()` asks before choosing how to label it.
  standardPlan: toPlan(r.standard_plan),
  sectionId: (r.section_id as string) ?? undefined,
  sectionName: (r.section_name as string) ?? undefined,
  subjectId: (r.subject_id as string) ?? undefined,
  subjectName: (r.subject_name as string) ?? undefined,
  batchId: (r.batch_id as string) ?? undefined,
  batchName: (r.batch_name as string) ?? undefined,
  scheduleDate: String(r.schedule_date ?? ""),
  startTime: String(r.start_time ?? "").slice(0, 5),
  endTime: String(r.end_time ?? "").slice(0, 5),
  durationMinutes: Number(
    r.duration_minutes ??
      minutesBetween(String(r.start_time ?? "0:0"), String(r.end_time ?? "0:0")),
  ),
  mode: (r.mode as ClassSchedule["mode"]) ?? "offline",
  room: (r.room as string) ?? undefined,
  meetingLink: (r.meeting_link as string) ?? undefined,
  remarks: (r.remarks as string) ?? undefined,
  repeatWeekly: Boolean(r.repeat_weekly),
  repeatUntil: (r.repeat_until as string) ?? undefined,
  holidaySkip: r.holiday_skip !== false,
  isExtra: Boolean(r.is_extra),
  extraReason: (r.extra_reason as string) ?? undefined,
  status: (r.status as ScheduleStatus) ?? "scheduled",
  cancelReason: (r.cancel_reason as string) ?? undefined,
  rescheduledFrom: (r.rescheduled_from as string) ?? undefined,
  originalTeacherId: (r.original_teacher_id as string) ?? undefined,
  startedAt: (r.started_at as string) ?? undefined,
  completedAt: (r.completed_at as string) ?? undefined,
  attendanceSubmitted: Boolean(r.attendance_submitted),
  liveClassId: (r.live_class_id as string) ?? undefined,
  // Phase 3 — academic dimensions
  academicYear: (r.academic_year as string) ?? undefined,
  term: (r.term as string) ?? undefined,
  month: r.month != null ? Number(r.month) : undefined,
  campusId: (r.campus_id as string) ?? undefined,
  campusName: (r.campus_name as string) ?? undefined,
  department: (r.department as string) ?? undefined,
  repeatPattern:
    (r.repeat_pattern as RepeatPattern) ?? (r.repeat_weekly ? "weekly" : "none"),
  repeatDays: Array.isArray(r.repeat_days) ? (r.repeat_days as number[]).map(Number) : [],
  seriesId: (r.series_id as string) ?? undefined,
  // Phase 3/5 — class tracking
  actualMinutes: r.actual_minutes != null ? Number(r.actual_minutes) : undefined,
  lateMinutes: Number(r.late_minutes ?? 0),
  earlyMinutes: Number(r.early_minutes ?? 0),
  startDevice: (r.start_device as string) ?? undefined,
  startBrowser: (r.start_browser as string) ?? undefined,
  startIp: (r.start_ip as string) ?? undefined,
  startLat: r.start_lat != null ? Number(r.start_lat) : undefined,
  startLng: r.start_lng != null ? Number(r.start_lng) : undefined,
  createdBy: (r.created_by as string) ?? undefined,
  createdAt: (r.created_at as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

interface Actor {
  id?: string;
  name?: string;
  role?: string;
}

/**
 * Normalise the two ways a caller can express standards.
 *
 * `standardIds` is authoritative; `standardId` is its first element. Keeping
 * the scalar in step matters — RLS, every `standardId` filter and the
 * denormalised `standard_name` label all still read the scalar column.
 */
export const normalizeStandards = (input: {
  standardId?: string;
  standardIds?: string[];
  standardPlan?: { standardId: string }[];
}): { ids: string[]; primaryId?: string } => {
  // The PLAN outranks both when present: it is the only one of the three that
  // also says what each standard is doing, so letting `standardIds` disagree
  // with it would put a standard on the class with no subject attached to it.
  // Then the array, then the scalar — merging would let a stale single-standard
  // value ride along and become the primary.
  const planIds = (input.standardPlan ?? []).map((e) => e.standardId).filter(Boolean);
  const source = planIds.length > 0 ? planIds : (input.standardIds ?? []).filter(Boolean);
  const ids = [...new Set(source.length > 0 ? source : input.standardId ? [input.standardId] : [])];
  return { ids, primaryId: ids[0] };
};

/** UUID for grouping a recurrence series (falls back where crypto is absent). */
const newId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/** Minutes between an ISO timestamp and an HH:MM wall-clock on the same date. */
const minutesFromScheduled = (
  actualIso: string,
  scheduleDate: string,
  hhmm: string,
): number => {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = scheduleDate.split("-").map(Number);
  const actual = new Date(actualIso);
  // Compare in the viewer's local frame — schedule times are wall-clock local.
  const planned = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, m ?? 0, 0, 0);
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
};

/**
 * Expand an allocation into its occurrence dates.
 *
 * Phase 1 shipped weekly-only repetition; Phase 3 generalised this into the
 * daily / weekly / monthly + day-of-week engine in `utils/recurrence.ts`. This
 * export stays as the service-level entry point (and keeps the original name
 * its callers and tests use) — the maths lives in the pure module.
 */
export const expandWeeklyDates = (input: ScheduleInput): string[] =>
  expandRecurrence(input);

class ScheduleService extends BaseService {
  private table() {
    return this.db.from("class_schedules" as never);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────
  async list(filters: ScheduleFilters = {}): Promise<ClassSchedule[]> {
    const res = await this.runList(filters, true);
    // `standard_ids` is absent until the multi-standard migration is applied;
    // a missing column fails the whole query, so fall back to the scalar filter
    // rather than reporting "no classes this week".
    if (res.error && isMissingColumn(res.error)) {
      const legacy = await this.runList(filters, false);
      if (legacy.error) {
        if (isMissingTable(legacy.error)) return [];
        throw AppError.fromSupabase(legacy.error, "class_schedules");
      }
      return ((legacy.data as unknown as Record<string, unknown>[]) ?? []).map(toSchedule);
    }
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_schedules");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toSchedule);
  }

  private runList(filters: ScheduleFilters, multiStandard: boolean) {
    let q = this.table().select("*");
    if (filters.teacherId) q = q.eq("teacher_id", filters.teacherId);
    if (filters.coordinatorId) q = q.eq("coordinator_id", filters.coordinatorId);
    if (filters.standardId) {
      // A class covering Std 9 + 10 must appear under BOTH, not only under the
      // primary standard it happens to be stamped with.
      q = multiStandard
        ? q.or(standardOrFilter(filters.standardId))
        : q.eq("standard_id", filters.standardId);
    }
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.isExtra !== undefined) q = q.eq("is_extra", filters.isExtra);
    if (filters.academicYear) q = q.eq("academic_year", filters.academicYear);
    if (filters.term) q = q.eq("term", filters.term);
    if (filters.month) q = q.eq("month", filters.month);
    if (filters.campusId) q = q.eq("campus_id", filters.campusId);
    if (filters.department) q = q.eq("department", filters.department);
    if (filters.from) q = q.gte("schedule_date", filters.from);
    if (filters.to) q = q.lte("schedule_date", filters.to);
    return q.order("schedule_date", { ascending: true }).order("start_time", { ascending: true });
  }

  async get(id: string): Promise<ClassSchedule | null> {
    const res = (await this.table().select("*").eq("id", id).maybeSingle()) as {
      data: Record<string, unknown> | null;
      error: { message?: string } | null;
    };
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "class_schedules");
    }
    return res.data ? toSchedule(res.data) : null;
  }

  // ── Denormalisation lookups (store names so lists render without joins) ─────
  private async resolveNames(input: ScheduleInput): Promise<Record<string, string | null>> {
    const pick = async (table: string, id?: string): Promise<string | null> => {
      if (!id) return null;
      const res = await this.db.from(table as never).select("name").eq("id", id).maybeSingle();
      return (res.data as { name?: string } | null)?.name ?? null;
    };
    const { primaryId } = normalizeStandards(input);
    const [teacher_name, subject_name, standard_name, section_name, batch_name, campus_name] =
      await Promise.all([
        pick("profiles", input.teacherId),
        pick("subjects", input.subjectId),
        pick("standards", primaryId),
        pick("sections", input.sectionId),
        pick("batches", input.batchId),
        pick("campuses", input.campusId),
      ]);
    return {
      teacher_name,
      subject_name,
      standard_name,
      section_name,
      batch_name,
      campus_name,
      // Department defaults to the teacher's own department so allocation stays
      // dynamic — nothing is hardcoded and analytics group correctly by default.
      department: input.department ?? (await this.teacherDepartment(input.teacherId)),
    };
  }

  /** The teacher's department (used as the allocation's default department). */
  private async teacherDepartment(teacherId?: string): Promise<string | null> {
    if (!teacherId) return null;
    const res = (await this.db
      .from("profiles" as never)
      .select("department")
      .eq("id", teacherId)
      .maybeSingle()) as { data: { department?: string } | null };
    return res.data?.department ?? null;
  }

  /**
   * Resolve the class plan, with every label filled in.
   *
   * Callers that predate the plan (and the reschedule clone) pass none, so one
   * is derived from the standards + scalar subject/batch they DID pass: that is
   * genuinely what those rows meant, and deriving here keeps a single write
   * path instead of two.
   *
   * Names are denormalised onto the entry for the same reason they are on the
   * row — the timetable renders a week of classes without joining four lookup
   * tables. They are resolved in three queries, not four per standard.
   */
  private async resolvePlan(input: ScheduleInput): Promise<ClassStandardPlanEntry[]> {
    const source: ClassStandardPlanEntry[] = input.standardPlan?.length
      ? input.standardPlan
      : normalizeStandards(input).ids.map((standardId) => ({
          standardId,
          subjectId: input.subjectId || undefined,
          subjectIds: input.subjectId ? [input.subjectId] : [],
          batchId: input.batchId || undefined,
          sectionId: input.sectionId || undefined,
        }));
    if (source.length === 0) return [];

    // Gather ALL subject IDs across all entries for a single name-map query.
    const allSubjectIds = source.flatMap((e) =>
      e.subjectIds?.length ? e.subjectIds : e.subjectId ? [e.subjectId] : [],
    );
    const [standards, subjects, batches, sections] = await Promise.all([
      this.nameMap("standards", source.map((e) => e.standardId)),
      this.nameMap("subjects", allSubjectIds),
      this.nameMap("batches", source.map((e) => e.batchId)),
      this.nameMap("sections", source.map((e) => e.sectionId)),
    ]);
    return source.map((e) => {
      const ids = e.subjectIds?.length ? e.subjectIds : e.subjectId ? [e.subjectId] : [];
      const names = ids.map((id) => subjects.get(id)).filter((n): n is string => !!n);
      return {
        standardId: e.standardId,
        standardName: standards.get(e.standardId),
        // Backward compat scalar: first subject.
        subjectId: ids[0] ?? undefined,
        subjectName: names[0] ?? undefined,
        subjectIds: ids,
        subjectNames: names,
        isTest: e.isTest || undefined,
        testName: e.testName || undefined,
        batchId: e.batchId,
        batchName: e.batchId ? batches.get(e.batchId) : undefined,
        sectionId: e.sectionId,
        sectionName: e.sectionId ? sections.get(e.sectionId) : undefined,
      };
    });
  }

  /** id → name for a lookup table, in one round-trip. Labels are cosmetic, so
   *  a failed lookup yields an unlabelled entry rather than a failed save. */
  private async nameMap(
    table: "standards" | "subjects" | "batches" | "sections",
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const res = await this.db.from(table as never).select("id, name").in("id", unique);
    if (res.error) return map;
    for (const r of (res.data ?? []) as unknown as { id: string; name?: string }[]) {
      if (r.name) map.set(String(r.id), r.name);
    }
    return map;
  }

  /** The jsonb shape. snake_case, like every other column on the row. */
  private static planRow(plan: ClassStandardPlanEntry[]): Record<string, unknown>[] {
    return plan.map((e) => ({
      standard_id: e.standardId,
      standard_name: e.standardName ?? null,
      // Backward compat scalar: first subject.
      subject_id: e.subjectId ?? (e.subjectIds?.[0] ?? null),
      subject_name: e.subjectName ?? (e.subjectNames?.[0] ?? null),
      // Multi-subject arrays.
      subject_ids: e.subjectIds?.length ? e.subjectIds : null,
      subject_names: e.subjectNames?.length ? e.subjectNames : null,
      // Test mode.
      is_test: e.isTest ?? null,
      test_name: e.testName ?? null,
      batch_id: e.batchId ?? null,
      batch_name: e.batchName ?? null,
      section_id: e.sectionId ?? null,
      section_name: e.sectionName ?? null,
    }));
  }

  /** Labels for every standard on the class, in the same order as the ids. */
  private async standardLabels(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const res = await this.db.from("standards").select("id, name").in("id", ids);
    if (res.error) return [];
    const byId = new Map(
      ((res.data ?? []) as unknown as { id: string; name?: string }[]).map((r) => [
        String(r.id),
        r.name ?? "",
      ]),
    );
    return ids.map((id) => byId.get(id) ?? "");
  }

  private toRow(
    input: ScheduleInput,
    names: Record<string, string | null>,
    coordinatorId?: string,
    actor?: Actor,
    standards: { ids: string[]; labels: string[] } = { ids: [], labels: [] },
    plan: ClassStandardPlanEntry[] = [],
  ): Record<string, unknown> {
    // The scalars ARE entry 0 whenever there is a plan — taken from it rather
    // than from `input` so the two can never disagree. Everything downstream
    // (RLS, the standardId filter, the denormalised labels on the timetable,
    // payroll) still reads the scalars, and a class whose primary standard said
    // Maths while the plan said Science would be wrong in whichever one the
    // reader happened to consult.
    const primary = plan[0];
    return {
      teacher_id: input.teacherId || null,
      teacher_name: names.teacher_name,
      coordinator_id: coordinatorId ?? actor?.id ?? null,
      standard_id: primary?.standardId ?? standards.ids[0] ?? input.standardId ?? null,
      standard_name: primary ? (primary.standardName ?? null) : names.standard_name,
      standard_ids: standards.ids,
      standard_names: standards.labels,
      standard_plan: ScheduleService.planRow(plan),
      section_id: (primary ? primary.sectionId : input.sectionId) || null,
      section_name: primary ? (primary.sectionName ?? null) : names.section_name,
      subject_id: (primary ? primary.subjectId : input.subjectId) || null,
      subject_name: primary ? (primary.subjectName ?? null) : names.subject_name,
      batch_id: (primary ? primary.batchId : input.batchId) || null,
      batch_name: primary ? (primary.batchName ?? null) : names.batch_name,
      start_time: input.startTime,
      end_time: input.endTime,
      mode: input.mode,
      room: input.room || null,
      meeting_link: input.meetingLink || null,
      remarks: input.remarks || null,
      repeat_weekly: effectivePattern(input) === "weekly",
      repeat_pattern: effectivePattern(input),
      repeat_days: input.repeatDays ?? [],
      repeat_until: input.repeatUntil || null,
      holiday_skip: input.holidaySkip !== false,
      is_extra: Boolean(input.isExtra),
      extra_reason: input.extraReason || null,
      // ── Academic dimensions (derived where the caller didn't supply them) ──
      academic_year: input.academicYear || academicYearOf(input.scheduleDate),
      term: input.term || null,
      campus_id: input.campusId || null,
      campus_name: names.campus_name,
      department: names.department,
      status: "scheduled",
      created_by: actor?.id ?? null,
    };
  }

  /**
   * Insert, surviving a project where 20261012 has not been applied yet.
   *
   * A column PostgREST cannot resolve fails the WHOLE statement, so without
   * this a deploy that reaches a database one migration behind cannot schedule
   * a class at all. Retrying without `standard_plan` degrades to the previous
   * behaviour — one subject for the class — which is worse than the new one and
   * far better than an outage. The read side already tolerates the absence.
   */
  private async insertRows(rows: Record<string, unknown>[]) {
    const res = await this.table().insert(rows as never).select("id");
    if (!res.error || !isMissingColumn(res.error)) return res;
    const stripped = rows.map(({ standard_plan: _ignored, ...rest }) => rest);
    return this.table().insert(stripped as never).select("id");
  }

  // ── Create ────────────────────────────────────────────────────────────────
  /**
   * Create one class (or a weekly series). Returns the created ids. Fires the
   * teacher notification for the FIRST occurrence (best-effort).
   */
  async create(
    input: ScheduleInput,
    opts: { coordinatorId?: string; actor?: Actor; isOverride?: boolean } = {},
  ): Promise<string[]> {
    await this.assertUnlocked(input.scheduleDate, opts.isOverride);
    const names = await this.resolveNames(input);
    const plan = await this.resolvePlan(input);
    const { ids: standardIds } = normalizeStandards(input);
    const standards = { ids: standardIds, labels: await this.standardLabels(standardIds) };
    const dates = expandRecurrence(input);
    const base = this.toRow(input, names, opts.coordinatorId, opts.actor, standards, plan);
    // One series id per recurrence run so the whole series can be edited,
    // cancelled or reported on as a unit. Month / academic year are stamped per
    // occurrence because a series legitimately straddles both.
    const seriesId = dates.length > 1 ? newId() : null;
    const rows = dates.map((schedule_date) => ({
      ...base,
      schedule_date,
      series_id: seriesId,
      month: monthOf(schedule_date),
      academic_year: input.academicYear || academicYearOf(schedule_date),
    }));
    const res = await this.insertRows(rows);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    const ids = ((res.data as unknown as { id: string }[]) ?? []).map((r) => String(r.id));

    // The chosen students apply to EVERY occurrence of the series — a weekly
    // class is one intent, not twelve separate rosters to re-pick.
    if (input.studentIds?.length) {
      await classStudentsService.setRoster(ids, input.studentIds, opts.actor?.id);
    }

    await this.notify(input.isExtra ? "teacher_extra_class" : "teacher_class_scheduled", {
      teacherId: input.teacherId,
      teacherName: names.teacher_name ?? undefined,
      date: dates[0],
      time: `${input.startTime}–${input.endTime}`,
      subject: names.subject_name ?? undefined,
      standard: names.standard_name ?? undefined,
      reason: input.extraReason,
      actorId: opts.actor?.id,
    });
    return ids;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(id: string, input: ScheduleInput, actor?: Actor, isOverride = false): Promise<void> {
    await this.assertUnlocked(input.scheduleDate, isOverride);
    const names = await this.resolveNames(input);
    const plan = await this.resolvePlan(input);
    const { ids: standardIds } = normalizeStandards(input);
    const row = this.toRow(
      input,
      names,
      undefined,
      actor,
      { ids: standardIds, labels: await this.standardLabels(standardIds) },
      plan,
    );
    // never clobber status/created_by/coordinator on an edit
    delete row.status;
    delete row.created_by;
    delete row.coordinator_id;
    row.schedule_date = input.scheduleDate;
    // Keep the academic dimensions consistent when the date moves.
    row.month = monthOf(input.scheduleDate);
    row.academic_year = input.academicYear || academicYearOf(input.scheduleDate);
    let res = await this.table().update(row as never).eq("id", id);
    if (res.error && isMissingColumn(res.error)) {
      const { standard_plan: _ignored, ...stripped } = row;
      res = await this.table().update(stripped as never).eq("id", id);
    }
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    // `undefined` means "the caller isn't editing the roster"; an empty array
    // means "clear it". Treating them the same would wipe the roster on every
    // unrelated edit (a time change, a room change).
    if (input.studentIds) {
      await classStudentsService.setRoster([id], input.studentIds, actor?.id);
    }
  }

  /**
   * Apply a patch to one class and PROVE the row actually moved.
   *
   * A PostgREST UPDATE whose row RLS filters away returns 204 with `error:
   * null` — byte-for-byte indistinguishable from success. That is exactly how
   * Start spent its life lying: teachers had no UPDATE policy on
   * class_schedules, every press updated zero rows, and the UI toasted "you're
   * live" while the coordinator's board kept the class under "not started".
   *
   * Asking for the id back makes a refused write a visible failure instead of a
   * green tick, so the next permission gap surfaces the first time it happens.
   */
  private async applyPatch(
    id: string,
    patch: Record<string, unknown>,
    action: string,
  ): Promise<void> {
    const res = (await this.table()
      .update(patch as never)
      .eq("id", id)
      .select("id")) as { data: { id: string }[] | null; error: { message?: string } | null };
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    if ((res.data ?? []).length === 0) {
      throw AppError.validation(
        `Could not ${action} this class — the database refused the change. ` +
          `You may not be assigned to it any more; ask your coordinator to re-check the timetable.`,
      );
    }
  }

  // ── Status transitions ──────────────────────────────────────────────────────
  async setStatus(id: string, status: ScheduleStatus, reason?: string): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === "cancelled") patch.cancel_reason = reason ?? null;
    if (status === "completed") patch.completed_at = new Date().toISOString();
    await this.applyPatch(id, patch, `mark this class ${status}`);
    await this.audit(id, status, reason ? { reason } : {});

    if (status === "cancelled") {
      const sched = await this.get(id);
      if (sched?.teacherId) {
        await this.notify("teacher_class_cancelled", {
          teacherId: sched.teacherId,
          teacherName: sched.teacherName,
          date: sched.scheduleDate,
          time: `${sched.startTime}–${sched.endTime}`,
          subject: sched.subjectName,
          standard: sched.standardName,
          reason,
        });
      }
    }
  }

  /**
   * Reschedule: mark the original 'rescheduled' and create a fresh 'scheduled'
   * row on the new date/time that links back via rescheduled_from.
   */
  async reschedule(
    id: string,
    newDate: string,
    newStart: string,
    newEnd: string,
    actor?: Actor,
    isOverride = false,
  ): Promise<string> {
    const orig = await this.get(id);
    if (!orig) throw AppError.validation("Original class not found.");
    await this.assertUnlocked(orig.scheduleDate, isOverride);
    await this.assertUnlocked(newDate, isOverride);
    await this.table().update({ status: "rescheduled" } as never).eq("id", id);
    const ins = await this.table()
      .insert({
        teacher_id: orig.teacherId ?? null,
        teacher_name: orig.teacherName ?? null,
        coordinator_id: orig.coordinatorId ?? actor?.id ?? null,
        standard_id: orig.standardId ?? null,
        standard_name: orig.standardName ?? null,
        standard_ids: orig.standardIds,
        standard_names: orig.standardNames,
        // Carried, not recomputed. A rescheduled split class is the SAME class
        // on a different day; dropping the plan here would silently flatten it
        // back to one subject for every standard in the room.
        standard_plan: ScheduleService.planRow(orig.standardPlan ?? []),
        section_id: orig.sectionId ?? null,
        section_name: orig.sectionName ?? null,
        subject_id: orig.subjectId ?? null,
        subject_name: orig.subjectName ?? null,
        batch_id: orig.batchId ?? null,
        batch_name: orig.batchName ?? null,
        schedule_date: newDate,
        start_time: newStart,
        end_time: newEnd,
        mode: orig.mode,
        room: orig.room ?? null,
        meeting_link: orig.meetingLink ?? null,
        remarks: orig.remarks ?? null,
        is_extra: orig.isExtra,
        extra_reason: orig.extraReason ?? null,
        status: "scheduled",
        rescheduled_from: id,
        created_by: actor?.id ?? null,
      } as never)
      .select("id")
      .single();
    if (ins.error) throw AppError.fromSupabase(ins.error, "class_schedules");
    const newId = String((ins.data as { id: string }).id);

    // Carry the roster across. A rescheduled class is the same class on a new
    // day — landing the teacher on an empty sheet would be a silent data loss.
    const roster = await classStudentsService.listAssigned(id);
    if (roster.length > 0) {
      await classStudentsService.setRoster(
        [newId],
        roster.map((r) => r.studentId),
        actor?.id,
      );
    }

    if (orig.teacherId) {
      await this.notify("teacher_class_rescheduled", {
        teacherId: orig.teacherId,
        teacherName: orig.teacherName,
        date: newDate,
        time: `${newStart}–${newEnd}`,
        subject: orig.subjectName,
        standard: orig.standardName,
      });
    }
    return newId;
  }

  async remove(id: string): Promise<void> {
    const res = await this.table().delete().eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
  }

  // ── Phase 2: lifecycle + operations ─────────────────────────────────────────
  /** Append an audit row (best-effort — never blocks the mutation). */
  private async audit(
    classScheduleId: string,
    action: string,
    detail: Record<string, unknown>,
    actor?: Actor | string,
    ctx?: ClientContext,
  ): Promise<void> {
    const a: Actor = typeof actor === "string" ? { id: actor } : (actor ?? {});
    // Device/browser are free (UA parse); IP/GPS only when the caller captured
    // them, so the audit write never waits on the network.
    const where = ctx ?? localContext();
    try {
      await this.db.from("class_schedule_audit" as never).insert({
        class_schedule_id: classScheduleId,
        action,
        actor_id: a.id ?? null,
        actor_name: a.name ?? null,
        actor_role: a.role ?? null,
        device: where.device ?? null,
        browser: where.browser ?? null,
        ip: where.ip ?? null,
        detail,
      } as never);
    } catch {
      /* audit is best-effort */
    }
  }

  /**
   * Refuse a mutation when the class date sits inside an active timetable lock.
   * Management/admin bypass the lock (override). Missing-table-safe: if the lock
   * table isn't migrated, nothing is locked.
   */
  private async assertUnlocked(date: string, isOverride = false): Promise<void> {
    if (isOverride) return;
    const res = await this.db.rpc("is_timetable_locked" as never, { _date: date } as never);
    if (res.error) return; // helper absent → treat as unlocked
    if (res.data === true) {
      throw AppError.validation(
        "The timetable is locked for this period by Management. Ask them to unlock it before editing.",
      );
    }
  }

  /**
   * SMART START (Phase 3) — scheduled → in_progress.
   *
   * Captures the actual start time plus the device / browser / IP / GPS the
   * faculty started from, and derives punctuality (late vs early minutes)
   * against the allocated start time. The class then shows LIVE on every
   * dashboard, and the coordinator/management notifications fire best-effort.
   *
   * Lateness is RECORDED, never a reason to refuse: a class started 12 minutes
   * behind is still a class that happened, and blocking it would leave the
   * timetable claiming it never did.
   */
  async start(id: string, actor?: Actor, ctx?: ClientContext): Promise<ClassSchedule | null> {
    const cur = await this.get(id);
    // Pressing Start twice must not reset the clock — the first press is the
    // real start time and everything downstream (late minutes, actual minutes,
    // the audit trail) is measured from it.
    if (cur && (cur.status === "in_progress" || cur.startedAt)) return cur;
    if (cur && cur.status === "completed") {
      throw AppError.validation("This class is already completed.");
    }
    const nowIso = new Date().toISOString();
    const where = ctx ?? localContext();

    const drift = cur ? minutesFromScheduled(nowIso, cur.scheduleDate, cur.startTime) : 0;
    const lateMinutes = Math.max(0, drift);
    const earlyMinutes = Math.max(0, -drift);

    await this.applyPatch(
      id,
      {
        status: "in_progress",
        started_at: nowIso,
        late_minutes: lateMinutes,
        early_minutes: earlyMinutes,
        start_device: where.device ?? null,
        start_browser: where.browser ?? null,
        start_ip: where.ip ?? null,
        start_lat: where.lat ?? null,
        start_lng: where.lng ?? null,
      },
      "start",
    );
    await this.audit(id, "started", { lateMinutes, earlyMinutes, at: nowIso }, actor, where);

    if (cur) {
      await this.notifyOps("class_started", cur, {
        late_minutes: String(lateMinutes),
        started_at: nowIso.slice(11, 16),
      });
    }
    return cur;
  }

  /**
   * END CLASS (Phase 5) — stamps the end time and derives the ACTUAL teaching
   * minutes and the variance against the allocated duration. `duration_minutes`
   * (allocated) is never overwritten; payroll and analytics read both.
   */
  async complete(id: string, actor?: Actor, ctx?: ClientContext): Promise<void> {
    const cur = await this.get(id);
    if (cur?.status === "completed") return; // idempotent — don't restamp the end
    const nowIso = new Date().toISOString();
    const where = ctx ?? localContext();

    // Actual = started_at → now. Falls back to the allocated duration when the
    // class was completed without ever being started (legacy / bulk complete).
    const actualMinutes = cur?.startedAt
      ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(cur.startedAt)) / 60000))
      : (cur?.durationMinutes ?? 0);
    const varianceMinutes = actualMinutes - (cur?.durationMinutes ?? 0);

    await this.applyPatch(
      id,
      {
        status: "completed",
        completed_at: nowIso,
        actual_minutes: actualMinutes,
        end_device: where.device ?? null,
        end_browser: where.browser ?? null,
        end_ip: where.ip ?? null,
      },
      "end",
    );
    await this.audit(
      id,
      "completed",
      { actualMinutes, allocatedMinutes: cur?.durationMinutes ?? 0, varianceMinutes },
      actor,
      where,
    );

    if (cur) {
      await this.notifyOps("class_ended", cur, {
        actual_hours: (actualMinutes / 60).toFixed(2),
        variance_minutes: String(varianceMinutes),
      });
    }
  }

  /** Alias — the UI calls this "End Class". */
  async end(id: string, actor?: Actor, ctx?: ClientContext): Promise<void> {
    return this.complete(id, actor, ctx);
  }

  /**
   * Flag attendance as submitted and complete the class. Called by the class-
   * attendance flow AFTER the student attendance + parent comms have been saved
   * (via the existing attendanceStudentService/attendanceWhatsappService path).
   */
  async submitAttendance(id: string, actor?: Actor): Promise<void> {
    await this.applyPatch(id, { attendance_submitted: true }, "record attendance against");
    await this.audit(id, "attendance_submitted", {}, actor);
    // Completing here (rather than in one update) reuses the Phase-3 End-Class
    // path so actual minutes + variance + the class_ended broadcast are
    // identical whether the teacher pressed End or submitted attendance.
    const cur = await this.get(id);
    if (cur && cur.status !== "completed") await this.complete(id, actor);
  }

  /**
   * Assign a substitute teacher. We SWAP teacher_id → substitute (keeping
   * original_teacher_id for audit/history) so teaching hours, RLS visibility and
   * the teacher dashboard all follow the substitute with zero other changes.
   */
  async assignSubstitute(
    id: string,
    substituteId: string,
    opts: { isOverride?: boolean; actor?: Actor } = {},
  ): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw AppError.validation("Class not found.");
    await this.assertUnlocked(cur.scheduleDate, opts.isOverride);
    // Preserve the original teacher only the first time a substitute is set.
    const originalTeacherId = cur.originalTeacherId ?? cur.teacherId ?? null;
    const subName = await this.teacherName(substituteId);
    const res = await this.table()
      .update({
        teacher_id: substituteId,
        teacher_name: subName,
        original_teacher_id: originalTeacherId,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    await this.audit(
      id,
      "substitute_assigned",
      { from: originalTeacherId, to: substituteId },
      opts.actor?.id,
    );
    await this.notify("teacher_substitute_assigned", {
      teacherId: substituteId,
      teacherName: subName ?? undefined,
      date: cur.scheduleDate,
      time: `${cur.startTime}–${cur.endTime}`,
      subject: cur.subjectName,
      standard: cur.standardName,
      actorId: opts.actor?.id,
    });
  }

  /** Management override — transfer a class to another teacher (no substitute audit trail swap). */
  async transfer(id: string, newTeacherId: string, actor?: Actor): Promise<void> {
    const name = await this.teacherName(newTeacherId);
    const res = await this.table()
      .update({ teacher_id: newTeacherId, teacher_name: name } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    await this.audit(id, "transferred", { to: newTeacherId }, actor?.id);
    await this.notify("teacher_class_scheduled", {
      teacherId: newTeacherId,
      teacherName: name ?? undefined,
      date: (await this.get(id))?.scheduleDate ?? "",
      time: "",
      actorId: actor?.id,
    });
  }

  /**
   * Operational broadcast (Phase 9) — tells the coordinator who owns the class
   * and every management profile that a class started / ended / needs
   * attendance. Reuses the settings-gated comms dispatcher, so each event can be
   * switched off per-institute and nothing is sent until it is opted in.
   */
  private async notifyOps(
    eventKey: string,
    sched: ClassSchedule,
    extra: Record<string, string> = {},
  ): Promise<void> {
    try {
      const ids = new Set<string>();
      if (sched.coordinatorId) ids.add(sched.coordinatorId);
      const mgmt = (await this.db
        .from("profiles" as never)
        .select("id, name, mobile, email, role")
        .in("role", ["management", "admin"])) as {
        data: { id: string; name?: string; mobile?: string; email?: string }[] | null;
      };
      for (const m of mgmt.data ?? []) ids.add(m.id);
      if (ids.size === 0) return;

      const people = (await this.db
        .from("profiles" as never)
        .select("id, name, mobile, email")
        .in("id", [...ids])) as {
        data: { id: string; name?: string; mobile?: string; email?: string }[] | null;
      };
      const recipients: RecipientCandidate[] = (people.data ?? []).map((p) => ({
        id: p.id,
        kind: "staff",
        name: p.name ?? "Staff",
        phone: p.mobile ?? undefined,
        email: p.email ?? undefined,
      }));
      if (recipients.length === 0) return;

      await commsDispatcherService.dispatch(eventKey, {
        recipients,
        resolve: (c) => ({
          recipient_name: c.name,
          teacher_name: sched.teacherName ?? "",
          class_date: sched.scheduleDate,
          class_time: `${sched.startTime}–${sched.endTime}`,
          subject: sched.subjectName ?? "",
          standard: [sched.standardName, sched.sectionName].filter(Boolean).join(" "),
          ...extra,
        }),
      });
    } catch {
      /* operational notifications are best-effort */
    }
  }

  private async teacherName(id: string): Promise<string | null> {
    const res = await this.db.from("profiles").select("name").eq("id", id).maybeSingle();
    return (res.data as { name?: string } | null)?.name ?? null;
  }

  // ── Notification (best-effort, settings-gated via the dispatcher) ───────────
  private async notify(
    eventKey: string,
    p: {
      teacherId?: string;
      teacherName?: string;
      date: string;
      time: string;
      subject?: string;
      standard?: string;
      reason?: string;
      actorId?: string;
    },
  ): Promise<void> {
    if (!p.teacherId) return;
    try {
      // Resolve the teacher's WhatsApp/email from profiles (mobile is the
      // authoritative staff number; email for the email channel).
      // profiles.mobile is the authoritative staff number but may be absent from
      // the generated types (schema drift) — query untyped and cast.
      const prof = (await this.db
        .from("profiles" as never)
        .select("id, name, mobile, email")
        .eq("id", p.teacherId)
        .maybeSingle()) as {
        data: { id: string; name?: string; mobile?: string; email?: string } | null;
      };
      const row = prof.data;
      if (!row) return;
      const recipient: RecipientCandidate = {
        id: row.id,
        kind: "staff",
        name: row.name ?? p.teacherName ?? "Teacher",
        phone: row.mobile ?? undefined,
        email: row.email ?? undefined,
      };
      await commsDispatcherService.dispatch(eventKey, {
        recipients: [recipient],
        resolve: (c) => ({
          teacher_name: c.name,
          class_date: p.date,
          class_time: p.time,
          subject: p.subject ?? "",
          standard: p.standard ?? "",
          reason: p.reason ?? "",
        }),
        actorId: p.actorId,
      });
    } catch {
      /* notifications are best-effort — never block the schedule mutation */
    }
  }
}

export const scheduleService = new ScheduleService();
