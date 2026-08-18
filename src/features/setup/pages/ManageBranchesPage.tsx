import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Star, MapPin, Users, GraduationCap, Layers, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { usePermissions } from "@/core/permissions";
import {
  BranchDetailDialog,
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
  useBranches,
  useBranchUsage,
  useCreateBranch,
  useDeleteBranch,
  useUpdateBranch,
} from "../hooks/useBranches";
import { useNewParam } from "../hooks/useNewParam";
import { branchSchema } from "../schemas/setup.schema";
import { branchIsDeletable } from "../services/branches.service";
import { validate } from "../utils";
import type { Branch } from "../types/setup.types";

// ──────────────────────────────────────────────────────────────────────────────
// MANAGE BRANCHES
//
// The plan sells "Branches: 5" and, until this page, an organization could
// never have more than the one its provisioning created — `campuses` has
// SELECT-only RLS, so there was no write path from anywhere in the product.
//
// A branch here is one object over two rows (campus + descriptor); the RPCs in
// branches.service.ts own that pairing. See the 20261009 migration.
//
// The plan allowance shown at the top is ADVISORY. Enforcement is a database
// trigger on `campuses`, so a stale or failed usage read can only ever be
// wrong in the permissive direction — the server still refuses, with a message
// naming the real numbers.
// ──────────────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  code: string;
  address: string;
  geoLat: string;
  geoLng: string;
  isPrimary: boolean;
  isActive: boolean;
}

const blank: FormState = {
  name: "",
  code: "",
  address: "",
  geoLat: "",
  geoLng: "",
  isPrimary: false,
  isActive: true,
};

const numberOrUndefined = (v: string): number | undefined =>
  v.trim() === "" ? undefined : Number(v);

type StatusFilter = "all" | "active" | "inactive";

const ManageBranchesPage = () => {
  const { data: allRows = [], isLoading, error: fetchError } = useBranches();
  const { data: allowance } = useBranchUsage();
  const createMut = useCreateBranch();
  const updateMut = useUpdateBranch();
  const deleteMut = useDeleteBranch();
  const { canDoAction } = usePermissions();

  const canCreate = canDoAction("setup.branch.create");
  const canEdit = canDoAction("setup.branch.edit");
  const canDelete = canDoAction("setup.branch.delete");

  useEffect(() => {
    if (fetchError) {
      console.error("[ManageBranchesPage] fetch error:", fetchError);
      toast.error(
        fetchError instanceof Error ? fetchError.message : "Failed to load branches",
      );
    }
  }, [fetchError]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);
  const [viewing, setViewing] = useState<Branch | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  // Filtering happens here rather than in the query: the directory is a handful
  // of rows already fetched, and re-querying on every keystroke would make the
  // list flicker for no gain.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((b) => {
      if (status === "active" && !b.isActive) return false;
      if (status === "inactive" && b.isActive) return false;
      if (!q) return true;
      return `${b.name} ${b.code ?? ""} ${b.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [allRows, search, status]);

  const filtering = search.trim() !== "" || status !== "all";

  const openCreate = () => {
    setEditing(null);
    // The first branch an organization creates is primary whether or not the
    // box is ticked (create_branch enforces it), so pre-tick it when there is
    // nothing else — otherwise the UI would contradict what happens.
    setForm({ ...blank, isPrimary: allRows.length === 0 });
    setErrors({});
    setSheetOpen(true);
  };
  useNewParam(openCreate);

  const openEdit = (b: Branch) => {
    if (!canEdit) return;
    setEditing(b);
    setForm({
      name: b.name,
      code: b.code ?? "",
      address: b.address ?? "",
      geoLat: b.geoLat != null ? String(b.geoLat) : "",
      geoLng: b.geoLng != null ? String(b.geoLng) : "",
      isPrimary: b.isPrimary,
      isActive: b.isActive,
    });
    setErrors({});
    setSheetOpen(true);
  };

  const submit = () => {
    const result = validate(branchSchema, {
      name: form.name,
      code: form.code,
      address: form.address,
      geoLat: numberOrUndefined(form.geoLat),
      geoLng: numberOrUndefined(form.geoLng),
      isPrimary: form.isPrimary,
      isActive: form.isActive,
    });
    if (!result.ok) return setErrors(result.errors);
    setErrors({});

    const input = {
      name: result.data.name,
      code: result.data.code ?? "",
      address: result.data.address ?? "",
      geoLat: result.data.geoLat,
      geoLng: result.data.geoLng,
      isPrimary: result.data.isPrimary,
      isActive: result.data.isActive,
    };

    if (editing) {
      updateMut.mutate({ id: editing.id, input }, { onSuccess: () => setSheetOpen(false) });
    } else {
      createMut.mutate(input, { onSuccess: () => setSheetOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete.id, { onSuccess: () => setSheetOpen(false) });
    setPendingDelete(null);
  };

  const atLimit = allowance?.atLimit ?? false;
  const usageLabel = useMemo(() => {
    if (!allowance) return null;
    if (allowance.limit === null) return `${allowance.used} branches · unlimited on your plan`;
    return `${allowance.used} of ${allowance.limit} branches used`;
  }, [allowance]);

  const columns: Column<Branch>[] = [
    {
      key: "name",
      header: "Branch",
      cell: (b) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">{b.name}</span>
            {b.isPrimary && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                <Star className="h-3 w-3" /> Primary
              </span>
            )}
          </div>
          {(b.code || b.address) && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {b.code ? `${b.code}` : ""}
              {b.code && b.address ? " · " : ""}
              {b.address ?? ""}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "usage",
      header: "In use by",
      cell: (b) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" /> {b.studentCount} students
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {b.staffCount} staff
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {b.batchCount} classes
          </span>
        </div>
      ),
    },
    {
      key: "geo",
      header: "Location",
      cell: (b) =>
        b.geoLat != null && b.geoLng != null ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {b.geoLat.toFixed(4)}, {b.geoLng.toFixed(4)}
            {b.isCheckinLocation ? " · check-in" : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
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
        <RowActions
          onView={() => setViewing(b)}
          onEdit={canEdit ? () => openEdit(b) : undefined}
          // Offering Delete on a branch with 400 students trains people to
          // press it and read an error. The row shows the counts; the action
          // simply is not there until they are zero.
          onDelete={
            canDelete && branchIsDeletable(b) && allRows.length > 1
              ? () => setPendingDelete(b)
              : undefined
          }
        />
      ),
    },
  ];

  return (
    <SetupPageShell
      title="Manage Branches"
      description="Each branch is a location students, staff, classes and finance can be assigned to. Your plan sets how many you can have."
      icon={<Building2 className="w-5 h-5" />}
      primaryAction={
        canCreate
          ? {
              label: "Add Branch",
              onClick: openCreate,
              disabled: atLimit,
            }
          : undefined
      }
      toolbar={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, code, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {filtering && (
            <span className="text-xs text-muted-foreground">
              {rows.length} of {allRows.length}
            </span>
          )}

          {usageLabel && (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  atLimit
                    ? "rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive"
                    : "rounded-md bg-muted px-2 py-1 text-muted-foreground"
                }
              >
                {usageLabel}
              </span>
              {atLimit && (
                <Link
                  to="/settings/billing"
                  className="font-medium text-accent underline underline-offset-4"
                >
                  Upgrade your plan to add another
                </Link>
              )}
            </div>
          )}
        </>
      }
    >
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        loading={isLoading}
        // Row click opens the read-only view. Editing is a deliberate second
        // step — a stray click on a table should not put a live branch into an
        // editable form.
        onRowClick={(b) => setViewing(b)}
        empty={
          filtering ? (
            <EmptyState
              icon={<Search className="w-5 h-5" />}
              title="No branches match"
              description="No branch matches that search or status. Clear the filters to see all of them."
              action={{
                label: "Clear filters",
                onClick: () => {
                  setSearch("");
                  setStatus("all");
                },
              }}
            />
          ) : (
            <EmptyState
              icon={<Building2 className="w-5 h-5" />}
              title="No branches yet"
              description="Add your first branch to assign students, staff and classes to a location."
              action={canCreate ? { label: "Add Branch", onClick: openCreate } : undefined}
            />
          )
        }
      />

      <BranchDetailDialog
        branch={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={canEdit ? openEdit : undefined}
      />

      <EntityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? "Edit Branch" : "Add Branch"}
        description="Branches appear wherever the product asks for a campus — student records, classes, finance and reports."
        submitLabel={editing ? "Save changes" : "Create branch"}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={submit}
        onDelete={
          editing && canDelete && branchIsDeletable(editing) && allRows.length > 1
            ? () => setPendingDelete(editing)
            : undefined
        }
      >
        <FormField label="Branch name" required error={errors.name}>
          <Input
            placeholder="e.g. North Campus"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>

        <FormField
          label="Short code"
          error={errors.code}
          hint="Optional. Used on receipts and reports where space is tight."
        >
          <Input
            placeholder="e.g. NC"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </FormField>

        <FormField label="Address" error={errors.address}>
          <Input
            placeholder="Street, area, city"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Latitude" error={errors.geoLat}>
            <Input
              inputMode="decimal"
              placeholder="13.0059"
              value={form.geoLat}
              onChange={(e) => setForm({ ...form, geoLat: e.target.value })}
            />
          </FormField>
          <FormField
            label="Longitude"
            error={errors.geoLng}
            hint="Optional — needed only for geofenced check-in."
          >
            <Input
              inputMode="decimal"
              placeholder="80.1961"
              value={form.geoLng}
              onChange={(e) => setForm({ ...form, geoLng: e.target.value })}
            />
          </FormField>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
          <div className="pr-4">
            <p className="text-xs font-medium text-foreground">Primary branch</p>
            <p className="text-[11px] text-muted-foreground">
              The default location for anything not assigned to a specific branch.
              Exactly one branch is primary.
            </p>
          </div>
          <Switch
            checked={form.isPrimary}
            // Un-ticking the only primary would leave the organization without
            // one; the server refuses that, so the control refuses it first.
            disabled={editing?.isPrimary || allRows.length === 0}
            onCheckedChange={(v) => setForm({ ...form, isPrimary: v })}
          />
        </div>

        {editing && (
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
            <div className="pr-4">
              <p className="text-xs font-medium text-foreground">Active</p>
              <p className="text-[11px] text-muted-foreground">
                Inactive branches stay on existing records but are hidden from new
                assignments. They still count towards your plan — delete a branch to
                free the slot.
              </p>
            </div>
            <Switch
              checked={form.isActive}
              disabled={editing.isPrimary}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })}
            />
          </div>
        )}
      </EntityFormSheet>

      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "branch"}?`}
        description="This frees a branch slot on your plan. Nothing is assigned to this branch, so no records are affected. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </SetupPageShell>
  );
};

export default ManageBranchesPage;
