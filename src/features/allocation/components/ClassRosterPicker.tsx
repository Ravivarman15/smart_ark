import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClassStudentCandidates } from "../hooks/useClassStudents";
import type { ClassStudentCandidate } from "../types/allocation.types";

// ─────────────────────────────────────────────────────────────────────────────
// Class roster picker.
//
// Pick standards (one or more) → every eligible student loads ALREADY SELECTED
// → the coordinator deselects the ones who aren't in this class. The teacher's
// attendance sheet is then exactly this list.
//
// Starting fully selected is the deliberate default: the common case is "the
// whole standard, minus a few", and an empty list would make the safe path
// (everyone) the most laborious one.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  standardIds: string[];
  batchId?: string;
  /** Currently-selected student ids (controlled). */
  value: string[];
  onChange: (studentIds: string[]) => void;
  /**
   * Seed for an EXISTING class. When set, the picker restores this selection
   * instead of selecting everyone — reopening a class must not silently
   * re-add the students someone removed.
   */
  initialSelection?: string[];
}

/** Stable identity of a candidate list, so we reset only on a real change. */
const signatureOf = (rows: ClassStudentCandidate[]): string =>
  rows.map((r) => r.studentId).sort().join(",");

export const ClassRosterPicker: React.FC<Props> = ({
  standardIds,
  batchId,
  value,
  onChange,
  initialSelection,
}) => {
  const { data: candidates = [], isLoading } = useClassStudentCandidates(standardIds, batchId);
  const [search, setSearch] = useState("");
  const lastSignature = useRef<string | null>(null);
  const seeded = useRef(false);

  // Whenever the eligible set actually changes (different standards or batch),
  // select everyone in it. Keeping stale ids from a previous standard would
  // assign students who are no longer even on the list.
  useEffect(() => {
    const signature = signatureOf(candidates);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (candidates.length === 0) {
      onChange([]);
      return;
    }
    if (initialSelection && !seeded.current) {
      seeded.current = true;
      const eligible = new Set(candidates.map((c) => c.studentId));
      onChange(initialSelection.filter((id) => eligible.has(id)));
      return;
    }
    onChange(candidates.map((c) => c.studentId));
    // `onChange` is a render-stable setter from the parent form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, initialSelection]);

  const selected = useMemo(() => new Set(value), [value]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.studentName.toLowerCase().includes(q) ||
        (c.rollNumber ?? "").toLowerCase().includes(q),
    );
  }, [candidates, search]);

  // Grouped by standard so a multi-standard class reads as what it is.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: ClassStudentCandidate[] }>();
    for (const c of visible) {
      const key = c.standardId ?? "none";
      const entry = map.get(key) ?? { label: c.standardName ?? "Unassigned standard", rows: [] };
      entry.rows.push(c);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [visible]);

  const toggle = (studentId: string) => {
    onChange(
      selected.has(studentId)
        ? value.filter((id) => id !== studentId)
        : [...value, studentId],
    );
  };

  const setAllVisible = (on: boolean) => {
    const visibleIds = visible.map((v) => v.studentId);
    if (on) onChange([...new Set([...value, ...visibleIds])]);
    else onChange(value.filter((id) => !visibleIds.includes(id)));
  };

  if (standardIds.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
        Select a standard to choose which students are in this class.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-medium">
          <Users2 className="h-3.5 w-3.5" /> Students in this class
          <Badge variant="secondary" className="ml-1">
            {value.length} of {candidates.length}
          </Badge>
        </Label>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setAllVisible(true)}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAllVisible(false)}>
            Clear
          </Button>
        </div>
      </div>

      {candidates.length > 8 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search name or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Loading students…</p>
      ) : candidates.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No active students found in the selected standard(s)
          {batchId ? " for this batch" : ""}.
        </p>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.label} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label} · {g.rows.filter((r) => selected.has(r.studentId)).length}/{g.rows.length}
              </p>
              {g.rows.map((c) => (
                <label
                  key={c.studentId}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(c.studentId)}
                    onCheckedChange={() => toggle(c.studentId)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.studentName}</span>
                  {c.rollNumber && (
                    <span className="text-xs text-muted-foreground">#{c.rollNumber}</span>
                  )}
                  {c.batchName && (
                    <Badge variant="outline" className="text-[10px]">
                      {c.batchName}
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && value.length === 0 && (
        <p className="text-xs text-amber-600">
          No students selected — this class will fall back to the whole batch roster.
        </p>
      )}
    </div>
  );
};

export default ClassRosterPicker;
