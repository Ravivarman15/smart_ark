// ──────────────────────────────────────────────────────────────────────────────
// EDIT SCHEDULE DIALOG
//
// A full-featured edit dialog for modifying an existing class schedule.
// Pre-fills every field from the schedule being edited and allows authorized
// users (management, admin, coordinator with scoped access) to change any
// combination of: teacher, standard/subject/batch, timing, students, mode,
// room/meeting link, recurrence, remarks, and academic dimensions.
//
// Reuses the same form structure as the create dialog, the same
// StandardPlanBuilder and ClassRosterPicker, and the same validation schema.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTeachers,
  useStandards,
  useSubjects,
  useBatches,
  useCampuses,
  useAcademicYears,
} from "@/features/setup/hooks";
import {
  useScheduleMutations,
  useMyManagedStaffIds,
  useMyStandardIds,
  useSections,
} from "@/features/allocation/hooks";
import { ClassRosterPicker } from "./ClassRosterPicker";
import { StandardPlanBuilder } from "./StandardPlanBuilder";
import { scheduleSchema } from "../schemas/schedule.schema";
import {
  DAY_LABELS,
  academicYearOf,
  expandRecurrence,
} from "../utils/recurrence";
import {
  batchByStandard,
  draftMissingLabel,
  draftsToInput,
  firstIncompleteDraft,
  isPlanComplete,
  batchesForStandard,
  subjectsForStandard,
  effectivePlan,
  type DraftOptions,
  type PlanDraft,
} from "../utils/standardPlan";
import type {
  ClassMode,
  ClassSchedule,
  RepeatPattern,
  ScheduleInput,
} from "../types/allocation.types";
import { useAssignedStudents } from "../hooks/useClassStudents";

const TERM_OPTIONS = ["Term 1", "Term 2", "Term 3", "Annual"];

/** Duration label from start/end strings. */
const durationLabel = (start: string, end: string): string => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (!Number.isFinite(mins) || mins <= 0) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

interface EditScheduleDialogProps {
  schedule: ClassSchedule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditScheduleDialog: React.FC<EditScheduleDialogProps> = ({
  schedule,
  open,
  onOpenChange,
}) => {
  const { user } = useAuth();
  const isOverride = user?.role === "management" || user?.role === "admin";

  // ── Data Sources ───────────────────────────────────────────────────────
  const { data: allTeachers = [] } = useTeachers();
  const { data: standards = [] } = useStandards();
  const { data: campuses = [] } = useCampuses();
  const { data: academicYears = [] } = useAcademicYears();
  const { data: managedStaffIds = [] } = useMyManagedStaffIds();
  const { data: myStandardIds = [] } = useMyStandardIds();
  const { data: allSubjects = [] } = useSubjects();
  const { data: allBatches = [] } = useBatches();
  const { data: allSections = [] } = useSections();

  // Load existing students for this class
  const { data: existingStudents = [] } = useAssignedStudents(
    open ? schedule?.id : undefined,
  );

  const { update } = useScheduleMutations();

  // Scoped teachers/standards (same logic as create dialog)
  const teachers = useMemo(
    () =>
      isOverride
        ? allTeachers.filter((t) => t.role === "teacher" || t.role === "coordinator")
        : allTeachers.filter((t) => managedStaffIds.includes(t.id)),
    [allTeachers, managedStaffIds, isOverride],
  );
  const scopedStandards = useMemo(
    () => (isOverride ? standards : standards.filter((s) => myStandardIds.includes(s.id))),
    [standards, myStandardIds, isOverride],
  );

  const standardName = useMemo(() => {
    const byId = new Map(standards.map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? "Standard";
  }, [standards]);

  // ── Form State ─────────────────────────────────────────────────────────
  type FormState = {
    teacherId: string;
    plan: PlanDraft[];
    studentIds: string[];
    scheduleDate: string;
    startTime: string;
    endTime: string;
    mode: ClassMode;
    room: string;
    meetingLink: string;
    remarks: string;
    repeatWeekly: boolean;
    repeatUntil: string;
    holidaySkip: boolean;
    isExtra: boolean;
    extraReason: string;
    academicYear: string;
    term: string;
    campusId: string;
    department: string;
    repeatPattern: RepeatPattern;
    repeatDays: number[];
  };

  const [form, setForm] = useState<FormState>({
    teacherId: "",
    plan: [],
    studentIds: [],
    scheduleDate: "",
    startTime: "09:00",
    endTime: "10:00",
    mode: "offline",
    room: "",
    meetingLink: "",
    remarks: "",
    repeatWeekly: false,
    repeatUntil: "",
    holidaySkip: true,
    isExtra: false,
    extraReason: "",
    academicYear: "",
    term: "",
    campusId: "",
    department: "",
    repeatPattern: "none",
    repeatDays: [],
  });

  // Pre-fill form when schedule changes or dialog opens
  useEffect(() => {
    if (!schedule || !open) return;

    const plan = effectivePlan(schedule);
    const planDrafts: PlanDraft[] = plan.map((entry) => ({
      standardId: entry.standardId,
      subjectId: entry.subjectId ?? "",
      subjectIds: entry.subjectIds ?? (entry.subjectId ? [entry.subjectId] : []),
      isTest: entry.isTest ?? false,
      testName: entry.testName ?? "",
      batchId: entry.batchId ?? "",
      sectionId: entry.sectionId ?? "",
    }));

    setForm({
      teacherId: schedule.teacherId ?? "",
      plan: planDrafts,
      studentIds: [], // will be filled from existingStudents effect
      scheduleDate: schedule.scheduleDate,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      mode: schedule.mode,
      room: schedule.room ?? "",
      meetingLink: schedule.meetingLink ?? "",
      remarks: schedule.remarks ?? "",
      repeatWeekly: schedule.repeatWeekly,
      repeatUntil: schedule.repeatUntil ?? "",
      holidaySkip: schedule.holidaySkip,
      isExtra: schedule.isExtra,
      extraReason: schedule.extraReason ?? "",
      academicYear: schedule.academicYear ?? academicYearOf(schedule.scheduleDate),
      term: schedule.term ?? "",
      campusId: schedule.campusId ?? "",
      department: schedule.department ?? "",
      repeatPattern: schedule.repeatPattern ?? "none",
      repeatDays: schedule.repeatDays ?? [],
    });
  }, [schedule, open]);

  // Fill student IDs once loaded
  useEffect(() => {
    if (existingStudents.length > 0 && open) {
      setForm((f) => ({
        ...f,
        studentIds: existingStudents.map((s) => s.studentId),
      }));
    }
  }, [existingStudents, open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Derived plan values
  const derived = useMemo(() => draftsToInput(form.plan), [form.plan]);
  const planOptions = useMemo(
    () =>
      (standardId: string): DraftOptions => ({
        hasSubjects: subjectsForStandard(allSubjects, standardId).length > 0,
        hasBatches: batchesForStandard(allBatches, standardId).length > 0,
      }),
    [allSubjects, allBatches],
  );
  const planComplete = isPlanComplete(form.plan, planOptions);
  const planBlocker = firstIncompleteDraft(form.plan, planOptions);

  const handleSubmit = async () => {
    if (!schedule) return;

    if (planBlocker) {
      const missing = draftMissingLabel(planBlocker, planOptions(planBlocker.standardId));
      toast.error(
        `Choose ${missing ?? "a subject"} for ${standardName(
          planBlocker.standardId,
        )} before saving`,
      );
      return;
    }

    const parsed = scheduleSchema.safeParse({ ...form, ...derived });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }

    try {
      await update.mutateAsync({
        id: schedule.id,
        input: parsed.data as unknown as ScheduleInput,
      });
      toast.success("Class schedule updated successfully");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update schedule");
    }
  };

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Class Schedule
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Modify any field below and save. Changes take effect immediately and
            notify affected staff.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* ── Academic scope ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Academic year">
              <Select value={form.academicYear} onValueChange={(v) => set("academicYear", v)}>
                <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  {academicYears.length === 0 ? (
                    <SelectItem value={academicYearOf(form.scheduleDate)}>
                      {academicYearOf(form.scheduleDate)}
                    </SelectItem>
                  ) : (
                    academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.name}>{y.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Term">
              <Select value={form.term} onValueChange={(v) => set("term", v)}>
                <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                <SelectContent>
                  {TERM_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Campus">
              <Select value={form.campusId} onValueChange={(v) => set("campusId", v)}>
                <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* ── Teacher & Department ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Teacher">
              <Select value={form.teacherId} onValueChange={(v) => set("teacherId", v)}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Input
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Defaults to the teacher's department"
              />
            </Field>
          </div>

          {/* ── Standards & Subjects ─────────────────────────────────── */}
          <StandardPlanBuilder
            standards={scopedStandards}
            subjects={allSubjects}
            batches={allBatches}
            sections={allSections}
            value={form.plan}
            onChange={(plan) => set("plan", plan)}
          />

          {/* ── Student Roster ───────────────────────────────────────── */}
          <ClassRosterPicker
            standardIds={derived.standardIds}
            batchByStandard={batchByStandard(derived.standardPlan)}
            value={form.studentIds}
            onChange={(studentIds) => set("studentIds", studentIds)}
          />

          {/* ── Date & Time ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Date">
              <Input type="date" value={form.scheduleDate} onChange={(e) => set("scheduleDate", e.target.value)} />
            </Field>
            <Field label="Start">
              <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </Field>
            <Field label="End">
              <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </Field>
          </div>

          {/* Duration display */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            Duration:{" "}
            <span className="font-medium">
              {durationLabel(form.startTime, form.endTime)}
            </span>
            <span className="text-xs text-muted-foreground">
              {" "}· calculated automatically and used for teaching hours &amp; salary
            </span>
          </div>

          {/* ── Mode / Room ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Class type">
              <Select value={form.mode} onValueChange={(v) => set("mode", v as ClassMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.mode === "offline" ? (
              <Field label="Room">
                <Input value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Room" />
              </Field>
            ) : (
              <Field label="Meeting link">
                <Input value={form.meetingLink} onChange={(e) => set("meetingLink", e.target.value)} placeholder="https://meet.google.com/…" />
              </Field>
            )}
          </div>

          {form.mode === "hybrid" && (
            <Field label="Room (hybrid also needs a physical room)">
              <Input value={form.room} onChange={(e) => set("room", e.target.value)} placeholder="Room" />
            </Field>
          )}

          {/* ── Extra class reason ───────────────────────────────────── */}
          {form.isExtra && (
            <Field label="Reason for extra class">
              <Input value={form.extraReason} onChange={(e) => set("extraReason", e.target.value)} placeholder="e.g. revision before exam" />
            </Field>
          )}

          {/* ── Remarks ──────────────────────────────────────────────── */}
          <Field label="Remarks">
            <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder="Optional" />
          </Field>

          {/* ── Recurrence ───────────────────────────────────────────── */}
          {!form.isExtra && (
            <div className="space-y-3 rounded-md border px-3 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Repeat">
                  <Select
                    value={form.repeatPattern}
                    onValueChange={(v) => {
                      const p = v as RepeatPattern;
                      set("repeatPattern", p);
                      set("repeatWeekly", p === "weekly");
                      if (p === "none") set("repeatDays", []);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Does not repeat</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.repeatPattern !== "none" && (
                  <Field label="Repeat until">
                    <Input
                      type="date"
                      value={form.repeatUntil}
                      onChange={(e) => set("repeatUntil", e.target.value)}
                    />
                  </Field>
                )}
              </div>

              {(form.repeatPattern === "daily" || form.repeatPattern === "weekly") && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Days {form.repeatPattern === "weekly" && "(leave empty to repeat on the start day)"}
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {DAY_LABELS.map((d, i) => {
                      const on = form.repeatDays.includes(i);
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() =>
                            set(
                              "repeatDays",
                              on
                                ? form.repeatDays.filter((x) => x !== i)
                                : [...form.repeatDays, i].sort((a, b) => a - b),
                            )
                          }
                        >
                          {d}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {form.repeatPattern !== "none" && form.repeatUntil && (
                <p className="text-xs text-muted-foreground">
                  Creates{" "}
                  <span className="font-medium text-foreground">
                    {expandRecurrence({
                      scheduleDate: form.scheduleDate,
                      repeatPattern: form.repeatPattern,
                      repeatDays: form.repeatDays,
                      repeatUntil: form.repeatUntil,
                    }).length}
                  </span>{" "}
                  classes ·{" "}
                  <span className="font-medium text-foreground">
                    {(
                      (expandRecurrence({
                        scheduleDate: form.scheduleDate,
                        repeatPattern: form.repeatPattern,
                        repeatDays: form.repeatDays,
                        repeatUntil: form.repeatUntil,
                      }).length *
                        ((Number(form.endTime.split(":")[0]) * 60 +
                          Number(form.endTime.split(":")[1])) -
                          (Number(form.startTime.split(":")[0]) * 60 +
                            Number(form.startTime.split(":")[1])))) /
                      60
                    ).toFixed(1)}
                    h
                  </span>{" "}
                  total allocated hours
                </p>
              )}

              <div className="flex items-center gap-2">
                <Switch checked={form.holidaySkip} onCheckedChange={(v) => set("holidaySkip", v)} />
                <Label className="text-sm">Skip holidays</Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={update.isPending || !planComplete}>
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);
