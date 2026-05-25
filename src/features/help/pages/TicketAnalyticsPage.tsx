import {
  BarChart3,
  CheckCircle2,
  Clock,
  Inbox,
  Smile,
  Star,
  ThumbsDown,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { HelpKpiRow, HelpPageShell } from "../components";
import { useHelpAnalytics } from "../hooks";
import { formatDuration, PRIORITY_LABEL, STATUS_LABEL } from "../utils/helpCalc";
import type { HelpKpi } from "../components/HelpKpiRow";

export const TicketAnalyticsPage = () => {
  const analytics = useHelpAnalytics();
  const a = analytics.data;

  const kpis: HelpKpi[] = a
    ? [
        {
          label: "Total tickets",
          value: a.totalTickets,
          icon: <Inbox className="w-5 h-5" />,
          tone: "info",
        },
        {
          label: "Open right now",
          value: a.open + a.inProgress + a.waitingUser,
          hint: `${a.open} open · ${a.inProgress} in progress · ${a.waitingUser} waiting`,
          icon: <TrendingUp className="w-5 h-5" />,
          tone: "warning",
        },
        {
          label: "Avg first response",
          value: formatDuration(a.avgFirstResponseMinutes),
          hint: `${a.slaBreachedFirstResponse} breached`,
          icon: <Clock className="w-5 h-5" />,
          tone: a.slaBreachedFirstResponse > 0 ? "negative" : "positive",
        },
        {
          label: "Avg resolution",
          value: formatDuration(a.avgResolutionMinutes),
          hint: `${a.slaBreachedResolution} breached`,
          icon: <CheckCircle2 className="w-5 h-5" />,
          tone: a.slaBreachedResolution > 0 ? "negative" : "positive",
        },
      ]
    : [];

  const satisfactionTone =
    !a || a.satisfactionAverage >= 4
      ? "positive"
      : a.satisfactionAverage >= 3
      ? "info"
      : "negative";
  const npsTone =
    !a || a.npsScore >= 30 ? "positive" : a.npsScore >= 0 ? "info" : "negative";

  const csat: HelpKpi[] = a
    ? [
        {
          label: "CSAT (avg ⭐)",
          value: a.satisfactionAverage.toFixed(1),
          hint: `${a.satisfactionCount} responses`,
          icon: <Star className="w-5 h-5" />,
          tone: satisfactionTone,
        },
        {
          label: "NPS score",
          value: a.npsScore,
          hint: `${a.npsResponses} responses`,
          icon: <Smile className="w-5 h-5" />,
          tone: npsTone,
        },
        {
          label: "Reopens",
          value: a.byPriority.reduce((s, p) => s + p.total, 0) === 0 ? 0 : a.resolved,
          hint: `Resolved tickets`,
          icon: <ThumbsDown className="w-5 h-5" />,
          tone: "default",
        },
        {
          label: "Feedback received",
          value: a.feedbackByKind.reduce((s, f) => s + f.total, 0),
          hint: a.feedbackByKind
            .slice(0, 2)
            .map((f) => `${f.kind} ${f.total}`)
            .join(" · "),
          icon: <BarChart3 className="w-5 h-5" />,
          tone: "info",
        },
      ]
    : [];

  return (
    <HelpPageShell
      title="Ticket analytics"
      description="SLA performance, satisfaction, NPS and module-level health."
      icon={<BarChart3 className="w-5 h-5" />}
    >
      {analytics.isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading…</Card>
      ) : !a ? (
        <Card className="p-10 text-center text-muted-foreground">
          No data yet.
        </Card>
      ) : (
        <div className="space-y-6">
          <HelpKpiRow items={kpis} />
          <HelpKpiRow items={csat} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Tickets by status</h3>
              <ul className="text-sm space-y-1">
                {(
                  [
                    ["open", a.open],
                    ["in_progress", a.inProgress],
                    ["waiting_user", a.waitingUser],
                    ["resolved", a.resolved],
                    ["closed", a.closed],
                    ["cancelled", a.cancelled],
                  ] as const
                ).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between border-b py-1">
                    <span>{STATUS_LABEL[k]}</span>
                    <span className="font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">By priority</h3>
              <ul className="text-sm space-y-1">
                {a.byPriority.map((p) => (
                  <li
                    key={p.priority}
                    className="flex items-center justify-between border-b py-1"
                  >
                    <span>{PRIORITY_LABEL[p.priority]}</span>
                    <span className="font-medium">{p.total}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Top categories</h3>
              <ul className="text-sm space-y-1">
                {a.byCategory.slice(0, 8).map((c) => (
                  <li
                    key={c.category}
                    className="flex items-center justify-between border-b py-1"
                  >
                    <span className="capitalize">{c.category.replace(/_/g, " ")}</span>
                    <span className="font-medium">
                      {c.resolved}/{c.total}
                    </span>
                  </li>
                ))}
                {a.byCategory.length === 0 && (
                  <li className="text-muted-foreground italic">No data yet</li>
                )}
              </ul>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Top assignees</h3>
              <ul className="text-sm space-y-1">
                {a.byAssignee.map((x) => (
                  <li
                    key={x.assignee}
                    className="flex items-center justify-between border-b py-1"
                  >
                    <span>{x.assignee}</span>
                    <span className="font-medium">
                      {x.resolved}/{x.total}
                    </span>
                  </li>
                ))}
                {a.byAssignee.length === 0 && (
                  <li className="text-muted-foreground italic">No data yet</li>
                )}
              </ul>
            </Card>

            <Card className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-3">Last 14 days</h3>
              <div className="flex items-end gap-1 h-32">
                {a.byDay.slice(-14).map((d) => {
                  const max = Math.max(...a.byDay.map((x) => x.total), 1);
                  const h = Math.round((d.total / max) * 100);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-sky-500"
                        style={{ height: `${h}%`, minHeight: "2px" }}
                        title={`${d.date}: ${d.total}`}
                      />
                      <div className="text-[10px] text-muted-foreground">
                        {d.date.slice(5)}
                      </div>
                    </div>
                  );
                })}
                {a.byDay.length === 0 && (
                  <div className="text-sm text-muted-foreground">No data yet</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </HelpPageShell>
  );
};

export default TicketAnalyticsPage;
