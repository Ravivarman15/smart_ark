import { useState } from "react";
import { CalendarClock, Clock, Copy, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { ProgressBar } from "./ProgressBar";
import { ChecklistPanel } from "./ChecklistPanel";
import { CommentsPanel } from "./CommentsPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { ActivityPanel } from "./ActivityPanel";
import { TaskFormDrawer } from "./TaskFormDrawer";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { useTask, useTaskAssignees } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import { statusMeta } from "../utils/taskConfig";
import { allowedNextStatuses } from "../utils/workflow";
import type { TaskStatus } from "../types/tasks.types";

interface Props {
  taskId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const TaskDetailDrawer = ({ taskId, open, onOpenChange }: Props) => {
  const { canDo } = useCanDo();
  const canEdit = canDo("tasks.edit");
  const canDelete = canDo("tasks.delete");
  const canStatus = canDo("tasks.status_change");
  const canDuplicate = canDo("tasks.create");
  const { data: task } = useTask(taskId ?? undefined);
  const { data: staff = [] } = useTaskAssignees();
  const { setStatus, setProgress, remove, duplicate } = useTaskMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "Unknown";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {!task ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="space-y-3 border-b border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
                <div className="flex shrink-0 gap-1">
                  {canDuplicate && (
                    <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate.mutate(task.id)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="icon" variant="ghost" title="Delete" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} overdue={task.isOverdue} />
                <PriorityBadge priority={task.priority} />
                {task.categoryName && (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      color: task.categoryColor,
                      borderColor: task.categoryColor ? `${task.categoryColor}55` : undefined,
                    }}
                  >
                    {task.categoryName}
                  </span>
                )}
              </div>

              {/* Quick controls */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                  <Select
                    value={task.status}
                    onValueChange={(v) =>
                      setStatus.mutate({ id: task.id, status: v as TaskStatus, from: task.status })
                    }
                    disabled={!canStatus}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedNextStatuses(task.status).map((s) => (
                        <SelectItem key={s} value={s}>{statusMeta(s).label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Progress · {task.progress}%</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={task.progress}
                    disabled={!canEdit}
                    onChange={(e) => setProgress.mutate({ id: task.id, progress: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {task.dueDate && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> Due {task.dueDate}
                    {task.dueTime ? ` ${task.dueTime.slice(0, 5)}` : ""}
                  </span>
                )}
                {task.estimatedHours != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Est. {task.estimatedHours}h
                  </span>
                )}
              </div>

              {task.assignedTo.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {task.assignedTo.map((id) => (
                    <span key={id} className="rounded-full bg-muted/40 px-2 py-0.5 text-[11px]">
                      {nameOf(id)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Body tabs */}
            <Tabs defaultValue="details" className="flex-1">
              <TabsList className="mx-4 mt-3 grid w-auto grid-cols-5">
                <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                <TabsTrigger value="checklist" className="text-xs">Checklist</TabsTrigger>
                <TabsTrigger value="comments" className="text-xs">Comments</TabsTrigger>
                <TabsTrigger value="files" className="text-xs">Files</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
              </TabsList>

              <div className="p-4">
                <TabsContent value="details" className="mt-0 space-y-3">
                  {task.description ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{task.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No description provided.</p>
                  )}
                  <ProgressBar value={task.progress} />
                </TabsContent>
                <TabsContent value="checklist" className="mt-0">
                  <ChecklistPanel taskId={task.id} />
                </TabsContent>
                <TabsContent value="comments" className="mt-0">
                  <CommentsPanel taskId={task.id} />
                </TabsContent>
                <TabsContent value="files" className="mt-0">
                  <AttachmentsPanel taskId={task.id} />
                </TabsContent>
                <TabsContent value="activity" className="mt-0">
                  <ActivityPanel taskId={task.id} />
                </TabsContent>
              </div>
            </Tabs>

            <TaskFormDrawer open={editOpen} onOpenChange={setEditOpen} task={task} />
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes “{task.title}” and its comments, checklist, and attachments.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      remove.mutate(task.id);
                      setConfirmDelete(false);
                      onOpenChange(false);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
