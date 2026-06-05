import { formatMinutes } from "../utils/workHours";
import { StatTile } from "./StatTile";
import type { StaffAttendanceRecord } from "../types/attendance.types";

interface Props {
  record?: StaffAttendanceRecord | null;
}

/** Per-staff work-hours summary: worked / remaining / overtime / % / late. */
export const WorkHoursCard = ({ record }: Props) => {
  const worked = record?.workedMinutes ?? 0;
  const expected = record?.expectedMinutes ?? 0;
  const remaining = Math.max(expected - worked, 0);
  const overtime = record?.overtimeMinutes ?? 0;
  const late = record?.lateMinutes ?? 0;
  const pct = expected > 0 ? Math.round(Math.min(worked / expected, 1) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatTile label="Worked" value={formatMinutes(worked)} tone="positive" />
      <StatTile label="Remaining" value={formatMinutes(remaining)} tone="warning" />
      <StatTile label="Overtime" value={formatMinutes(overtime)} tone="accent" />
      <StatTile label="Attendance" value={`${pct}%`} tone={pct >= 75 ? "positive" : "danger"} />
      <StatTile label="Late by" value={late > 0 ? formatMinutes(late) : "—"} tone={late > 0 ? "danger" : "neutral"} />
    </div>
  );
};
