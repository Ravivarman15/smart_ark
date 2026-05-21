import { useMemo, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, FormField, StudentPageShell } from "../components";
import { useStudents } from "../hooks/useStudents";
import { useStudentTransfers, useTransferStudents } from "../hooks/useStudentTransfer";
import {
  useAcademicYearOptions,
  useBatchOptions,
  useStandardOptions,
} from "../hooks/useStudentLookups";
import { validate, formatDateTime } from "../utils/helpers";
import { transferSchema } from "../schemas/student.schema";

const NONE = "__none__";

const StudentYearTransferPage = () => {
  const { data: standards = [] } = useStandardOptions();
  const { data: batches = [] } = useBatchOptions();
  const { data: years = [] } = useAcademicYearOptions();
  const { data: studentsData } = useStudents({ filters: { status: "active" } });
  const students = studentsData?.rows ?? [];
  const { data: history = [] } = useStudentTransfers();
  const transferMut = useTransferStudents();

  const [fromStandard, setFromStandard] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [toYear, setToYear] = useState("");
  const [toStandard, setToStandard] = useState(NONE);
  const [toBatch, setToBatch] = useState(NONE);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roster = useMemo(
    () =>
      fromStandard === "all"
        ? students
        : students.filter((s) => s.standardId === fromStandard),
    [students, fromStandard]
  );

  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allSelected = roster.length > 0 && selected.length === roster.length;

  const submit = () => {
    const candidate = {
      studentIds: selected,
      toAcademicYearId: toYear,
      toStandardId: toStandard === NONE ? "" : toStandard,
      toBatchId: toBatch === NONE ? "" : toBatch,
      note,
    };
    const result = validate(transferSchema, candidate);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    transferMut.mutate(result.data, {
      onSuccess: () => {
        setSelected([]);
        setNote("");
      },
    });
  };

  const yearName = (id?: string) => years.find((y) => y.id === id)?.name ?? "—";

  return (
    <StudentPageShell
      title="Student Year Transfer"
      description="Promote students to a new academic year with optional standard and batch reassignment. Every transfer is logged and reversible."
      icon={<ArrowRightLeft className="w-5 h-5" />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Roster */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-display font-semibold">Select students</h3>
            <Select value={fromStandard} onValueChange={setFromStandard}>
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
          </div>

          {roster.length === 0 ? (
            <EmptyState title="No active students" />
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground border-b border-border/40 pb-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) =>
                    setSelected(v ? roster.map((s) => s.id) : [])
                  }
                />
                Select all ({roster.length})
              </label>
              <div className="max-h-96 overflow-y-auto divide-y divide-border/30">
                {roster.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2.5 py-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.includes(s.id)}
                      onCheckedChange={() => toggle(s.id)}
                    />
                    <span className="text-sm">{s.name}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {s.standardName || "—"} · {s.batch || "No batch"}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Transfer target */}
        <div className="glass-card p-4 space-y-3 h-fit">
          <h3 className="text-sm font-display font-semibold">Transfer to</h3>
          <FormField label="Academic year" required error={errors.toAcademicYearId}>
            <Select value={toYear} onValueChange={setToYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Standard (optional)">
            <Select value={toStandard} onValueChange={setToStandard}>
              <SelectTrigger>
                <SelectValue placeholder="Keep current" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Keep current</SelectItem>
                {standards.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Batch (optional)">
            <Select value={toBatch} onValueChange={setToBatch}>
              <SelectTrigger>
                <SelectValue placeholder="Keep current" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Keep current</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Note">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <Button
            className="w-full"
            disabled={transferMut.isPending}
            onClick={submit}
          >
            {transferMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Transfer {selected.length} student{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {/* History */}
      <div className="glass-card p-0 overflow-hidden mt-4">
        <div className="px-5 py-3 border-b border-border/50">
          <h3 className="text-sm font-display font-semibold">Transfer history</h3>
        </div>
        {history.length === 0 ? (
          <EmptyState title="No transfers yet" description="Completed transfers are logged here." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Student</th>
                <th className="px-5 py-2.5 text-left font-medium">Year</th>
                <th className="px-5 py-2.5 text-left font-medium">When</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {history.slice(0, 30).map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5 font-medium">{t.studentName ?? "—"}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {yearName(t.fromAcademicYearId)} → {yearName(t.toAcademicYearId)}
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {formatDateTime(t.transferredAt)}
                  </td>
                  <td className="px-5 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        t.status === "active"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.status === "active" ? "Active" : "Rolled back"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </StudentPageShell>
  );
};

export default StudentYearTransferPage;
