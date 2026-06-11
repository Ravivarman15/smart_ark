import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ListTodo, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { TaskFormDrawer } from "./TaskFormDrawer";

interface Tab {
  label: string;
  to: string;
  action?: string;
}

export const TasksPageShell = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => {
  const { pathname } = useLocation();
  const { canDo } = useCanDo();
  const base = `${pathname.split("/tasks")[0]}/tasks`;
  const [createOpen, setCreateOpen] = useState(false);

  const tabs: Tab[] = [
    { label: "Dashboard", to: `${base}/dashboard` },
    { label: "My Tasks", to: `${base}/my` },
    { label: "Team Tasks", to: `${base}/team`, action: "tasks.view_all" },
    { label: "Board", to: `${base}/board` },
    { label: "Workload", to: `${base}/workload`, action: "tasks.view_all" },
  ].filter((t) => canDo(t.action));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
            <ListTodo className="h-6 w-6 text-accent" />
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {canDo("tasks.create") && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/60">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                "rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-b-2 border-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      {children}

      <TaskFormDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};
