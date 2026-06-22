import { useMemo, useState } from "react";
import {
  Send,
  CheckCheck,
  Eye,
  Clock,
  XCircle,
  Download,
  Ban,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ActionGuard } from "@/features/rbac/components/ActionGuard";
import { useWhatsappDelivery } from "../hooks/useWhatsappDelivery";
import { useStaffOptions } from "../hooks/useStaffOptions";
import { LeadKpiCard } from "../components";
import {
  computeDelivery,
  filterLogs,
  type DeliveryFilters,
} from "../utils/whatsappDelivery";

const PALETTE = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="glass-card p-4">
    <p className="mb-3 text-sm font-semibold">{title}</p>
    {children}
  </div>
);

const Select = ({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) => (
  <label className="flex flex-col gap-1 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <select
      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </label>
);

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const toCsv = (rows: Array<Record<string, string | number>>): string => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

const download = (name: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/** WhatsApp Delivery Dashboard — queued→sent→delivered→read→failed health
 *  across the lead funnel, sliced by course / counselor / template / day. */
const LeadWhatsappDashboardPage = () => {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [filters, setFilters] = useState<DeliveryFilters>({});

  const { data: rows = [], isLoading } = useWhatsappDelivery({
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.999Z`,
  });
  const { data: staff = [] } = useStaffOptions();
  const counselorName = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown" : "Unassigned");
  }, [staff]);

  const filtered = useMemo(() => filterLogs(rows, filters), [rows, filters]);
  const a = useMemo(() => computeDelivery(filtered, counselorName), [filtered, counselorName]);

  // Filter option lists derived from the full (date-bounded) dataset.
  const courseOpts = useMemo(() => {
    const s = new Set(rows.map((r) => r.course ?? "Unspecified"));
    return [{ value: "", label: "All courses" }, ...[...s].map((c) => ({ value: c, label: c }))];
  }, [rows]);
  const counselorOpts = useMemo(() => {
    const s = new Set(rows.map((r) => r.counselorId ?? ""));
    return [{ value: "", label: "All counselors" },
      ...[...s].map((id) => ({ value: id, label: counselorName(id || null) }))];
  }, [rows, counselorName]);
  const templateOpts = useMemo(() => {
    const s = new Set(rows.map((r) => r.templateKey));
    return [{ value: "", label: "All templates" }, ...[...s].map((t) => ({ value: t, label: t }))];
  }, [rows]);
  const statusOpts = [
    { value: "", label: "All statuses" },
    { value: "queued", label: "Queued" },
    { value: "sent", label: "Sent" },
    { value: "delivered", label: "Delivered" },
    { value: "read", label: "Read" },
    { value: "failed", label: "Failed" },
    { value: "skipped", label: "Skipped" },
  ];

  const exportCsv = () => {
    const rowsOut = a.byCounselor.map((g) => ({
      Counselor: g.name, Total: g.total, Sent: g.sent,
      Delivered: g.delivered, Read: g.read, Failed: g.failed,
    }));
    download(`whatsapp-delivery_${from}_${to}.csv`, toCsv(rowsOut));
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">WhatsApp Delivery Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Lead funnel message health — queued, sent, delivered, read and failed.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <ActionGuard action="lead.export">
            <Button size="sm" variant="outline" onClick={exportCsv} className="mb-[1px]">
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </ActionGuard>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select label="Course" value={filters.course ?? ""} options={courseOpts}
          onChange={(v) => setFilters((f) => ({ ...f, course: v || undefined }))} />
        <Select label="Counselor" value={filters.counselorId ?? ""} options={counselorOpts}
          onChange={(v) => setFilters((f) => ({ ...f, counselorId: v || undefined }))} />
        <Select label="Template" value={filters.templateKey ?? ""} options={templateOpts}
          onChange={(v) => setFilters((f) => ({ ...f, templateKey: v || undefined }))} />
        <Select label="Status" value={filters.status ?? ""} options={statusOpts}
          onChange={(v) => setFilters((f) => ({ ...f, status: v || undefined }))} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <LeadKpiCard label="Queued" value={a.buckets.queued} icon={Clock} tone="warning" />
        <LeadKpiCard label="Sent" value={a.buckets.sent} icon={Send} tone="accent" />
        <LeadKpiCard label="Delivered" value={a.buckets.delivered} icon={CheckCheck} tone="success" />
        <LeadKpiCard label="Read" value={a.buckets.read} icon={Eye} tone="success" />
        <LeadKpiCard label="Failed" value={a.buckets.failed} icon={XCircle} tone="danger" />
        <LeadKpiCard label="Skipped" value={a.buckets.skipped} icon={Ban} tone="warning" />
      </div>

      {/* Why-not-sent — the single most useful panel when a template "won't send".
          A row here means the message never reached AiSensy (skipped) or AiSensy
          rejected it (failed). Empty = everything dispatched. */}
      {a.reasons.length > 0 && (
        <div className="glass-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Delivery blockers (why messages didn’t send)
          </p>
          <div className="space-y-1.5">
            {a.reasons.map((r) => (
              <div key={r.reason} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{r.reason}</span>
                  {r.sample && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">— {r.sample}</span>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <LeadKpiCard label="Delivery %" value={a.rates.deliveryPct} suffix="%" icon={CheckCheck} tone="success" />
        <LeadKpiCard label="Read %" value={a.rates.readPct} suffix="%" icon={Eye} tone="accent" />
        <LeadKpiCard label="Failure %" value={a.rates.failurePct} suffix="%" icon={XCircle} tone="danger" />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading delivery logs…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No WhatsApp activity in this window yet. Messages appear here once the funnel queues them.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Daily volume">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={a.byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="sent" name="Sent" stroke="#6366f1" strokeWidth={2} />
              <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="read" name="Read" stroke="#06b6d4" strokeWidth={2} />
              <Line type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By course">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={a.byCourse}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" stackId="s" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Failed" stackId="s" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By counselor">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={a.byCounselor.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="total" name="Total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="delivered" name="Delivered" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="By template">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={a.byTemplate} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                {a.byTemplate.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default LeadWhatsappDashboardPage;
