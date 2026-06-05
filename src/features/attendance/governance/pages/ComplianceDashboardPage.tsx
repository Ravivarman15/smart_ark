import { ShieldCheck, Loader2 } from "lucide-react";
import { AttendancePageShell, StatTile } from "../../components";
import { useComplianceSnapshot } from "../hooks";

const ComplianceDashboardPage = () => {
  const { data, isLoading } = useComplianceSnapshot();

  return (
    <AttendancePageShell
      title="Compliance Dashboard"
      description="At-a-glance attendance governance health — defaulters, staff below target, unapproved corrections and open governance tasks (current month, live data)."
      icon={<ShieldCheck className="w-5 h-5" />}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-display font-semibold mb-2">Attendance risk</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Students below 75%" value={data?.studentsBelow75 ?? 0} tone={data && data.studentsBelow75 > 0 ? "warning" : "positive"} />
              <StatTile label="Students below 50%" value={data?.studentsBelow50 ?? 0} tone={data && data.studentsBelow50 > 0 ? "danger" : "positive"} />
              <StatTile label="Staff below target" value={data?.staffBelowTarget ?? 0} tone={data && data.staffBelowTarget > 0 ? "warning" : "positive"} />
              <StatTile label="Open alerts" value={data?.openAlerts ?? 0} tone={data && data.openAlerts > 0 ? "warning" : "neutral"} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-display font-semibold mb-2">Governance tasks</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Unapproved corrections" value={data?.unapprovedCorrections ?? 0} tone={data && data.unapprovedCorrections > 0 ? "warning" : "neutral"} />
              <StatTile label="Pending approvals" value={data?.pendingApprovals ?? 0} tone={data && data.pendingApprovals > 0 ? "warning" : "neutral"} />
              <StatTile label="Pending reopen requests" value={data?.pendingReopens ?? 0} tone={data && data.pendingReopens > 0 ? "warning" : "neutral"} />
              <StatTile label="Open governance tasks" value={data?.openGovernanceTasks ?? 0} tone={data && data.openGovernanceTasks > 0 ? "accent" : "positive"} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-display font-semibold mb-2">Locking integrity</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Months closed" value={data?.monthsClosed ?? 0} tone="accent" />
              <StatTile label="Active locks" value={data?.activeLocks ?? 0} tone="accent" />
            </div>
          </div>
        </div>
      )}
    </AttendancePageShell>
  );
};

export default ComplianceDashboardPage;
