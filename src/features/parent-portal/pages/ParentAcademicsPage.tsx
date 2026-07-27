// ── Parent Portal — Academics ────────────────────────────────────────────────
// Reuses fetchStudentInsights (the Student 360° data source) and the shared
// rule-based scorer, so every figure matches what staff see.

import { useMemo } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildAttendance, useChildInsights } from "../hooks/useChildData";
import { buildAiSummary, computeHealthScores } from "@/features/students/utils/student360";
import { MarksTrendChart, SubjectBarChart } from "../components/charts";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingTiles,
  PageHeader,
  RiskChip,
  ScoreBar,
  SectionTitle,
  StatTile,
} from "../components/primitives";

export const ParentAcademicsPage = () => {
  const { activeChild } = useActiveChild();
  const studentId = activeChild?.student.id;
  const { data: insights, isLoading, error } = useChildInsights(studentId);
  const { data: days = [] } = useChildAttendance(studentId);

  const attendancePercent = useMemo(() => {
    if (days.length === 0) return null;
    return Math.round((days.filter((d) => d.status !== "absent").length / days.length) * 100);
  }, [days]);

  const healthInput = useMemo(
    () => ({
      overallPercent: insights?.overallPercent ?? null,
      attendancePercent,
      fee: insights?.fee
        ? {
            total: insights.fee.total,
            discount: insights.fee.discount,
            received: insights.fee.received,
            pending: insights.fee.pending,
          }
        : undefined,
      commTotal: 0,
      commDelivered: 0,
      strongSubjects: insights?.strong.map((s) => s.subject) ?? [],
      weakSubjects: insights?.weak.map((s) => s.subject) ?? [],
    }),
    [insights, attendancePercent],
  );

  const health = useMemo(() => computeHealthScores(healthInput), [healthInput]);
  const ai = useMemo(() => buildAiSummary(healthInput), [healthInput]);

  const trend = useMemo(
    () =>
      (insights?.exams ?? [])
        .filter((e) => e.percent !== null)
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
        .map((e) => ({ label: (e.date ?? "").slice(5) || e.title.slice(0, 6), percent: e.percent as number })),
    [insights],
  );

  // Direction over thirds — the same noise-tolerant rule the assistant uses.
  const direction = useMemo(() => {
    if (trend.length < 4) return null;
    const size = Math.max(1, Math.floor(trend.length / 3));
    const avg = (xs: typeof trend) => Math.round(xs.reduce((a, x) => a + x.percent, 0) / xs.length);
    const delta = avg(trend.slice(-size)) - avg(trend.slice(0, size));
    return { delta, label: delta >= 5 ? "Improving" : delta <= -5 ? "Declining" : "Steady" };
  }, [trend]);

  if (!activeChild) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Academics"
        subtitle={activeChild.student.name}
        action={<RiskChip risk={health.risk} />}
      />

      {isLoading && <LoadingTiles count={4} />}
      {error && <ErrorState error={error as Error} />}

      {insights && !isLoading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile
              label="Overall average"
              value={insights.overallPercent === null ? "—" : `${insights.overallPercent}%`}
              tone={
                insights.overallPercent === null
                  ? "default"
                  : insights.overallPercent >= 50
                    ? "good"
                    : "bad"
              }
            />
            <StatTile
              label="Attendance"
              value={attendancePercent === null ? "—" : `${attendancePercent}%`}
              tone={attendancePercent === null ? "default" : attendancePercent >= 75 ? "good" : "bad"}
            />
            <StatTile label="Results recorded" value={trend.length} />
            <StatTile
              label="Trend"
              value={direction ? direction.label : "—"}
              hint={direction ? `${direction.delta > 0 ? "+" : ""}${direction.delta} pts` : "Needs 4+ results"}
              tone={
                !direction ? "default" : direction.delta >= 5 ? "good" : direction.delta <= -5 ? "bad" : "default"
              }
              icon={
                direction ? (
                  direction.delta >= 5 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : direction.delta <= -5 ? (
                    <TrendingDown className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )
                ) : undefined
              }
            />
          </div>

          {/* NOTE ON RANK: class / section rank is surfaced per-exam on the
              Exams page, read from exam_results.rank — a value staff write
              during result publication. It is deliberately never computed
              here: RLS means this parent's session can see only their own
              child's rows, so any client-side "rank" would be a rank out of
              one. An absent rank shows as "—", never as a guess. */}

          {trend.length > 0 && (
            <Card className="mb-4">
              <SectionTitle>Marks trend</SectionTitle>
              <MarksTrendChart data={trend} />
            </Card>
          )}

          {insights.subjects.length > 0 && (
            <Card className="mb-4">
              <SectionTitle>Subject performance</SectionTitle>
              <SubjectBarChart data={insights.subjects} />
              <div className="flex flex-wrap gap-1.5 mt-3">
                {insights.strong.map((s) => (
                  <Chip key={s.subject} tone="good">
                    Strong · {s.subject} {s.avgPercent}%
                  </Chip>
                ))}
                {insights.weak.map((s) => (
                  <Chip key={s.subject} tone="bad">
                    Needs work · {s.subject} {s.avgPercent}%
                  </Chip>
                ))}
              </div>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <SectionTitle>Health score</SectionTitle>
              <div className="text-3xl font-bold text-foreground mb-3 tabular-nums">
                {health.overall}
                <span className="text-base text-muted-foreground font-normal">/100</span>
              </div>
              <ScoreBar label="Academic" value={health.academic} />
              <ScoreBar label="Attendance" value={health.attendance} />
              <ScoreBar label="Fee" value={health.fee} />
            </Card>

            <Card>
              <SectionTitle>Summary &amp; recommendation</SectionTitle>
              <p className="text-sm text-foreground mb-1.5">{ai.performance}</p>
              <p className="text-sm text-muted-foreground mb-1.5">{ai.attendance}</p>
              <p className="text-sm text-muted-foreground mb-3">{ai.fee}</p>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Recommended
                </p>
                <p className="text-sm font-medium text-foreground">{ai.recommendation}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Generated from your child's recorded results, attendance and fee ledger using the
                institution's standard scoring rules.
              </p>
            </Card>
          </div>

          {insights.exams.length === 0 && (
            <EmptyState
              title="No results published yet"
              hint="Marks appear here once the subject teacher publishes them."
            />
          )}
        </>
      )}
    </div>
  );
};

export default ParentAcademicsPage;
