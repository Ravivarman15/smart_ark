import { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { ProgressBar } from "./ProgressBar";
import { TaskCard } from "./TaskCard";
import { useTaskAssignees } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import { ALL_STATUSES, ALL_PRIORITIES, statusMeta, priorityMeta } from "../utils/taskConfig";
import type { Task, TaskPriority, TaskStatus } from "../types/tasks.types";

interface Props {
  rows: Task[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onOpen: (id: string) => void;
  canBulk?: boolean;
}

export const TaskListTable = ({ rows, total, page, pageSize, onPage, onOpen, canBulk = true }: Props) => {
  const { canDo } = useCanDo();
  const { data: staff = [] } = useTaskAssignees();
  const { bulkStatus, bulkPriority, bulkRemove } = useTaskMutations();
  const [selected, setSelected] = useState<string[]>([]);

  // Bulk actions require the matching permission; "view-only" users see no
  // checkboxes / action bar.
  const canBulkEdit = canBulk && canDo("tasks.edit");
  const canBulkDelete = canBulk && canDo("tasks.delete");
  const showBulk = canBulkEdit || canBulkDelete;

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "Unknown";
  const pageIds = rows.map((r) => r.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggleAll = () =>
    setSelected(allChecked ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])]);
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const clear = () => setSelected([]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const assigneeLabel = (t: Task) =>
    t.assignedTo.length === 0 ? "—" : t.assignedTo.length === 1 ? nameOf(t.assignedTo[0]) : `${nameOf(t.assignedTo[0])} +${t.assignedTo.length - 1}`;

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {showBulk && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2 text-sm">
          <span className="px-1 font-medium">{selected.length} selected</span>
          {canBulkEdit && (
            <>
              <Select onValueChange={(v) => { bulkStatus.mutate({ ids: selected, status: v as TaskStatus }); clear(); }}>
                <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Set status" /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{statusMeta(s).label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => { bulkPriority.mutate({ ids: selected, priority: v as TaskPriority }); clear(); }}>
                <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Set priority" /></SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{priorityMeta(p).label}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          {canBulkDelete && (
            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { bulkRemove.mutate(selected); clear(); }}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        </div>
      )}

      {/* Mobile: cards */}
      <div className="grid gap-2 md:hidden">
        {rows.map((t) => (
          <TaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} />
        ))}
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No tasks found.</p>}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showBulk && (
                <TableHead className="w-8">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                </TableHead>
              )}
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Assignees</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="w-32">Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => onOpen(t.id)}>
                {showBulk && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.includes(t.id)} onCheckedChange={() => toggle(t.id)} />
                  </TableCell>
                )}
                <TableCell className="max-w-[260px]">
                  <p className="truncate font-medium">{t.title}</p>
                  {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                </TableCell>
                <TableCell><StatusBadge status={t.status} overdue={t.isOverdue} /></TableCell>
                <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.categoryName ?? "—"}</TableCell>
                <TableCell className="text-xs">{assigneeLabel(t)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <span className={t.isOverdue ? "text-red-500" : ""}>{t.dueDate ?? "—"}</span>
                </TableCell>
                <TableCell><ProgressBar value={t.progress} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showBulk ? 8 : 7} className="py-8 text-center text-sm text-muted-foreground">
                  No tasks found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">Page {page} / {lastPage}</span>
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
