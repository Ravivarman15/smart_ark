import { Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttendancePageShell, EmptyState, WorkHoursCard } from "../components";
import { useMarker } from "../hooks/useMarker";
import { useStaffCheckIn, useStaffCheckOut, useStaffMemberDay } from "../hooks/useStaffAttendance";
import { formatClock, today } from "../utils/dates";

const StaffCheckInOutPage = () => {
  const marker = useMarker();
  const staffId = marker?.profileId;
  const date = today();

  const { data: record } = useStaffMemberDay(staffId, date);
  const checkIn = useStaffCheckIn();
  const checkOut = useStaffCheckOut();

  const hasCheckedIn = !!record?.inTime;
  const hasCheckedOut = !!record?.outTime;

  return (
    <AttendancePageShell
      title="Check In / Check Out"
      description="Record your work day. Hours are calculated automatically when you check out."
      icon={<Clock className="w-5 h-5" />}
    >
      {!staffId ? (
        <div className="glass-card">
          <EmptyState icon={<Clock className="w-5 h-5" />} title="Sign in required" description="We couldn't identify your staff profile." />
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <div className="glass-card p-5 text-center space-y-4">
            <div className="flex items-center justify-center gap-8 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Check in</p>
                <p className="text-xl font-display font-bold mt-1">{formatClock(record?.inTime) || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Check out</p>
                <p className="text-xl font-display font-bold mt-1">{formatClock(record?.outTime) || "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => checkIn.mutate({ staffId, date })}
                disabled={hasCheckedIn || checkIn.isPending}
              >
                <LogIn className="w-4 h-4 mr-2" /> Check In
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => checkOut.mutate({ staffId, date })}
                disabled={!hasCheckedIn || hasCheckedOut || checkOut.isPending}
              >
                <LogOut className="w-4 h-4 mr-2" /> Check Out
              </Button>
            </div>
          </div>

          <WorkHoursCard record={record} />
        </div>
      )}
    </AttendancePageShell>
  );
};

export default StaffCheckInOutPage;
