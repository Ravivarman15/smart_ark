import { useState } from "react";
import { Loader2, UserCog } from "lucide-react";
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
import { useSaveStaffManual, useStaffAttendanceDay } from "../hooks/useStaffAttendance";
import { STAFF_STATUSES, STAFF_STATUS_META } from "../utils/statusMeta";
import { formatMinutes } from "../utils/workHours";
import { composeTimestamp, formatClock, today } from "../utils/dates";
import type { StaffAttendanceStatus } from "../types/attendance.types";

const StaffManualAttendancePage = () => {
  const { data: staff = [] } = useStaffOptions();
  const saveMut = useSaveStaffManual();

  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<StaffAttendanceStatus>("present");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: dayRecords = [] } = useStaffAttendanceDay(date);

  const submit = () => {
    if (!staffId) return;
    saveMut.mutate(
      {
        staffId,
        date,
        status,
        inTime: composeTimestamp(date, inTime),
        outTime: composeTimestamp(date, outTime),
        remarks: remarks || undefined,
      },
      { onSuccess: () => { setInTime(""); setOutTime(""); setRemarks(""); } },
    );
  };

  return (
    <AttendancePageShell
      title="Staff Manual Attendance"
      description="Record staff attendance with in/out times. Work hours are computed automatically."
      icon={<UserCog className="w-5 h-5" />}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Staff</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {s.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 mt-1" />
            </div>
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
          </div>
          <Button onClick={submit} disabled={!staffId || saveMut.isPending} className="w-full">
            {saveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Attendance
          </Button>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-sm font-display font-semibold mb-3">Marked on {date}</h3>
          {dayRecords.length === 0 ? (
            <EmptyState icon={<UserCog className="w-5 h-5" />} title="No staff marked yet" description="Records you save appear here." />
          ) : (
            <ul className="divide-y divide-border/30">
              {dayRecords.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{r.staffName ?? "Staff"}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatClock(r.inTime) || "—"} → {formatClock(r.outTime) || "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{formatMinutes(r.workedMinutes)}</span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${STAFF_STATUS_META[r.status].className}`}>
                      {STAFF_STATUS_META[r.status].label}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AttendancePageShell>
  );
};

export default StaffManualAttendancePage;
