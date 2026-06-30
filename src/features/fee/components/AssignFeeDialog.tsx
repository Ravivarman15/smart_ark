import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssignFeeStructure, useEligibleStudents } from "../hooks";
import { formatINR } from "../utils";
import type { FeeStructure } from "../types/fee.types";

interface LookupOption {
  id: string;
  name: string;
}

interface Props {
  structure: FeeStructure | null;
  standards: LookupOption[];
  onOpenChange: (open: boolean) => void;
}

const ALL = "__all__";

/**
 * Assign a fee structure to students — generates the per-student `student_fees`
 * ledger rows so the students appear in Fees Management.
 *
 * Pre-filters to the structure's standard, pre-checks every eligible student
 * (those without an existing fee record), and lets the operator search, switch
 * class, and uncheck before confirming. Students who already have a fee record
 * are shown disabled and can never be overwritten.
 */
export const AssignFeeDialog = ({ structure, standards, onOpenChange }: Props) => {
  const [standardId, setStandardId] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const assign = useAssignFeeStructure();
  const { data: students = [], isLoading } = useEligibleStudents(
    { standardId: standardId === ALL ? undefined : standardId },
    !!structure
  );

  // When a structure is opened, default the class filter to its standard.
  useEffect(() => {
    if (structure) {
      setStandardId(structure.standardId || ALL);
      setSearch("");
    }
  }, [structure]);

  // Each time the eligible list changes (open / class switch), pre-check every
  // student that does not already have a fee record.
  useEffect(() => {
    setSelected(new Set(students.filter((s) => !s.hasFee).map((s) => s.id)));
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.batchName ?? "").toLowerCase().includes(q)
    );
  }, [students, search]);

  const eligibleCount = students.filter((s) => !s.hasFee).length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectableFiltered = filtered.filter((s) => !s.hasFee);
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((s) => selected.has(s.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) selectableFiltered.forEach((s) => next.delete(s.id));
      else selectableFiltered.forEach((s) => next.add(s.id));
      return next;
    });

  const confirm = async () => {
    if (!structure || selected.size === 0) return;
    await assign.mutateAsync({
      structureId: structure.id,
      studentIds: Array.from(selected),
      totalAmount: structure.totalAmount,
      seatConfirmationAmount: structure.seatConfirmationAmount,
      firstPaymentAmount: structure.firstPaymentAmount,
      installmentCount: structure.installmentCount,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!structure} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Assign to Students — {structure?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 text-sm bg-accent/5 border border-accent/20 rounded-lg px-4 py-2.5">
          <span className="text-muted-foreground">
            Fee per student:{" "}
            <span className="font-semibold text-foreground">
              {formatINR(structure?.totalAmount ?? 0)}
            </span>
          </span>
          <span className="text-muted-foreground">
            {eligibleCount} eligible · {selected.size} selected
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={standardId}
            onChange={(e) => setStandardId(e.target.value)}
            className="bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value={ALL}>All classes</option>
            {standards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search student or batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background/50"
            />
          </div>
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/30 min-h-[12rem]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading students…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-6 text-center text-sm text-muted-foreground space-y-3">
              <p>No active students found for this class.</p>
              {standardId !== ALL && !search && (
                <p className="text-xs">
                  Imported students whose class didn&apos;t match a Setup standard have no
                  class assigned — they only show under{" "}
                  <button
                    type="button"
                    onClick={() => setStandardId(ALL)}
                    className="text-accent font-medium hover:underline"
                  >
                    All classes
                  </button>
                  .
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="flex items-center gap-3 px-4 py-2 bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  disabled={selectableFiltered.length === 0}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Select all eligible ({selectableFiltered.length})
              </label>
              {filtered.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-muted/20 ${
                    s.hasFee ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => !s.hasFee && toggle(s.id)}
                    disabled={s.hasFee}
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  <span className="flex-1 font-medium text-foreground">{s.name}</span>
                  {s.batchName && (
                    <span className="text-xs text-muted-foreground">{s.batchName}</span>
                  )}
                  {s.hasFee && (
                    <span className="flex items-center gap-1 text-[11px] text-green-600">
                      <CheckCircle2 className="w-3 h-3" /> Has fee
                    </span>
                  )}
                </label>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={selected.size === 0 || assign.isPending}>
            {assign.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Assigning…
              </>
            ) : (
              `Create ${selected.size} fee record${selected.size === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
