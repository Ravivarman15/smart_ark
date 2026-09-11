import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Plus,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  BarChart3,
  UserCog,
  Lock,
  Unlock,
  CalendarX,
  ArrowRightLeft,
  Users2,
  Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
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
  useSchedules,
  useScheduleMutations,
  useScheduleOps,
  useMyManagedStaffIds,
  useMyStandardIds,
  useSections,
  useTeachingHours,
  useLeaveImpact,
  useTimetableLocks,
  useTimetableLockMutations,
  useClassStudentCounts,
} from "@/features/allocation/hooks";
import { ClassRosterDialog } from "@/features/allocation/components/ClassRosterDialog";
import { ClassRosterPicker } from "@/features/allocation/components/ClassRosterPicker";
import { scheduleSchema } from "@/features/allocation/schemas/schedule.schema";
import {
  DAY_LABELS,
  academicYearOf,
  expandRecurrence,
} from "@/features/allocation/utils/recurrence";
import {
  localIso,
  resolveRange,
  type RangePreset,
} from "@/features/allocation/utils/scheduleView";
import {
  batchByStandard,
  draftMissingLabel,
  draftsToInput,
  firstIncompleteDraft,
  isPlanComplete,
  batchesForStandard,
  subjectsForStandard,
  type DraftOptions,
  type PlanDraft,
} from "@/features/allocation/utils/standardPlan";
import { StandardPlanBuilder } from "@/features/allocation/components/StandardPlanBuilder";
import { ScheduleRangeBar } from "@/features/allocation/components/ScheduleRangeBar";
import { ScheduleDayList } from "@/features/allocation/components/ScheduleDayList";
import type {
  ClassMode,
  ClassSchedule,
  RepeatPattern,
  ScheduleInput,
  ScheduleStatus,
} from "@/features/allocation/types/allocation.types";

/**
 * Week range [Mon..Sun] around today.
 *
 * Built from LOCAL calendar fields via `resolveRange`. The previous version
 * used `toISOString()`, which is UTC — in IST that shifted the whole week a day
 * earlier for the first five and a half hours of every day, and made the
 * workload card disagree with the class list it sat above.
 */
const weekRange = () => {
  const r = resolveRange("week");
  return { from: r.from!, to: r.to! };
};

const todayIso = localIso();

const emptyForm = {
  teacherId: "",
  /**
   * One entry per standard, each with ITS OWN subject and batch.
   *
   * `standardIds`, `subjectId`, `batchId` and `sectionId` are no longer held
   * in the form at all — they are DERIVED from this on every render. Keeping
   * both would let them drift, and the last time this form held a subject
   * independently of the standard it belonged to, that is exactly what
   * happened: the dropdown listed one standard's subjects while the form still
   * held another's.
   */
  plan: [] as PlanDraft[],
  studentIds: [] as string[],
  scheduleDate: todayIso,
  startTime: "09:00",
  endTime: "10:00",
  mode: "offline" as ClassMode,
  room: "",
  meetingLink: "",
  remarks: "",
  repeatWeekly: false,
  repeatUntil: "",
  holidaySkip: true,
  isExtra: false,
  extraReason: "",
  // ── Phase 3 — academic dimensions + recurrence ────────────────────────────
  academicYear: academicYearOf(todayIso),
  term: "",
  campusId: "",
  department: "",
  repeatPattern: "none" as RepeatPattern,
  repeatDays: [] as number[],
};

/** Duration is derived, never typed — 10:00 → 12:00 shows "2h 0m". */
const durationLabel = (start: string, end: string): string => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (!Number.isFinite(mins) || mins <= 0) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

/** Terms are configurable free text with sensible defaults — nothing hardcoded
 *  into the schema, so an institute can rename or add its own. */
const TERM_OPTIONS = ["Term 1", "Term 2", "Term 3", "Annual"];

const ClassScheduling: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const isOverride = user?.role === "management" || user?.role === "admin";

  const { from, to } = useMemo(weekRange, []);
  const { data: allTeachers = [] } = useTeachers();
  const { data: standards = [] } = useStandards();
  const { data: campuses = [] } = useCampuses();
  const { data: academicYears = [] } = useAcademicYears();
  const { data: managedStaffIds = [] } = useMyManagedStaffIds();
  const { data: myStandardIds = [] } = useMyStandardIds();

  // Scope the teacher/standard pickers. Management/admin override → everyone.
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

  // ── What the class list is showing ───────────────────────────────────────
  //
  // Deliberately SEPARATE from `weekRange` above. The workload card and the
  // timetable lock are weekly by definition; switching the list to "Tomorrow"
  // must not silently redefine "hours this week" in the card beside it.
  const [preset, setPreset] = useState<RangePreset>("today");
  const [pickedDate, setPickedDate] = useState(todayIso);
  const [statusFilter, setStatusFilter] = useState<ScheduleStatus | "all">("all");
  const range = useMemo(() => resolveRange(preset, pickedDate), [preset, pickedDate]);

  const { data: schedules = [] } = useSchedules({
    coordinatorId: isOverride ? undefined : user?.profileId,
    from: range.from,
    to: range.to,
  });

  const visibleSchedules = useMemo(
    () =>
      statusFilter === "all" ? schedules : schedules.filter((c) => c.status === statusFilter),
    [schedules, statusFilter],
  );
  const { data: studentCounts = {} } = useClassStudentCounts(
    useMemo(() => schedules.map((s) => s.id), [schedules]),
  );
  const { data: teachingHours = [] } = useTeachingHours(from, to);
  const { data: leaveAffected = [] } = useLeaveImpact(from, to);
  const { data: locks = [] } = useTimetableLocks();
  const { create, setStatus, reschedule, remove } = useScheduleMutations();
  const { assignSubstitute, transfer } = useScheduleOps();
  const { lock, unlock } = useTimetableLockMutations();

  // Substitute / transfer dialog (teacher picker).
  const [subTarget, setSubTarget] = useState<{ id: string; mode: "substitute" | "transfer" } | null>(null);
  const [subTeacherId, setSubTeacherId] = useState("");
  // Editing who is in an already-scheduled class (students join and leave).
  const [rosterTarget, setRosterTarget] = useState<ClassSchedule | null>(null);

  const doSubstitute = async () => {
    if (!subTarget || !subTeacherId) return;
    try {
      if (subTarget.mode === "transfer") {
        await transfer.mutateAsync({ id: subTarget.id, newTeacherId: subTeacherId });
        toast.success("Class transferred — teacher notified");
      } else {
        await assignSubstitute.mutateAsync({ id: subTarget.id, substituteId: subTeacherId });
        toast.success("Substitute assigned — teacher notified, hours reassigned");
      }
      setSubTarget(null);
      setSubTeacherId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleLock = async () => {
    try {
      const active = locks.find((l) => l.periodStart <= from && l.periodEnd >= to);
      if (active) {
        await unlock.mutateAsync(active.id);
        toast.success("Timetable unlocked for this week");
      } else {
        await lock.mutateAsync({ periodStart: from, periodEnd: to, reason: "Week locked by management" });
        toast.success("Timetable locked for this week");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const weekLocked = locks.some((l) => l.periodStart <= from && l.periodEnd >= to);

  // Workload classification (dynamic thresholds on total engaged hours/week).
  const classify = (mins: number) => {
    const h = mins / 60;
    if (h === 0) return { label: "Free", cls: "bg-slate-500/15 text-slate-400" };
    if (h > 20) return { label: "Overloaded", cls: "bg-red-500/15 text-red-500" };
    if (h < 5) return { label: "Underutilized", cls: "bg-amber-500/15 text-amber-500" };
    return { label: "Balanced", cls: "bg-emerald-500/15 text-emerald-500" };
  };

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Subjects, batches and sections are all loaded UNSCOPED once and narrowed
  // per standard in `utils/standardPlan`. The server-side `{ standardId }`
  // filters take a SINGLE standard, which is the whole bug: a class covering
  // two standards can only ever be given one of their subject lists. They also
  // issue `.eq("standard_id", …)`, which drops the institute-wide rows
  // (standard_id IS NULL) that every standard legitimately shares.
  const { data: allSubjects = [] } = useSubjects();
  const { data: allBatches = [] } = useBatches();
  const { data: allSections = [] } = useSections();

  const standardName = useMemo(() => {
    const byId = new Map(standards.map((s) => [s.id, s.name]));
    return (id: string) => byId.get(id) ?? "Standard";
  }, [standards]);

  // What the plan collapses to: the standard ids, and the primary standard's
  // own subject/batch/section. Derived, never stored — see `emptyForm.plan`.
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

  const openCreate = (extra: boolean) => {
    setForm({ ...emptyForm, isExtra: extra });
    setOpen(true);
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    // Checked before the schema, and separately from it: whether a standard
    // CAN be given a subject depends on what Setup holds for it, which the
    // schema cannot see. Naming the standard is the point — a generic "check
    // the form" makes the operator hunt through a list they just built.
    if (planBlocker) {
      const missing = draftMissingLabel(planBlocker, planOptions(planBlocker.standardId));
      toast.error(
        `Choose ${missing ?? "a subject"} for ${standardName(
          planBlocker.standardId,
        )} before scheduling`,
      );
      return;
    }
    const parsed = scheduleSchema.safeParse({ ...form, ...derived });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    try {
      // zod defaults guarantee the required fields at runtime; the cast bridges
      // zod's input/output type variance for the service contract.
      await create.mutateAsync(parsed.data as unknown as ScheduleInput);
      const who = form.studentIds.length
        ? ` · ${form.studentIds.length} student(s) assigned`
        : "";
      toast.success(
        (form.isExtra ? "Extra class assigned — teacher notified" : "Class scheduled") + who,
      );
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    }
  };

  const doStatus = async (id: string, status: ScheduleStatus) => {
    try {
      if (status === "cancelled") {
        const reason = await prompt({ title: "Cancel class", placeholder: "Reason (optional)" });
        if (reason === null) return;
        await setStatus.mutateAsync({ id, status, reason });
      } else {
        await setStatus.mutateAsync({ id, status });
      }
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const doReschedule = async (id: string) => {
    const date = await prompt({ title: "Reschedule — new date", placeholder: "YYYY-MM-DD" });
    if (!date) return;
    const start = await prompt({ title: "New start time", placeholder: "HH:MM" });
    if (!start) return;
    const end = await prompt({ title: "New end time", placeholder: "HH:MM" });
    if (!end) return;
    try {
      await reschedule.mutateAsync({ id, date, start, end });
      toast.success("Rescheduled — teacher notified");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const doDelete = async (id: string) => {
    if (!(await confirm({ title: "Delete class?", type: "danger", confirmText: "Delete" }))) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const nameOf = (id?: string) => teachers.find((t) => t.id === id)?.name ?? id ?? "";
  const fmtHrs = (mins: number) => `${(mins / 60).toFixed(1)}h`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Class Scheduling</h1>
            <p className="text-sm text-muted-foreground">
              {isOverride
                ? "Management override — schedule any teacher."
                : "Schedule your assigned teachers. This week."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isOverride && (
            <Button variant="outline" onClick={toggleLock}>
              {weekLocked ? (
                <><Unlock className="h-4 w-4 mr-1" /> Unlock Week</>
              ) : (
                <><Lock className="h-4 w-4 mr-1" /> Lock Week</>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => openCreate(true)}>
            <Zap className="h-4 w-4 mr-1" /> Assign Extra Class
          </Button>
          <Button onClick={() => openCreate(false)} disabled={weekLocked && !isOverride}>
            <Plus className="h-4 w-4 mr-1" /> Schedule Class
          </Button>
        </div>
      </div>

      {weekLocked && (
        <Card className="border-red-500/40">
          <CardContent className="py-3 text-sm text-red-500 flex items-center gap-2">
            <Lock className="h-4 w-4" /> This week's timetable is locked by Management.
            {isOverride ? " You can still override." : " Editing is disabled."}
          </CardContent>
        </Card>
      )}

      {/* Leave impact — classes needing coverage */}
      {leaveAffected.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <CalendarX className="h-4 w-4" /> Leave Impact — {leaveAffected.length} class(es) need coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaveAffected.map(({ schedule: c, leaveType, leaveStatus }) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                <p className="text-xs">
                  <span className="font-medium">{c.teacherName ?? nameOf(c.teacherId)}</span> ·{" "}
                  {c.scheduleDate} {c.startTime}–{c.endTime} ·{" "}
                  {[c.standardName, c.subjectName].filter(Boolean).join(" / ")} ·{" "}
                  <Badge variant="outline" className="ml-1">{leaveType ?? "leave"} · {leaveStatus}</Badge>
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setSubTarget({ id: c.id, mode: "substitute" }); setSubTeacherId(""); }}>
                    <UserCog className="h-4 w-4 mr-1" /> Substitute
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => doReschedule(c.id)}>
                    <Clock className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {teachers.length === 0 && !isOverride && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No staff assigned to you yet. Ask Management to allocate staff on the Staff Allocation page.
          </CardContent>
        </Card>
      )}

      {/* Workload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" /> Teacher Workload (this week)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teachingHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teaching hours recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teachingHours.map((h) => {
                // A class being taught right now is neither completed nor
                // upcoming. Leaving it out made a teacher's load DROP the
                // moment they pressed Start, which is the opposite of the truth.
                const engaged =
                  h.totalMinutes + h.extraMinutes + h.scheduledMinutes + h.inProgressMinutes;
                const c = classify(engaged);
                return (
                  <div key={h.teacherId} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{h.teacherName ?? nameOf(h.teacherId)}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {h.inProgressCount > 0 && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 gap-1">
                            <Radio className="h-3 w-3" /> LIVE
                          </Badge>
                        )}
                        <Badge className={c.cls}>{c.label}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Completed {fmtHrs(h.totalMinutes)}</span>
                      <span>Extra {fmtHrs(h.extraMinutes)}</span>
                      {h.inProgressCount > 0 && (
                        <span className="text-emerald-600">
                          In class {fmtHrs(h.inProgressMinutes)}
                        </span>
                      )}
                      <span>Upcoming {fmtHrs(h.scheduledMinutes)}</span>
                      <span>Cancelled {h.cancelledCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule list — grouped by day, ordered by start time */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {range.label} · {visibleSchedules.length} class
              {visibleSchedules.length === 1 ? "" : "es"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScheduleRangeBar
            preset={preset}
            date={pickedDate}
            onPreset={setPreset}
            onDate={(d) => { setPickedDate(d); setPreset("date"); }}
          >
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ScheduleStatus | "all")}
            >
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
              </SelectContent>
            </Select>
          </ScheduleRangeBar>

          <ScheduleDayList
            schedules={visibleSchedules}
            emptyTitle={`No classes ${range.label.toLowerCase()}`}
            emptyHint={
              preset === "today"
                ? "Try Tomorrow or This week, or schedule one with the button above."
                : "Adjust the range or the status filter."
            }
            renderMeta={(c) => (
              <>
                {c.teacherName ?? nameOf(c.teacherId)}
                {" · "}
                {c.mode}
                {c.room ? ` · ${c.room}` : ""}
                {studentCounts[c.id] ? ` · ${studentCounts[c.id]} students` : ""}
                {c.scheduleDate ? ` · ${c.scheduleDate}` : ""}
                {/* The lifecycle the teacher drives, mirrored here live — a
                    coordinator shouldn't have to open the Control Center to
                    find out whether a class actually happened. */}
                {c.startedAt ? ` · started ${c.startedAt.slice(11, 16)}` : ""}
                {c.completedAt ? ` · ended ${c.completedAt.slice(11, 16)}` : ""}
                {c.actualMinutes != null
                  ? ` · actual ${(c.actualMinutes / 60).toFixed(1)}h`
                  : ""}
              </>
            )}
            renderActions={(c) =>
              c.status === "scheduled" || c.status === "in_progress" ? (
                <>
                  <Button variant="ghost" size="sm" title="Students in this class" onClick={() => setRosterTarget(c)}>
                    <Users2 className="h-4 w-4 text-teal-500" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Assign substitute" onClick={() => { setSubTarget({ id: c.id, mode: "substitute" }); setSubTeacherId(""); }}>
                    <UserCog className="h-4 w-4 text-blue-500" />
                  </Button>
                  {isOverride && (
                    <Button variant="ghost" size="sm" title="Transfer teacher" onClick={() => { setSubTarget({ id: c.id, mode: "transfer" }); setSubTeacherId(""); }}>
                      <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" title="Complete" onClick={() => doStatus(c.id, "completed")}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Missed" onClick={() => doStatus(c.id, "missed")}>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Reschedule" onClick={() => doReschedule(c.id)}>
                    <Clock className="h-4 w-4 text-purple-500" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Cancel" onClick={() => doStatus(c.id, "cancelled")}>
                    <XCircle className="h-4 w-4 text-red-500" />
                  </Button>
                </>
              ) : null
            }
          />
        </CardContent>
      </Card>

      {/* Who is in this class */}
      <ClassRosterDialog
        schedule={rosterTarget}
        open={!!rosterTarget}
        onOpenChange={(v) => !v && setRosterTarget(null)}
      />

      {/* Substitute / Transfer dialog */}
      <Dialog open={!!subTarget} onOpenChange={(v) => !v && setSubTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{subTarget?.mode === "transfer" ? "Transfer Class" : "Assign Substitute"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {subTarget?.mode === "transfer" ? "New teacher" : "Substitute teacher"}
            </Label>
            <Select value={subTeacherId} onValueChange={setSubTeacherId}>
              <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Teaching hours and the class move to the selected teacher, who is notified instantly.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubTarget(null)}>Cancel</Button>
            <Button onClick={doSubstitute} disabled={!subTeacherId}>
              {subTarget?.mode === "transfer" ? "Transfer" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Extra dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.isExtra ? "Assign Extra Class" : "Schedule Class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* ── Academic scope. Every option is loaded from Setup, so adding a
                year / term / campus needs no code change. ─────────────────── */}
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

            {/* ── Standards & subjects ────────────────────────────────────
                One card per standard, each with its own subject and batch, and
                the next standard cannot be added until this one is finished.
                Replaces a chip row + a single subject dropdown that could only
                ever describe one subject for the whole room. */}
            <StandardPlanBuilder
              standards={scopedStandards}
              subjects={allSubjects}
              batches={allBatches}
              sections={allSections}
              value={form.plan}
              onChange={(plan) => set("plan", plan)}
            />

            {/* Who is actually in the class. Everyone eligible starts selected;
                deselect the students who aren't attending. */}
            <ClassRosterPicker
              standardIds={derived.standardIds}
              // Per standard, not one batch for the class: 2nd STD may be
              // drawn from Batch A while 3rd STD is drawn from Batch C, and a
              // single batch id would filter one of them down to nobody.
              batchByStandard={batchByStandard(derived.standardPlan)}
              value={form.studentIds}
              onChange={(studentIds) => set("studentIds", studentIds)}
            />

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

            {/* Duration is computed from start/end — never typed. */}
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Duration:{" "}
              <span className="font-medium">
                {durationLabel(form.startTime, form.endTime)}
              </span>
              <span className="text-xs text-muted-foreground">
                {" "}· calculated automatically and used for teaching hours &amp; salary
              </span>
            </div>

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

            {form.isExtra && (
              <Field label="Reason for extra class">
                <Input value={form.extraReason} onChange={(e) => set("extraReason", e.target.value)} placeholder="e.g. revision before exam" />
              </Field>
            )}

            <Field label="Remarks">
              <Input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder="Optional" />
            </Field>

            {/* ── Recurrence (Phase 1): daily / weekly / monthly + day mask ── */}
            {!form.isExtra && (
              <div className="space-y-3 rounded-md border px-3 py-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Repeat">
                    <Select
                      value={form.repeatPattern}
                      onValueChange={(v) => {
                        const p = v as RepeatPattern;
                        set("repeatPattern", p);
                        // Keep the Phase-1 boolean in step so old rows/filters work.
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !planComplete}>
              {form.isExtra ? "Assign & Notify" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default ClassScheduling;
