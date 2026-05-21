import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EntityFormSheet,
  EmptyState,
  FormField,
  SetupPageShell,
} from "../components";
import {
  useBatches,
  useClearTimetableCell,
  useSubjects,
  useTeachers,
  useTimetable,
  useUpsertTimetableCell,
} from "../hooks";
import {
  DAY_LABELS,
  DAY_SHORT,
  TIMETABLE_DAYS,
  TIMETABLE_PERIODS,
  formatTimeRange,
} from "../utils";
import type { DayOfWeek, TimetablePeriod } from "../types/setup.types";

// ─────────────────────────────────────────────────────────────────────────────
// TIMETABLE ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────────
// The grid is a pure projection of `setup_timetable_periods` rows keyed by
// (day_of_week, period_no). Each <TimetableCell> is a self-contained unit that
// owns only its coordinates + payload — no shared mutable state between cells.
//
// Drag-and-drop extension point (future): because every cell is addressed by
// a stable {day, period} pair and writes go through `upsertCell` / `clearCell`
// (idempotent, conflict on batch_id+day+period), a drag handler only needs to:
//   1. read the source cell payload,
//   2. clearCell(source), upsertCell(target, payload),
//   3. let React Query refetch.
// No grid-wide reflow or ordering logic is required. Wrap each cell in a
// dnd-kit `useDraggable`/`useDroppable` and the persistence layer is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const NONE = "__none__";

interface CellForm {
  subjectId: string;
  teacherProfileId: string;
  startTime: string;
  endTime: string;
  room: string;
  notes: string;
}

const emptyForm: CellForm = {
  subjectId: NONE,
  teacherProfileId: NONE,
  startTime: "",
  endTime: "",
  room: "",
  notes: "",
};

const ManageTimetablePage = () => {
  const { data: batches = [], isLoading: batchesLoading } = useBatches({ isActive: true });
  const { data: teachers = [] } = useTeachers();
  const { data: allSubjects = [] } = useSubjects();

  const [batchId, setBatchId] = useState<string>("");
  const { data: periods = [], isLoading: gridLoading } = useTimetable(batchId || undefined);

  const upsertMut = useUpsertTimetableCell();
  const clearMut = useClearTimetableCell();

  const [editingCell, setEditingCell] = useState<{
    day: DayOfWeek;
    period: number;
  } | null>(null);
  const [form, setForm] = useState<CellForm>(emptyForm);

  const selectedBatch = batches.find((b) => b.id === batchId);

  // Subjects offered for the batch's standard (plus standard-agnostic ones).
  const eligibleSubjects = useMemo(() => {
    if (!selectedBatch?.standardId) return allSubjects;
    return allSubjects.filter(
      (s) => !s.standardId || s.standardId === selectedBatch.standardId
    );
  }, [allSubjects, selectedBatch]);

  // (day-period) → period row, for O(1) cell lookup while rendering the grid.
  const cellMap = useMemo(() => {
    const map = new Map<string, TimetablePeriod>();
    for (const p of periods) map.set(`${p.dayOfWeek}-${p.periodNo}`, p);
    return map;
  }, [periods]);

  const openCell = (day: DayOfWeek, period: number) => {
    const existing = cellMap.get(`${day}-${period}`);
    setForm(
      existing
        ? {
            subjectId: existing.subjectId ?? NONE,
            teacherProfileId: existing.teacherProfileId ?? NONE,
            startTime: existing.startTime ?? "",
            endTime: existing.endTime ?? "",
            room: existing.room ?? "",
            notes: existing.notes ?? "",
          }
        : emptyForm
    );
    setEditingCell({ day, period });
  };

  const submitCell = () => {
    if (!editingCell || !batchId) return;
    upsertMut.mutate(
      {
        batchId,
        dayOfWeek: editingCell.day,
        periodNo: editingCell.period,
        subjectId: form.subjectId === NONE ? null : form.subjectId,
        teacherProfileId:
          form.teacherProfileId === NONE ? null : form.teacherProfileId,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        room: form.room || null,
        notes: form.notes || null,
      },
      { onSuccess: () => setEditingCell(null) }
    );
  };

  const clearCell = () => {
    if (!editingCell || !batchId) return;
    clearMut.mutate(
      {
        batchId,
        dayOfWeek: editingCell.day,
        periodNo: editingCell.period,
      },
      { onSuccess: () => setEditingCell(null) }
    );
  };

  return (
    <SetupPageShell
      title="Manage Time Table"
      description="Build the weekly schedule for each batch — assign a subject, teacher and time to every period."
      icon={<CalendarClock className="w-5 h-5" />}
      toolbar={
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Batch</span>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger className="h-8 w-64">
              <SelectValue placeholder="Select a batch to schedule" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.standardName ? ` · ${b.standardName}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {!batchId ? (
        <div className="glass-card">
          <EmptyState
            icon={<CalendarClock className="w-5 h-5" />}
            title={batchesLoading ? "Loading batches…" : "Select a batch"}
            description="Choose a batch above to view and edit its weekly timetable."
          />
        </div>
      ) : gridLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="glass-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium text-left w-20 border-b border-border/50">
                    Period
                  </th>
                  {TIMETABLE_DAYS.map((day) => (
                    <th
                      key={day}
                      className="px-3 py-2.5 font-medium text-left border-b border-l border-border/50 min-w-[150px]"
                    >
                      <span className="hidden sm:inline">{DAY_LABELS[day]}</span>
                      <span className="sm:hidden">{DAY_SHORT[day]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIMETABLE_PERIODS.map((period) => (
                  <tr key={period} className="divide-x divide-border/40">
                    <td className="px-3 py-2 align-top text-xs font-medium text-muted-foreground border-b border-border/30">
                      P{period}
                    </td>
                    {TIMETABLE_DAYS.map((day) => (
                      <td
                        key={day}
                        className="p-1.5 align-top border-b border-border/30"
                      >
                        <TimetableCell
                          period={cellMap.get(`${day}-${period}`)}
                          onClick={() => openCell(day, period)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EntityFormSheet
        open={!!editingCell}
        onOpenChange={(o) => !o && setEditingCell(null)}
        title={
          editingCell
            ? `${DAY_LABELS[editingCell.day]} · Period ${editingCell.period}`
            : "Period"
        }
        description={selectedBatch ? `Batch: ${selectedBatch.name}` : undefined}
        submitLabel="Save period"
        submitting={upsertMut.isPending}
        onSubmit={submitCell}
        onDelete={clearCell}
        deleteLabel="Clear period"
      >
        <FormField label="Subject">
          <Select
            value={form.subjectId}
            onValueChange={(v) => setForm({ ...form, subjectId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No subject</SelectItem>
              {eligibleSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Teacher">
          <Select
            value={form.teacherProfileId}
            onValueChange={(v) => setForm({ ...form, teacherProfileId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start time">
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </FormField>
          <FormField label="End time">
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Room">
          <Input
            placeholder="e.g. Block A-203"
            value={form.room}
            onChange={(e) => setForm({ ...form, room: e.target.value })}
          />
        </FormField>
        <FormField label="Notes" hint="Optional — e.g. lab session, doubt clearing.">
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormField>
      </EntityFormSheet>
    </SetupPageShell>
  );
};

// ── One scheduled (or empty) period cell ─────────────────────────────────────
interface CellProps {
  period?: TimetablePeriod;
  onClick: () => void;
}

const TimetableCell = ({ period, onClick }: CellProps) => {
  if (!period) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full min-h-[64px] flex items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground/50 hover:border-accent/50 hover:text-accent transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-full min-h-[64px] flex flex-col gap-0.5 rounded-md border border-border/60 bg-accent/5 px-2.5 py-2 text-left hover:border-accent/50 hover:bg-accent/10 transition-colors"
    >
      <span className="text-xs font-semibold text-foreground truncate">
        {period.subjectName ?? "Untitled"}
      </span>
      {period.teacherName && (
        <span className="text-[11px] text-muted-foreground truncate">
          {period.teacherName}
        </span>
      )}
      {(period.startTime || period.endTime) && (
        <span className="text-[10px] text-muted-foreground">
          {formatTimeRange(period.startTime, period.endTime)}
        </span>
      )}
      {period.room && (
        <span className="text-[10px] text-muted-foreground">Room {period.room}</span>
      )}
    </button>
  );
};

export default ManageTimetablePage;
