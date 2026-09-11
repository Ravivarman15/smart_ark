import React, { useMemo } from "react";
import { GraduationCap, Plus, X, AlertTriangle, CheckCircle2, ClipboardEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Batch, Standard, Subject } from "@/features/setup/types/setup.types";
import type { Section } from "../types/allocation.types";
import {
  ALL_BATCHES,
  batchesForStandard,
  draftMissingLabel,
  draftSubjectIds,
  firstIncompleteDraft,
  isDraftComplete,
  newDraft,
  ownSubjectsForStandard,
  sectionsForStandard,
  subjectsForStandard,
  type DraftOptions,
  type PlanDraft,
} from "../utils/standardPlan";

// ─────────────────────────────────────────────────────────────────────────────
// STANDARDS & SUBJECTS — one standard at a time, finished before the next.
//
// Phase 4: each standard may now have MULTIPLE subjects selected (toggle chips),
// plus a "📝 Test" mode that replaces subjects with a named test entry. Test and
// subject modes are mutually exclusive per standard.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Standards this coordinator may schedule (already scoped by the caller). */
  standards: Standard[];
  /** UNSCOPED lists — narrowed per standard here, including institute-wide rows. */
  subjects: Subject[];
  batches: Batch[];
  sections: Section[];
  value: PlanDraft[];
  onChange: (next: PlanDraft[]) => void;
}

export const StandardPlanBuilder: React.FC<Props> = ({
  standards,
  subjects,
  batches,
  sections,
  value,
  onChange,
}) => {
  const nameOf = useMemo(() => {
    const byId = new Map(standards.map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? "Standard";
  }, [standards]);

  const optionsFor = useMemo(
    () =>
      (standardId: string): DraftOptions => ({
        hasSubjects: subjectsForStandard(subjects, standardId).length > 0,
        hasBatches: batchesForStandard(batches, standardId).length > 0,
      }),
    [subjects, batches],
  );

  const blocking = firstIncompleteDraft(value, optionsFor);
  const chosen = new Set(value.map((d) => d.standardId));
  const remaining = standards.filter((s) => !chosen.has(s.id));

  const patch = (standardId: string, next: Partial<PlanDraft>) =>
    onChange(value.map((d) => (d.standardId === standardId ? { ...d, ...next } : d)));

  const add = (standardId: string) => onChange([...value, newDraft(standardId)]);
  const drop = (standardId: string) =>
    onChange(value.filter((d) => d.standardId !== standardId));

  if (standards.length === 0) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Standards &amp; subjects</Label>
        <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          No standards in your scope. Ask Management to assign them on the Staff Allocation
          page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-medium">
          <GraduationCap className="h-3.5 w-3.5" /> Standards &amp; subjects
          {value.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {value.length}
            </Badge>
          )}
        </Label>
        {value.length > 1 && (
          <span className="text-[11px] text-muted-foreground">
            Each standard keeps its own subjects.
          </span>
        )}
      </div>

      {value.map((draft, i) => (
        <PlanCard
          key={draft.standardId}
          draft={draft}
          index={i}
          label={nameOf(draft.standardId)}
          multi={value.length > 1}
          subjects={subjectsForStandard(subjects, draft.standardId)}
          ownSubjectCount={ownSubjectsForStandard(subjects, draft.standardId).length}
          batches={batchesForStandard(batches, draft.standardId)}
          sections={sectionsForStandard(sections, draft.standardId)}
          complete={isDraftComplete(draft, optionsFor(draft.standardId))}
          missingLabel={draftMissingLabel(draft, optionsFor(draft.standardId))}
          onPatch={(next) => patch(draft.standardId, next)}
          onRemove={() => drop(draft.standardId)}
        />
      ))}

      {/* ── Add the next standard ──────────────────────────────────────────
          Kept as chips rather than a dropdown: the list is short, every
          option is visible at a glance, and on a phone a wrapped chip row is
          a bigger tap target than a select. */}
      {remaining.length > 0 && (
        <div className="rounded-md border border-dashed px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              {value.length === 0 ? "Pick a standard" : "Add another standard"}
            </span>
            {blocking && (
              // Name the standard and what it needs. "Complete the previous
              // entry" would make the operator hunt for which one.
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Choose {draftMissingLabel(blocking, optionsFor(blocking.standardId)) ?? "a subject"} for{" "}
                <strong>{nameOf(blocking.standardId)}</strong> first
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {remaining.map((s) => (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={!!blocking}
                onClick={() => add(s.id)}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  draft: PlanDraft;
  index: number;
  label: string;
  multi: boolean;
  subjects: Subject[];
  ownSubjectCount: number;
  batches: Batch[];
  sections: Section[];
  complete: boolean;
  missingLabel: string | null;
  onPatch: (next: Partial<PlanDraft>) => void;
  onRemove: () => void;
}

const PlanCard: React.FC<CardProps> = ({
  draft,
  index,
  label,
  multi,
  subjects,
  ownSubjectCount,
  batches,
  sections,
  complete,
  missingLabel,
  onPatch,
  onRemove,
}) => {
  const selectedSubjectIds = useMemo(
    () => draftSubjectIds(draft),
    [draft.subjectIds, draft.subjectId],
  );

  /** Toggle a subject in/out of the multi-select. */
  const toggleSubject = (id: string) => {
    const next = selectedSubjectIds.includes(id)
      ? selectedSubjectIds.filter((x) => x !== id)
      : [...selectedSubjectIds, id];
    onPatch({
      subjectIds: next,
      // Keep the deprecated scalar in sync for anything that still reads it.
      subjectId: next[0] ?? "",
    });
  };

  /** Toggle test mode on/off. Clears subjects when entering test mode. */
  const toggleTest = () => {
    if (draft.isTest) {
      // Exit test mode
      onPatch({ isTest: false, testName: "" });
    } else {
      // Enter test mode — clear subjects
      onPatch({ isTest: true, subjectIds: [], subjectId: "", testName: "" });
    }
  };

  return (
    <div
      className={`rounded-md border px-3 py-2.5 transition-colors ${
        complete ? "" : "border-amber-500/50 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {complete ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="truncate text-sm font-medium">{label}</span>
          {multi && index === 0 && (
            <Badge variant="secondary" className="text-[9px] uppercase">
              primary
            </Badge>
          )}
          {draft.isTest && (
            <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 text-[9px] uppercase">
              test
            </Badge>
          )}
          {selectedSubjectIds.length > 1 && !draft.isTest && (
            <Badge variant="secondary" className="text-[9px]">
              {selectedSubjectIds.length} subjects
            </Badge>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-2 space-y-2.5">
        {/* ── Mode Selection: Subjects vs Test ────────────────────────── */}
        <ChipField label="Class type">
          <Chip
            on={!draft.isTest}
            onClick={() => draft.isTest && onPatch({ isTest: false, testName: "" })}
          >
            Subjects
          </Chip>
          <Chip
            on={!!draft.isTest}
            onClick={toggleTest}
          >
            <ClipboardEdit className="h-3 w-3 mr-1" />
            📝 Test
          </Chip>
        </ChipField>

        {/* ── Test name input (only when test mode is active) ─────────── */}
        {draft.isTest && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Test name</Label>
            <Input
              value={draft.testName ?? ""}
              onChange={(e) => onPatch({ testName: e.target.value })}
              placeholder="e.g. Unit Test 2 — Maths"
              className="h-8 text-sm"
              autoFocus
            />
            {!draft.testName?.trim() && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Enter a test name to continue.
              </p>
            )}
          </div>
        )}

        {/* ── Subject chips (hidden when in test mode) ────────────────── */}
        {!draft.isTest && (
          <ChipField label="Subject" hint={`for ${label} (select one or more)`}>
            {subjects.length === 0 ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                No subjects for {label}. Add them in Setup → Manage Subjects.
              </p>
            ) : (
              subjects.map((s) => (
                <Chip
                  key={s.id}
                  on={selectedSubjectIds.includes(s.id)}
                  onClick={() => toggleSubject(s.id)}
                >
                  {s.name}
                  {!s.standardId && ownSubjectCount > 0 && (
                    <span className="ml-1 opacity-60">· all</span>
                  )}
                </Chip>
              ))
            )}
          </ChipField>
        )}

        {/* ── Batch (shown in both modes) ─────────────────────────────── */}
        <ChipField label="Batch">
          {batches.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No batches for {label} — the whole standard is used.
            </p>
          ) : (
            <>
              <Chip
                on={draft.batchId === ALL_BATCHES}
                onClick={() => onPatch({ batchId: ALL_BATCHES })}
              >
                All batches
              </Chip>
              {batches.map((b) => (
                <Chip
                  key={b.id}
                  on={draft.batchId === b.id}
                  onClick={() => onPatch({ batchId: b.id })}
                >
                  {b.name}
                </Chip>
              ))}
            </>
          )}
        </ChipField>

        {sections.length > 0 && (
          <ChipField label="Section" hint="optional">
            {sections.map((sec) => (
              <Chip
                key={sec.id}
                on={draft.sectionId === sec.id}
                onClick={() =>
                  onPatch({ sectionId: draft.sectionId === sec.id ? "" : sec.id })
                }
              >
                {sec.name}
              </Chip>
            ))}
          </ChipField>
        )}
      </div>

      {/* Actionable hint when incomplete */}
      {missingLabel && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Select {missingLabel} to continue
        </p>
      )}
    </div>
  );
};

/** A labelled row of wrapping chips. Wraps at every width, so it needs no
 *  breakpoints of its own. */
const ChipField: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">
      {label}
      {hint && <span className="ml-1 opacity-70">{hint}</span>}
    </Label>
    <div className="flex flex-wrap items-center gap-1.5">{children}</div>
  </div>
);

const Chip: React.FC<{
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ on, onClick, children }) => (
  <Button
    type="button"
    size="sm"
    variant={on ? "default" : "outline"}
    className="h-7 px-2.5 text-xs font-normal"
    onClick={onClick}
  >
    {children}
  </Button>
);

export default StandardPlanBuilder;
