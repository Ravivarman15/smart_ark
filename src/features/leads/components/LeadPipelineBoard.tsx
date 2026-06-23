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
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LEAD_PIPELINE, type Lead, type LeadStatus, type ScoreCategory } from "../types/lead.types";
import { statusLabel, canTransition } from "../utils/leadStatus";
import { useUpdateLeadStage } from "../hooks/useLeadMutations";
import { LeadCard } from "./LeadCard";

const CATEGORY_FILTERS: { key: ScoreCategory | "all" | "overdue"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "priority", label: "Priority" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "overdue", label: "Overdue" },
];

const inrCompact = (n: number): string =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : n >= 1000
      ? `₹${(n / 1000).toFixed(0)}k`
      : `₹${n}`;

const DraggableCard = ({
  lead,
  onOpen,
  staffName,
  onMove,
  busy,
}: {
  lead: Lead;
  onOpen: (id: string) => void;
  staffName?: (id?: string) => string;
  onMove: (lead: Lead, to: LeadStatus) => void;
  busy: boolean;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status },
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <LeadCard lead={lead} onOpen={onOpen} staffName={staffName} onMove={onMove} busy={busy} />
    </div>
  );
};

const Column = ({
  status,
  leads,
  onOpen,
  staffName,
  onMove,
  busy,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpen: (id: string) => void;
  staffName?: (id?: string) => string;
  onMove: (lead: Lead, to: LeadStatus) => void;
  busy: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const value = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  return (
    <div className="flex w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-muted/20 sm:w-72 lg:w-auto lg:flex-1">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-sm font-semibold">{statusLabel(status)}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {value > 0 && (
            <span className="text-[10px] font-medium text-emerald-600">{inrCompact(value)}</span>
          )}
          <span className="rounded-full bg-muted/50 px-2 text-xs text-muted-foreground">
            {leads.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 rounded-b-xl p-2 transition-colors",
          isOver && "bg-accent/10 ring-1 ring-inset ring-accent/40",
        )}
      >
        {leads.map((l) => (
          <DraggableCard
            key={l.id}
            lead={l}
            onOpen={onOpen}
            staffName={staffName}
            onMove={onMove}
            busy={busy}
          />
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
  staffName,
}: {
  leads: Lead[];
  onOpen: (id: string) => void;
  staffName?: (id?: string) => string;
}) => {
  const updateStage = useUpdateLeadStage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ScoreCategory | "all" | "overdue">("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter === "overdue" && !l.isOverdue) return false;
      if (filter !== "all" && filter !== "overdue" && l.scoreCategory !== filter) return false;
      if (!q) return true;
      return (
        l.studentName.toLowerCase().includes(q) ||
        (l.parentName ?? "").toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q) ||
        (l.course ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, filter]);

  const byStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const s of LEAD_PIPELINE) map.set(s, []);
    // Within a column: overdue first, then highest score.
    const sorted = [...filtered].sort(
      (a, b) => Number(b.isOverdue) - Number(a.isOverdue) || b.score - a.score,
    );
    for (const l of sorted) map.get(l.status)?.push(l);
    return map;
  }, [filtered]);

  const active = leads.find((l) => l.id === activeId) ?? null;

  const moveLead = (lead: Lead, to: LeadStatus) => {
    if (lead.status === to) return;
    if (!canTransition(lead.status, to)) {
      toast.error(`Can't move ${statusLabel(lead.status)} → ${statusLabel(to)} directly.`);
      return;
    }
    updateStage.mutate(
      { lead, to },
      {
        onSuccess: () => toast.success(`Moved to ${statusLabel(to)}`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id as LeadStatus | undefined;
    const lead = leads.find((l) => l.id === String(e.active.id));
    if (!to || !lead) return;
    moveLead(lead, to);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar — search + quick filters. Wraps cleanly on narrow screens. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, course…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {leads.length} leads
        <span className="ml-1 hidden sm:inline">· tip: use “Move…” on a card to change stage on mobile</span>
      </p>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none">
          {LEAD_PIPELINE.map((s) => (
            <Column
              key={s}
              status={s}
              leads={byStatus.get(s) ?? []}
              onOpen={onOpen}
              staffName={staffName}
              onMove={moveLead}
              busy={updateStage.isPending}
            />
          ))}
        </div>
        <DragOverlay>
          {active ? <LeadCard lead={active} onOpen={() => {}} staffName={staffName} preview /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
