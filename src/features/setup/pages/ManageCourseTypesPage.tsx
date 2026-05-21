import { useState } from "react";
import { Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ConfirmDeleteDialog,
  EmptyState,
  EntityFormSheet,
  EntityTable,
  FormField,
  RowActions,
  SetupPageShell,
  type Column,
} from "../components";
import {
  useCourseTypes,
  useCreateCourseType,
  useDeleteCourseType,
  useUpdateCourseType,
} from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { courseTypeSchema } from "../schemas/setup.schema";
import { validate } from "../utils";
import type { CourseType } from "../types/setup.types";

interface FormState {
  name: string;
  description: string;
}

const blank: FormState = { name: "", description: "" };

const ManageCourseTypesPage = () => {
  const { data: rows = [], isLoading } = useCourseTypes();
  const createMut = useCreateCourseType();
  const updateMut = useUpdateCourseType();
  const deleteMut = useDeleteCourseType();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CourseType | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (c: CourseType) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? "" });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(courseTypeSchema, form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    const input = { name: result.data.name, description: result.data.description || undefined };
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

  const columns: Column<CourseType>[] = [
    {
      key: "name",
      header: "Course type",
      cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
    },
    {
      key: "description",
      header: "Description",
      cell: (c) => (
        <span className="text-muted-foreground">{c.description || "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <RowActions onEdit={() => openEdit(c)} onDelete={() => setPendingDelete(c.id)} />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Manage Course Types"
      description="Course types (e.g. NEET, JEE, Foundation) classify standards and batches into academic streams."
      icon={<Layers className="w-5 h-5" />}
      primaryAction={{ label: "Add Course Type", onClick: openCreate }}
    >
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<Layers className="w-5 h-5" />}
            title="No course types yet"
            description="Add streams like NEET or JEE to organise your academic structure."
            action={{ label: "Add Course Type", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Course Type" : "Add Course Type"}
        description="Streams are reusable across standards and batches."
        submitLabel={editing ? "Save changes" : "Create course type"}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Name" required error={errors.name}>
          <Input
            placeholder="e.g. NEET, JEE, Foundation"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField
          label="Description"
          error={errors.description}
          hint="Optional — a short note about this stream."
        >
          <Textarea
            rows={3}
            placeholder="What this course type covers"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </FormField>
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete course type?"
        description="Standards and batches referencing this stream may be affected. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageCourseTypesPage;
