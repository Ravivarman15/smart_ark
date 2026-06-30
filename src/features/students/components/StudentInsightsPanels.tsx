import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/features/fee";
import type {
  FeeDetail,
  ReceiptRow,
  StudentInsights,
} from "../hooks/useStudentInsights";

const Tile = ({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) => (
  <div className="rounded-lg border border-border/50 px-3 py-2 text-center">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-base font-semibold mt-0.5 ${tone}`}>{value}</p>
  </div>
);

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="glass-card p-4">
    <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {title}
    </h3>
    {children}
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground text-center py-6">{children}</p>
);

const percentTone = (p: number) =>
  p >= 75 ? "text-emerald-600" : p >= 40 ? "text-amber-600" : "text-red-600";

const barColor = (p: number) =>
  p >= 75 ? "hsl(142 71% 45%)" : p >= 40 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";

const ATT_COLORS = ["hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(38 92% 50%)"];

// ── Performance ───────────────────────────────────────────────────────────────
export const StudentPerformancePanel = ({
  insights,
  loading,
}: {
  insights?: StudentInsights;
  loading: boolean;
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading performance…
      </div>
    );
  }
  const exams = insights?.exams ?? [];
  const scored = exams.filter((e) => e.percent !== null);
  const subjects = insights?.subjects ?? [];
  const att = insights?.attendance;

  const trend = scored.map((e, i) => ({
    name: e.date?.slice(5) || `#${i + 1}`,
    percent: e.percent as number,
    subject: e.subject,
  }));

  const attData = att
    ? [
        { name: "Present", value: att.present },
        { name: "Absent", value: att.absent },
        { name: "Late", value: att.late },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Overall"
          value={insights?.overallPercent !== null && insights?.overallPercent !== undefined ? `${insights.overallPercent}%` : "—"}
          tone={insights?.overallPercent != null ? percentTone(insights.overallPercent) : ""}
        />
        <Tile label="Exams" value={scored.length || "—"} />
        <Tile
          label="Attendance"
          value={att ? `${att.percent}%` : "—"}
          tone={att ? percentTone(att.percent) : ""}
        />
      </div>

      {/* Strong / weak */}
      {subjects.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 mb-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> Strong
            </p>
            {(insights?.strong ?? []).map((s) => (
              <div key={s.subject} className="flex justify-between text-sm">
                <span className="text-foreground truncate">{s.subject}</span>
                <span className="font-medium text-emerald-600">{s.avgPercent}%</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-1.5">
              <ArrowDownRight className="w-3.5 h-3.5" /> Needs focus
            </p>
            {(insights?.weak ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Not enough subjects yet</p>
            ) : (
              (insights?.weak ?? []).map((s) => (
                <div key={s.subject} className="flex justify-between text-sm">
                  <span className="text-foreground truncate">{s.subject}</span>
                  <span className="font-medium text-red-600">{s.avgPercent}%</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Marks trend */}
      <Block title="Marks Trend (%)">
        {trend.length === 0 ? (
          <Empty>No exam results recorded yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, _n, p) => [`${v}%`, (p?.payload as { subject?: string })?.subject ?? "Score"]}
              />
              <Line
                type="monotone"
                dataKey="percent"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Block>

      {/* Subject performance */}
      <Block title="Subject Performance (avg %)">
        {subjects.length === 0 ? (
          <Empty>No subject scores yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(140, subjects.length * 34)}>
            <BarChart
              data={subjects}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                type="category"
                dataKey="subject"
                width={84}
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v}%`, "Average"]}
              />
              <Bar dataKey="avgPercent" radius={[0, 4, 4, 0]}>
                {subjects.map((s) => (
                  <Cell key={s.subject} fill={barColor(s.avgPercent)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Block>

      {/* Attendance donut */}
      <Block title="Attendance Breakdown">
        {!att || att.total === 0 ? (
          <Empty>No attendance recorded yet.</Empty>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={150}>
              <PieChart>
                <Pie
                  data={attData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={60}
                  paddingAngle={2}
                >
                  {attData.map((d, i) => (
                    <Cell key={d.name} fill={ATT_COLORS[i % ATT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-emerald-600">● Present</span>
                <span className="font-medium">{att.present}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">● Absent</span>
                <span className="font-medium">{att.absent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-600">● Late</span>
                <span className="font-medium">{att.late}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-1 mt-1">
                <span className="text-muted-foreground">Total days</span>
                <span className="font-semibold">{att.total}</span>
              </div>
            </div>
          </div>
        )}
      </Block>
    </div>
  );
};

// ── Fees + receipts ─────────────────────────────────────────────────────────
export const StudentFeesPanel = ({
  fee,
  loading,
  onView,
}: {
  fee?: FeeDetail;
  loading: boolean;
  onView: (r: ReceiptRow) => void;
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading fees…
      </div>
    );
  }
  if (!fee) {
    return (
      <div className="glass-card p-6 text-center text-sm text-muted-foreground">
        No fee record for this student yet. Assign a fee structure from{" "}
        <span className="font-medium text-foreground">Fee Structures → Assign</span> to start
        collecting.
      </div>
    );
  }

  const paidPct = fee.total > 0 ? Math.round((fee.received / fee.total) * 100) : 0;
  const statusTone =
    fee.pending <= 0
      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
      : fee.received > 0
        ? "text-amber-600 bg-amber-500/10 border-amber-500/30"
        : "text-red-600 bg-red-500/10 border-red-500/30";

  return (
    <div className="space-y-4">
      <Block title="Fee Ledger">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Tile label="Total Fee" value={formatINR(fee.total)} />
          <Tile label="Discount" value={formatINR(fee.discount)} />
          <Tile label="Received" value={formatINR(fee.received)} tone="text-emerald-600" />
          <Tile
            label="Pending"
            value={formatINR(fee.pending)}
            tone={fee.pending > 0 ? "text-red-600" : "text-emerald-600"}
          />
        </div>
        {/* progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Collected</span>
            <span className="font-medium">{paidPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, paidPct)}%` }}
            />
          </div>
          <div className="flex justify-end">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusTone}`}>
              {fee.pending <= 0 ? "Paid" : fee.received > 0 ? "Partial" : "Pending"}
            </span>
          </div>
        </div>
      </Block>

      <Block title={`Payment Receipts (${fee.receipts.length})`}>
        {fee.receipts.length === 0 ? (
          <Empty>No payments collected yet.</Empty>
        ) : (
          <div className="space-y-2">
            {fee.receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{formatINR(r.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.date} · {r.method}
                    {r.receiptNo ? ` · ${r.receiptNo}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => onView(r)}
                >
                  <Receipt className="w-3 h-3" /> View
                </Button>
              </div>
            ))}
          </div>
        )}
      </Block>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <TrendingUp className="w-3.5 h-3.5" /> Collect new payments from the Fees Management page.
      </p>
    </div>
  );
};
