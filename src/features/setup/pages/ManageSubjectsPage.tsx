import { useMemo, useState } from "react";
import { BookText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
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
  useCreateSubject,
  useDeleteSubject,
  useStandards,
  useSubjects,
  useUpdateSubject,
} from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { subjectSchema } from "../schemas/setup.schema";
import { validate } from "../utils";
import type { Subject } from "../types/setup.types";

const NONE = "__none__";

interface FormState {
  name: string;
  code: string;
  standardId: string;
  isOptional: boolean;
  isActive: boolean;
  displayOrder: string;
}

const blank: FormState = {
  name: "",
  code: "",
  standardId: NONE,
  isOptional: false,
  isActive: true,
  displayOrder: "",
};

const ManageSubjectsPage = () => {
  const { data: standards = [] } = useStandards();
  const [filterStandard, setFilterStandard] = useState<string>("all");
  const { data: subjects = [], isLoading } = useSubjects(
    filterStandard === "all" ? undefined : { standardId: filterStandard }
  );
  const createMut = useCreateSubject();
  const updateMut = useUpdateSubject();
  const deleteMut = useDeleteSubject();

  const standardName = useMemo(() => {
    const map = new Map(standards.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? map.get(id) ?? "—" : "—");
  }, [standards]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...blank,
      standardId: filterStandard !== "all" ? filterStandard : NONE,
    });
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code ?? "",
      standardId: s.standardId ?? NONE,
      isOptional: s.isOptional,
      isActive: s.isActive,
      displayOrder: String(s.displayOrder ?? 0),
    });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const candidate = {
      name: form.name,
      code: form.code || "",
      standardId: form.standardId === NONE ? "" : form.standardId,
      isOptional: form.isOptional,
      isActive: form.isActive,
      displayOrder: form.displayOrder === "" ? undefined : Number(form.displayOrder),
    };
    const result = validate(subjectSchema, candidate);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    const input = {
      name: result.data.name,
      code: result.data.code || undefined,
      standardId: form.standardId === NONE ? null : form.standardId,
      isOptional: form.isOptional,
      isActive: form.isActive,
      displayOrder: candidate.displayOrder,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, input }, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMut.mutate(input, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete, { onSuccess: () => setSheetOpen(false) });
    setPendingDelete(null);
  };

  const columns: Column<Subject>[] = [
    {
      key: "name",
      header: "Subject",
      cell: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: "code",
      header: "Code",
      cell: (s) => <span className="text-muted-foreground">{s.code || "—"}</span>,
    },
    {
      key: "standard",
      header: "Standard",
      cell: (s) => (
        <span className="text-muted-foreground">{standardName(s.standardId)}</span>
      ),
    },
    {
      key: "optional",
      header: "Type",
      cell: (s) => (
        <span className="text-muted-foreground">
          {s.isOptional ? "Optional" : "Core"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => <StatusChip active={s.isActive} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (s) => (
        <RowActions onEdit={() => openEdit(s)} onDelete={() => setPendingDelete(s.id)} />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Assign Subjects"
      description="Define subjects and assign each to a standard. Optional subjects can be picked per student / batch."
      icon={<BookText className="w-5 h-5" />}
      primaryAction={{ label: "Add Subject", onClick: openCreate }}
      toolbar={
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Standard</span>
          <Select value={filterStandard} onValueChange={setFilterStandard}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
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
        </div>
      }
    >
      <EntityTable
        columns={columns}
        rows={subjects}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<BookText className="w-5 h-5" />}
            title="No subjects found"
            description="Add subjects and link them to a standard to assign them to batches."
            action={{ label: "Add Subject", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Subject" : "Add Subject"}
        description="Subjects feed batch assignment and timetables."
        submitLabel={editing ? "Save changes" : "Create subject"}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Subject name" required error={errors.name}>
          <Input
            placeholder="e.g. Physics"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Subject code" error={errors.code}>
            <Input
              placeholder="e.g. PHY"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </FormField>
          <FormField label="Display order" error={errors.displayOrder}>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={form.displayOrder}
              onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
            />
          </FormField>
        </div>
        <FormField label="Standard" error={errors.standardId}>
          <Select
            value={form.standardId}
            onValueChange={(v) => setForm({ ...form, standardId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a standard" />
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
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Optional subject</p>
            <p className="text-[11px] text-muted-foreground">
              Optional subjects are elective per student / batch.
            </p>
          </div>
          <Switch
            checked={form.isOptional}
            onCheckedChange={(v) => setForm({ ...form, isOptional: v })}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Active</p>
            <p className="text-[11px] text-muted-foreground">
              Inactive subjects stay hidden from new assignments.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
        </div>
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete subject?"
        description="Batch assignments and timetable entries using this subject may be affected. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageSubjectsPage;
