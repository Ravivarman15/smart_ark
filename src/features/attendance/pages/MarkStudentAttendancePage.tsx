import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { AttendancePageShell, AttendanceFilters, EmptyState, StudentMarkingPanel } from "../components";
import { today } from "../utils/dates";

const MarkStudentAttendancePage = () => {
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(today());

  return (
    <AttendancePageShell
      title="Mark Student Attendance"
      description="Filter to a batch, then mark the day's attendance. Teachers change only the exceptions."
      icon={<CalendarCheck className="w-5 h-5" />}
      toolbar={
        <AttendanceFilters
          batchId={batchId}
          onBatchChange={setBatchId}
          date={date}
          onDateChange={setDate}
        />
      }
    >
      {!batchId ? (
        <div className="glass-card">
          <EmptyState
            icon={<CalendarCheck className="w-5 h-5" />}
            title="Select a batch"
            description="Choose Academic Year, Course Type, Standard and Batch above to load the roster."
          />
        </div>
      ) : (
        <StudentMarkingPanel batchId={batchId} date={date} source="manual" />
      )}
    </AttendancePageShell>
  );
};

export default MarkStudentAttendancePage;
