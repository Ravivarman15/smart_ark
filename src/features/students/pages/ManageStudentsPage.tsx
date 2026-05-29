import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  GraduationCap,
  LayoutGrid,
  Power,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  RiskBadge,
  StatTile,
  StatusBadge,
  StudentAvatar,
  StudentPageShell,
  StudentProfileDrawer,
  type Column,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import { useDeactivateStudent } from "../hooks/useDeactivateStudent";
import { useUpdateStudent } from "../hooks/useUpdateStudent";
import {
  useAcademicYearOptions,
  useBatchOptions,
  useCourseTypeOptions,
  useStandardOptions,
} from "../hooks/useStudentLookups";
import { useStudentFilterPresets } from "../hooks/useStudentFilterPresets";
import { studentsService } from "../services/students.service";
import {
  exportStudents,
  type ExportFormat,
} from "../services/studentExport.service";
import {
  applyClientFilters,
  computeStudentStats,
  DEFAULT_VIEWS,
  distinctValues,
  EMPTY_FILTERS,
  toServerParams,
  type StudentFilters,
} from "../utils/studentFilters";
import type { Student } from "../types/student.types";

const PAGE_SIZE = 25;
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "pdf", label: "PDF" },
];

const ManageStudentsPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.replace(/\/+$/, "");
  const { user } = useAuth();
  const { canDo } = useCanDo();

  const canExport = canDo("student.export");
  const canDownloadRecord = canDo("student.download_record");
  // Teachers see only their campus's students (their "assigned" scope); admin /
  // management / coordinator see everyone. Enforced server-side below.
  const teacherCampusScope = user?.role === "teacher" ? user.campusId : undefined;

  const [filters, setFilters] = useState<StudentFilters>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [drawerStudent, setDrawerStudent] = useState<Student | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Student | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const { data: courseTypes = [] } = useCourseTypeOptions();
  const { data: academicYears = [] } = useAcademicYearOptions();
  const deactivate = useDeactivateStudent();
  const updateStudent = useUpdateStudent();
  const { presets, savePreset, deletePreset } = useStudentFilterPresets();

  // Server fetch: structural filters only (status / standard / batch / course /
  // campus / risk). Demographic + search refinements run client-side so they
  // also work on a migration-drifted schema. No server pagination — the full
  // matching set is fetched once and cached, then filtered + paged on the client
  // so the table and every export operate on the same array.
  const serverParams = useMemo(() => {
    const p = toServerParams(filters);
    if (teacherCampusScope) p.filters = { ...p.filters, campusId: teacherCampusScope };
    return p;
  }, [filters, teacherCampusScope]);

  const { data, isLoading } = useStudents(serverParams);
  const serverRows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const filtered = useMemo(
    () => applyClientFilters(serverRows, filters),
    [serverRows, filters],
  );
  const stats = useMemo(() => computeStudentStats(filtered), [filtered]);

  // Reset to first page whenever the result set changes.
  useEffect(() => setPage(1), [filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // Demographic dropdown options derived from the loaded set.
  const genderOptions = useMemo(() => distinctValues(serverRows, (s) => s.gender), [serverRows]);
  const categoryOptions = useMemo(() => distinctValues(serverRows, (s) => s.category), [serverRows]);
  const groupOptions = useMemo(() => distinctValues(serverRows, (s) => s.groupName), [serverRows]);

  const set = (patch: Partial<StudentFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // ── selection ──────────────────────────────────────────────────────────────
  const pageAllSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageRows.forEach((s) => next.delete(s.id));
      else pageRows.forEach((s) => next.add(s.id));
      return next;
    });

  // ── export ───────────────────────────────────────────────────────────────--
  const exportScope = async (scope: "all" | "filtered" | "selected", format: ExportFormat) => {
    try {
      let rows: Student[];
      if (scope === "all") {
        const res = await studentsService.list({
          filters: teacherCampusScope
            ? { status: "all", campusId: teacherCampusScope }
            : { status: "all" },
        });
        rows = res.rows;
      } else if (scope === "selected") {
        rows = filtered.filter((s) => selected.has(s.id));
      } else {
        rows = filtered;
      }
      if (rows.length === 0) {
        toast.warning("No students to export for that selection.");
        return;
      }
      await exportStudents(rows, format, {
        fileName: "students",
        title: "Students",
        subtitle: `${scope[0].toUpperCase()}${scope.slice(1)} export`,
      });
      toast.success(`Exported ${rows.length} students (${format.toUpperCase()})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  // ── deactivate / restore ─────────────────────────────────────────────────--
  const confirmToggle = () => {
    if (!pendingToggle) return;
    if (pendingToggle.active) deactivate.mutate(pendingToggle.id);
    else updateStudent.mutate({ id: pendingToggle.id, updates: { active: true } });
    setPendingToggle(null);
  };

  // ── presets ────────────────────────────────────────────────────────────────
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePreset(presetName, filters);
    toast.success(`Saved view "${presetName.trim()}"`);
    setPresetName("");
    setSaveOpen(false);
  };

  const columns: Column<Student>[] = [
    {
      key: "select",
      header: (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={pageAllSelected}
            onCheckedChange={togglePage}
            aria-label="Select page"
          />
        </div>
      ),
      cell: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected.has(s.id)}
            onCheckedChange={() => toggleRow(s.id)}
            aria-label={`Select ${s.name}`}
          />
        </div>
      ),
    },
    {
      key: "name",
      header: "Student",
      cell: (s) => (
        <div className="flex items-center gap-2.5">
          <StudentAvatar name={s.name} imageUrl={s.profileImageUrl} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{s.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {s.rollNumber ? `#${s.rollNumber} · ` : ""}
              {s.parentName || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "standard",
      header: "Standard",
      cell: (s) => <span className="text-muted-foreground">{s.standardName || "—"}</span>,
    },
    {
      key: "batch",
      header: "Batch",
      cell: (s) => <span className="text-muted-foreground">{s.batch || "—"}</span>,
    },
    { key: "risk", header: "Risk", cell: (s) => <RiskBadge risk={s.risk} /> },
    { key: "status", header: "Status", cell: (s) => <StatusBadge active={s.active} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (s) => (
        <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => setDrawerStudent(s)}
          >
            <Eye className="w-3 h-3" />
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => navigate(`${base}/registration?id=${s.id}`)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={`h-7 gap-1 text-xs ${
              s.active
                ? "text-destructive border-destructive/30 hover:bg-destructive/10"
                : "text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
            }`}
            onClick={() => setPendingToggle(s)}
          >
            {s.active ? <Power className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
            {s.active ? "Deactivate" : "Restore"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StudentPageShell
      title="Manage Students"
      description="Search, filter, view, export and maintain every student record."
      icon={<Users className="w-5 h-5" />}
      primaryAction={{ label: "Add Student", onClick: () => navigate(`${base}/registration`) }}
      toolbar={
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, roll, enrolment, mobile…"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              className="pl-9 h-8 w-64"
            />
          </div>
          <Select value={filters.standardId} onValueChange={(v) => set({ standardId: v })}>
            <SelectTrigger className="h-8 w-40">
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
          <Select value={filters.batchId} onValueChange={(v) => set({ batchId: v })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => set({ status: v as StudentFilters["status"] })}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant={showAdvanced ? "default" : "outline"}
            className="h-8 gap-1.5"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
          </Button>

          {/* Saved views */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" />
                Views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Default views</DropdownMenuLabel>
              {DEFAULT_VIEWS.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => setFilters({ ...EMPTY_FILTERS, ...v.patch })}
                >
                  {v.label}
                </DropdownMenuItem>
              ))}
              {presets.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
                  {presets.map((p) => (
                    <div key={p.id} className="flex items-center">
                      <DropdownMenuItem
                        className="flex-1"
                        onClick={() => setFilters({ ...EMPTY_FILTERS, ...p.filters })}
                      >
                        {p.name}
                      </DropdownMenuItem>
                      <button
                        className="px-2 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          deletePreset(p.id);
                        }}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveOpen(true)}>
                <Save className="w-3.5 h-3.5 mr-2" />
                Save current view…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export center */}
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Export center</DropdownMenuLabel>
                <ExportScopeSub label="All students" scope="all" onPick={exportScope} />
                <ExportScopeSub
                  label={`Selected (${selected.size})`}
                  scope="selected"
                  disabled={selected.size === 0}
                  onPick={exportScope}
                />
                <ExportScopeSub
                  label={`Filtered (${filtered.length})`}
                  scope="filtered"
                  onPick={exportScope}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    >
      {/* Advanced filter panel */}
      {showAdvanced && (
        <div className="glass-card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FilterSelect
            label="Course type"
            value={filters.courseTypeId}
            onChange={(v) => set({ courseTypeId: v })}
            options={courseTypes.map((c) => ({ value: c.id, label: c.name }))}
            allLabel="All course types"
          />
          <FilterSelect
            label="Academic year"
            value={filters.academicYearId}
            onChange={(v) => set({ academicYearId: v })}
            options={academicYears.map((y) => ({ value: y.id, label: y.name }))}
            allLabel="All years"
          />
          <FilterSelect
            label="Risk"
            value={filters.risk}
            onChange={(v) => set({ risk: v })}
            options={[
              { value: "safe", label: "Safe" },
              { value: "watch", label: "Watch" },
              { value: "critical", label: "Critical" },
            ]}
            allLabel="All risk"
          />
          <FilterSelect
            label="Gender"
            value={filters.gender}
            onChange={(v) => set({ gender: v })}
            options={genderOptions.map((g) => ({ value: g, label: g }))}
            allLabel="All genders"
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            onChange={(v) => set({ category: v })}
            options={categoryOptions.map((c) => ({ value: c, label: c }))}
            allLabel="All categories"
          />
          <FilterSelect
            label="Group"
            value={filters.group}
            onChange={(v) => set({ group: v })}
            options={groupOptions.map((g) => ({ value: g, label: g }))}
            allLabel="All groups"
          />
          <DateRange
            label="Admission date"
            from={filters.admissionFrom}
            to={filters.admissionTo}
            onFrom={(v) => set({ admissionFrom: v })}
            onTo={(v) => set({ admissionTo: v })}
          />
          <DateRange
            label="Date of birth"
            from={filters.dobFrom}
            to={filters.dobTo}
            onFrom={(v) => set({ dobFrom: v })}
            onTo={(v) => set({ dobTo: v })}
          />
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Reset all filters
            </Button>
          </div>
        </div>
      )}

      {/* Live statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <StatTile label="Total" value={stats.total} icon={<Users className="w-4 h-4" />} />
        <StatTile label="Active" value={stats.active} tone="positive" />
        <StatTile label="Male" value={stats.male} />
        <StatTile label="Female" value={stats.female} />
        <StatTile label="New (30d)" value={stats.newAdmissions} tone="accent" />
        <StatTile label="Batches" value={stats.batchCount} />
        <StatTile label="Standards" value={stats.standardCount} />
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => setDrawerStudent(s)}
        empty={
          <EmptyState
            icon={<GraduationCap className="w-5 h-5" />}
            title="No students found"
            description="Adjust the filters above, or register your first student."
            action={{ label: "Add Student", onClick: () => navigate(`${base}/registration`) }}
          />
        }
      />

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <StudentProfileDrawer
        student={drawerStudent}
        open={!!drawerStudent}
        onOpenChange={(o) => !o && setDrawerStudent(null)}
        onEdit={(s) => {
          setDrawerStudent(null);
          navigate(`${base}/registration?id=${s.id}`);
        }}
        canDownload={canDownloadRecord}
      />

      <ConfirmDialog
        open={!!pendingToggle}
        onOpenChange={(o) => !o && setPendingToggle(null)}
        title={pendingToggle?.active ? "Deactivate student?" : "Restore student?"}
        description={
          pendingToggle?.active
            ? "The student is moved to inactive. Their records (fees, attendance, history) are preserved."
            : "The student is restored to the active roster."
        }
        confirmLabel={pendingToggle?.active ? "Deactivate" : "Restore"}
        destructive={!!pendingToggle?.active}
        onConfirm={confirmToggle}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="preset-name">View name</Label>
            <Input
              id="preset-name"
              placeholder="e.g. Grade 10 actives"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudentPageShell>
  );
};

// ── small presentational helpers ──────────────────────────────────────────────
const FilterSelect = ({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const DateRange = ({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    <div className="flex items-center gap-1">
      <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="h-8" />
      <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="h-8" />
    </div>
  </div>
);

const ExportScopeSub = ({
  label,
  scope,
  disabled,
  onPick,
}: {
  label: string;
  scope: "all" | "filtered" | "selected";
  disabled?: boolean;
  onPick: (scope: "all" | "filtered" | "selected", format: ExportFormat) => void;
}) => (
  <DropdownMenuSub>
    <DropdownMenuSubTrigger disabled={disabled}>{label}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      {FORMATS.map((f) => (
        <DropdownMenuItem key={f.id} onClick={() => onPick(scope, f.id)}>
          {f.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuSubContent>
  </DropdownMenuSub>
);

export default ManageStudentsPage;
