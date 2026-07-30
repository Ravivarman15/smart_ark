import { BaseService } from "@/shared/services";
import { commsDispatcherService } from "@/features/communication/services";
import type { RecipientCandidate } from "@/features/communication/types/communication.types";
import type { ClassSchedule } from "../types/allocation.types";
import { scheduleService } from "./schedule.service";

// ─────────────────────────────────────────────────────────────────────────────
// Class reminder + alert automation (Phase 9).
//
//   • 15 minutes before start → remind the FACULTY
//   •  5 minutes before start → remind the COORDINATOR
//   • 10 minutes before END, attendance still blank → alert the FACULTY
//   • class ended, attendance still missing → chase the FACULTY
//
// Everything is dispatched through the existing settings-gated comms engine
// (commsDispatcherService) — no new sending path, no new templates table. Each
// send is stamped on the class row (reminder_faculty_at / reminder_coordinator_at
// / attendance_alert_at) so a reminder fires EXACTLY ONCE no matter how many
// dashboards are open or how often the sweep runs.
//
// The sweep is driven from the live board (which any coordinator/management
// user has open during class hours) rather than a server cron, so it needs no
// extra infrastructure. It is idempotent and safe to call every minute.
// ─────────────────────────────────────────────────────────────────────────────

export const FACULTY_LEAD_MINUTES = 15;
export const COORDINATOR_LEAD_MINUTES = 5;
/**
 * Attendance is expected to be IN before the class ends, not chased afterwards
 * — the students are still in the room at T-10, which is the only moment the
 * teacher can actually fix a wrong mark.
 */
export const ATTENDANCE_DUE_LEAD_MINUTES = 10;
/** How long after a class ends before "attendance missing" is chased. */
export const ATTENDANCE_GRACE_MINUTES = 30;

const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Minutes left to submit attendance before the class ends, or `null` when the
 * class isn't in that window (already marked, cancelled, or more than
 * ATTENDANCE_DUE_LEAD_MINUTES from its end).
 *
 * Exported so the teacher's own screens count down against exactly the same
 * rule that decides whether to send them a message — a banner that disagrees
 * with the WhatsApp alert is worse than neither.
 */
export const attendanceDueIn = (
  s: ClassSchedule,
  nowMinutes: number,
): number | null => {
  if (s.attendanceSubmitted) return null;
  if (s.status === "cancelled" || s.status === "rescheduled") return null;
  const left = hhmmToMinutes(s.endTime) - nowMinutes;
  if (left > ATTENDANCE_DUE_LEAD_MINUTES || left < 0) return null;
  return left;
};

export interface ReminderDecision {
  scheduleId: string;
  kind: "faculty_15" | "coordinator_5" | "attendance_due" | "attendance_missing";
}

/**
 * Pure decision function — which reminders are due right now?
 * Exported so the timing windows are unit tested without a clock or a database.
 */
export const dueReminders = (
  schedules: ClassSchedule[],
  nowMinutes: number,
): ReminderDecision[] => {
  const out: ReminderDecision[] = [];
  for (const s of schedules) {
    if (s.status === "cancelled" || s.status === "rescheduled") continue;
    const start = hhmmToMinutes(s.startTime);
    const end = hhmmToMinutes(s.endTime);
    const untilStart = start - nowMinutes;

    // Faculty: inside the 15-minute run-up, and only while still unstarted.
    if (
      !s.startedAt &&
      s.status === "scheduled" &&
      untilStart <= FACULTY_LEAD_MINUTES &&
      untilStart > COORDINATOR_LEAD_MINUTES
    ) {
      out.push({ scheduleId: s.id, kind: "faculty_15" });
    }

    // Coordinator: inside the last 5 minutes and the class has not started.
    if (
      !s.startedAt &&
      s.status === "scheduled" &&
      untilStart <= COORDINATOR_LEAD_MINUTES &&
      untilStart > -ATTENDANCE_GRACE_MINUTES
    ) {
      out.push({ scheduleId: s.id, kind: "coordinator_5" });
    }

    // Attendance due: the class ends in ≤10 minutes and the sheet is still
    // blank. Deliberately fires whether or not the class was ever started —
    // attendance is owed for a class that happened, and an unstarted class is a
    // separate problem the coordinator has already been told about.
    if (attendanceDueIn(s, nowMinutes) !== null) {
      out.push({ scheduleId: s.id, kind: "attendance_due" });
    }

    // Attendance chase: the class is over (or completed) and nothing was marked.
    if (
      !s.attendanceSubmitted &&
      (s.status === "completed" || s.status === "in_progress") &&
      nowMinutes >= end + ATTENDANCE_GRACE_MINUTES
    ) {
      out.push({ scheduleId: s.id, kind: "attendance_missing" });
    }
  }
  return out;
};

const EVENT_BY_KIND: Record<ReminderDecision["kind"], string> = {
  faculty_15: "class_reminder_faculty",
  coordinator_5: "class_reminder_coordinator",
  attendance_due: "class_attendance_due",
  attendance_missing: "class_attendance_missing",
};

const STAMP_BY_KIND: Record<ReminderDecision["kind"], string> = {
  faculty_15: "reminder_faculty_at",
  coordinator_5: "reminder_coordinator_at",
  attendance_due: "attendance_due_alert_at",
  attendance_missing: "attendance_alert_at",
};

const ALREADY_SENT = (s: ClassSchedule, kind: ReminderDecision["kind"]): boolean => {
  const raw = s as unknown as Record<string, unknown>;
  // The stamps are read from the raw row (they're automation bookkeeping, not
  // part of the app-facing model), so an unmigrated DB simply never marks them.
  return Boolean(raw[STAMP_BY_KIND[kind]]);
};

class ClassReminderService extends BaseService {
  /**
   * Run one sweep for a date. Returns how many notifications were dispatched.
   * Safe to call repeatedly — already-stamped rows are skipped.
   */
  async runSweep(date: string, opts: { coordinatorId?: string } = {}): Promise<number> {
    // Read the raw rows so the automation stamps are visible.
    const res = await this.db
      .from("class_schedules" as never)
      .select("*")
      .eq("schedule_date", date);
    if (res.error) return 0; // not migrated → nothing to do
    const raw = (res.data as unknown as Record<string, unknown>[]) ?? [];
    if (raw.length === 0) return 0;

    const schedules = await scheduleService.list({
      from: date,
      to: date,
      status: "all",
      coordinatorId: opts.coordinatorId,
    });
    const rawById = new Map(raw.map((r) => [String(r.id), r]));

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const decisions = dueReminders(schedules, nowMinutes);

    let sent = 0;
    for (const d of decisions) {
      const sched = schedules.find((s) => s.id === d.scheduleId);
      if (!sched) continue;
      const rawRow = rawById.get(d.scheduleId) ?? {};
      if (ALREADY_SENT(rawRow as unknown as ClassSchedule, d.kind)) continue;

      // Claim BEFORE sending, not after. Two sweeps running at once (a
      // coordinator's board and the teacher's own dashboard) would otherwise
      // both read a blank stamp and both message the same person.
      if (!(await this.claim(d.scheduleId, d.kind))) continue;
      const ok = await this.dispatch(d.kind, sched, {
        minutes_left: String(attendanceDueIn(sched, nowMinutes) ?? 0),
      });
      if (ok) sent += 1;
    }
    return sent;
  }

  /**
   * Atomically take ownership of one reminder: stamp it only if it is still
   * unstamped, and report whether this caller was the one that won.
   *
   * The stamp is written before the dispatch, so a disabled event or a comms
   * outage costs one lost reminder rather than a retry storm on every refresh —
   * the same trade the sweep has always made, now race-free.
   */
  private async claim(id: string, kind: ReminderDecision["kind"]): Promise<boolean> {
    const col = STAMP_BY_KIND[kind];
    try {
      const res = (await this.db
        .from("class_schedules" as never)
        .update({ [col]: new Date().toISOString() } as never)
        .eq("id", id)
        .is(col, null)
        .select("id")) as { data: { id: string }[] | null; error: unknown };
      return (res.data ?? []).length > 0;
    } catch {
      return false; // can't claim it → don't risk a duplicate send
    }
  }

  private async dispatch(
    kind: ReminderDecision["kind"],
    sched: ClassSchedule,
    extra: Record<string, string> = {},
  ): Promise<boolean> {
    const targetId =
      kind === "coordinator_5" ? sched.coordinatorId : sched.teacherId;
    if (!targetId) return false;
    try {
      const prof = (await this.db
        .from("profiles" as never)
        .select("id, name, mobile, email")
        .eq("id", targetId)
        .maybeSingle()) as {
        data: { id: string; name?: string; mobile?: string; email?: string } | null;
      };
      const row = prof.data;
      if (!row) return false;
      const recipient: RecipientCandidate = {
        id: row.id,
        kind: "staff",
        name: row.name ?? "Staff",
        phone: row.mobile ?? undefined,
        email: row.email ?? undefined,
      };
      await commsDispatcherService.dispatch(EVENT_BY_KIND[kind], {
        recipients: [recipient],
        resolve: (c) => ({
          recipient_name: c.name,
          teacher_name: sched.teacherName ?? "",
          class_date: sched.scheduleDate,
          class_time: `${sched.startTime}–${sched.endTime}`,
          subject: sched.subjectName ?? "",
          standard: [sched.standardName, sched.sectionName].filter(Boolean).join(" "),
          room: sched.room ?? "",
          meeting_link: sched.meetingLink ?? "",
          ...extra,
        }),
      });
      return true;
    } catch {
      return false; // comms engine unavailable — never blocks the board
    }
  }

  /**
   * Notify students + parents that a class was cancelled. Called from the
   * cancel flow; reuses the same dispatcher and the batch's student list.
   */
  async notifyCancellation(sched: ClassSchedule): Promise<void> {
    if (!sched.batchId) return;
    try {
      const res = await this.db
        .from("students" as never)
        .select("id, name, parent_mobile, mobile, email")
        .eq("batch_id", sched.batchId);
      if (res.error) return;
      const rows =
        (res.data as unknown as {
          id: string;
          name?: string;
          parent_mobile?: string;
          mobile?: string;
          email?: string;
        }[]) ?? [];
      const recipients: RecipientCandidate[] = rows.map((r) => ({
        id: r.id,
        kind: "student",
        name: r.name ?? "Student",
        phone: r.parent_mobile ?? r.mobile ?? undefined,
        email: r.email ?? undefined,
      }));
      if (recipients.length === 0) return;
      await commsDispatcherService.dispatch("class_cancelled_students", {
        recipients,
        resolve: (c) => ({
          student_name: c.name,
          teacher_name: sched.teacherName ?? "",
          class_date: sched.scheduleDate,
          class_time: `${sched.startTime}–${sched.endTime}`,
          subject: sched.subjectName ?? "",
          reason: sched.cancelReason ?? "",
        }),
      });
    } catch {
      /* best-effort */
    }
  }
}

export const classReminderService = new ClassReminderService();
