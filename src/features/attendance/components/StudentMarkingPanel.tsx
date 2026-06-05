import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCheck, Clock, Copy, Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/core/constants/queryKeys";
import { useStudentAttendanceDay, useSaveStudentAttendance } from "../hooks/useStudentAttendance";
import { attendanceStudentService } from "../services";
import { STUDENT_STATUS_META, STUDENT_STATUSES } from "../utils/statusMeta";
import { previousDay } from "../utils/dates";
import { EmptyState } from "./EmptyState";
import { StatTile } from "./StatTile";
import { StatusButtons } from "./StatusButtons";
import type {
  AttendanceSource,
  StudentAttendanceStatus,
  StudentDraftRow,
} from "../types/attendance.types";

interface Props {
  batchId: string;
  date: string;
  source?: AttendanceSource;
}

/** Shared roster marking grid — used by Mark Attendance and Backdated entry. */
export const StudentMarkingPanel = ({ batchId, date, source = "manual" }: Props) => {
  const qc = useQueryClient();
  const { data: serverRows, isLoading } = useStudentAttendanceDay(batchId, date);
  const [rows, setRows] = useState<StudentDraftRow[]>([]);
  const saveMut = useSaveStudentAttendance();

  useEffect(() => {
    if (serverRows) setRows(serverRows);
  }, [serverRows]);

  const setStatus = (studentId: string, status: StudentAttendanceStatus) =>
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  const markAll = (status: StudentAttendanceStatus) =>
    setRows((prev) => prev.map((r) => ({ ...r, status })));

  const copyYesterday = async () => {
    const prev = await qc.fetchQuery({
      queryKey: queryKeys.attendance.studentMark(batchId, previousDay(date)),
      queryFn: () => attendanceStudentService.getDay(batchId, previousDay(date)),
    });
    const byId = new Map(prev.map((r) => [r.studentId, r.status]));
    setRows((cur) => cur.map((r) => ({ ...r, status: byId.get(r.studentId) ?? r.status })));
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, other: 0 };
    for (const r of rows) {
      if (r.status === "present") c.present += 1;
      else if (r.status === "absent") c.absent += 1;
      else if (r.status === "late") c.late += 1;
      else c.other += 1;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Present" value={counts.present} tone="positive" />
        <StatTile label="Absent" value={counts.absent} tone="danger" />
        <StatTile label="Late" value={counts.late} tone="warning" />
        <StatTile label="Other" value={counts.other} tone="accent" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => markAll("present")} disabled={rows.length === 0}>
          <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Present All
        </Button>
        <Button size="sm" variant="outline" onClick={() => markAll("absent")} disabled={rows.length === 0}>
          <UserX className="w-3.5 h-3.5 mr-1.5" /> Absent All
        </Button>
        <Button size="sm" variant="outline" onClick={() => markAll("late")} disabled={rows.length === 0}>
          <Clock className="w-3.5 h-3.5 mr-1.5" /> Late All
        </Button>
        <Button size="sm" variant="outline" onClick={copyYesterday} disabled={rows.length === 0}>
          <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Yesterday
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => saveMut.mutate({ batchId, date, rows, source })}
          disabled={rows.length === 0 || saveMut.isPending}
        >
          {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Save Attendance
        </Button>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="w-5 h-5" />}
            title="No students in this batch"
            description="Assign students to this batch to mark their attendance."
          />
        ) : (
          <ul className="divide-y divide-border/30">
            {rows.map((r, i) => (
              <li key={r.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm min-w-0">
                  <span className="text-muted-foreground mr-2">{r.rollNumber ?? i + 1}.</span>
                  {r.studentName}
                </span>
                <StatusButtons
                  statuses={STUDENT_STATUSES}
                  meta={STUDENT_STATUS_META}
                  value={r.status}
                  onChange={(s) => setStatus(r.studentId, s)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
