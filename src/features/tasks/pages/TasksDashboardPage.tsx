import { useMemo, useState } from "react";
import {
  ListTodo,
  UserCheck,
  Hourglass,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Flame,
  Percent,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { TasksPageShell, TaskKpiCard, TaskDetailDrawer, TaskCard } from "../components";
import { useTaskKpis, useTasks } from "../hooks/useTasks";
import { ALL_STATUSES, statusMeta, STATUS_HEX } from "../utils/taskConfig";

const TasksDashboardPage = () => {
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const viewAll = canDo("tasks.view_all");
  const scope = viewAll ? {} : { mineProfileId: user?.profileId };

  const { data: kpis } = useTaskKpis(scope);
  const { data: list } = useTasks({ ...scope, pageSize: 100000, page: 1, sortBy: "due_date", sortDir: "asc" });
  const rows = useMemo(() => list?.rows ?? [], [list]);
  const [openId, setOpenId] = useState<string | null>(null);

  const dist = useMemo(
    () =>
      ALL_STATUSES.map((s) => ({
        status: s,
        label: statusMeta(s).label,
        count: rows.filter((t) => t.status === s).length,
      })).filter((d) => d.count > 0),
    [rows],
  );

  const dueSoon = useMemo(
    () => rows.filter((t) => !t.isOverdue && t.status !== "completed" && t.dueDate).slice(0, 6),
    [rows],
  );
  const overdue = useMemo(() => rows.filter((t) => t.isOverdue).slice(0, 6), [rows]);

  const k = kpis ?? {
    total: 0, assigned: 0, pending: 0, inProgress: 0, underReview: 0,
    completed: 0, overdue: 0, dueToday: 0, highPriority: 0, completionRate: 0,
  };

  return (
    <TasksPageShell
      title="Task Dashboard"
      description={viewAll ? "Organisation-wide task health and workload." : "Your personal task overview."}
    >
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <TaskKpiCard label="Total Tasks" value={k.total} icon={ListTodo} tone="accent" />
        <TaskKpiCard label="Assigned" value={k.assigned} icon={UserCheck} />
        <TaskKpiCard label="Pending" value={k.pending} icon={Hourglass} tone="warning" />
        <TaskKpiCard label="In Progress" value={k.inProgress} icon={Loader2} />
        <TaskKpiCard label="Under Review" value={k.underReview} icon={Hourglass} />
        <TaskKpiCard label="Completed" value={k.completed} icon={CheckCircle2} tone="success" />
        <TaskKpiCard label="Overdue" value={k.overdue} icon={AlertTriangle} tone="danger" />
        <TaskKpiCard label="Due Today" value={k.dueToday} icon={CalendarDays} tone="warning" />
        <TaskKpiCard label="High Priority" value={k.highPriority} icon={Flame} tone="danger" />
        <TaskKpiCard label="Completion" value={k.completionRate} suffix="%" icon={Percent} tone="success" />
      </div>

      {/* Chart + lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-4">
          <p className="mb-3 text-sm font-semibold">Status Distribution</p>
          {dist.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dist}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dist.map((d) => (
                    <Cell key={d.status} fill={STATUS_HEX[d.status]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-500">
              <AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})
            </p>
            <div className="grid gap-2">
              {overdue.map((t) => <TaskCard key={t.id} task={t} compact onClick={() => setOpenId(t.id)} />)}
              {overdue.length === 0 && <p className="text-xs text-muted-foreground">Nothing overdue. 🎉</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-amber-500" /> Upcoming
            </p>
            <div className="grid gap-2">
              {dueSoon.map((t) => <TaskCard key={t.id} task={t} compact onClick={() => setOpenId(t.id)} />)}
              {dueSoon.length === 0 && <p className="text-xs text-muted-foreground">No upcoming deadlines.</p>}
            </div>
          </div>
        </div>
      </div>

      <TaskDetailDrawer taskId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </TasksPageShell>
  );
};

export default TasksDashboardPage;
