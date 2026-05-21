import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  useCreateStandard,
  useDeleteStandard,
  useSetStandardCourseTypes,
  useStandardCourseTypes,
  useStandards,
  useUpdateStandard,
} from "../hooks";
import { useNewParam } from "../hooks/useNewParam";
import { standardSchema } from "../schemas/setup.schema";
import { validate } from "../utils";
import type { Standard } from "../types/setup.types";

interface FormState {
  name: string;
  displayOrder: string;
}

const blank: FormState = { name: "", displayOrder: "" };

const ManageStandardsPage = () => {
  const { data: standards = [], isLoading } = useStandards();
  const { data: courseTypes = [] } = useCourseTypes();
  const createMut = useCreateStandard();
  const updateMut = useUpdateStandard();
  const deleteMut = useDeleteStandard();
  const setStreamsMut = useSetStandardCourseTypes();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Standard | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [streamIds, setStreamIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Assigned streams load only when an existing standard is open for edit.
  const { data: assignedStreams, isLoading: streamsLoading } = useStandardCourseTypes(
    editing?.id
  );
  useEffect(() => {
    if (assignedStreams) setStreamIds(assignedStreams);
  }, [assignedStreams]);

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setStreamIds([]);
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (s: Standard) => {
    setEditing(s);
    setForm({ name: s.name, displayOrder: String(s.displayOrder ?? 0) });
    setStreamIds([]);
    setErrors({});
    setSheetOpen(true);
  };

  const toggleStream = (id: string) =>
    setStreamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = () => {
    const candidate = {
      name: form.name,
      displayOrder: form.displayOrder === "" ? undefined : Number(form.displayOrder),
    };
    const result = validate(standardSchema, candidate);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    if (editing) {
      updateMut.mutate(
        { id: editing.id, input: result.data },
        {
          onSuccess: () =>
            setStreamsMut.mutate(
              { standardId: editing.id, courseTypeIds: streamIds },
              { onSuccess: () => setSheetOpen(false) }
            ),
        }
      );
    } else {
      createMut.mutate(result.data, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete, { onSuccess: () => setSheetOpen(false) });
    setPendingDelete(null);
  };

  const columns: Column<Standard>[] = [
    {
      key: "order",
      header: "#",
      className: "w-16",
      cell: (s) => <span className="text-muted-foreground">{s.displayOrder}</span>,
    },
    {
      key: "name",
      header: "Standard",
      cell: (s) => <span className="font-medium text-foreground">{s.name}</span>,
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
      title="Assign Standards"
      description="Standards (classes / grades) are the backbone of the academic structure. Assign course-type streams to each standard."
      icon={<GraduationCap className="w-5 h-5" />}
      primaryAction={{ label: "Add Standard", onClick: openCreate }}
    >
      <EntityTable
        columns={columns}
        rows={standards}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={openEdit}
        empty={
          <EmptyState
            icon={<GraduationCap className="w-5 h-5" />}
            title="No standards yet"
            description="Add standards like Class 11 or Class 12 to start building batches."
            action={{ label: "Add Standard", onClick: openCreate }}
          />
        }
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Standard" : "Add Standard"}
        description="Standards order how classes appear across the app."
        submitLabel={editing ? "Save changes" : "Create standard"}
        submitting={createMut.isPending || updateMut.isPending || setStreamsMut.isPending}
        onSubmit={submit}
        onDelete={editing ? () => setPendingDelete(editing.id) : undefined}
      >
        <FormField label="Standard name" required error={errors.name}>
          <Input
            placeholder="e.g. Class 11"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField
          label="Display order"
          error={errors.displayOrder}
          hint="Lower numbers appear first in lists."
        >
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
          />
        </FormField>

        {editing ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Course-type streams</p>
            <p className="text-[11px] text-muted-foreground">
              Select the streams (NEET, JEE, …) offered for this standard.
            </p>
            {streamsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : courseTypes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No course types defined yet — add them under Manage Course Types.
              </p>
            ) : (
              <div className="rounded-md border border-border/60 divide-y divide-border/40">
                {courseTypes.map((ct) => (
                  <label
                    key={ct.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={streamIds.includes(ct.id)}
                      onCheckedChange={() => toggleStream(ct.id)}
                    />
                    <span className="text-xs text-foreground">{ct.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            Save the standard first — you can then assign course-type streams.
          </p>
        )}
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete standard?"
        description="Subjects and batches linked to this standard may be affected. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageStandardsPage;
