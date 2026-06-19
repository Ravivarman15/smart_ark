import { useMemo, useState } from "react";
import {
  Users,
  CalendarDays,
  Trophy,
  IndianRupee,
  Hourglass,
  AlertTriangle,
  UserX,
  Flame,
  ShieldAlert,
  Percent,
} from "lucide-react";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { useManagementDashboard } from "../hooks/useLeadDashboards";
import { useLeads } from "../hooks/useLeads";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { LeadKpiCard, LeadsTable, LeadDetailDrawer, LeaderboardCard } from "../components";
import {
  exportCounselorReportCsv,
  exportCounselorReportXlsx,
  exportCounselorReportPdf,
} from "../utils/leadExport";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/** Management dashboard — org-wide lead health + revenue. */
const ManagementLeadsPage = () => {
  const { data: dash } = useManagementDashboard();
  const { data: list } = useLeads({ assignedTo: "all", pageSize: 200 });
  const { data: leaderboard } = useLeaderboard();
  const { data: staff = [] } = useStaffOptions();
  const staffName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? "Assigned" : "—");
  }, [staff]);
  const [openId, setOpenId] = useState<string | null>(null);

  const d = dash ?? {
    totalLeads: 0, todayLeads: 0, admissions: 0, revenue: 0, pendingFollowups: 0,
    overdueLeads: 0, unassignedLeads: 0, highValueLeads: 0, slaViolations: 0, conversionRate: 0,
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Lead Management</h1>
        <p className="text-sm text-muted-foreground">Organisation-wide lead funnel, SLA health and revenue.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <LeadKpiCard label="Total Leads" value={d.totalLeads} icon={Users} tone="accent" />
        <LeadKpiCard label="Today's Leads" value={d.todayLeads} icon={CalendarDays} />
        <LeadKpiCard label="Admissions" value={d.admissions} icon={Trophy} tone="success" />
        <LeadKpiCard label="Revenue" value={inr(d.revenue)} icon={IndianRupee} tone="success" />
        <LeadKpiCard label="Conversion" value={d.conversionRate} suffix="%" icon={Percent} tone="success" />
        <LeadKpiCard label="Pending Follow-ups" value={d.pendingFollowups} icon={Hourglass} tone="warning" />
        <LeadKpiCard label="Overdue" value={d.overdueLeads} icon={AlertTriangle} tone="danger" />
        <LeadKpiCard label="Unassigned" value={d.unassignedLeads} icon={UserX} tone="warning" />
        <LeadKpiCard label="High-Value" value={d.highValueLeads} icon={Flame} tone="danger" />
        <LeadKpiCard label="SLA Violations" value={d.slaViolations} icon={ShieldAlert} tone="danger" />
      </div>

      {/* Counselor leaderboard + fastest-response engine */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h2 className="text-sm font-semibold">Counselor Leaderboard — this month</h2>
        <ActionGuard action="lead.export">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exportCounselorReportCsv(leaderboard?.rows ?? [])}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportCounselorReportXlsx(leaderboard?.rows ?? [])}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportCounselorReportPdf(leaderboard?.rows ?? [])}>
              <FileText className="mr-1 h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        </ActionGuard>
      </div>
      <LeaderboardCard />

      <h2 className="pt-2 text-sm font-semibold">Recent leads</h2>
      <LeadsTable leads={list?.rows ?? []} staffName={staffName} onOpen={setOpenId} />

      <LeadDetailDrawer leadId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
};

export default ManagementLeadsPage;
