import { cn } from "@/lib/utils";
import { priorityMeta } from "../utils/taskConfig";
import type { TaskPriority } from "../types/tasks.types";

export const PriorityBadge = ({ priority, className }: { priority: TaskPriority; className?: string }) => {
  const m = priorityMeta(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        m.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
};
