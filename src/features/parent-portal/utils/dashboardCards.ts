// ── Parent Portal — dashboard card derivations ───────────────────────────────
//
// Pure functions over data the portal has ALREADY fetched for other pages.
// Nothing here issues a query: the Home dashboard composes existing cached
// hooks (insights, attendance, results, documents, messages, classes), so
// every card below is free once those caches are warm — and visiting Messages
// or Documents afterwards is free in turn, because it is the same cache entry.
//
// Keeping the maths out of the components is what makes the dashboard
// testable: a "Weekly Progress" card that silently miscounts a week is the
// kind of bug nobody notices until a parent quotes it back to a teacher.

import type { ExamPoint, StudentInsights } from "@/features/students/hooks/useStudentInsights";
import type { StudentDocument } from "@/features/students/types";
import type { TimelineEntry } from "@/features/communication/types/communication.types";
import type { AttendanceDay } from "../services/parentPortal.service";
import type { ParentClassItem } from "../types/parentPortal.types";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** yyyy-mm-dd `n` days ago. */
const daysAgo = (n: number) => iso(new Date(Date.now() - n * DAY));

// ── Relative day labels ──────────────────────────────────────────────────────

/**
 * "Today" / "Tomorrow" / "In 3 days" / "Mon, 14 Aug".
 *
 * A parent scanning a dashboard needs urgency, not a date they have to subtract
 * from today. Past dates fall back to the absolute form — "In -2 days" is
 * nonsense, and an exam in the past on a dashboard means something is stale.
 */
export const relativeDay = (date?: string): string => {
  if (!date) return "—";
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / DAY);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff <= 7) return `In ${diff} days`;
  return target.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

/** Urgency tone for the upcoming-exam tile. */
export const examUrgency = (date?: string): "bad" | "warn" | "default" => {
  const label = relativeDay(date);
  if (label === "Today") return "bad";
  if (label === "Tomorrow") return "warn";
  return "default";
};

// ── Weekly progress ──────────────────────────────────────────────────────────

export interface WeeklyProgress {
  /** Attendance % across the last 7 days that have a record. */
  attendancePercent: number | null;
  attendedDays: number;
  recordedDays: number;
  /** Results published in the last 7 days. */
  resultCount: number;
  averagePercent: number | null;
  /** Change in average vs the 7 days before that; null when either is empty. */
  deltaVsPrevious: number | null;
}

/**
 * The last 7 days, compared against the 7 before.
 *
 * Uses only days that HAVE a record: dividing by a flat 7 would punish a child
 * for a public holiday or a weekend, and a parent seeing "57% this week" during
 * an exam break would reasonably think something was wrong.
 */
export const weeklyProgress = (
  attendance: AttendanceDay[],
  exams: ExamPoint[],
): WeeklyProgress => {
  const weekStart = daysAgo(7);
  const prevStart = daysAgo(14);

  const thisWeek = attendance.filter((a) => a.date >= weekStart);
  const attended = thisWeek.filter((a) => a.status !== "absent").length;

  const scored = exams.filter((e) => e.percent !== null && e.date);
  const recent = scored.filter((e) => (e.date as string) >= weekStart);
  const previous = scored.filter(
    (e) => (e.date as string) >= prevStart && (e.date as string) < weekStart,
  );

  const avg = (xs: ExamPoint[]) =>
    xs.length ? Math.round(xs.reduce((a, e) => a + (e.percent as number), 0) / xs.length) : null;

  const recentAvg = avg(recent);
  const prevAvg = avg(previous);

  return {
    attendancePercent: thisWeek.length
      ? Math.round((attended / thisWeek.length) * 100)
      : null,
    attendedDays: attended,
    recordedDays: thisWeek.length,
    resultCount: recent.length,
    averagePercent: recentAvg,
    deltaVsPrevious:
      recentAvg !== null && prevAvg !== null ? recentAvg - prevAvg : null,
  };
};

// ── Marks trend ──────────────────────────────────────────────────────────────

export interface MarksTrend {
  points: { label: string; percent: number }[];
  direction: "improving" | "declining" | "steady" | "insufficient";
  delta: number;
  latest: number | null;
}

/**
 * Chronological trend plus a direction verdict.
 *
 * Compares the most recent third against the earliest third — the same
 * noise-tolerant rule the Assistant and the Academics page use, so all three
 * surfaces agree. First-vs-last would let one bad paper flip the verdict.
 */
export const marksTrend = (exams: ExamPoint[], take = 8): MarksTrend => {
  const sorted = exams
    .filter((e) => e.percent !== null)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const points = sorted.slice(-take).map((e) => ({
    label: (e.date ?? "").slice(5) || e.title.slice(0, 6),
    percent: e.percent as number,
  }));

  const latest = sorted.length ? (sorted[sorted.length - 1].percent as number) : null;

  if (sorted.length < 4) {
    return { points, direction: "insufficient", delta: 0, latest };
  }

  const size = Math.max(1, Math.floor(sorted.length / 3));
  const avg = (xs: ExamPoint[]) =>
    Math.round(xs.reduce((a, e) => a + (e.percent as number), 0) / xs.length);
  const delta = avg(sorted.slice(-size)) - avg(sorted.slice(0, size));

  return {
    points,
    direction: delta >= 5 ? "improving" : delta <= -5 ? "declining" : "steady",
    delta,
    latest,
  };
};

// ── Teacher remarks ──────────────────────────────────────────────────────────

export interface TeacherRemark {
  id: string;
  subject: string;
  examTitle: string;
  date?: string;
  remark: string;
  percent: number | null;
}

/** Latest published remarks, newest first. Blank remarks are not remarks. */
export const teacherRemarks = (
  results: {
    id: string;
    subject: string;
    title: string;
    date?: string;
    remarks?: string;
    percent: number | null;
  }[],
  take = 3,
): TeacherRemark[] =>
  results
    .filter((r) => !!r.remarks && r.remarks.trim().length > 0)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, take)
    .map((r) => ({
      id: r.id,
      subject: r.subject,
      examTitle: r.title,
      date: r.date,
      remark: (r.remarks as string).trim(),
      percent: r.percent,
    }));

// ── Certificates ─────────────────────────────────────────────────────────────

/**
 * Achievement documents.
 *
 * There is no `certificates` table — the Certificate module is a
 * localStorage-backed starter. What DOES exist is `student_documents.category`,
 * whose vocabulary already includes `certificate` and `marksheet`. So a
 * certificate is a shared document in those categories: real, downloadable, and
 * already RLS-scoped, rather than an invented counter.
 */
export const ACHIEVEMENT_CATEGORIES = ["certificate", "marksheet"] as const;

export const certificatesFrom = (docs: StudentDocument[]): StudentDocument[] =>
  docs
    .filter((d) => (ACHIEVEMENT_CATEGORIES as readonly string[]).includes(d.category))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

// ── Parent engagement ────────────────────────────────────────────────────────

export interface ParentEngagement {
  /** Messages the institution successfully delivered in the window. */
  delivered: number;
  /** Of those, how many carry a read receipt. */
  read: number;
  readPercent: number | null;
  portalVisits: number;
  /** Encouragement band — never a reprimand. */
  band: "strong" | "steady" | "low" | "unknown";
}

/**
 * How connected the family is to the institution's communication.
 *
 * Framed as encouragement, never as a score a parent is graded on — the bands
 * are "strong / steady / low", and an unmeasurable case reports `unknown`
 * rather than 0%.
 *
 * Read receipts only exist for channels that report them (WhatsApp via the
 * AiSensy webhook). Undelivered messages are excluded from the denominator: a
 * parent must never be marked down for a message that never arrived.
 */
export const parentEngagement = (
  messages: TimelineEntry[],
  portalVisits: number,
  windowDays = 30,
): ParentEngagement => {
  const since = daysAgo(windowDays);
  const recent = messages.filter((m) => (m.createdAt ?? "") >= since);

  const delivered = recent.filter((m) =>
    ["delivered", "read"].includes((m.status ?? "").toLowerCase()),
  );
  const read = delivered.filter((m) => !!m.readAt).length;

  const readPercent = delivered.length
    ? Math.round((read / delivered.length) * 100)
    : null;

  // With no delivered messages there is nothing to measure — say so rather
  // than reporting a 0% the parent did not earn.
  const band: ParentEngagement["band"] =
    readPercent === null && portalVisits === 0
      ? "unknown"
      : (readPercent ?? 0) >= 70 || portalVisits >= 12
        ? "strong"
        : (readPercent ?? 0) >= 35 || portalVisits >= 4
          ? "steady"
          : "low";

  return { delivered: delivered.length, read, readPercent, portalVisits, band };
};

// ── Live class status ────────────────────────────────────────────────────────

export interface LiveClassStatus {
  state: "live" | "upcoming" | "done" | "none";
  current?: ParentClassItem;
  next?: ParentClassItem;
  totalToday: number;
}

/**
 * What is happening with online classes right now.
 *
 * `nowHm` is injectable so the "is it live" boundary is testable without
 * freezing the system clock.
 */
export const liveClassStatus = (
  classes: ParentClassItem[],
  nowHm = new Date().toTimeString().slice(0, 5),
): LiveClassStatus => {
  const online = classes.filter((c) => c.source === "live" || !!c.meetingLink);
  if (online.length === 0) return { state: "none", totalToday: 0 };

  const active = online.find(
    (c) =>
      c.status !== "cancelled" &&
      (c.startTime ?? "") <= nowHm &&
      nowHm <= (c.endTime ?? "23:59"),
  );
  if (active) return { state: "live", current: active, totalToday: online.length };

  const next = online
    .filter((c) => c.status !== "cancelled" && (c.startTime ?? "") > nowHm)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))[0];
  if (next) return { state: "upcoming", next, totalToday: online.length };

  return { state: "done", totalToday: online.length };
};

// ── Monthly attendance headline ──────────────────────────────────────────────

export interface MonthlyAttendanceCard {
  month: string;
  percent: number | null;
  present: number;
  late: number;
  absent: number;
  /** Change vs the previous month, in percentage points. */
  deltaVsPrevious: number | null;
}

/** Current-month headline plus its change, from the monthly rollup. */
export const monthlyAttendanceCard = (
  monthly: { month: string; present: number; late: number; absent: number; total: number; percent: number }[],
): MonthlyAttendanceCard => {
  if (monthly.length === 0) {
    return { month: "", percent: null, present: 0, late: 0, absent: 0, deltaVsPrevious: null };
  }
  const current = monthly[monthly.length - 1];
  const previous = monthly.length > 1 ? monthly[monthly.length - 2] : undefined;
  return {
    month: current.month,
    percent: current.percent,
    present: current.present,
    late: current.late,
    absent: current.absent,
    deltaVsPrevious: previous ? current.percent - previous.percent : null,
  };
};

/** Human month label: "2026-07" → "July 2026". */
export const monthLabel = (m: string): string => {
  if (!m) return "—";
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
