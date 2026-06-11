import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { TasksPageShell, TaskListTable, TaskDetailDrawer } from "../components";
import { useTasks } from "../hooks/useTasks";
import type { TaskFilters } from "../types/tasks.types";

type Quick = "all" | "today" | "overdue" | "in_progress" | "completed";

const CHIPS: { key: Quick; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Due Today" },
  { key: "overdue", label: "Overdue" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

const MyTasksPage = () => {
  const { user } = useAuth();
  const [quick, setQuick] = useState<Quick>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const pageSize = 20;

  const filters: TaskFilters = {
    mineProfileId: user?.profileId,
    page,
    pageSize,
    sortBy: "due_date",
    sortDir: "asc",
    ...(quick === "today" ? { dueToday: true } : {}),
    ...(quick === "overdue" ? { overdueOnly: true } : {}),
    ...(quick === "in_progress" ? { status: "in_progress" as const } : {}),
    ...(quick === "completed" ? { status: "completed" as const } : {}),
  };

  const { data } = useTasks(filters);

  return (
    <TasksPageShell title="My Tasks" description="Tasks assigned to you.">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => { setQuick(c.key); setPage(1); }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              quick === c.key
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-muted/20 text-muted-foreground hover:border-accent/40",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <TaskListTable
        rows={data?.rows ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPage={setPage}
        onOpen={setOpenId}
        canBulk={false}
      />

      <TaskDetailDrawer taskId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </TasksPageShell>
  );
};

export default MyTasksPage;
