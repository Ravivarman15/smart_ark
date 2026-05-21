import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, Power, RotateCcw, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  RiskBadge,
  StatTile,
  StatusBadge,
  StudentAvatar,
  StudentPageShell,
  type Column,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import { useDeactivateStudent } from "../hooks/useDeactivateStudent";
import { useUpdateStudent } from "../hooks/useUpdateStudent";
import { useBatchOptions, useStandardOptions } from "../hooks/useStudentLookups";
import type { Student } from "../types/student.types";

const ManageStudentsPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.replace(/\/+$/, "");

  const [search, setSearch] = useState("");
  const [standardId, setStandardId] = useState("all");
  const [batchId, setBatchId] = useState("all");
  const [status, setStatus] = useState("active");
  const [risk, setRisk] = useState("all");
  const [pendingToggle, setPendingToggle] = useState<Student | null>(null);

  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const deactivate = useDeactivateStudent();
  const updateStudent = useUpdateStudent();

  const filters = useMemo(
    () => ({
      status,
      ...(standardId !== "all" ? { standardId } : {}),
      ...(batchId !== "all" ? { batchId } : {}),
      ...(risk !== "all" ? { riskLevel: risk } : {}),
    }),
    [status, standardId, batchId, risk]
  );

  const { data, isLoading } = useStudents({ search: search || undefined, filters });
  const rows = data?.rows ?? [];

  const stats = useMemo(() => {
    const critical = rows.filter((s) => s.risk === "critical").length;
    const watch = rows.filter((s) => s.risk === "watch").length;
    return { total: data?.total ?? rows.length, critical, watch };
  }, [rows, data?.total]);

  const confirmToggle = () => {
    if (!pendingToggle) return;
    if (pendingToggle.active) {
      deactivate.mutate(pendingToggle.id);
    } else {
      updateStudent.mutate({ id: pendingToggle.id, updates: { active: true } });
    }
    setPendingToggle(null);
  };

  const columns: Column<Student>[] = [
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
    {
      key: "spi",
      header: "SPI",
      align: "center",
      cell: (s) => <span className="font-semibold">{s.spi || "—"}</span>,
    },
    { key: "risk", header: "Risk", cell: (s) => <RiskBadge risk={s.risk} /> },
    {
      key: "status",
      header: "Status",
      cell: (s) => <StatusBadge active={s.active} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (s) => (
        <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
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
      description="Search, filter and maintain every student record. Click a row to open the full profile."
      icon={<Users className="w-5 h-5" />}
      primaryAction={{
        label: "Add Student",
        onClick: () => navigate(`${base}/registration`),
      }}
      toolbar={
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 w-56"
            />
          </div>
          <Select value={standardId} onValueChange={setStandardId}>
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
          <Select value={batchId} onValueChange={setBatchId}>
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
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk</SelectItem>
              <SelectItem value="safe">Safe</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatTile label="Students" value={stats.total} icon={<Users className="w-4 h-4" />} />
        <StatTile label="Watch" value={stats.watch} tone="warning" />
        <StatTile label="Critical" value={stats.critical} tone="danger" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={isLoading}
        onRowClick={(s) => navigate(`${base}/${s.id}`)}
        empty={
          <EmptyState
            icon={<GraduationCap className="w-5 h-5" />}
            title="No students found"
            description="Adjust the filters above, or register your first student."
            action={{ label: "Add Student", onClick: () => navigate(`${base}/registration`) }}
          />
        }
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
    </StudentPageShell>
  );
};

export default ManageStudentsPage;
