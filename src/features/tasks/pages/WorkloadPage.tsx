import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TasksPageShell } from "../components";
import { ProgressBar } from "../components/ProgressBar";
import { useTaskWorkload } from "../hooks/useTasks";

const WorkloadPage = () => {
  const { data: rows = [], isLoading } = useTaskWorkload();
  const chart = rows.slice(0, 12).map((r) => ({
    name: r.name.split(" ")[0],
    Assigned: r.assigned,
    Completed: r.completed,
    Overdue: r.overdue,
  }));

  return (
    <TasksPageShell title="Team Workload" description="Spot overloaded staff and track productivity.">
      <div className="glass-card p-4">
        <p className="mb-3 text-sm font-semibold">Workload by Staff</p>
        {chart.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {isLoading ? "Loading…" : "No assigned tasks yet."}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Assigned" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Assigned</TableHead>
              <TableHead className="text-center">In Progress</TableHead>
              <TableHead className="text-center">Completed</TableHead>
              <TableHead className="text-center">Overdue</TableHead>
              <TableHead className="w-40">Productivity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.profileId} className={cn(r.overdue > 2 && "bg-red-500/5")}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs capitalize text-muted-foreground">{r.role}</TableCell>
                <TableCell className="text-center">{r.assigned}</TableCell>
                <TableCell className="text-center">{r.inProgress}</TableCell>
                <TableCell className="text-center text-green-500">{r.completed}</TableCell>
                <TableCell className={cn("text-center", r.overdue > 0 && "text-red-500")}>{r.overdue}</TableCell>
                <TableCell><ProgressBar value={r.productivity} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No assigned tasks yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TasksPageShell>
  );
};

export default WorkloadPage;
