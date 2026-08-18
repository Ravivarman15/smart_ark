import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BranchFilter,
  ConfirmDeleteDialog,
  EmptyState,
  EntityFormSheet,
  EntityTable,
  FormField,
  RowActions,
  SetupPageShell,
  StatusChip,
  type Column,
} from "../components";
import {
  useBatches,
  useBatchSubjects,
  useCampuses,
  useCourseTypes,
  useCreateBatch,
  useDeleteBatch,
  useAcademicYears,
  useSetBatchSubjects,
  useStandards,
  useSubjects,
  useTeachers,
  useUpdateBatch,
} from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { batchSchema } from "../schemas/setup.schema";
import {
  BATCH_HEALTH_OPTIONS,
  HEALTH_CLASS,
  formatTimeRange,
  validate,
} from "../utils";
import type { Batch, BatchInput } from "../types/setup.types";

const NONE = "__none__";

interface FormState {
  name: string;
  campusId: string;
  standardId: string;
  courseTypeId: string;
  coordinatorId: string;
  academicYearId: string;
  timingStart: string;
  timingEnd: string;
  capacity: string;
  room: string;
  health: string;
  isActive: boolean;
}

const blank: FormState = {
  name: "",
  campusId: NONE,
  standardId: NONE,
  courseTypeId: NONE,
  coordinatorId: NONE,
  academicYearId: NONE,
  timingStart: "",
  timingEnd: "",
  capacity: "",
  room: "",
  health: "moderate",
  isActive: true,
};

const ManageBatchesPage = () => {
  const [filters, setFilters] = useState<{
    standardId: string;
    courseTypeId: string;
    campusId: string;
    status: string;
  }>({ standardId: "all", courseTypeId: "all", campusId: "all", status: "all" });

  const queryFilters = useMemo(
    () => ({
      ...(filters.standardId !== "all" ? { standardId: filters.standardId } : {}),
      ...(filters.courseTypeId !== "all" ? { courseTypeId: filters.courseTypeId } : {}),
      ...(filters.campusId !== "all" ? { campusId: filters.campusId } : {}),
      ...(filters.status !== "all" ? { isActive: filters.status === "active" } : {}),
    }),
    [filters]
  );

  const { data: batches = [], isLoading } = useBatches(queryFilters);
  const { data: standards = [] } = useStandards();
  const { data: courseTypes = [] } = useCourseTypes();
  const { data: campuses = [] } = useCampuses();
  const { data: teachers = [] } = useTeachers();
  const { data: years = [] } = useAcademicYears();
  const { data: allSubjects = [] } = useSubjects();

  const createMut = useCreateBatch();
  const updateMut = useUpdateBatch();
  const deleteMut = useDeleteBatch();
  const setSubjectsMut = useSetBatchSubjects();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: assignedSubjects, isLoading: subjectsLoading } = useBatchSubjects(
    editing?.id
  );
  useEffect(() => {
    if (assignedSubjects) setSubjectIds(assignedSubjects.map((s) => s.subjectId));
  }, [assignedSubjects]);

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setSubjectIds([]);
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (b: Batch) => {
    setEditing(b);
    setForm({
      name: b.name,
      campusId: b.campusId ?? NONE,
      standardId: b.standardId ?? NONE,
      courseTypeId: b.courseTypeId ?? NONE,
      coordinatorId: b.coordinatorId ?? NONE,
      academicYearId: b.academicYearId ?? NONE,
      timingStart: b.timingStart ?? "",
      timingEnd: b.timingEnd ?? "",
      capacity: b.capacity != null ? String(b.capacity) : "",
      room: b.room ?? "",
      health: b.health ?? "moderate",
      isActive: b.isActive,
    });
    setSubjectIds([]);
    setErrors({});
    setSheetOpen(true);
  };

  const toggleSubject = (id: string) =>
    setSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = () => {
    const candidate = {
      name: form.name,
      campusId: form.campusId === NONE ? "" : form.campusId,
      standardId: form.standardId === NONE ? "" : form.standardId,
      courseTypeId: form.courseTypeId === NONE ? "" : form.courseTypeId,
      coordinatorId: form.coordinatorId === NONE ? "" : form.coordinatorId,
      academicYearId: form.academicYearId === NONE ? "" : form.academicYearId,
      timingStart: form.timingStart || "",
      timingEnd: form.timingEnd || "",
      capacity: form.capacity === "" ? undefined : Number(form.capacity),
      room: form.room || "",
      isActive: form.isActive,
    };
    const result = validate(batchSchema, candidate);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});

    const input: BatchInput = {
      name: candidate.name,
      campusId: candidate.campusId || undefined,
      standardId: candidate.standardId || undefined,
      courseTypeId: candidate.courseTypeId || undefined,
      coordinatorId: candidate.coordinatorId || undefined,
      academicYearId: candidate.academicYearId || undefined,
      timingStart: candidate.timingStart || undefined,
      timingEnd: candidate.timingEnd || undefined,
      capacity: candidate.capacity,
      room: candidate.room || undefined,
      health: form.health,
      isActive: form.isActive,
    };

    if (editing) {
      updateMut.mutate(
        { id: editing.id, input },
        {
          onSuccess: () =>
            setSubjectsMut.mutate(
              { batchId: editing.id, subjectIds },
              { onSuccess: () => setSheetOpen(false) }
            ),
        }
      );
    } else {
      createMut.mutate(input, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete, { onSuccess: () => setSheetOpen(false) });
    setPendingDelete(null);
  };

  // Subjects offered for the batch's standard (plus standard-agnostic ones).
  const eligibleSubjects = useMemo(() => {
    if (form.standardId === NONE) return allSubjects;
    return allSubjects.filter(
      (s) => !s.standardId || s.standardId === form.standardId
    );
  }, [allSubjects, form.standardId]);

  const columns: Column<Batch>[] = [
    {
      key: "name",
      header: "Batch",
      cell: (b) => <span className="font-medium text-foreground">{b.name}</span>,
    },
    {
      key: "standard",
      header: "Standard",
      cell: (b) => <span className="text-muted-foreground">{b.standardName || "—"}</span>,
    },
    {
      key: "course",
      header: "Course type",
      cell: (b) => (
        <span className="text-muted-foreground">{b.courseTypeName || "—"}</span>
      ),
    },
    {
      key: "campus",
      header: "Campus",
      cell: (b) => <span className="text-muted-foreground">{b.campusName || "—"}</span>,
    },
    {
      key: "timing",
      header: "Timing",
      cell: (b) => (
        <span className="text-muted-foreground">
          {formatTimeRange(b.timingStart, b.timingEnd)}
        </span>
      ),
    },
    {
      key: "capacity",
      header: "Capacity",
      cell: (b) => <span className="text-muted-foreground">{b.capacity ?? "—"}</span>,
    },
    {
      key: "health",
      header: "Health",
      cell: (b) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
            HEALTH_CLASS[b.health ?? ""] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {b.health || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (b) => <StatusChip active={b.isActive} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (b) => (
        <RowActions onEdit={() => openEdit(b)} onDelete={() => setPendingDelete(b.id)} />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Manage Classes / Batches"
      description="Batches link a standard, course type and campus together — students and timetables attach to them."
      icon={<Users className="w-5 h-5" />}
      primaryAction={{ label: "Add Batch", onClick: openCreate }}
      toolbar={
        <>
          <Select
            value={filters.standardId}
            onValueChange={(v) => setFilters((f) => ({ ...f, standardId: v }))}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Standard" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All standards</SelectItem>
              {standards.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BranchFilter
            value={filters.campusId}
            onChange={(v) => setFilters((f) => ({ ...f, campusId: v }))}
          />
          <Select
            value={filters.courseTypeId}
            onValueChange={(v) => setFilters((f) => ({ ...f, courseTypeId: v }))}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Course type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All course types</SelectItem>
              {courseTypes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={batches}
        rowKey={(b) => b.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="No batches found"
            description="Create a batch to start assigning students, subjects and timetables."
            action={{ label: "Add Batch", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Batch" : "Add Class / Batch"}
        description="Batches anchor students, subjects and timetables."
        submitLabel={editing ? "Save changes" : "Create batch"}
        submitting={createMut.isPending || updateMut.isPending || setSubjectsMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Batch name" required error={errors.name}>
          <Input
            placeholder="e.g. NEET Morning A"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Standard" error={errors.standardId}>
            <Select
              value={form.standardId}
              onValueChange={(v) => setForm({ ...form, standardId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No standard</SelectItem>
                {standards.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Course type" error={errors.courseTypeId}>
            <Select
              value={form.courseTypeId}
              onValueChange={(v) => setForm({ ...form, courseTypeId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No course type</SelectItem>
                {courseTypes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Campus" error={errors.campusId}>
            <Select
              value={form.campusId}
              onValueChange={(v) => setForm({ ...form, campusId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No campus</SelectItem>
                {campuses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Academic year" error={errors.academicYearId}>
            <Select
              value={form.academicYearId}
              onValueChange={(v) => setForm({ ...form, academicYearId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No year</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Coordinator / teacher in charge" error={errors.coordinatorId}>
          <Select
            value={form.coordinatorId}
            onValueChange={(v) => setForm({ ...form, coordinatorId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
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
          <FormField label="Start time" error={errors.timingStart}>
            <Input
              type="time"
              value={form.timingStart}
              onChange={(e) => setForm({ ...form, timingStart: e.target.value })}
            />
          </FormField>
          <FormField label="End time" error={errors.timingEnd}>
            <Input
              type="time"
              value={form.timingEnd}
              onChange={(e) => setForm({ ...form, timingEnd: e.target.value })}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Capacity" error={errors.capacity}>
            <Input
              type="number"
              min={0}
              placeholder="60"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </FormField>
          <FormField label="Room" error={errors.room}>
            <Input
              placeholder="e.g. Block A-203"
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Health status">
          <Select
            value={form.health}
            onValueChange={(v) => setForm({ ...form, health: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_HEALTH_OPTIONS.map((h) => (
                <SelectItem key={h} value={h} className="capitalize">
                  {h.charAt(0).toUpperCase() + h.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Active</p>
            <p className="text-[11px] text-muted-foreground">
              Inactive batches are hidden from new student assignments.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
        </div>

        {editing ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Subjects in this batch</p>
            {subjectsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : eligibleSubjects.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No subjects available — add them under Assign Subjects.
              </p>
            ) : (
              <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-52 overflow-y-auto">
                {eligibleSubjects.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={subjectIds.includes(s.id)}
                      onCheckedChange={() => toggleSubject(s.id)}
                    />
                    <span className="text-xs text-foreground">
                      {s.name}
                      {s.isOptional && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          (optional)
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            Save the batch first — you can then assign subjects to it.
          </p>
        )}
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete batch?"
        description="Students assigned to this batch will need reassignment. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageBatchesPage;
