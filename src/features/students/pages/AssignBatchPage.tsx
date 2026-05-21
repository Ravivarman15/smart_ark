import { useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  EmptyState,
  RiskBadge,
  StudentAvatar,
  StudentPageShell,
  type Column,
} from "../components";
import { useStudents } from "../hooks/useStudents";
import { useUpdateStudent } from "../hooks/useUpdateStudent";
import { useBatchOptions, useStandardOptions } from "../hooks/useStudentLookups";
import type { Student } from "../types/student.types";

const ALL = "all";
const UNASSIGNED = "__unassigned__";

const AssignBatchPage = () => {
  const [search, setSearch] = useState("");
  const [standardId, setStandardId] = useState(ALL);
  const [batchFilter, setBatchFilter] = useState(ALL);

  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const updateStudent = useUpdateStudent();

  const { data, isLoading } = useStudents({
    search: search || undefined,
    filters: { status: "active", ...(standardId !== ALL ? { standardId } : {}) },
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (batchFilter === ALL) return all;
    if (batchFilter === UNASSIGNED) return all.filter((s) => !s.batchId);
    return all.filter((s) => s.batchId === batchFilter);
  }, [data, batchFilter]);

  const eligibleBatches = (s: Student) =>
    batches.filter((b) => !s.standardId || !b.standardId || b.standardId === s.standardId);

  const columns: Column<Student>[] = [
    {
      key: "name",
      header: "Student",
      cell: (s) => (
        <div className="flex items-center gap-2.5">
          <StudentAvatar name={s.name} imageUrl={s.profileImageUrl} size="sm" />
          <div>
            <p className="font-medium text-foreground">{s.name}</p>
            <p className="text-[11px] text-muted-foreground">{s.standardName || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "risk", header: "Risk", cell: (s) => <RiskBadge risk={s.risk} /> },
    {
      key: "batch",
      header: "Assigned batch",
      cell: (s) => (
        <Select
          value={s.batchId ?? UNASSIGNED}
          onValueChange={(v) =>
            updateStudent.mutate({
              id: s.id,
              updates: { batchId: v === UNASSIGNED ? "" : v },
            })
          }
        >
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {eligibleBatches(s).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <StudentPageShell
      title="Assign Class / Batch"
      description="Place students into batches. Batch options respect each student's standard."
      icon={<Layers className="w-5 h-5" />}
      toolbar={
        <>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search students…"
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
              <SelectItem value={ALL}>All standards</SelectItem>
              {standards.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All batches</SelectItem>
              <SelectItem value={UNASSIGNED}>Unassigned only</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<Layers className="w-5 h-5" />}
            title="No students"
            description="No active students match the current filters."
          />
        }
      />
    </StudentPageShell>
  );
};

export default AssignBatchPage;
