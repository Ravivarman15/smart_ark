import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  User,
  Users,
  MapPin,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock3,
  Video,
  BookOpen,
} from "lucide-react";
import { useClassRoster } from "../hooks/useClassAttendance";
import type { ClassSchedule, ClassAttendanceStatus } from "../types/allocation.types";
import { classTitle, durationLabel, timeRangeLabel, formatDay } from "../utils/scheduleView";

interface ClassDetailsDialogProps {
  schedule: ClassSchedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ATTENDANCE_BADGE_STYLE: Record<ClassAttendanceStatus, { label: string; style: string }> = {
  present: { label: "Present", style: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  absent: { label: "Absent", style: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  late: { label: "Late", style: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  medical: { label: "Medical Leave", style: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  leave: { label: "Leave", style: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30" },
};

export const ClassDetailsDialog: React.FC<ClassDetailsDialogProps> = ({
  schedule,
  open,
  onOpenChange,
}) => {
  const [search, setSearch] = useState("");

  const { data: rosterData, isLoading: isRosterLoading } = useClassRoster(
    open ? schedule?.id : undefined
  );

  const rosterRows = rosterData?.rows ?? [];

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rosterRows;
    return rosterRows.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        (s.rollNumber ?? "").toLowerCase().includes(q) ||
        (s.standardName ?? "").toLowerCase().includes(q)
    );
  }, [rosterRows, search]);

  if (!schedule) return null;

  const formattedDate = schedule.scheduleDate ? formatDay(schedule.scheduleDate) : "—";
  const title = classTitle(schedule);

  const presentCount = rosterRows.filter((r) => r.status === "present" || r.status === "late").length;
  const absentCount = rosterRows.filter((r) => r.status === "absent").length;
  const otherCount = rosterRows.length - presentCount - absentCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className="capitalize text-xs font-semibold px-2.5 py-0.5">
              {schedule.status.replace("_", " ")}
            </Badge>
            {schedule.isExtra && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30">
                Extra Class
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-bold mt-2 text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-primary" /> {formattedDate} ({schedule.scheduleDate})
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-primary" /> {timeRangeLabel(schedule.startTime, schedule.endTime)} ({durationLabel(schedule.durationMinutes)})
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Class Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 p-4 rounded-xl border border-border">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Teacher</p>
              <p className="text-sm font-semibold mt-0.5 text-foreground flex items-center gap-1 truncate">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {schedule.teacherName ?? "Unassigned"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mode / Room</p>
              <p className="text-sm font-semibold mt-0.5 text-foreground flex items-center gap-1 truncate capitalize">
                {schedule.meetingLink ? (
                  <Video className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
                {schedule.mode} {schedule.room ? `(${schedule.room})` : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Started At</p>
              <p className="text-sm font-semibold mt-0.5 text-foreground flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                {schedule.startedAt ? schedule.startedAt.slice(11, 16) : "Not started"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ended At</p>
              <p className="text-sm font-semibold mt-0.5 text-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                {schedule.completedAt ? schedule.completedAt.slice(11, 16) : "Not ended"}
              </p>
            </div>
          </div>

          {/* Student Roster Header & Search */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h4 className="font-semibold text-base text-foreground">
                  Student List ({rosterRows.length})
                </h4>
              </div>

              {/* Quick Attendance Summary Pills */}
              {rosterRows.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" /> {presentCount} Present
                  </span>
                  {absentCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 font-medium border border-rose-500/20">
                      <XCircle className="h-3 w-3" /> {absentCount} Absent
                    </span>
                  )}
                  {otherCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium border border-amber-500/20">
                      <AlertCircle className="h-3 w-3" /> {otherCount} Other
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Search Input */}
            {rosterRows.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student name, roll number, or standard..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            )}

            {/* Student Table / Cards */}
            {isRosterLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent animate-spin rounded-full mx-auto" />
                <p>Loading student roster...</p>
              </div>
            ) : rosterRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-medium text-foreground">No students assigned to this class yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Students can be assigned via Class Scheduling or the batch roster.
                </p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No students match &quot;{search}&quot;
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border bg-card">
                {filteredStudents.map((student, idx) => {
                  const badgeInfo = ATTENDANCE_BADGE_STYLE[student.status] ?? {
                    label: student.status,
                    style: "bg-muted text-muted-foreground",
                  };

                  return (
                    <div
                      key={student.studentId || idx}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {student.studentName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                            {student.rollNumber && <span>Roll: {student.rollNumber}</span>}
                            {student.standardName && (
                              <span>Standard: {student.standardName}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {student.feeDue && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                            Fee Due
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-medium ${badgeInfo.style}`}>
                          {badgeInfo.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
