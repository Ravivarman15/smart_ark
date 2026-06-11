import { CalendarClock, CheckSquare, MessageSquare, Paperclip, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { ProgressBar } from "./ProgressBar";
import type { Task } from "../types/tasks.types";

export const TaskCard = ({
  task,
  onClick,
  compact,
  dragHandleProps,
}: {
  task: Task;
  onClick?: () => void;
  compact?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "glass-card cursor-pointer space-y-2 p-3 transition-colors hover:border-accent/40",
        task.isOverdue && "border-red-500/30",
      )}
      {...dragHandleProps}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</p>
        <PriorityBadge priority={task.priority} />
      </div>

      {!compact && task.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} overdue={task.isOverdue} />
        {task.categoryName && (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px]"
            style={{ color: task.categoryColor, borderColor: task.categoryColor ? `${task.categoryColor}55` : undefined }}
          >
            {task.categoryName}
          </span>
        )}
      </div>

      <ProgressBar value={task.progress} />

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {task.assignedTo.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {task.assignedTo.length}
            </span>
          )}
          {!!task.checklistTotal && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3 w-3" /> {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {!!task.commentCount && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {task.commentCount}
            </span>
          )}
          {!!task.attachmentCount && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" /> {task.attachmentCount}
            </span>
          )}
        </div>
        {task.dueDate && (
          <span className={cn("inline-flex items-center gap-1", task.isOverdue && "text-red-500")}>
            <CalendarClock className="h-3 w-3" /> {task.dueDate.slice(5)}
          </span>
        )}
      </div>
    </div>
  );
};
