import { useState } from "react";
import { CalendarRange, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  useAcademicYears,
  useCreateAcademicYear,
  useDeleteAcademicYear,
  useSetDefaultAcademicYear,
  useUpdateAcademicYear,
} from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { academicYearSchema } from "../schemas/setup.schema";
import { formatDate, validate } from "../utils";
import type { AcademicYear } from "../types/setup.types";

interface FormState {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const blank: FormState = { name: "", startDate: "", endDate: "", isActive: true };

const ManageYearsPage = () => {
  const { data: years = [], isLoading } = useAcademicYears();
  const createMut = useCreateAcademicYear();
  const updateMut = useUpdateAcademicYear();
  const deleteMut = useDeleteAcademicYear();
  const defaultMut = useSetDefaultAcademicYear();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
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

  const openEdit = (y: AcademicYear) => {
    setEditing(y);
    setForm({
      name: y.name,
      startDate: y.startDate ?? "",
      endDate: y.endDate ?? "",
      isActive: y.isActive,
    });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(academicYearSchema, form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    if (editing) {
      updateMut.mutate(
        { id: editing.id, input: result.data },
        { onSuccess: () => setSheetOpen(false) }
      );
    } else {
      createMut.mutate(result.data, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete, {
      onSuccess: () => {
        setSheetOpen(false);
        setEditing(null);
      },
    });
    setPendingDelete(null);
  };

  const columns: Column<AcademicYear>[] = [
    {
      key: "name",
      header: "Year",
      cell: (y) => (
        <span className="font-medium text-foreground flex items-center gap-1.5">
          {y.name}
          {y.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
        </span>
      ),
    },
    { key: "start", header: "Start", cell: (y) => formatDate(y.startDate) },
    { key: "end", header: "End", cell: (y) => formatDate(y.endDate) },
    {
      key: "default",
      header: "Default",
      cell: (y) =>
        y.isDefault ? (
          <StatusChip active trueLabel="Default" />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-accent"
            onClick={(e) => {
              e.stopPropagation();
              defaultMut.mutate(y.id);
            }}
          >
            Set default
          </Button>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (y) => <StatusChip active={y.isActive} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (y) => (
        <RowActions onEdit={() => openEdit(y)} onDelete={() => setPendingDelete(y.id)} />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Manage Academic Years"
      description="Define the academic / session years used across admissions, batches and reports."
      icon={<CalendarRange className="w-5 h-5" />}
      primaryAction={{ label: "Add Year", onClick: openCreate }}
    >
      <EntityTable
        columns={columns}
        rows={years}
        rowKey={(y) => y.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<CalendarRange className="w-5 h-5" />}
            title="No academic years yet"
            description="Add your first session year to start linking batches and admissions."
            action={{ label: "Add Year", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Academic Year" : "Add Academic Year"}
        description="Sessions group every academic record for the period."
        submitLabel={editing ? "Save changes" : "Create year"}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Year name" required error={errors.name}>
          <Input
            placeholder="e.g. 2025-26"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start date" required error={errors.startDate}>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </FormField>
          <FormField label="End date" required error={errors.endDate}>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </FormField>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-xs font-medium text-foreground">Active year</p>
            <p className="text-[11px] text-muted-foreground">
              Inactive years stay available for historical reports.
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
        title="Delete academic year?"
        description="Batches and admissions linked to this year may be affected. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageYearsPage;
