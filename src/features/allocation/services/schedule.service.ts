import { BaseService, AppError } from "@/shared/services";
import { commsDispatcherService } from "@/features/communication/services";
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

const minutesBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
};

const toSchedule = (r: Record<string, unknown>): ClassSchedule => ({
  id: String(r.id),
  teacherId: (r.teacher_id as string) ?? undefined,
  teacherName: (r.teacher_name as string) ?? undefined,
  coordinatorId: (r.coordinator_id as string) ?? undefined,
  standardId: (r.standard_id as string) ?? undefined,
  standardName: (r.standard_name as string) ?? undefined,
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
    let q = this.table().select("*");
    if (filters.teacherId) q = q.eq("teacher_id", filters.teacherId);
    if (filters.coordinatorId) q = q.eq("coordinator_id", filters.coordinatorId);
    if (filters.standardId) q = q.eq("standard_id", filters.standardId);
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.isExtra !== undefined) q = q.eq("is_extra", filters.isExtra);
    if (filters.academicYear) q = q.eq("academic_year", filters.academicYear);
    if (filters.term) q = q.eq("term", filters.term);
    if (filters.month) q = q.eq("month", filters.month);
    if (filters.campusId) q = q.eq("campus_id", filters.campusId);
    if (filters.department) q = q.eq("department", filters.department);
    if (filters.from) q = q.gte("schedule_date", filters.from);
    if (filters.to) q = q.lte("schedule_date", filters.to);
    const res = await q.order("schedule_date", { ascending: true }).order("start_time", {
      ascending: true,
    });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "class_schedules");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map(toSchedule);
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
    const [teacher_name, subject_name, standard_name, section_name, batch_name, campus_name] =
      await Promise.all([
        pick("profiles", input.teacherId),
        pick("subjects", input.subjectId),
        pick("standards", input.standardId),
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

  private toRow(
    input: ScheduleInput,
    names: Record<string, string | null>,
    coordinatorId?: string,
    actor?: Actor,
  ): Record<string, unknown> {
    return {
      teacher_id: input.teacherId || null,
      teacher_name: names.teacher_name,
      coordinator_id: coordinatorId ?? actor?.id ?? null,
      standard_id: input.standardId || null,
      standard_name: names.standard_name,
      section_id: input.sectionId || null,
      section_name: names.section_name,
      subject_id: input.subjectId || null,
      subject_name: names.subject_name,
      batch_id: input.batchId || null,
      batch_name: names.batch_name,
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
    const dates = expandRecurrence(input);
    const base = this.toRow(input, names, opts.coordinatorId, opts.actor);
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
    const res = await this.table().insert(rows as never).select("id");
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    const ids = ((res.data as unknown as { id: string }[]) ?? []).map((r) => String(r.id));

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
    const row = this.toRow(input, names, undefined, actor);
    // never clobber status/created_by/coordinator on an edit
    delete row.status;
    delete row.created_by;
    delete row.coordinator_id;
    row.schedule_date = input.scheduleDate;
    // Keep the academic dimensions consistent when the date moves.
    row.month = monthOf(input.scheduleDate);
    row.academic_year = input.academicYear || academicYearOf(input.scheduleDate);
    const res = await this.table().update(row as never).eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
  }

  // ── Status transitions ──────────────────────────────────────────────────────
  async setStatus(id: string, status: ScheduleStatus, reason?: string): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === "cancelled") patch.cancel_reason = reason ?? null;
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const res = await this.table().update(patch as never).eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
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
   */
  async start(id: string, actor?: Actor, ctx?: ClientContext): Promise<ClassSchedule | null> {
    const cur = await this.get(id);
    const nowIso = new Date().toISOString();
    const where = ctx ?? localContext();

    const drift = cur ? minutesFromScheduled(nowIso, cur.scheduleDate, cur.startTime) : 0;
    const lateMinutes = Math.max(0, drift);
    const earlyMinutes = Math.max(0, -drift);

    const res = await this.table()
      .update({
        status: "in_progress",
        started_at: nowIso,
        late_minutes: lateMinutes,
        early_minutes: earlyMinutes,
        start_device: where.device ?? null,
        start_browser: where.browser ?? null,
        start_ip: where.ip ?? null,
        start_lat: where.lat ?? null,
        start_lng: where.lng ?? null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
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
    const nowIso = new Date().toISOString();
    const where = ctx ?? localContext();

    // Actual = started_at → now. Falls back to the allocated duration when the
    // class was completed without ever being started (legacy / bulk complete).
    const actualMinutes = cur?.startedAt
      ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(cur.startedAt)) / 60000))
      : (cur?.durationMinutes ?? 0);
    const varianceMinutes = actualMinutes - (cur?.durationMinutes ?? 0);

    const res = await this.table()
      .update({
        status: "completed",
        completed_at: nowIso,
        actual_minutes: actualMinutes,
        end_device: where.device ?? null,
        end_browser: where.browser ?? null,
        end_ip: where.ip ?? null,
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
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
    const res = await this.table()
      .update({ attendance_submitted: true } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
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
