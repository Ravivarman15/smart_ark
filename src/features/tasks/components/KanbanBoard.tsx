import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";
import { BOARD_COLUMNS, statusMeta } from "../utils/taskConfig";
import { canTransition, transitionError } from "../utils/workflow";
import { useTaskMutations } from "../hooks/useTaskMutations";
import type { Task, TaskStatus } from "../types/tasks.types";

const DraggableCard = ({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <TaskCard task={task} compact onClick={() => onOpen(task.id)} />
    </div>
  );
};

const Column = ({
  status,
  label,
  tasks,
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  onOpen: (id: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = statusMeta(status);
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/20 md:w-auto md:flex-1">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <span className="rounded-full bg-muted/50 px-2 text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 rounded-b-xl p-2 transition-colors",
          isOver && "bg-accent/10 ring-1 ring-inset ring-accent/40",
        )}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop tasks here</p>
        )}
      </div>
    </div>
  );
};

export const KanbanBoard = ({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) => {
  const { setStatus } = useTaskMutations();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of BOARD_COLUMNS) map.set(col.status, []);
    for (const t of tasks) {
      // Tasks in statuses not represented as a column (draft/accepted/rejected/
      // cancelled) are folded into the nearest board column for visibility.
      const col = map.has(t.status) ? t.status : t.status === "draft" || t.status === "accepted" ? "assigned" : null;
      if (col) map.get(col)!.push(t);
    }
    return map;
  }, [tasks]);

  const active = tasks.find((t) => t.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overStatus = e.over?.id as TaskStatus | undefined;
    const fromStatus = e.active.data.current?.status as TaskStatus | undefined;
    if (!overStatus || !fromStatus || overStatus === fromStatus) return;
    // Enforce the workflow — block illegal drops with an explanatory toast
    // instead of silently moving the card.
    if (!canTransition(fromStatus, overStatus)) {
      toast.error(transitionError(fromStatus, overStatus));
      return;
    }
    setStatus.mutate({ id: String(e.active.id), status: overStatus, from: fromStatus });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
        {BOARD_COLUMNS.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={byStatus.get(col.status) ?? []}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} compact /> : null}</DragOverlay>
    </DndContext>
  );
};
