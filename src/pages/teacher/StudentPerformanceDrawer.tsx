import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MarksEntry, StudentInfo } from "@/contexts/AppDataContext";
import {
  X, TrendingUp, TrendingDown, Minus, Award, CalendarCheck,
  FileText, GraduationCap, AlertTriangle, Loader2,
} from "lucide-react";

interface StudentPerformanceDrawerProps {
  studentName: string;
  student?: StudentInfo;
  marks: MarksEntry[];          // marks entries already filtered to this student
  onClose: () => void;
}

interface AttendanceRow {
  date: string;
  status: string;
}

// How many days of attendance history to pull for the mini-summary.
const HISTORY_DAYS = 30;

/**
 * Per-student drill-down for the teacher dashboard. Marks-based metrics come
 * from the already-loaded `marksEntries` (no round-trip). Attendance % is
 * fetched live from `student_attendance` for this student so the teacher sees
 * a real trend, not a placeholder. Degrades gracefully if the student has no
 * id (e.g. added locally before a refresh) or the query fails.
 */
const StudentPerformanceDrawer: React.FC<StudentPerformanceDrawerProps> = ({
  studentName, student, marks, onClose,
}) => {
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const studentId = student?.id;
    if (!studentId) { setAttendance([]); return; }

    setAttLoading(true);
    setAttError(null);
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().split("T")[0];
    (async () => {
      const { data, error } = await supabase
        .from("student_attendance")
        .select("date, status")
        .eq("student_id", studentId)
        .gte("date", since)
        .order("date", { ascending: false });
      if (cancelled) return;
      if (error) {
        setAttError("Couldn't load attendance history.");
        setAttendance([]);
      } else {
        setAttendance((data as AttendanceRow[]) || []);
      }
      setAttLoading(false);
    })();
    return () => { cancelled = true; };
  }, [student?.id]);

  // ── Marks metrics (chronological, oldest → newest) ────────────────
  const sortedMarks = useMemo(
    () => [...marks].sort((a, b) => a.date.localeCompare(b.date)),
    [marks],
  );

  const perf = useMemo(() => {
    if (sortedMarks.length === 0) {
      return { avg: null as number | null, best: null as number | null, worst: null as number | null, trend: 0 };
    }
    const pcts = sortedMarks.map((e) => (e.totalMarks > 0 ? (e.marks / e.totalMarks) * 100 : 0));
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    const best = Math.round(Math.max(...pcts));
    const worst = Math.round(Math.min(...pcts));
    // Trend = last entry minus average of the earlier ones (simple momentum).
    let trend = 0;
    if (pcts.length >= 2) {
      const last = pcts[pcts.length - 1];
      const priorAvg = pcts.slice(0, -1).reduce((a, b) => a + b, 0) / (pcts.length - 1);
      trend = Math.round(last - priorAvg);
    }
    return { avg, best, worst, trend };
  }, [sortedMarks]);

  const attSummary = useMemo(() => {
    if (!attendance || attendance.length === 0) return { total: 0, present: 0, pct: null as number | null };
    const present = attendance.filter((r) => r.status === "present").length;
    return { total: attendance.length, present, pct: Math.round((present / attendance.length) * 100) };
  }, [attendance]);

  const initials = studentName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const toneFor = (pct: number | null) =>
    pct === null ? "text-muted-foreground"
      : pct >= 60 ? "text-ark-success" : pct >= 40 ? "text-ark-warning" : "text-ark-danger";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-0 sm:px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#0f172a] border border-border rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold ${
              perf.avg === null ? "bg-accent/15 text-accent"
                : perf.avg >= 60 ? "bg-ark-success/15 text-ark-success"
                : perf.avg >= 40 ? "bg-ark-warning/15 text-ark-warning" : "bg-ark-danger/15 text-ark-danger"
            }`}>
              {initials}
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{studentName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {student?.batch || "Unassigned"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* At-risk banner */}
        {perf.avg !== null && perf.avg < 40 && (
          <div className="rounded-xl bg-ark-danger/10 border border-ark-danger/20 px-4 py-2.5 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-ark-danger flex-shrink-0" />
            <p className="text-xs text-ark-danger font-medium">At-risk — class average below 40%. Consider a re-test or parent update.</p>
          </div>
        )}

        {/* Metric tiles */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className={`text-xl font-bold ${toneFor(perf.avg)}`}>{perf.avg === null ? "—" : `${perf.avg}%`}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Avg</p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className="text-xl font-bold text-foreground flex items-center justify-center gap-0.5">
              {perf.trend > 0 ? <TrendingUp className="w-4 h-4 text-ark-success" />
                : perf.trend < 0 ? <TrendingDown className="w-4 h-4 text-ark-danger" />
                : <Minus className="w-4 h-4 text-muted-foreground" />}
              <span className={perf.trend > 0 ? "text-ark-success" : perf.trend < 0 ? "text-ark-danger" : "text-muted-foreground"}>
                {perf.trend > 0 ? `+${perf.trend}` : perf.trend}
              </span>
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Trend</p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className="text-xl font-bold text-accent">{marks.length}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Tests</p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className={`text-xl font-bold ${toneFor(attSummary.pct)}`}>
              {attLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : attSummary.pct === null ? "—" : `${attSummary.pct}%`}
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Present</p>
          </div>
        </div>

        {/* Attendance summary */}
        <section className="mb-5">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-accent" /> Attendance ({HISTORY_DAYS}d)
          </h3>
          {attLoading ? (
            <div className="rounded-xl border border-border/50 p-4 text-center text-xs text-muted-foreground">Loading…</div>
          ) : attError ? (
            <div className="rounded-xl border border-border/50 p-4 text-center text-xs text-muted-foreground">{attError}</div>
          ) : attSummary.total === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No attendance recorded yet.
            </div>
          ) : (
            <div className="rounded-xl bg-card/50 border border-border/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{attSummary.present}/{attSummary.total} days present</span>
                <span className={`text-xs font-bold ${toneFor(attSummary.pct)}`}>{attSummary.pct}%</span>
              </div>
              {/* Last ~14 days as dots, newest on the right */}
              <div className="flex gap-1 flex-wrap">
                {[...(attendance || [])].slice(0, 14).reverse().map((r, i) => (
                  <span
                    key={`${r.date}-${i}`}
                    title={`${r.date}: ${r.status}`}
                    className={`w-4 h-4 rounded-sm ${r.status === "present" ? "bg-ark-success/70" : "bg-ark-danger/70"}`}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Marks history */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" /> Marks History
          </h3>
          {sortedMarks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No marks recorded yet for this student.
            </div>
          ) : (
            <div className="space-y-2">
              {[...sortedMarks].reverse().map((e) => {
                const pct = e.totalMarks > 0 ? Math.round((e.marks / e.totalMarks) * 100) : 0;
                const tone = pct >= 60 ? "success" : pct >= 40 ? "warning" : "danger";
                return (
                  <div key={e.id} className="rounded-xl bg-card/50 border border-border/50 p-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-ark-${tone}/15`}>
                        <span className={`text-sm font-bold text-ark-${tone}`}>{pct}%</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{e.subject} · {e.examType}</p>
                        <p className="text-[10px] text-muted-foreground">{e.marks}/{e.totalMarks} · {e.date}</p>
                        {e.remarks && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{e.remarks}"</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Best/worst footnote */}
        {perf.avg !== null && (
          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Award className="w-3 h-3 text-ark-success" /> Best {perf.best}%</span>
            <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-ark-danger" /> Lowest {perf.worst}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentPerformanceDrawer;
