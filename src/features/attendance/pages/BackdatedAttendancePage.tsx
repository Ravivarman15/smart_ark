import { useState } from "react";
import { History, Info } from "lucide-react";
import { AttendancePageShell, AttendanceFilters, EmptyState, StudentMarkingPanel } from "../components";
import { daysAgo } from "../utils/dates";

const BackdatedAttendancePage = () => {
  const [batchId, setBatchId] = useState("");
  // Default to yesterday — this page exists for historical / migration entry.
  const [date, setDate] = useState(daysAgo(1));

  return (
    <AttendancePageShell
      title="Backdated Attendance"
      description="Enter historical attendance for past dates — used to migrate records off Google Sheets."
      icon={<History className="w-5 h-5" />}
      toolbar={
        <AttendanceFilters
          batchId={batchId}
          onBatchChange={setBatchId}
          date={date}
          onDateChange={setDate}
        />
      }
    >
      <div className="mb-3 flex items-start gap-2 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 px-3 py-2 text-xs">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Records saved here are stamped with the chosen date and your identity for the audit trail.
          For large historical loads, use the bulk import (coming next).
        </span>
      </div>
      {!batchId ? (
        <div className="glass-card">
          <EmptyState
            icon={<History className="w-5 h-5" />}
            title="Select a batch and a past date"
            description="Pick the batch and the historical date, then mark the roster."
          />
        </div>
      ) : (
        <StudentMarkingPanel batchId={batchId} date={date} source="manual" />
      )}
    </AttendancePageShell>
  );
};

export default BackdatedAttendancePage;
