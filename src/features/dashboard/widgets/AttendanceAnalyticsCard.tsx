import { UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceAnalytics } from "../hooks/useAttendanceAnalytics";

/**
 * Staff attendance summary tile. Single number + breakdown chips, no chart —
 * this is "operational" data; managers want it at a glance.
 */
export const AttendanceAnalyticsCard = () => {
  const { data, isLoading, error } = useAttendanceAnalytics();

  if (error) {
    return <p className="text-xs text-rose-600">Failed to load attendance</p>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 w-full" />;
  }

  const cells: { label: string; value: number; tone: string }[] = [
    { label: "Present", value: data.presentToday, tone: "text-emerald-600" },
    { label: "Absent", value: data.absentToday, tone: "text-rose-600" },
    { label: "Pending", value: data.pendingApproval, tone: "text-amber-600" },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex w-7 h-7 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
            <UserCheck className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Staff Attendance</h3>
            <p className="text-[11px] text-muted-foreground">Today's check-ins</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-semibold text-foreground">
            {data.attendancePct}%
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 mt-auto">
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
    </div>
  );
};
