import { useState } from "react";
import { TasksPageShell, TaskFilterBar, TaskListTable, TaskDetailDrawer } from "../components";
import { useTasks } from "../hooks/useTasks";
import type { TaskFilters as Filters } from "../types/tasks.types";

const TeamTasksPage = () => {
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    pageSize: 20,
    sortBy: "created_at",
    sortDir: "desc",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useTasks(filters);

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <TasksPageShell title="Team Tasks" description="All tasks across the team — search, filter, and manage in bulk.">
      <TaskFilterBar filters={filters} onChange={patch} />
      {data?.degraded && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          Showing tasks in compatibility mode — run the Tasks migration to unlock priority, status workflow and more.
        </p>
      )}
      <TaskListTable
        rows={data?.rows ?? []}
        total={data?.total ?? 0}
        page={filters.page ?? 1}
        pageSize={filters.pageSize ?? 20}
        onPage={(p) => patch({ page: p })}
        onOpen={setOpenId}
      />
      <TaskDetailDrawer taskId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </TasksPageShell>
  );
};

export default TeamTasksPage;
