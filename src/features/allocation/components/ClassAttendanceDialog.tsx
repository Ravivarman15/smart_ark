import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, HeartPulse, Plane, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  useAutosaveClassAttendance,
  useClassRoster,
  useSubmitClassAttendance,
} from "../hooks";
import { ABSENT_LIKE } from "../services/classAttendance.service";
import type {
  ClassAttendanceStatus,
  ClassRosterRow,
  ClassSchedule,
} from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// One-click class attendance (Phase 8).
//
//   • the whole roster loads automatically for the class's batch
//   • five statuses — Present / Absent / Late / Medical / Leave — which map onto
//     the existing enterprise student-attendance vocabulary on save
//   • AUTO-SAVE: marks are persisted to class_attendance a second after the last
//     tap, so nothing is lost mid-sheet. Parent comms only fire on Submit.
//   • Submit runs the existing student-attendance pipeline (day row + parent
//     WhatsApp), completes the class and updates teaching hours → payroll,
//     coordinator/management dashboards and Student 360.
// ─────────────────────────────────────────────────────────────────────────────

const AUTOSAVE_DELAY_MS = 1000;

const OPTIONS: {
  value: ClassAttendanceStatus;
  label: string;
  icon: React.ReactNode;
  active: string;
}[] = [
  { value: "present", label: "Present", icon: <Check className="h-4 w-4" />, active: "bg-emerald-500 text-white hover:bg-emerald-500/90" },
  { value: "absent", label: "Absent", icon: <X className="h-4 w-4" />, active: "bg-rose-500 text-white hover:bg-rose-500/90" },
  { value: "late", label: "Late", icon: <Clock className="h-4 w-4" />, active: "bg-amber-500 text-white hover:bg-amber-500/90" },
  { value: "medical", label: "Medical", icon: <HeartPulse className="h-4 w-4" />, active: "bg-sky-500 text-white hover:bg-sky-500/90" },
  { value: "leave", label: "Leave", icon: <Plane className="h-4 w-4" />, active: "bg-indigo-500 text-white hover:bg-indigo-500/90" },
];

interface Props {
  schedule: ClassSchedule | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const ClassAttendanceDialog: React.FC<Props> = ({ schedule, open, onOpenChange }) => {
  const { data, isLoading } = useClassRoster(open ? schedule?.id : undefined);
  const submit = useSubmitClassAttendance();
  const autosave = useAutosaveClassAttendance();
  const [rows, setRows] = useState<ClassRosterRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data?.rows) {
      setRows(data.rows);
      setDirty(false);
    }
  }, [data]);

  // Debounced auto-save — persists the per-class marks only (no comms, no
  // completion), so a lost connection mid-sheet never costs the teacher work.
  useEffect(() => {
    if (!dirty || !schedule?.id || rows.length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      autosave.mutate(
        { classScheduleId: schedule.id, rows },
        {
          onSuccess: () => {
            setSavedAt(new Date().toLocaleTimeString());
            setDirty(false);
          },
        },
      );
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `autosave` is a stable mutation object; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dirty, schedule?.id]);

  const setStatus = (studentId: string, status: ClassAttendanceStatus) => {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
    setDirty(true);
  };
  const setRemark = (studentId: string, remarks: string) => {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, remarks } : r)));
    setDirty(true);
  };
  const markAll = (status: ClassAttendanceStatus) => {
    setRows((rs) => rs.map((r) => ({ ...r, status })));
    setDirty(true);
  };

  const presentCount = rows.filter((r) => !ABSENT_LIKE.includes(r.status)).length;
  const multiStandard = new Set(rows.map((r) => r.standardId).filter(Boolean)).size > 1;

  const handleSubmit = async () => {
    // An assigned roster carries its own per-student batch, so the class-level
    // batch is only required when we're falling back to the batch roster.
    if (!schedule || !data?.date || (!data.assigned && !data.batchId)) {
      toast.error("This class has no batch/roster to mark.");
      return;
    }
    try {
      await submit.mutateAsync({
        classScheduleId: schedule.id,
        batchId: data.batchId,
        date: data.date,
        rows,
        previousRows: data.rows,
      });
      toast.success("Attendance submitted — class completed, parents notified");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit attendance");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Class Attendance —{" "}
            {[
              schedule?.standardNames?.length
                ? schedule.standardNames.join(" + ")
                : schedule?.standardName,
              schedule?.sectionName,
              schedule?.subjectName,
            ]
              .filter(Boolean)
              .join(" / ") || "Class"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading roster…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No students in this class yet — ask your coordinator to assign students to it
            (or set a batch) on the Class Scheduling page.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {rows.length} students · {presentCount} in class · {rows.length - presentCount} away
                {data?.assigned ? " · assigned to this class" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => markAll("present")}>
                  Mark all present
                </Button>
                <span className="text-xs text-muted-foreground">
                  {dirty || autosave.isPending ? (
                    <span className="flex items-center gap-1">
                      <Save className="h-3 w-3 animate-pulse" /> saving…
                    </span>
                  ) : savedAt ? (
                    `saved ${savedAt}`
                  ) : (
                    ""
                  )}
                </span>
              </div>
            </div>

            {rows.map((r) => (
              <div key={r.studentId} className="rounded-md border px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{r.studentName}</span>
                    {r.rollNumber && (
                      <span className="text-xs text-muted-foreground">#{r.rollNumber}</span>
                    )}
                    {/* Only worth showing when the class actually mixes them. */}
                    {multiStandard && r.standardName && (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.standardName}
                      </Badge>
                    )}
                    {r.feeDue && (
                      <Badge variant="outline" className="text-amber-500 gap-1">
                        <AlertCircle className="h-3 w-3" /> Fee due
                      </Badge>
                    )}
                    {r.previousStatus && r.previousStatus !== "present" && (
                      <Badge variant="outline" className="text-xs">
                        last: {r.previousStatus}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {OPTIONS.map((o) => (
                      <Button
                        key={o.value}
                        size="sm"
                        variant="outline"
                        title={o.label}
                        className={r.status === o.value ? o.active : undefined}
                        onClick={() => setStatus(r.studentId, o.value)}
                      >
                        {o.icon}
                        <span className="ml-1 hidden sm:inline text-xs">{o.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
                <Input
                  className="h-7 text-xs"
                  placeholder="Note (optional)"
                  value={r.remarks ?? ""}
                  onChange={(e) => setRemark(r.studentId, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSubmit} disabled={submit.isPending || rows.length === 0}>
            Submit Attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClassAttendanceDialog;
