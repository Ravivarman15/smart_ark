import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { TasksPageShell, KanbanBoard, TaskDetailDrawer } from "../components";
import { useTasks } from "../hooks/useTasks";

const TaskBoardPage = () => {
  const { user } = useAuth();
  const { canDo } = useCanDo();
  const viewAll = canDo("tasks.view_all");
  const scope = viewAll ? {} : { mineProfileId: user?.profileId };
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useTasks({ ...scope, pageSize: 100000, page: 1 });

  return (
    <TasksPageShell
      title="Kanban Board"
      description="Drag tasks between columns to update their status."
    >
      <KanbanBoard tasks={data?.rows ?? []} onOpen={setOpenId} />
      <TaskDetailDrawer taskId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
    </TasksPageShell>
  );
};

export default TaskBoardPage;
