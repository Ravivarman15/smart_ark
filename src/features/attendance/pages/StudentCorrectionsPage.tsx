import { useState } from "react";
import { ClipboardEdit, History } from "lucide-react";
import { AttendancePageShell, AttendanceFilters, EmptyState, StudentMarkingPanel } from "../components";
import { useStudentAttendanceAudit } from "../hooks/useStudentAttendance";
import { formatDate, formatClock, today } from "../utils/dates";

const StudentCorrectionsPage = () => {
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(today());
  const { data: audit = [] } = useStudentAttendanceAudit({
    batchId: batchId || undefined,
    date: batchId ? date : undefined,
    limit: 100,
  });

  return (
    <AttendancePageShell
      title="Student Attendance Corrections"
      description="Edit attendance with a full audit trail — every change records who, when and what changed."
      icon={<ClipboardEdit className="w-5 h-5" />}
      toolbar={
        <AttendanceFilters batchId={batchId} onBatchChange={setBatchId} date={date} onDateChange={setDate} />
      }
    >
      {!batchId ? (
        <div className="glass-card">
          <EmptyState icon={<ClipboardEdit className="w-5 h-5" />} title="Select a batch and date" description="Re-mark any student to record a correction. The previous value is preserved in the audit log." />
        </div>
      ) : (
        <div className="space-y-5">
          <StudentMarkingPanel batchId={batchId} date={date} source="correction" />

          <section className="glass-card p-4">
            <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4" /> Change history
            </h3>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No changes recorded for this batch and date.</p>
            ) : (
              <ul className="divide-y divide-border/30">
                {audit.map((a) => (
                  <li key={a.id} className="py-2 text-sm flex items-center justify-between gap-3">
                    <span>
                      <span className="font-medium capitalize">{a.changeType}</span>
                      {a.oldStatus && (
                        <span className="text-muted-foreground">
                          {" "}· {a.oldStatus} → {a.newStatus}
                        </span>
                      )}
                      {!a.oldStatus && <span className="text-muted-foreground"> · {a.newStatus}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground text-right shrink-0">
                      {a.changedByName ?? "—"} · {formatDate(a.date)} {formatClock(a.changedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StudentCorrectionsPage;
