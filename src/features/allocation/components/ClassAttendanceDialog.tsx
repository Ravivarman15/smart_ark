import React, { useEffect, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
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
import { useClassRoster, useSubmitClassAttendance } from "../hooks";
import type { ClassRosterRow, ClassSchedule } from "../types/allocation.types";

interface Props {
  schedule: ClassSchedule | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// Teacher class-attendance sheet. Reuses the roster + fee-due + previous status
// from classAttendanceService; submitting drives the existing student-attendance
// pipeline (parent WhatsApp) + completes the class.
export const ClassAttendanceDialog: React.FC<Props> = ({ schedule, open, onOpenChange }) => {
  const { data, isLoading } = useClassRoster(open ? schedule?.id : undefined);
  const submit = useSubmitClassAttendance();
  const [rows, setRows] = useState<ClassRosterRow[]>([]);

  useEffect(() => {
    if (data?.rows) setRows(data.rows);
  }, [data]);

  const setStatus = (studentId: string, status: "present" | "absent") =>
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  const setRemark = (studentId: string, remarks: string) =>
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, remarks } : r)));

  const presentCount = rows.filter((r) => r.status === "present").length;

  const handleSubmit = async () => {
    if (!schedule || !data?.batchId || !data.date) {
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Class Attendance —{" "}
            {[schedule?.standardName, schedule?.sectionName, schedule?.subjectName]
              .filter(Boolean)
              .join(" / ") || "Class"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading roster…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No students found for this class (a batch must be assigned to the class).
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{rows.length} students</span>
              <span>{presentCount} present · {rows.length - presentCount} absent</span>
            </div>
            {rows.map((r) => (
              <div key={r.studentId} className="rounded-md border px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.studentName}</span>
                      {r.rollNumber && (
                        <span className="text-xs text-muted-foreground">#{r.rollNumber}</span>
                      )}
                      {r.feeDue && (
                        <Badge variant="outline" className="text-amber-500 gap-1">
                          <AlertCircle className="h-3 w-3" /> Fee due
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={r.status === "present" ? "default" : "outline"}
                      onClick={() => setStatus(r.studentId, "present")}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={r.status === "absent" ? "destructive" : "outline"}
                      onClick={() => setStatus(r.studentId, "absent")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
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
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submit.isPending || rows.length === 0}
          >
            Submit Attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClassAttendanceDialog;
