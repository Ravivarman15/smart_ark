import { BaseService, AppError } from "@/shared/services";
import { commsDispatcherService } from "@/features/communication/services";
import type { RecipientCandidate } from "@/features/communication/types/communication.types";
import type {
  ClassSchedule,
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
  createdBy: (r.created_by as string) ?? undefined,
  createdAt: (r.created_at as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

interface Actor {
  id?: string;
}

/**
 * Expand a weekly-repeating input into one date per week up to repeat_until.
 * Uses UTC epoch math (not local `new Date(str)`) so it never drifts a day
 * across timezones.
 */
export const expandWeeklyDates = (input: ScheduleInput): string[] => {
  if (!input.repeatWeekly || !input.repeatUntil) return [input.scheduleDate];
  const toUtc = (d: string): number => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, day ?? 1);
  };
  const dates: string[] = [];
  const start = toUtc(input.scheduleDate);
  const until = toUtc(input.repeatUntil);
  const week = 7 * 24 * 60 * 60 * 1000;
  // guard against runaway loops (cap at ~2 years of weekly occurrences)
  for (let t = start, i = 0; t <= until && i < 110; i++, t += week) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates.length > 0 ? dates : [input.scheduleDate];
};

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
    const [teacher_name, subject_name, standard_name, section_name, batch_name] =
      await Promise.all([
        pick("profiles", input.teacherId),
        pick("subjects", input.subjectId),
        pick("standards", input.standardId),
        pick("sections", input.sectionId),
        pick("batches", input.batchId),
      ]);
    return { teacher_name, subject_name, standard_name, section_name, batch_name };
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
      repeat_weekly: Boolean(input.repeatWeekly),
      repeat_until: input.repeatUntil || null,
      holiday_skip: input.holidaySkip !== false,
      is_extra: Boolean(input.isExtra),
      extra_reason: input.extraReason || null,
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
    const dates = expandWeeklyDates(input);
    const base = this.toRow(input, names, opts.coordinatorId, opts.actor);
    const rows = dates.map((schedule_date) => ({ ...base, schedule_date }));
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
    actorId?: string,
  ): Promise<void> {
    try {
      await this.db.from("class_schedule_audit" as never).insert({
        class_schedule_id: classScheduleId,
        action,
        actor_id: actorId ?? null,
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

  /** Mark a class started (scheduled → in_progress). */
  async start(id: string, actor?: Actor): Promise<void> {
    const res = await this.table()
      .update({ status: "in_progress", started_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    await this.audit(id, "started", {}, actor?.id);
  }

  /** Mark a class completed (stamps completed_at). */
  async complete(id: string, actor?: Actor): Promise<void> {
    const res = await this.table()
      .update({ status: "completed", completed_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    await this.audit(id, "completed", {}, actor?.id);
  }

  /**
   * Flag attendance as submitted and complete the class. Called by the class-
   * attendance flow AFTER the student attendance + parent comms have been saved
   * (via the existing attendanceStudentService/attendanceWhatsappService path).
   */
  async submitAttendance(id: string, actor?: Actor): Promise<void> {
    const res = await this.table()
      .update({
        attendance_submitted: true,
        status: "completed",
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    if (res.error) throw AppError.fromSupabase(res.error, "class_schedules");
    await this.audit(id, "attendance_submitted", {}, actor?.id);
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
