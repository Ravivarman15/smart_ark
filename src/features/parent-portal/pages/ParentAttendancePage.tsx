// ── Parent Portal — Attendance ───────────────────────────────────────────────
// Reuses student_attendance through parentPortalService. No new attendance
// engine: the same rows the staff Attendance Register writes.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveChild } from "../providers/ActiveChildProvider";
import { useChildAttendance } from "../hooks/useChildData";
import { parentPortalService } from "../services/parentPortal.service";
import { AttendanceTrendChart, useStatusColors } from "../components/charts";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingTiles,
  PageHeader,
  SectionTitle,
  StatTile,
} from "../components/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export const ParentAttendancePage = () => {
  const { activeChild } = useActiveChild();
  const studentId = activeChild?.student.id;
  const { data: days = [], isLoading, error } = useChildAttendance(studentId);
  const colors = useStatusColors();

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.status])), [days]);
  const monthly = useMemo(() => parentPortalService.monthlyAttendance(days), [days]);

  const totals = useMemo(() => {
    const present = days.filter((d) => d.status === "present").length;
    const late = days.filter((d) => d.status === "late").length;
    const absent = days.filter((d) => d.status === "absent").length;
    const total = days.length;
    return {
      present,
      late,
      absent,
      total,
      // 'late' counts as attended, matching the service's monthly rollup.
      percent: total ? Math.round(((present + late) / total) * 100) : null,
    };
  }, [days]);

  // Calendar grid: leading blanks so the 1st lands on the right weekday.
  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: ({ day: number; iso: string } | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    return cells;
  }, [cursor]);

  const shift = (by: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const cellStyle = (status?: string) => {
    if (status === "present") return { background: `${colors.present}22`, color: colors.present, borderColor: `${colors.present}55` };
    if (status === "late") return { background: `${colors.late}22`, color: colors.late, borderColor: `${colors.late}55` };
    if (status === "absent") return { background: `${colors.absent}22`, color: colors.absent, borderColor: `${colors.absent}55` };
    return undefined;
  };

  if (!activeChild) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Attendance" subtitle={activeChild.student.name} />

      {isLoading && <LoadingTiles count={4} />}
      {error && <ErrorState error={error as Error} />}

      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile
              label="Attendance"
              value={totals.percent === null ? "—" : `${totals.percent}%`}
              tone={totals.percent === null ? "default" : totals.percent >= 75 ? "good" : "bad"}
              hint={`${totals.total} day(s) recorded`}
            />
            <StatTile label="Present" value={totals.present} tone="good" />
            <StatTile label="Late" value={totals.late} tone="warn" />
            <StatTile label="Absent" value={totals.absent} tone="bad" />
          </div>

          {days.length === 0 ? (
            <EmptyState
              title="No attendance recorded yet"
              hint="Attendance will appear here as soon as the class teacher marks the register."
            />
          ) : (
            <>
              <Card className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>
                    {MONTHS[cursor.month]} {cursor.year}
                  </SectionTitle>
                  <div className="flex gap-1">
                    <button
                      onClick={() => shift(-1)}
                      aria-label="Previous month"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => shift(1)}
                      aria-label="Next month"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DOW.map((d, i) => (
                    <div
                      key={i}
                      className="text-center text-[10px] font-semibold text-muted-foreground py-1"
                    >
                      {d}
                    </div>
                  ))}
                  {grid.map((cell, i) =>
                    cell === null ? (
                      <div key={`b${i}`} />
                    ) : (
                      <div
                        key={cell.iso}
                        title={`${cell.iso}${byDate.get(cell.iso) ? ` — ${byDate.get(cell.iso)}` : ""}`}
                        style={cellStyle(byDate.get(cell.iso))}
                        className={cn(
                          "aspect-square rounded-lg border flex items-center justify-center text-xs font-medium tabular-nums",
                          !byDate.get(cell.iso) && "border-border text-muted-foreground/50",
                        )}
                      >
                        {cell.day}
                      </div>
                    ),
                  )}
                </div>

                {/* Legend — three statuses, so identity is never colour-alone. */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3">
                  {[
                    { label: "Present", color: colors.present },
                    { label: "Late", color: colors.late },
                    { label: "Absent", color: colors.absent },
                  ].map((l) => (
                    <span
                      key={l.label}
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ background: l.color }}
                        aria-hidden
                      />
                      {l.label}
                    </span>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionTitle>Monthly trend</SectionTitle>
                <AttendanceTrendChart data={monthly} />

                {/* Table view — the required relief for the contrast warning on
                    the amber step, and the accessible alternative to the chart. */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-1.5 pr-3">Month</th>
                        <th className="text-right font-medium py-1.5 px-2">Present</th>
                        <th className="text-right font-medium py-1.5 px-2">Late</th>
                        <th className="text-right font-medium py-1.5 px-2">Absent</th>
                        <th className="text-right font-medium py-1.5 pl-2">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => (
                        <tr key={m.month} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 pr-3 text-foreground">{m.month}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{m.present}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{m.late}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{m.absent}</td>
                          <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-foreground">
                            {m.percent}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ParentAttendancePage;
