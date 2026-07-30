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
import type {
  ClassMode,
  ClassSchedule,
  RepeatPattern,
  ScheduleInput,
  ScheduleStatus,
} from "@/features/allocation/types/allocation.types";

// Week range [Mon..Sun] around today (ISO strings).
const weekRange = () => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(mon), to: iso(sun) };
};

const statusBadge = (s: ScheduleStatus) => {
  const map: Record<ScheduleStatus, string> = {
    scheduled: "bg-blue-500/15 text-blue-500",
    in_progress: "bg-cyan-500/15 text-cyan-500",
    completed: "bg-emerald-500/15 text-emerald-500",
    cancelled: "bg-red-500/15 text-red-500",
    missed: "bg-amber-500/15 text-amber-500",
    rescheduled: "bg-purple-500/15 text-purple-500",
  };
  return map[s] ?? "bg-muted";
};

const todayIso = new Date().toISOString().slice(0, 10);

const emptyForm = {
  teacherId: "",
  // A class can cover several standards; the first is the primary one that
  // stamps standard_id / standard_name for filters, RLS and reports.
  standardIds: [] as string[],
  studentIds: [] as string[],
  sectionId: "",
  subjectId: "",
  batchId: "",
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

  const { data: schedules = [] } = useSchedules({
    coordinatorId: isOverride ? undefined : user?.profileId,
    from,
    to,
  });
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
  // The primary standard drives the single-value lookups (sections, subjects).
  const primaryStandardId = form.standardIds[0];
  const { data: sections = [] } = useSections(primaryStandardId);
  const { data: subjects = [] } = useSubjects(
    primaryStandardId ? { standardId: primaryStandardId } : undefined,
  );
  // Batches are loaded unscoped and filtered here: a multi-standard class needs
  // the UNION of its standards' batches, which the single-standard hook filter
  // cannot express.
  const { data: allBatches = [] } = useBatches();
  const batches = useMemo(
    () =>
      form.standardIds.length === 0
        ? allBatches
        : allBatches.filter((b) => !b.standardId || form.standardIds.includes(b.standardId)),
    [allBatches, form.standardIds],
  );

  const openCreate = (extra: boolean) => {
    setForm({ ...emptyForm, isExtra: extra });
    setOpen(true);
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  /**
   * Toggle a standard. Dropping one also drops the dependent choices it made
   * valid — a section belongs to a single standard, and a batch left behind
   * from a removed standard would silently filter the roster to nothing.
   */
  const toggleStandard = (id: string) =>
    setForm((f) => {
      const standardIds = f.standardIds.includes(id)
        ? f.standardIds.filter((s) => s !== id)
        : [...f.standardIds, id];
      const batchStillValid =
        !f.batchId ||
        standardIds.length === 0 ||
        allBatches.some(
          (b) => b.id === f.batchId && (!b.standardId || standardIds.includes(b.standardId)),
        );
      return {
        ...f,
        standardIds,
        sectionId: standardIds.length === 1 ? f.sectionId : "",
        batchId: batchStillValid ? f.batchId : "",
      };
    });

  const submit = async () => {
    const parsed = scheduleSchema.safeParse(form);
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

      {/* Schedule list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule ({schedules.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes scheduled this week.</p>
          ) : (
            schedules.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.teacherName ?? nameOf(c.teacherId)}</span>
                    {c.isExtra && <Badge variant="outline" className="text-amber-500">Extra</Badge>}
                    {c.status === "in_progress" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 gap-1">
                        <Radio className="h-3 w-3" /> LIVE
                      </Badge>
                    ) : (
                      <Badge className={statusBadge(c.status)}>{c.status}</Badge>
                    )}
                    {/* The lifecycle the teacher drives, mirrored here live —
                        a coordinator shouldn't have to open the Control Center
                        to find out whether a class actually happened. */}
                    {c.lateMinutes > 0 && (
                      <Badge variant="outline" className="text-amber-600">
                        {c.lateMinutes}m late
                      </Badge>
                    )}
                    {c.attendanceSubmitted && (
                      <Badge className="bg-emerald-500/15 text-emerald-500">attendance ✓</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.scheduleDate} · {c.startTime}–{c.endTime} ({(c.durationMinutes / 60).toFixed(1)}h) ·{" "}
                    {[
                      // Every standard, not just the primary — otherwise a
                      // combined class reads as if it only covers one.
                      c.standardNames.length > 0 ? c.standardNames.join(" + ") : c.standardName,
                      c.sectionName,
                      c.subjectName,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"} ·{" "}
                    {c.mode}
                    {c.room ? ` · ${c.room}` : ""}
                    {studentCounts[c.id] ? ` · ${studentCounts[c.id]} students` : ""}
                    {c.startedAt ? ` · started ${c.startedAt.slice(11, 16)}` : ""}
                    {c.completedAt ? ` · ended ${c.completedAt.slice(11, 16)}` : ""}
                    {c.actualMinutes != null ? ` · actual ${(c.actualMinutes / 60).toFixed(1)}h` : ""}
                  </p>
                </div>
                {(c.status === "scheduled" || c.status === "in_progress") && (
                  <div className="flex items-center gap-1">
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
                  </div>
                )}
              </div>
            ))
          )}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.isExtra ? "Assign Extra Class" : "Schedule Class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* ── Academic scope. Every option is loaded from Setup, so adding a
                year / term / campus needs no code change. ─────────────────── */}
            <div className="grid grid-cols-3 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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

            {/* Standards — a class may cover more than one. The first picked
                becomes the primary (what reports and filters group by). */}
            <Field label="Standards (pick one or more)">
              {scopedStandards.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No standards in your scope. Ask Management to assign them on the Staff
                  Allocation page.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {scopedStandards.map((s, i) => {
                    const on = form.standardIds.includes(s.id);
                    const isPrimary = form.standardIds[0] === s.id;
                    return (
                      <Button
                        key={s.id ?? i}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() => toggleStandard(s.id)}
                      >
                        {s.name}
                        {isPrimary && form.standardIds.length > 1 && (
                          <span className="ml-1 text-[9px] uppercase opacity-80">primary</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </Field>

            <div
              className={`grid gap-3 ${form.standardIds.length === 1 ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {/* Sections belong to ONE standard, so the field only makes sense
                  for a single-standard class. */}
              {form.standardIds.length === 1 && (
                <Field label="Section">
                  <Select value={form.sectionId} onValueChange={(v) => set("sectionId", v)}>
                    <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Subject">
                <Select value={form.subjectId} onValueChange={(v) => set("subjectId", v)}>
                  <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Batch (optional filter)">
                <Select value={form.batchId} onValueChange={(v) => set("batchId", v)}>
                  <SelectTrigger><SelectValue placeholder="All batches" /></SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Who is actually in the class. Everyone eligible starts selected;
                deselect the students who aren't attending. */}
            <ClassRosterPicker
              standardIds={form.standardIds}
              batchId={form.batchId || undefined}
              value={form.studentIds}
              onChange={(studentIds) => set("studentIds", studentIds)}
            />

            <div className="grid grid-cols-3 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3">
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
            <Button onClick={submit} disabled={create.isPending}>
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
