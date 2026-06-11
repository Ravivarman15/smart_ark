import { cn } from "@/lib/utils";
import { statusMeta } from "../utils/taskConfig";
import type { TaskStatus } from "../types/tasks.types";

export const StatusBadge = ({
  status,
  overdue,
  className,
}: {
  status: TaskStatus;
  overdue?: boolean;
  className?: string;
}) => {
  // An overdue task shows the overdue chip unless it is already in a terminal state.
  const m = statusMeta(overdue ? "overdue" : status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        m.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
};
