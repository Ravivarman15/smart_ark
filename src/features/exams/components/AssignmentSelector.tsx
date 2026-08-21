import { useMemo, useState } from "react";
import { Check, Globe, Loader2, Search, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExamLookups } from "../hooks";
import { useStudentRoster } from "../hooks/useStudentRoster";
import {
  describeTargeting,
  normaliseDrafts,
  summarise,
} from "../utils/assignmentTargeting";
import type { AssignmentDraft, AssignmentScope } from "../types/mcqExam.types";

// ─────────────────────────────────────────────────────────────────────────────
// WHO GETS THIS TEST
//
// One screen for the whole audience: everyone, whole standards, whole batches,
// or named students — in any combination, as a union.
//
// ┌── THE NUMBER IS THE POINT ─────────────────────────────────────────────┐
// │ The failure this replaces is silent: a teacher assigns a test to a     │
// │ standard that has no batches yet, publishes, and finds out on exam day │
// │ that it reached nobody. So the live count is the loudest thing here,   │
// │ and "no students match this selection yet" is said in words rather     │
// │ than shown as a 0 that reads like a loading state.                     │
// │                                                                        │
// │ It is still only a PREVIEW. The check that admits a student runs on    │
// │ the server on every attempt — see _shared/testEngine.ts.               │
// └────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  value: AssignmentDraft[];
  onChange: (next: AssignmentDraft[]) => void;
}

export const AssignmentSelector = ({ value, onChange }: Props) => {
  const { data: lookups } = useExamLookups();
  const standards = lookups?.standards ?? [];
  const batches = lookups?.batches ?? [];
  const { data: roster = [], isLoading: rosterLoading } = useStudentRoster();
  const [search, setSearch] = useState("");

  const summary = useMemo(() => summarise(value, roster), [value, roster]);

  const has = (scopeType: AssignmentScope, scopeId: string) =>
    value.some((d) => d.scopeType === scopeType && d.scopeId === scopeId);

  const toggle = (scopeType: AssignmentScope, scopeId: string, scopeName: string) => {
    const next = has(scopeType, scopeId)
      ? value.filter((d) => !(d.scopeType === scopeType && d.scopeId === scopeId))
      : [...value, { scopeType, scopeId, scopeName }];
    onChange(normaliseDrafts(next));
  };

  const setEveryone = (on: boolean) => {
    // Choosing "everyone" clears the rest rather than keeping it as dead
    // config a later reader has to reason about. Turning it off returns an
    // empty selection, not the previous one — restoring choices someone did
    // not make is worse than making them choose again.
    onChange(on ? normaliseDrafts([{ scopeType: "all", scopeId: "", scopeName: "Everyone" }]) : []);
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return roster
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.rollNumber ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [roster, search]);

  const namedStudents = value.filter((d) => d.scopeType === "student");

  return (
    <div className="space-y-5">
      {/* ── Everyone ───────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setEveryone(!summary.everyone)}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition",
          summary.everyone
            ? "border-accent bg-accent/5"
            : "border-border/70 hover:border-border",
        )}
      >
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            summary.everyone ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
          )}
        >
          <Globe className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Everyone</p>
          <p className="text-[11px] text-muted-foreground">
            Every active student in your institution
          </p>
        </div>
        {summary.everyone && <Check className="w-4 h-4 text-accent shrink-0" />}
      </button>

      {!summary.everyone && (
        <>
          {/* ── Standards ─────────────────────────────────────────────────── */}
          <Group label="Classes">
            {standards.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={has("standard", s.id)}
                onClick={() => toggle("standard", s.id, s.name)}
              />
            ))}
            {standards.length === 0 && <Empty>No classes configured yet</Empty>}
          </Group>

          {/* ── Batches ───────────────────────────────────────────────────── */}
          <Group label="Batches / sections">
            {batches.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                selected={has("batch", b.id)}
                onClick={() => toggle("batch", b.id, b.name)}
              />
            ))}
            {batches.length === 0 && <Empty>No batches configured yet</Empty>}
          </Group>

          {/* ── Named students ────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Specific students
            </p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or roll number…"
                className="pl-9"
              />
            </div>

            {rosterLoading && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading students…
              </p>
            )}

            {search.trim().length >= 2 && matches.length === 0 && !rosterLoading && (
              <Empty>No student matches “{search.trim()}”</Empty>
            )}

            {matches.length > 0 && (
              <div className="mt-2 rounded-lg border border-border/70 divide-y divide-border/60 max-h-56 overflow-y-auto">
                {matches.map((s) => {
                  const picked = has("student", s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle("student", s.id, s.name)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[s.rollNumber, s.batchName].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      {picked && <Check className="w-4 h-4 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {namedStudents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {namedStudents.map((d) => (
                  <span
                    key={d.scopeId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 text-accent text-xs px-2.5 py-1"
                  >
                    {d.scopeName || "Student"}
                    <button
                      type="button"
                      aria-label={`Remove ${d.scopeName}`}
                      onClick={() => toggle("student", d.scopeId, d.scopeName)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── The count ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-muted/40 p-3.5 flex items-start gap-3">
        <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium",
              summary.eligible === 0 && !summary.everyone
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {describeTargeting(summary)}
          </p>
          <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
            {summary.inactive > 0 && (
              // Named rather than dropped: a teacher who selected a class
              // containing deactivated students should know why the number is
              // lower than the class list they were looking at.
              <p>
                {summary.inactive} selected student
                {summary.inactive === 1 ? " is" : "s are"} deactivated and will not
                receive it.
              </p>
            )}
            {summary.redundant > 0 && (
              // The commonest confusion: selecting a class and then also
              // searching for three of its students, and wondering why the
              // count did not move.
              <p>
                {summary.redundant} named student
                {summary.redundant === 1 ? " is" : "s are"} already covered by a
                class or batch you selected.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Bits ─────────────────────────────────────────────────────────────────────
const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const Chip = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant={selected ? "default" : "outline"}
    size="sm"
    className="h-7 rounded-full text-xs"
    onClick={onClick}
    aria-pressed={selected}
  >
    {selected && <Check className="w-3 h-3 mr-1" />}
    {label}
  </Button>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-muted-foreground py-1">{children}</p>
);
