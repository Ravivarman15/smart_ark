import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAppData, isNearCampus,
  AttendanceStatus, CheckinRecord, MarksEntry, TeacherInfo,
} from "@/contexts/AppDataContext";

// ─────────────────────────────────────────────────────────────────────────────
// useTeacherWorkspace — the single source of truth for the teacher dashboard.
//
// The dashboard is one page (no tabs), and every number on it is derived from
// live context data here. The shift (check-in / check-out) is *mandatory*: the
// rest of the workspace stays locked until `shift.checkedIn` is true, and the
// day is only complete once `shift.checkedOut` is true.
// ─────────────────────────────────────────────────────────────────────────────

/** Days of check-in history rolled up into the "This month" stats. */
const HISTORY_DAYS = 30;
/** Below this average %, a student counts as at-risk. */
const AT_RISK_THRESHOLD = 40;

export type ShiftPhase = "not-started" | "working" | "done";

export interface DayStep {
  key: string;
  label: string;
  done: boolean;
  /** Blocking steps must be finished for the day to be compliant. */
  required: boolean;
  hint: string;
}

const toDate = (rec: CheckinRecord, key: "checkinTimestamp" | "checkoutTimestamp"): Date | null => {
  const raw = rec[key];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** ms between check-in and check-out (or now, if still on shift). */
const shiftDurationMs = (rec: CheckinRecord | undefined, nowMs: number): number => {
  if (!rec) return 0;
  const start = toDate(rec, "checkinTimestamp");
  if (!start) return 0;
  const end = toDate(rec, "checkoutTimestamp");
  return Math.max(0, (end ? end.getTime() : nowMs) - start.getTime());
};

export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

export function useTeacherWorkspace() {
  const { user, logout } = useAuth();
  const {
    teachers, students, attendance, submitAttendance,
    checkins, teacherCheckin, teacherCheckout,
    getTasksForTeacher, markTaskComplete,
    marksEntries, addMarksEntry, markSentToParent,
    leaveRequests, addLeaveRequest, addStudentToTeacher,
    loading,
  } = useAppData();

  const teacherInfo: TeacherInfo | undefined = teachers.find(
    (t) => t.id === user?.profileId || t.id === user?.id,
  );
  const teacherId = teacherInfo?.id || user?.profileId || user?.id || "";
  const today = new Date().toISOString().split("T")[0];
  const roster = useMemo(() => teacherInfo?.students || [], [teacherInfo?.students]);

  // A ticking clock so the on-shift timer and the greeting stay live without
  // every consumer wiring its own interval.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Shift (mandatory check-in / check-out) ────────────────────────────────
  const todayCheckin = teacherId ? checkins[teacherId]?.[today] : undefined;
  const checkedIn = !!todayCheckin;
  const checkedOut = !!todayCheckin?.checkoutTime;
  const phase: ShiftPhase = !checkedIn ? "not-started" : checkedOut ? "done" : "working";
  const workedMs = shiftDurationMs(todayCheckin, nowMs);

  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  /** Resolves the browser's position, falling back to a geo-invalid punch. */
  const withGeo = useCallback((run: (geoValid: boolean, campus?: string) => void) => {
    if (!navigator.geolocation) { run(false); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const result = isNearCampus(coords.latitude, coords.longitude);
        run(result.valid, result.campus);
      },
      () => run(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const punchIn = useCallback(() => {
    if (!teacherId || checkinLoading) return;
    setCheckinLoading(true);
    withGeo((geoValid, campus) => {
      teacherCheckin(teacherId, geoValid)
        .then(() => {
          if (geoValid) toast.success(`Checked in at ${campus} — pending admin approval`);
          else toast.warning("Checked in, but your location could not be verified against a campus");
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to record check-in"))
        .finally(() => setCheckinLoading(false));
    });
  }, [teacherId, checkinLoading, withGeo, teacherCheckin]);

  const punchOut = useCallback(async (): Promise<boolean> => {
    if (!teacherId || checkoutLoading) return false;
    setCheckoutLoading(true);
    return new Promise<boolean>((resolve) => {
      withGeo((geoValid, campus) => {
        teacherCheckout(teacherId, geoValid)
          .then(() => {
            if (geoValid) toast.success(`Checked out at ${campus} — pending admin approval`);
            else toast.warning("Checked out, but your location could not be verified against a campus");
            resolve(true);
          })
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : "Failed to record check-out");
            resolve(false);
          })
          .finally(() => setCheckoutLoading(false));
      });
    });
  }, [teacherId, checkoutLoading, withGeo, teacherCheckout]);

  // ── Shift history (last 30 days) ──────────────────────────────────────────
  const shiftHistory = useMemo(() => {
    const mine = checkins[teacherId] || {};
    const cutoff = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().split("T")[0];
    const days = Object.entries(mine)
      .filter(([date]) => date >= cutoff)
      .sort(([a], [b]) => (a < b ? 1 : -1));

    const onTime = days.filter(([, r]) => r.status === "on-time").length;
    const late = days.filter(([, r]) => r.status === "late").length;
    const rated = onTime + late;
    // Only closed shifts (a check-out exists) can contribute an hours figure.
    const closed = days.filter(([, r]) => !!r.checkoutTimestamp);
    const totalMs = closed.reduce((acc, [, r]) => acc + shiftDurationMs(r, nowMs), 0);
    // A shift the teacher forgot to close out — admin sees these as exceptions.
    const missedCheckouts = days.filter(([date, r]) => date !== today && !r.checkoutTime).length;

    return {
      daysPresent: days.length,
      onTime,
      late,
      punctuality: rated > 0 ? Math.round((onTime / rated) * 100) : null,
      avgHours: closed.length > 0 ? formatDuration(totalMs / closed.length) : null,
      missedCheckouts,
      recent: days.slice(0, 7).map(([date, r]) => ({ date, record: r })),
    };
  }, [checkins, teacherId, nowMs, today]);

  // ── Student attendance ────────────────────────────────────────────────────
  const existingAttendance = teacherId ? attendance[teacherId]?.[today] : undefined;
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceSubmitted, setAttendanceSubmitted] = useState(false);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);

  // Seed from the saved record when it arrives, otherwise default everyone to
  // present. Runs whenever the roster or the saved record changes, so a class
  // assigned mid-session still populates.
  useEffect(() => {
    if (existingAttendance) {
      setAttendanceMap(existingAttendance);
      setAttendanceSubmitted(true);
      return;
    }
    setAttendanceSubmitted(false);
    setAttendanceMap((prev) =>
      Object.fromEntries(roster.map((s) => [s, prev[s] ?? ("present" as AttendanceStatus)])),
    );
  }, [existingAttendance, roster]);

  const toggleStudent = useCallback((name: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [name]: prev[name] === "present" ? "absent" : "present",
    }));
  }, []);

  const setAllStudents = useCallback((status: AttendanceStatus) => {
    setAttendanceMap(Object.fromEntries(roster.map((s) => [s, status])));
  }, [roster]);

  const submitStudentAttendance = useCallback(async () => {
    if (!teacherId) return;
    setSubmittingAttendance(true);
    try {
      await submitAttendance(teacherId, today, attendanceMap);
      setAttendanceSubmitted(true);
      toast.success("Attendance submitted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit attendance");
    } finally {
      setSubmittingAttendance(false);
    }
  }, [teacherId, today, attendanceMap, submitAttendance]);

  const reopenAttendance = useCallback(() => setAttendanceSubmitted(false), []);

  const presentCount = useMemo(
    () => roster.filter((s) => attendanceMap[s] !== "absent").length,
    [roster, attendanceMap],
  );
  const absentCount = roster.length - presentCount;

  // ── Marks ─────────────────────────────────────────────────────────────────
  const myMarks = useMemo(
    () => marksEntries.filter((e) => e.teacherId === teacherId),
    [marksEntries, teacherId],
  );
  const marksToday = useMemo(() => myMarks.filter((e) => e.date === today), [myMarks, today]);

  // ── Class performance (live-derived, never a placeholder) ─────────────────
  const classInsights = useMemo(() => {
    const perStudent = new Map<string, { sum: number; count: number; last: string }>();
    myMarks.forEach((e) => {
      const pct = e.totalMarks > 0 ? (e.marks / e.totalMarks) * 100 : 0;
      const cur = perStudent.get(e.studentName) || { sum: 0, count: 0, last: e.date };
      perStudent.set(e.studentName, {
        sum: cur.sum + pct,
        count: cur.count + 1,
        last: e.date > cur.last ? e.date : cur.last,
      });
    });

    const scored = [...perStudent.entries()]
      .map(([name, v]) => ({ name, average: Math.round(v.sum / v.count), entries: v.count, lastTest: v.last }))
      .sort((a, b) => b.average - a.average);

    const classAverage = scored.length > 0
      ? Math.round(scored.reduce((a, s) => a + s.average, 0) / scored.length)
      : null;

    // Students on the roster who have never been assessed — a real gap the
    // teacher should see, not a silent zero.
    const unassessed = roster.filter((s) => !perStudent.has(s));

    return {
      classAverage,
      scored,
      atRisk: scored.filter((s) => s.average < AT_RISK_THRESHOLD),
      topPerformers: scored.slice(0, 3),
      unassessed,
      pendingParentUpdates: myMarks.filter((e) => !e.sentToParent).length,
    };
  }, [myMarks, roster]);

  // ── Tasks & leave ─────────────────────────────────────────────────────────
  // getTasksForTeacher is re-created whenever the task list changes, so this
  // recomputes on completion without depending on the raw list.
  const tasks = useMemo(
    () => (teacherId ? getTasksForTeacher(teacherId) : []),
    [teacherId, getTasksForTeacher],
  );
  const pendingTasks = tasks.filter((t) => t.statusByTeacher[teacherId] !== "completed");
  const overdueTasks = pendingTasks.filter((t) => t.dueDate < today);
  const myLeaves = useMemo(
    () => leaveRequests.filter((l) => l.userId === teacherId),
    [leaveRequests, teacherId],
  );

  // ── Day compliance checklist ──────────────────────────────────────────────
  const daySteps: DayStep[] = useMemo(() => [
    {
      key: "check-in",
      label: "Check in",
      done: checkedIn,
      required: true,
      hint: "Mandatory — location-verified punch that starts your shift",
    },
    {
      key: "attendance",
      label: "Mark class attendance",
      done: attendanceSubmitted,
      required: roster.length > 0,
      hint: roster.length > 0 ? `${roster.length} students on your roster` : "No students linked yet",
    },
    {
      key: "marks",
      label: "Record today's marks",
      done: marksToday.length > 0,
      required: false,
      hint: marksToday.length > 0 ? `${marksToday.length} recorded today` : "Optional — log any test you conducted",
    },
    {
      key: "tasks",
      label: "Clear assigned tasks",
      done: pendingTasks.length === 0,
      required: false,
      hint: pendingTasks.length > 0 ? `${pendingTasks.length} still open` : "All tasks closed",
    },
    {
      key: "check-out",
      label: "Check out",
      done: checkedOut,
      required: true,
      hint: "Mandatory — closes your shift and logs your hours",
    },
  ], [checkedIn, attendanceSubmitted, roster.length, marksToday.length, pendingTasks.length, checkedOut]);

  const requiredSteps = daySteps.filter((s) => s.required);
  const dayProgress = requiredSteps.length === 0
    ? 0
    : Math.round((requiredSteps.filter((s) => s.done).length / requiredSteps.length) * 100);

  return {
    user, logout, loading,
    teacherInfo, teacherId, today, roster, students,

    shift: {
      record: todayCheckin,
      phase, checkedIn, checkedOut,
      workedMs, workedLabel: formatDuration(workedMs),
      checkinLoading, checkoutLoading,
      punchIn, punchOut,
      history: shiftHistory,
    },

    attendanceMap, attendanceSubmitted, submittingAttendance,
    toggleStudent, setAllStudents, submitStudentAttendance, reopenAttendance,
    presentCount, absentCount,
    // The context declares this as `void`, but it is async and throws on RLS
    // failure — the UI needs the rejection to surface the real error.
    addStudentToTeacher: addStudentToTeacher as (teacherId: string, studentName: string) => Promise<void>,

    myMarks, marksToday, addMarksEntry, markSentToParent,
    classInsights,

    tasks, pendingTasks, overdueTasks, markTaskComplete,
    myLeaves, addLeaveRequest,

    daySteps, dayProgress,
    nowMs,
  };
}

export type TeacherWorkspace = ReturnType<typeof useTeacherWorkspace>;
