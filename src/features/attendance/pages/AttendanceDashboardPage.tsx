import { useState } from "react";
import { LayoutDashboard, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AttendancePageShell, StatTile } from "../components";
import { useAttendanceDashboard } from "../hooks/useAttendanceDashboard";
import { formatMinutes } from "../utils/workHours";
import { today } from "../utils/dates";

const AttendanceDashboardPage = () => {
  const [date, setDate] = useState(today());
  const { data, isLoading } = useAttendanceDashboard(date);
  const s = data?.students;
  const st = data?.staff;

  return (
    <AttendancePageShell
      title="Attendance Dashboard"
      description="Realtime view of student and staff attendance across the institute."
      icon={<LayoutDashboard className="w-5 h-5" />}
      headerExtra={
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="text-sm font-display font-semibold mb-2">Students</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatTile label="Present" value={s?.present ?? 0} tone="positive" />
              <StatTile label="Absent" value={s?.absent ?? 0} tone="danger" />
              <StatTile label="Late" value={s?.late ?? 0} tone="warning" />
              <StatTile label="Excused" value={s?.excused ?? 0} tone="accent" />
              <StatTile label="Half Day" value={s?.halfDay ?? 0} />
              <StatTile label="Attendance" value={`${s?.presentPct ?? 0}%`} tone="positive" />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-display font-semibold mb-2">Staff</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatTile label="Present" value={st?.present ?? 0} tone="positive" />
              <StatTile label="Absent" value={st?.absent ?? 0} tone="danger" />
              <StatTile label="Late" value={st?.late ?? 0} tone="warning" />
              <StatTile label="On Leave" value={st?.leave ?? 0} tone="accent" />
              <StatTile label="Attendance" value={`${st?.presentPct ?? 0}%`} tone="positive" />
              <StatTile label="Avg Hours" value={formatMinutes(st?.avgWorkedMinutes ?? 0)} />
            </div>
          </section>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default AttendanceDashboardPage;
