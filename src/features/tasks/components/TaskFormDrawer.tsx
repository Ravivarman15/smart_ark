import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AssigneePicker } from "./AssigneePicker";
import { useTaskCategories } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import { taskFormSchema } from "../schemas/task.schema";
import { ALL_PRIORITIES, statusMeta, priorityMeta } from "../utils/taskConfig";
import { allowedNextStatuses } from "../utils/workflow";
import type { Task, TaskInput, TaskPriority, TaskStatus } from "../types/tasks.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
}

const empty = {
  title: "",
  description: "",
  status: "assigned" as TaskStatus,
  priority: "medium" as TaskPriority,
  categoryId: "",
  progress: 0,
  assignedTo: [] as string[],
  startDate: "",
  dueDate: "",
  dueTime: "",
  estimatedHours: "",
};

export const TaskFormDrawer = ({ open, onOpenChange, task }: Props) => {
  const isEdit = !!task;
  const { data: categories = [] } = useTaskCategories();
  const { create, update } = useTaskMutations();
  const [form, setForm] = useState({ ...empty });

  // New tasks start in Draft/Assigned; edits may only advance along a legal
  // workflow transition (the workflow guard also enforces this server-side).
  const statusOptions: TaskStatus[] =
    isEdit && task ? allowedNextStatuses(task.status) : (["draft", "assigned"] as TaskStatus[]);

  useEffect(() => {
    if (open) {
      setForm(
        task
          ? {
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              categoryId: task.categoryId ?? "",
              progress: task.progress,
              assignedTo: task.assignedTo,
              startDate: task.startDate ?? "",
              dueDate: task.dueDate ?? "",
              dueTime: task.dueTime ?? "",
              estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : "",
            }
          : { ...empty },
      );
    }
  }, [open, task]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = taskFormSchema.safeParse({
      ...form,
      categoryId: form.categoryId || null,
      estimatedHours: form.estimatedHours === "" ? null : form.estimatedHours,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    const input: TaskInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      categoryId: form.categoryId || null,
      progress: Number(form.progress),
      assignedTo: form.assignedTo,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      dueTime: form.dueTime || null,
      estimatedHours: form.estimatedHours === "" ? null : Number(form.estimatedHours),
    };
    try {
      if (isEdit && task) await update.mutateAsync({ id: task.id, patch: input });
      else await create.mutateAsync(input);
      onOpenChange(false);
    } catch {
      /* toast handled in mutation */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Task" : "Create Task"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder="Describe the task…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{priorityMeta(p).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{statusMeta(s).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.categoryId || "none"} onValueChange={(v) => set("categoryId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Uncategorised" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Assign To</Label>
            <AssigneePicker value={form.assignedTo} onChange={(ids) => set("assignedTo", ids)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Time</Label>
              <Input type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Estimated Hours</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={form.estimatedHours}
                onChange={(e) => set("estimatedHours", e.target.value)}
              />
            </div>
          </div>

          {isEdit && (
            <div>
              <Label className="text-xs">Progress: {form.progress}%</Label>
              <Input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.progress}
                onChange={(e) => set("progress", Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
