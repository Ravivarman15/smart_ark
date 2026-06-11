import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  CheckCircle2,
  FileText,
  ListChecks,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { useTaskActivity } from "../hooks/useTaskDetail";
import { useTaskAssignees } from "../hooks/useTasks";
import { statusMeta } from "../utils/taskConfig";
import type { TaskActivityKind } from "../types/tasks.types";

const ICONS: Record<TaskActivityKind, typeof Activity> = {
  created: PlusCircle,
  status_changed: RefreshCw,
  progress: CheckCircle2,
  assigned: UserPlus,
  comment: MessageSquare,
  checklist: ListChecks,
  attachment: FileText,
  updated: Activity,
};

const label = (kind: TaskActivityKind, meta: Record<string, unknown>): string => {
  switch (kind) {
    case "created":
      return "created this task";
    case "status_changed":
      return `changed status to ${statusMeta(String(meta.status ?? "")).label}`;
    case "progress":
      return `updated progress to ${meta.progress ?? 0}%`;
    case "assigned":
      return "updated assignees";
    case "comment":
      return "added a comment";
    case "checklist":
      return meta.label ? `added checklist item "${meta.label}"` : "updated the checklist";
    case "attachment":
      return meta.fileName ? `attached ${meta.fileName}` : "added an attachment";
    default:
      return "updated this task";
  }
};

const timeAgo = (iso: string) => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
};

export const ActivityPanel = ({ taskId }: { taskId: string }) => {
  const { data: entries = [] } = useTaskActivity(taskId);
  const { data: staff = [] } = useTaskAssignees();
  const nameOf = (id?: string) => (id ? staff.find((s) => s.id === id)?.name ?? "Someone" : "System");

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity Timeline</p>
      {entries.length === 0 && <p className="py-2 text-xs text-muted-foreground">No activity recorded yet.</p>}
      <ol className="relative space-y-3 border-l border-border/60 pl-4">
        {entries.map((e) => {
          const Icon = ICONS[e.kind] ?? Activity;
          return (
            <li key={e.id} className="relative">
              <span className="absolute -left-[22px] flex h-4 w-4 items-center justify-center rounded-full bg-muted">
                <Icon className="h-2.5 w-2.5 text-muted-foreground" />
              </span>
              <p className="text-xs">
                <span className="font-medium">{nameOf(e.actorId)}</span>{" "}
                <span className="text-muted-foreground">{label(e.kind, e.meta)}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">{timeAgo(e.createdAt)}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
