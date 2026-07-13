import React, { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, Clock, Calendar, CheckSquare, AlertTriangle } from "lucide-react";
import type { TeacherWorkspace } from "./useTeacherWorkspace";

// Tasks assigned to this teacher by admin/coordinator.

interface Props {
  ws: TeacherWorkspace;
}

const TasksSection: React.FC<Props> = ({ ws }) => {
  const { tasks, pendingTasks, overdueTasks, teacherId, today, markTaskComplete } = ws;
  const [completing, setCompleting] = useState<string | null>(null);

  const handleComplete = async (taskId: string) => {
    setCompleting(taskId);
    try {
      await markTaskComplete(taskId, teacherId);
      toast.success("Task marked complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setCompleting(null);
    }
  };

  return (
    <section id="tasks" className="scroll-mt-24">
      <h2 className="section-heading">
        <ClipboardList className="w-4 h-4 text-accent" /> My Tasks
        {pendingTasks.length > 0 && (
          <span className="status-pill-warning">{pendingTasks.length} open</span>
        )}
        {overdueTasks.length > 0 && (
          <span className="status-pill-danger">
            <AlertTriangle className="w-3 h-3" /> {overdueTasks.length} overdue
          </span>
        )}
      </h2>

      <div className="space-y-2">
        {tasks.slice(0, 6).map((task) => {
            const done = task.statusByTeacher[teacherId] === "completed";
            const overdue = !done && task.dueDate < today;
            return (
              <div
                key={task.id}
                className={`rounded-xl p-3.5 border ${
                  done ? "bg-ark-success/5 border-ark-success/20"
                    : overdue ? "bg-ark-danger/5 border-ark-danger/20"
                      : "bg-ark-warning/5 border-ark-warning/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    done ? "bg-ark-success/20" : overdue ? "bg-ark-danger/20" : "bg-ark-warning/20"
                  }`}>
                    {done
                      ? <CheckCircle2 className="w-4 h-4 text-ark-success" />
                      : <Clock className={`w-4 h-4 ${overdue ? "text-ark-danger" : "text-ark-warning"}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-ark-danger font-semibold" : "text-muted-foreground"}`}>
                        <Calendar className="w-3 h-3" /> Due {task.dueDate}
                      </span>
                      {!done && (
                        <button
                          onClick={() => handleComplete(task.id)}
                          disabled={completing === task.id}
                          className="text-[10px] font-semibold text-accent hover:opacity-80 flex items-center gap-1 disabled:opacity-50"
                        >
                          <CheckSquare className="w-3 h-3" />
                          {completing === task.id ? "Saving…" : "Mark done"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
          );
        })}
      </div>
    </section>
  );
};

export default TasksSection;
