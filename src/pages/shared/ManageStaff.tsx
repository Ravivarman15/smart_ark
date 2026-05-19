import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreateStaffSheet,
  EditStaffSheet,
  ManageStaffTable,
  StaffProfileDrawer,
  useDeactivateStaff,
  useActivateStaff,
  useResendInvite,
  useResetStaffPassword,
  useStaff,
  useRoles,
  type Staff,
  type StaffStatus,
} from "@/features/staff";
import type { Role } from "@/core/constants/roles";

/**
 * Manage Staff — the new modern UI that replaces StaffControl for the
 * Create/Manage flows. Attendance (the other half of the legacy page) stays
 * at its existing routes.
 *
 * Pagination is client-side for now — the staff service already supports
 * server-side filters, swap to range() once the headcount grows past a few
 * hundred.
 */
const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: StaffStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

const ManageStaff = () => {
  const roles = useRoles();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<Staff | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StaffStatus | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);

  // Server-side filters: include inactive so the lifecycle column is honest.
  const { data: staff = [], isLoading, refetch } = useStaff({
    includeInactive: true,
    role: roleFilter === "all" ? undefined : (roleFilter as Role),
  });

  const deactivate = useDeactivateStaff();
  const activate = useActivateStaff();
  const resendInvite = useResendInvite();
  const resetPassword = useResetStaffPassword();

  // Department list derived from the staff result — keeps the dropdown
  // honest to what's actually in use.
  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => s.department).filter(Boolean) as string[])).sort(),
    [staff]
  );

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (departmentFilter && s.department !== departmentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [s.name, s.email, s.mobile, s.designation]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staff, search, statusFilter, departmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((s) => s.status === "active").length,
      invited: staff.filter((s) => s.status === "invited").length,
      inactive: staff.filter((s) => s.status === "inactive").length,
    }),
    [staff]
  );

  const handleDeactivate = async (s: Staff) => {
    if (!confirm(`Deactivate ${s.name}? They will lose access immediately.`)) return;
    try {
      await deactivate.mutateAsync(s.id);
      toast.success(`${s.name} deactivated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate");
    }
  };

  const handleActivate = async (s: Staff) => {
    try {
      await activate.mutateAsync(s.id);
      toast.success(`${s.name} activated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate");
    }
  };

  const handleResend = async (s: Staff) => {
    if (!s.email) return toast.error("No email on file for this staff");
    try {
      await resendInvite.mutateAsync(s.email);
      toast.success(`Invite resent to ${s.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invite");
    }
  };

  const handleReset = async (s: Staff) => {
    if (!s.email) return toast.error("No email on file for this staff");
    try {
      await resetPassword.mutateAsync(s.email);
      toast.success(`Password reset email sent to ${s.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Manage Staff
          </h1>
          <p className="text-sm text-muted-foreground">
            {counts.total} total · {counts.active} active · {counts.invited} pending invite
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Staff
        </Button>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile label="Total" value={counts.total} icon={<Users className="w-3.5 h-3.5" />} />
        <SummaryTile label="Active" value={counts.active} tone="emerald" />
        <SummaryTile label="Invited" value={counts.invited} tone="sky" />
        <SummaryTile label="Inactive" value={counts.inactive} tone="rose" />
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, mobile, designation…"
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v as Role | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StaffStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={departmentFilter || "all"}
            onValueChange={(v) => {
              setDepartmentFilter(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="lg:w-44">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <ManageStaffTable
        rows={paged}
        loading={isLoading}
        onView={(s) => setViewing(s)}
        onEdit={(s) => setEditing(s)}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
        onResendInvite={handleResend}
        onResetPassword={handleReset}
      />

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>
            Page {safePage} of {pageCount} · showing {paged.length} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <CreateStaffSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => refetch()}
      />
      <EditStaffSheet
        staff={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => refetch()}
      />
      <StaffProfileDrawer staff={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  );
};

const SummaryTile = ({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "sky" | "rose";
  icon?: React.ReactNode;
}) => {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  }[tone];

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={`text-2xl font-display font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
};

export default ManageStaff;
