import React, { useMemo } from "react";
import { GraduationCap, Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Batch, Standard, Subject } from "@/features/setup/types/setup.types";
import type { Section } from "../types/allocation.types";
import {
  ALL_BATCHES,
  batchesForStandard,
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
// The old control was a row of toggle chips plus ONE subject dropdown for the
// whole class. Two things were wrong with it and they compounded:
//
//   • the subject list was the union across every selected standard, so after
//     picking 2nd STD and 3rd STD you were offered 3rd STD's subjects while
//     standing on 2nd STD, and
//   • whichever one you picked was then saved as THE subject of the class — for
//     every standard in the room.
//
// A teacher taking two standards in one period teaches each of them a different
// subject. That is the normal case, not an edge case, and the form could not
// express it at all.
//
// So: adding a standard opens a card for that standard, and the next standard
// cannot be added until this one has its subject and batch. The gate is not
// bureaucracy — it is what makes "which standard is this subject for?" have an
// answer at the moment the question is asked, instead of at submit time when
// the operator has forgotten the order they clicked things in.
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
            Each standard keeps its own subject.
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
                Choose {blocking.subjectId ? "a batch" : "a subject"} for{" "}
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
  onPatch,
  onRemove,
}) => (
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

    {/* ── Choices, shown rather than hidden ──────────────────────────────
        These were dropdowns. A Radix Select portals its list over a dialog
        that is itself scrollable, and the shadcn viewport is pinned to the
        trigger's height — so an eleven-subject list opens as a one-row sliver
        and reads as "there is no dropdown for selecting the subject".

        A handful of chips is the right control regardless: every option is
        visible without a second interaction, the tap targets are finger-sized
        on a phone instead of a 36px popup row, and it matches how standards
        are already picked directly above. Nothing here has enough options to
        justify hiding them. */}
    <div className="mt-2 space-y-2.5">
      <ChipField label="Subject" hint={`for ${label}`}>
        {subjects.length === 0 ? (
          // Name the standard that is unconfigured. "No subjects" alone sends a
          // coordinator to Setup without telling them what to add there.
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            No subjects for {label}. Add them in Setup → Manage Subjects.
          </p>
        ) : (
          subjects.map((s) => (
            <Chip
              key={s.id}
              on={draft.subjectId === s.id}
              onClick={() => onPatch({ subjectId: s.id })}
            >
              {s.name}
              {/* An institute-wide subject appears under every standard, so say
                  so — otherwise the same name under two standards looks like
                  duplicate data. */}
              {!s.standardId && ownSubjectCount > 0 && (
                <span className="ml-1 opacity-60">· all</span>
              )}
            </Chip>
          ))
        )}
      </ChipField>

      <ChipField label="Batch">
        {batches.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No batches for {label} — the whole standard is used.
          </p>
        ) : (
          <>
            {/* An explicit choice, not a blank. The operator has to DECIDE which
                children this standard means, and "all of them" is a valid
                decision that an empty control cannot express. */}
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
              // Re-tapping the chosen section clears it. A section is optional,
              // and without this there is no way back to "no section" once one
              // has been tapped.
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
  </div>
);

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
