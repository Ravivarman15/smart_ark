import { GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentAttendanceAnalytics } from "../hooks/useStudentAttendanceAnalytics";

/**
 * Student-attendance summary tile. Reads today's marks from
 * `student_attendance` and surfaces the present% across the marked roster
 * plus a coverage-of-active number so managers can spot batches that
 * weren't recorded.
 *
 * Why this is separate from AttendanceAnalyticsCard: that card is staff
 * (teacher_attendance) only. Conflating staff and student datasets in one
 * widget was the source of the "marked all present but dashboard shows 0"
 * confusion — those numbers come from different tables entirely.
 */
export const StudentAttendanceCard = () => {
  const { data, isLoading, error } = useStudentAttendanceAnalytics();

  if (error) {
    return <p className="text-xs text-rose-600">Failed to load student attendance</p>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 w-full" />;
  }

  const cells: { label: string; value: number; tone: string }[] = [
    { label: "Present", value: data.present, tone: "text-emerald-600" },
    { label: "Absent", value: data.absent, tone: "text-rose-600" },
    { label: "Late", value: data.late, tone: "text-amber-600" },
    { label: "Unmarked", value: data.unmarked, tone: "text-muted-foreground" },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
            <GraduationCap className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Student Attendance</h3>
            <p className="text-[11px] text-muted-foreground">
              Today · {data.marked} of {data.totalActive} marked
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-semibold text-foreground">
            {data.presentPct}%
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Present
          </p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-2 mt-auto">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-md border border-border/60 bg-muted/30 p-2 text-center"
          >
            <p className={`text-lg font-semibold ${c.tone}`}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
          </div>
        ))}
      </div>

      {data.totalActive > 0 && (
        <p className="text-[10px] text-muted-foreground -mt-1">
          Institute-wide coverage: {data.coverageOfActivePct}% of active students present
        </p>
      )}
    </div>
  );
};
