import { useEffect, useState } from "react";
import { ClipboardEdit, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendancePageShell, EmptyState } from "../components";
import { useStaffOptions } from "../hooks/useAttendanceLookups";
import { useStaffCorrection, useStaffMemberDay, useStaffAttendanceAudit } from "../hooks/useStaffAttendance";
import { STAFF_STATUSES, STAFF_STATUS_META } from "../utils/statusMeta";
import { clockInput, composeTimestamp, formatClock, formatDate, today } from "../utils/dates";
import type { StaffAttendanceStatus } from "../types/attendance.types";

const StaffCorrectionsPage = () => {
  const { data: staff = [] } = useStaffOptions();
  const correctMut = useStaffCorrection();

  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(today());
  const { data: record } = useStaffMemberDay(staffId || undefined, date);
  const { data: audit = [] } = useStaffAttendanceAudit({ staffId: staffId || undefined, limit: 100 });

  const [status, setStatus] = useState<StaffAttendanceStatus>("present");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [remarks, setRemarks] = useState("");
  const [reason, setReason] = useState("");

  // Prefill the form from the existing record when staff/date changes.
  useEffect(() => {
    if (record) {
      setStatus(record.status);
      setInTime(clockInput(record.inTime));
      setOutTime(clockInput(record.outTime));
      setRemarks(record.remarks ?? "");
    } else {
      setStatus("present");
      setInTime("");
      setOutTime("");
      setRemarks("");
    }
  }, [record, staffId, date]);

  const submit = () => {
    if (!staffId || reason.trim().length < 3) return;
    correctMut.mutate(
      {
        input: {
          staffId,
          date,
          status,
          inTime: composeTimestamp(date, inTime),
          outTime: composeTimestamp(date, outTime),
          remarks: remarks || undefined,
        },
        reason: reason.trim(),
      },
      { onSuccess: () => setReason("") },
    );
  };

  return (
    <AttendancePageShell
      title="Staff Attendance Corrections"
      description="Adjust a staff member's record with a reason. Every change is preserved in the audit log."
      icon={<ClipboardEdit className="w-5 h-5" />}
      toolbar={
        <>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
        </>
      }
    >
      {!staffId ? (
        <div className="glass-card">
          <EmptyState icon={<ClipboardEdit className="w-5 h-5" />} title="Select a staff member" description="Choose a staff member and date to correct their record." />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="glass-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StaffAttendanceStatus)}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STAFF_STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div />
              <div>
                <Label className="text-xs">In time</Label>
                <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Out time</Label>
                <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="h-9 mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Reason for correction <span className="text-red-500">*</span></Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1" placeholder="Why is this being changed?" />
              </div>
            </div>
            <Button onClick={submit} disabled={reason.trim().length < 3 || correctMut.isPending} className="w-full">
              {correctMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Correction
            </Button>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5"><History className="w-4 h-4" /> Change history</h3>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No changes recorded for this staff member.</p>
            ) : (
              <ul className="divide-y divide-border/30">
                {audit.map((a) => (
                  <li key={a.id} className="py-2 text-sm flex items-center justify-between gap-3">
                    <span>
                      <span className="font-medium capitalize">{a.changeType}</span>
                      {a.oldStatus ? (
                        <span className="text-muted-foreground"> · {a.oldStatus} → {a.newStatus}</span>
                      ) : (
                        <span className="text-muted-foreground"> · {a.newStatus}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground text-right shrink-0">
                      {a.changedByName ?? "—"} · {formatDate(a.date)} {formatClock(a.changedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StaffCorrectionsPage;
