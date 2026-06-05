// Status presentation metadata — label + tailwind classes per status.
// Single source so a colour/label change is a one-file edit. NO React.

import type {
  AttendanceSource,
  StaffAttendanceStatus,
  StudentAttendanceStatus,
} from "../types/attendance.types";

interface Meta {
  label: string;
  className: string;
  dot: string;
}

export const STUDENT_STATUS_META: Record<StudentAttendanceStatus, Meta> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  absent: {
    label: "Absent",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  excused: {
    label: "Excused",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  half_day: {
    label: "Half Day",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  medical_leave: {
    label: "Medical",
    className: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
    dot: "bg-pink-500",
  },
  holiday: {
    label: "Holiday",
    className: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
    dot: "bg-slate-500",
  },
};

export const STUDENT_STATUSES: StudentAttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
  "half_day",
  "medical_leave",
  "holiday",
];

export const STAFF_STATUS_META: Record<StaffAttendanceStatus, Meta> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  absent: {
    label: "Absent",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  half_day: {
    label: "Half Day",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  leave: {
    label: "Leave",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
};

export const STAFF_STATUSES: StaffAttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
];

export const SOURCE_LABELS: Record<AttendanceSource, string> = {
  manual: "Manual",
  staff_checkin: "Check-in",
  bulk_import: "Import",
  correction: "Correction",
};
