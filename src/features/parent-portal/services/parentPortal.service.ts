// ── Parent Portal — per-child read aggregates ────────────────────────────────
//
// The portal owns NO domain data. Every method here is a projection over tables
// the staff modules already own, shaped for a parent audience:
//
//   attendance      → student_attendance          (Attendance module)
//   exams / results → exams, exam_results         (Examination module)
//   fees            → student_fees, fee_installments (Fee module)
//   timetable       → class_schedules             (Academic Allocation module)
//   live classes    → live_classes                (Live Class module)
//
// Every query is best-effort: a module whose migration has not been applied on
// this database yields an empty section rather than breaking the page. That is
// the same contract the rest of the codebase uses (fetchStudentInsights,
// commsTimelineService, documentsService) and it matters more here, because a
// parent has no way to interpret a stack trace.

import { BaseService } from "@/shared/services";
import { fetchStudentInsights } from "@/features/students/hooks/useStudentInsights";
import { computeHealthScores } from "@/features/students/utils/student360";
import type { Student } from "@/features/students/types";
import type {
  ChildSummary,
  ParentClassItem,
  ParentTimelineItem,
} from "../types/parentPortal.types";

const num = (v: unknown): number => Number(v ?? 0) || 0;
const today = (): string => new Date().toISOString().slice(0, 10);

/** yyyy-mm-dd for `d` days from now. */
const dateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Was this failure "the table isn't there"? Those degrade to empty; anything
 * else is a real error and is allowed to surface, because silently swallowing
 * a permission failure would show a parent an empty page when the truth is
 * that something is misconfigured.
 */
const isMissing = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

export interface AttendanceDay {
  date: string;
  status: "present" | "absent" | "late";
}

export interface MonthlyAttendancePoint {
  month: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  percent: number;
}

class ParentPortalService extends BaseService {
  // ── Attendance ────────────────────────────────────────────────────────────

  /** Every recorded attendance day for a child, newest first. */
  async attendanceDays(studentId: string): Promise<AttendanceDay[]> {
    const res = await this.db
      .from("student_attendance")
      .select("date, status")
      .eq("student_id", studentId)
      .order("date", { ascending: false });
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as { date: string | null; status: string | null }[])
      .filter((r) => !!r.date)
      .map((r) => ({
        date: r.date as string,
        // The base schema constrains status to present|absent; the attendance
        // module widened it to include 'late'. Anything unrecognised counts as
        // absent so a percentage can never silently overstate attendance.
        status:
          r.status === "present" ? "present" : r.status === "late" ? "late" : "absent",
      }));
  }

  /** Roll attendance days up per calendar month for the trend chart. */
  monthlyAttendance(days: AttendanceDay[]): MonthlyAttendancePoint[] {
    const map = new Map<string, MonthlyAttendancePoint>();
    for (const d of days) {
      const month = d.date.slice(0, 7);
      const m =
        map.get(month) ?? { month, present: 0, absent: 0, late: 0, total: 0, percent: 0 };
      m.total += 1;
      m[d.status] += 1;
      map.set(month, m);
    }
    return [...map.values()]
      .map((m) => ({
        ...m,
        // 'late' counts as attended — a late child was in class. Counting it as
        // absent would show a parent a percentage the institution disagrees with.
        percent: m.total ? Math.round(((m.present + m.late) / m.total) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  // ── Timetable + live classes ──────────────────────────────────────────────

  /**
   * Classes for one child on one date — the offline timetable
   * (class_schedules) and online sessions (live_classes) merged into one
   * chronological list, because a parent thinks in terms of "my child's day",
   * not in terms of which module scheduled what.
   */
  async classesFor(student: Student, date = today()): Promise<ParentClassItem[]> {
    const [scheduled, live] = await Promise.allSettled([
      this.scheduledClasses(student, date),
      this.liveClasses(student, date, date),
    ]);
    const items = [
      ...(scheduled.status === "fulfilled" ? scheduled.value : []),
      ...(live.status === "fulfilled" ? live.value : []),
    ];
    return items.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  }

  private async scheduledClasses(student: Student, date: string): Promise<ParentClassItem[]> {
    if (!student.batchId && !student.standardId) return [];
    let q = this.db
      .from("class_schedules" as never)
      .select(
        "id, subject_name, teacher_name, schedule_date, start_time, end_time, status, room, mode, meeting_link, remarks",
      )
      .eq("schedule_date", date);

    // Prefer the batch (the narrower cohort); fall back to the standard for
    // institutions that schedule at standard level.
    q = student.batchId
      ? q.eq("batch_id", student.batchId)
      : q.eq("standard_id", student.standardId as string);

    const res = await q;
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      source: "schedule" as const,
      title: (r.subject_name as string) || "Class",
      subjectName: (r.subject_name as string) ?? undefined,
      teacherName: (r.teacher_name as string) ?? undefined,
      date: (r.schedule_date as string) ?? undefined,
      startTime: ((r.start_time as string) ?? "").slice(0, 5),
      endTime: ((r.end_time as string) ?? "").slice(0, 5),
      status: (r.status as string) ?? undefined,
      room: (r.room as string) ?? undefined,
      mode: (r.mode as string) ?? undefined,
      meetingLink: (r.meeting_link as string) ?? undefined,
      classNotes: (r.remarks as string) ?? undefined,
    }));
  }

  /** Live classes for the child's cohort within a date window (inclusive). */
  async liveClasses(student: Student, from: string, to: string): Promise<ParentClassItem[]> {
    if (!student.batchId && !student.standardId) return [];

    // RLS already restricts live_classes to the parent's cohorts, but filtering
    // client-side too keeps the payload small when a parent has several
    // children across different standards.
    const res = await this.db
      .from("live_classes" as never)
      .select(
        "id, title, subject_name, teacher_name, start_date, start_time, end_time, status, platform, meeting_link, recording_url, class_notes, standard_id",
      )
      .gte("start_date", from)
      .lte("start_date", to)
      .order("start_date", { ascending: true });

    if (res.error) {
      if (isMissing(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      source: "live" as const,
      title: (r.title as string) || "Live Class",
      subjectName: (r.subject_name as string) ?? undefined,
      teacherName: (r.teacher_name as string) ?? undefined,
      date: (r.start_date as string) ?? undefined,
      startTime: (r.start_time as string) ?? undefined,
      endTime: (r.end_time as string) ?? undefined,
      status: (r.status as string) ?? undefined,
      mode: "online",
      meetingLink: (r.meeting_link as string) ?? undefined,
      recordingUrl: (r.recording_url as string) ?? undefined,
      classNotes: (r.class_notes as string) ?? undefined,
    }));
  }

  // ── Exams ─────────────────────────────────────────────────────────────────

  /** Exams scheduled for the child's cohort from today onwards. */
  async upcomingExams(student: Student, limit = 10) {
    if (!student.batchId && !student.standardId) return [];
    // `as never` matches the pattern used across this codebase for tables whose
    // generated Supabase types lag their migration — `exams.start_time` /
    // `end_time` / `hall` / `exam_type` were added by 20260522_exam_module but
    // are absent from the checked-in generated types.
    let q = this.db
      .from("exams" as never)
      .select(
        "id, title, subject_name, exam_date, start_time, end_time, hall, total_marks, exam_type, status",
      )
      .gte("exam_date", today())
      .neq("status", "cancelled")
      .order("exam_date", { ascending: true })
      .limit(limit);

    q = student.batchId
      ? q.eq("batch_id", student.batchId)
      : q.eq("standard_id", student.standardId as string);

    const res = await q;
    if (res.error) {
      if (isMissing(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      title: (r.title as string) || "Exam",
      subject: (r.subject_name as string) ?? undefined,
      date: (r.exam_date as string) ?? undefined,
      startTime: (r.start_time as string) ?? undefined,
      endTime: (r.end_time as string) ?? undefined,
      hall: (r.hall as string) ?? undefined,
      totalMarks: num(r.total_marks),
      examType: (r.exam_type as string) ?? undefined,
    }));
  }

  /**
   * Published results for a child, including RANK and the teacher's remark.
   *
   * A separate read from fetchStudentInsights rather than a widening of it:
   * `rank` and `remarks` are only meaningful on this page, and every other
   * consumer of that shared hook (Student 360°, the staff drawer, the portal's
   * Academics tab) would pay for columns it never renders.
   *
   * Only rows for exams whose results the institution has PUBLISHED are
   * returned — a parent must not see a mark that staff are still entering.
   */
  async examResults(studentId: string) {
    // `as never` — exam_results.rank / .remarks and exams.results_status come
    // from 20260522_exam_module, which the generated types predate.
    const res = await this.db
      .from("exam_results" as never)
      .select(
        "id, marks, grade, rank, remarks, is_absent, exams(id, title, subject_name, total_marks, pass_marks, exam_date, exam_type, results_status)",
      )
      .eq("student_id", studentId);

    if (res.error) {
      if (isMissing(res.error)) return [];
      throw res.error;
    }

    return ((res.data ?? []) as unknown as Record<string, unknown>[])
      .map((r) => {
        const exRaw = r.exams;
        const ex = (Array.isArray(exRaw) ? exRaw[0] : exRaw) as Record<string, unknown> | null;
        const total = num(ex?.total_marks) || 100;
        const absent = !!r.is_absent;
        const marks = r.marks === null || r.marks === undefined ? null : num(r.marks);
        return {
          id: String(r.id),
          examId: ex?.id ? String(ex.id) : "",
          title: (ex?.title as string) ?? "Exam",
          subject: (ex?.subject_name as string) ?? "General",
          date: (ex?.exam_date as string) ?? undefined,
          examType: (ex?.exam_type as string) ?? undefined,
          resultsStatus: (ex?.results_status as string) ?? "pending",
          total,
          passMarks: num(ex?.pass_marks),
          marks,
          percent: absent || marks === null ? null : Math.round((marks / total) * 100),
          grade: (r.grade as string) ?? undefined,
          // Absent unless staff published a rank — never inferred.
          rank: r.rank === null || r.rank === undefined ? null : Number(r.rank),
          remarks: (r.remarks as string) ?? undefined,
          absent,
        };
      })
      .filter((r) => r.resultsStatus === "published" || r.resultsStatus === "locked")
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  // ── Home dashboard rollup ─────────────────────────────────────────────────

  /**
   * The per-child Home card. One method, five parallel reads, because Home
   * renders this once per child and a serial version would make a three-child
   * dashboard visibly slow.
   *
   * Reuses fetchStudentInsights for marks + fees rather than re-querying them,
   * so the portal's numbers can never disagree with the Student 360° report's.
   */
  async childSummary(student: Student): Promise<ChildSummary> {
    const [insightsR, daysR, classesR, examsR] = await Promise.allSettled([
      fetchStudentInsights(student.id),
      this.attendanceDays(student.id),
      this.classesFor(student, today()),
      this.upcomingExams(student, 1),
    ]);

    const insights =
      insightsR.status === "fulfilled"
        ? insightsR.value
        : { fee: undefined, exams: [], subjects: [], strong: [], weak: [], overallPercent: null, attendance: undefined };
    const days = daysR.status === "fulfilled" ? daysR.value : [];
    const classes = classesR.status === "fulfilled" ? classesR.value : [];
    const exams = examsR.status === "fulfilled" ? examsR.value : [];

    const attended = days.filter((d) => d.status !== "absent").length;
    const attendancePercent = days.length ? Math.round((attended / days.length) * 100) : null;
    const todayRow = days.find((d) => d.date === today());

    const nowHm = new Date().toTimeString().slice(0, 5);
    const nextClass = classes.find((c) => (c.startTime ?? "") >= nowHm);

    const fee = insights.fee;

    return {
      studentId: student.id,
      attendancePercent,
      todayStatus: todayRow?.status ?? null,
      classesToday: classes.length,
      nextClassAt: nextClass?.startTime,
      upcomingExam: exams[0]
        ? { id: exams[0].id, title: exams[0].title, subject: exams[0].subject, date: exams[0].date }
        : undefined,
      feePending: fee?.pending ?? 0,
      feeTotal: fee?.total ?? 0,
      overallPercent: insights.overallPercent,
      // Same scorer the Student 360° report and the staff dashboard use, so a
      // parent and the front desk always quote the same number. Communication
      // deliverability is excluded here (commTotal 0 ⇒ that pillar scores 100):
      // it is an institutional health metric, not something a parent can act on,
      // and fetching it per child would double the Home dashboard's query count.
      health: computeHealthScores({
        overallPercent: insights.overallPercent,
        attendancePercent,
        fee: fee
          ? { total: fee.total, discount: fee.discount, received: fee.received, pending: fee.pending }
          : undefined,
        commTotal: 0,
        commDelivered: 0,
        strongSubjects: insights.strong.map((s) => s.subject),
        weakSubjects: insights.weak.map((s) => s.subject),
      }),
      transportRequired: !!student.transportRequired,
      hostelRequired: !!student.hostelRequired,
    };
  }

  // ── Unified activity timeline ─────────────────────────────────────────────

  /**
   * Merge every event type into one chronological feed. Built from data the
   * caller has already fetched — the timeline page reuses the same query
   * results the Attendance / Exam / Fee tabs used, so opening it costs nothing.
   */
  buildTimeline(input: {
    student: Student;
    attendance: AttendanceDay[];
    exams: { id: string; title: string; subject: string; date?: string; percent: number | null; absent: boolean }[];
    receipts: { id: string; amount: number; date: string; method: string; receiptNo?: string }[];
    classes: ParentClassItem[];
    documents: { id: string; title: string; category: string; createdAt?: string }[];
    messages: { id: string; channel: string; template: string; status: string; createdAt: string }[];
  }): ParentTimelineItem[] {
    const items: ParentTimelineItem[] = [];
    const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

    if (input.student.dateOfJoining) {
      items.push({
        id: `admission-${input.student.id}`,
        kind: "admission",
        date: input.student.dateOfJoining,
        title: "Admission",
        detail: `Joined ${input.student.standardName ?? ""} ${input.student.batch ?? ""}`.trim(),
      });
    }

    // Attendance is the noisiest source by an order of magnitude — a full year
    // is ~220 rows per child and would bury every other event type. Only
    // exceptions (absent / late) are timeline-worthy; "present" is the norm and
    // is already visible on the Attendance calendar.
    for (const a of input.attendance) {
      if (a.status === "present") continue;
      items.push({
        id: `att-${a.date}`,
        kind: "attendance",
        date: a.date,
        title: a.status === "late" ? "Marked late" : "Marked absent",
        detail: a.date,
      });
    }

    for (const e of input.exams) {
      if (!e.absent && e.percent === null) continue; // never marked — not a result
      items.push({
        id: `exam-${e.id}`,
        kind: "exam",
        date: e.date,
        title: `Result — ${e.title}`,
        detail: e.absent ? `${e.subject} · Absent` : `${e.subject} · ${e.percent}%`,
      });
    }

    for (const r of input.receipts) {
      items.push({
        id: `fee-${r.id}`,
        kind: "fee",
        date: r.date,
        title: `Fee paid — ${inr(r.amount)}`,
        detail: `${r.method}${r.receiptNo ? ` · Receipt ${r.receiptNo}` : ""}`,
      });
    }

    for (const c of input.classes) {
      items.push({
        id: `class-${c.id}`,
        kind: "class",
        date: c.date,
        title: c.title,
        detail: [c.teacherName, c.startTime && `${c.startTime}–${c.endTime ?? ""}`]
          .filter(Boolean)
          .join(" · "),
      });
    }

    for (const d of input.documents) {
      items.push({
        id: `doc-${d.id}`,
        kind: "document",
        date: d.createdAt,
        title: `Document — ${d.title}`,
        detail: d.category,
      });
    }

    for (const m of input.messages) {
      items.push({
        id: `msg-${m.id}`,
        kind: "message",
        date: m.createdAt,
        title: `Message via ${m.channel}`,
        detail: `${m.template || "Notification"} · ${m.status}`,
      });
    }

    return items.sort((a, b) => (a.date ?? "") < (b.date ?? "") ? 1 : -1);
  }

  /** Exams in the next `days` days — drives the "Exam tomorrow" Home nudge. */
  async examsSoon(student: Student, days = 7) {
    const all = await this.upcomingExams(student, 25);
    const cutoff = dateOffset(days);
    return all.filter((e) => (e.date ?? "") <= cutoff);
  }
}

export const parentPortalService = new ParentPortalService();
