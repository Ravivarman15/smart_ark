import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import { ProgressBar } from "./ProgressBar";
import { useTaskChecklist, useChecklistMutations } from "../hooks/useTaskDetail";

export const ChecklistPanel = ({ taskId }: { taskId: string }) => {
  const { canDo } = useCanDo();
  const canEdit = canDo("tasks.edit");
  const { data: items = [], isLoading } = useTaskChecklist(taskId);
  const { add, toggle, remove } = useChecklistMutations(taskId);
  const [label, setLabel] = useState("");

  const done = items.filter((i) => i.isDone).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const onAdd = () => {
    if (!label.trim()) return;
    add.mutate({ label: label.trim(), position: items.length });
    setLabel("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Checklist {items.length > 0 && `· ${done}/${items.length}`}
        </p>
      </div>
      {items.length > 0 && <ProgressBar value={pct} />}

      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/30">
            <Checkbox checked={it.isDone} onCheckedChange={() => toggle.mutate(it)} />
            <span className={it.isDone ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>
              {it.label}
            </span>
            {canEdit && (
              <button
                onClick={() => remove.mutate(it.id)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">No checklist items yet.</p>
        )}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            placeholder="Add checklist item…"
            className="h-9"
          />
          <Button size="sm" onClick={onAdd} disabled={add.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
