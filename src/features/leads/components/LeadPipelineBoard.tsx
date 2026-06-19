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
import { LEAD_PIPELINE, type Lead, type LeadStatus } from "../types/lead.types";
import { statusLabel, canTransition } from "../utils/leadStatus";
import { useUpdateLeadStage } from "../hooks/useLeadMutations";
import { LeadScoreBadge } from "./LeadBadges";

const LeadCard = ({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(lead.id)}
    className="w-full rounded-lg border border-border/60 bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
  >
    <div className="flex items-start justify-between gap-2">
      <span className="truncate text-sm font-semibold">{lead.studentName}</span>
      {lead.isOverdue && (
        <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
          overdue
        </span>
      )}
    </div>
    {lead.course && <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.course}</p>}
    <div className="mt-2 flex items-center justify-between">
      <LeadScoreBadge score={lead.score} category={lead.scoreCategory} />
      {lead.phone && <span className="text-[11px] text-muted-foreground">{lead.phone}</span>}
    </div>
  </button>
);

const DraggableCard = ({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status },
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <LeadCard lead={lead} onOpen={onOpen} />
    </div>
  );
};

const Column = ({
  status,
  leads,
  onOpen,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpen: (id: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/20 lg:w-auto lg:flex-1">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">{statusLabel(status)}</span>
        <span className="rounded-full bg-muted/50 px-2 text-xs text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 rounded-b-xl p-2 transition-colors",
          isOver && "bg-accent/10 ring-1 ring-inset ring-accent/40",
        )}
      >
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} onOpen={onOpen} />
        ))}
        {leads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No leads</p>
        )}
      </div>
    </div>
  );
};

export const LeadPipelineBoard = ({
  leads,
  onOpen,
}: {
  leads: Lead[];
  onOpen: (id: string) => void;
}) => {
  const updateStage = useUpdateLeadStage();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const byStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const s of LEAD_PIPELINE) map.set(s, []);
    for (const l of leads) map.get(l.status)?.push(l);
    return map;
  }, [leads]);

  const active = leads.find((l) => l.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id as LeadStatus | undefined;
    const from = e.active.data.current?.status as LeadStatus | undefined;
    if (!to || !from || to === from) return;
    if (!canTransition(from, to)) {
      toast.error(`Can't move ${statusLabel(from)} → ${statusLabel(to)} directly.`);
      return;
    }
    const lead = leads.find((l) => l.id === String(e.active.id));
    if (!lead) return;
    updateStage.mutate(
      { lead, to },
      {
        onSuccess: () => toast.success(`Moved to ${statusLabel(to)}`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {LEAD_PIPELINE.map((s) => (
          <Column key={s} status={s} leads={byStatus.get(s) ?? []} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>{active ? <LeadCard lead={active} onOpen={() => {}} /> : null}</DragOverlay>
    </DndContext>
  );
};
