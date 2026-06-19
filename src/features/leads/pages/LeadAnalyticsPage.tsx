import { useCallback, useMemo } from "react";
import { Download } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { useLeads } from "../hooks/useLeads";
import { useAdmissions } from "../hooks/useDemosAdmissions";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { exportLeadsXlsx } from "../utils/leadExport";

const PALETTE = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];
const monthKey = (iso: string) => new Date(iso).toISOString().slice(0, 7);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="glass-card p-4">
    <p className="mb-3 text-sm font-semibold">{title}</p>
    {children}
  </div>
);

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

const LeadAnalyticsPage = () => {
  const { data: list } = useLeads({ assignedTo: "all", pageSize: 1000 });
  const { data: admissions = [] } = useAdmissions();
  const { data: staff = [] } = useStaffOptions();
  const leads = useMemo(() => list?.rows ?? [], [list]);

  const staffName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? "Assigned" : "Unassigned");
  }, [staff]);

  const by = useCallback(
    (key: (l: (typeof leads)[number]) => string) => {
      const m = new Map<string, number>();
      for (const l of leads) {
        const k = key(l) || "—";
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].map(([name, value]) => ({ name, value }));
    },
    [leads],
  );

  const bySource = useMemo(() => by((l) => l.source.replace("_", " ")), [by]);
  const byCourse = useMemo(() => by((l) => l.course ?? "Unspecified"), [by]);
  const byCategory = useMemo(() => by((l) => l.scoreCategory), [by]);

  const leadsByMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(monthKey(l.createdAt), (m.get(monthKey(l.createdAt)) ?? 0) + 1);
    return [...m.entries()].sort().map(([month, count]) => ({ month, count }));
  }, [leads]);

  const admissionsByMonth = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    for (const a of admissions) {
      const k = monthKey(a.admissionDate);
      const cur = m.get(k) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += a.feeAmount;
      m.set(k, cur);
    }
    return [...m.entries()].sort().map(([month, v]) => ({ month, ...v }));
  }, [admissions]);

  const counselorPerf = useMemo(() => {
    const m = new Map<string, { leads: number; admissions: number }>();
    for (const l of leads) {
      const k = staffName(l.assignedTo);
      const cur = m.get(k) ?? { leads: 0, admissions: 0 };
      cur.leads += 1;
      if (l.status === "admission") cur.admissions += 1;
      m.set(k, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).slice(0, 10);
  }, [leads, staffName]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Lead Analytics</h1>
          <p className="text-sm text-muted-foreground">Funnel, source, course and counselor performance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
          <ActionGuard action="lead.export">
            <Button variant="outline" onClick={() => exportLeadsXlsx(leads, staffName)}>
              <Download className="mr-1 h-4 w-4" /> Export Excel
            </Button>
          </ActionGuard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads by Month">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={leadsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Admissions & Revenue by Month">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={admissionsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="count" name="Admissions" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads by Source">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={bySource} dataKey="value" nameKey="name" outerRadius={90} label>
                {bySource.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads by Course">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCourse} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead Score Distribution">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {byCategory.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Counselor Performance">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={counselorPerf}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="leads" name="Leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="admissions" name="Admissions" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default LeadAnalyticsPage;
