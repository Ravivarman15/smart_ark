import { useMemo, useState } from "react";
import {
  Users,
  CalendarDays,
  Hourglass,
  AlertTriangle,
  GraduationCap,
  Trophy,
  Percent,
  Timer,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeads } from "../hooks/useLeads";
import { useCounselorDashboard } from "../hooks/useLeadDashboards";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { LeadKpiCard, LeadsTable, AddLeadDialog, LeadDetailDrawer } from "../components";
import type { LeadStatus } from "../types/lead.types";

/**
 * Counselor workspace — "My Leads". Counselors see only their own leads (RLS
 * enforces this server-side; the dashboard hook scopes by profileId). Managers
 * who land here see their own assigned subset; the org view lives on the
 * Management dashboard.
 */
const LeadsWorkspacePage = () => {
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const counselorId = user?.profileId;
  // Reassign-capable users (admin/management) see every lead, so scope both the
  // KPI cards and the table org-wide; everyone else sees only their own queue.
  const seesAll = canDo("lead.reassign");
  const scope = seesAll ? "all" : counselorId;

  const { data: dash } = useCounselorDashboard(scope);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const { data: list } = useLeads({
    assignedTo: seesAll ? "all" : counselorId,
    status,
    search: search || undefined,
    pageSize: 200,
  });
  const { data: staff = [] } = useStaffOptions();
  const staffName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? "Assigned" : "—");
  }, [staff]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const d = dash ?? {
    totalLeads: 0, todayLeads: 0, pendingFollowups: 0, overdueLeads: 0, demosScheduled: 0,
    admissions: 0, conversionRate: 0, avgResponseMinutes: 0, slaCompliance: 100,
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{seesAll ? "All Leads" : "My Leads"}</h1>
          <p className="text-sm text-muted-foreground">
            {seesAll
              ? "Every lead across counselors — follow-ups and conversions."
              : "Your assigned leads, follow-ups and conversions."}
          </p>
        </div>
        <ActionGuard action="lead.create">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Lead
          </Button>
        </ActionGuard>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <LeadKpiCard label="Total Leads" value={d.totalLeads} icon={Users} tone="accent" />
        <LeadKpiCard label="Today's Leads" value={d.todayLeads} icon={CalendarDays} />
        <LeadKpiCard label="Pending Follow-ups" value={d.pendingFollowups} icon={Hourglass} tone="warning" />
        <LeadKpiCard label="Overdue" value={d.overdueLeads} icon={AlertTriangle} tone="danger" />
        <LeadKpiCard label="Demos Scheduled" value={d.demosScheduled} icon={GraduationCap} />
        <LeadKpiCard label="Admissions" value={d.admissions} icon={Trophy} tone="success" />
        <LeadKpiCard label="Conversion" value={d.conversionRate} suffix="%" icon={Percent} tone="success" />
        <LeadKpiCard label="Avg Response" value={d.avgResponseMinutes} suffix="m" icon={Timer} />
        <LeadKpiCard label="SLA Compliance" value={d.slaCompliance} suffix="%" icon={ShieldCheck} tone={d.slaCompliance >= 80 ? "success" : "warning"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name / phone / email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}
        >
          <option value="all">All stages</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="followup">Follow-up</option>
          <option value="demo_scheduled">Demo Scheduled</option>
          <option value="demo_attended">Demo Attended</option>
          <option value="admission">Admission</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <LeadsTable leads={list?.rows ?? []} staffName={staffName} onOpen={setOpenId} />

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      <LeadDetailDrawer leadId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  );
};

export default LeadsWorkspacePage;
