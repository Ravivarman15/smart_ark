import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import arkLogo from "@/assets/ark-logo.jpeg";
import { ThemeToggle } from "@/core/theme";
import { RoleSidebar } from "@/shared/layouts";
import { useNavigation } from "@/core/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  LogOut, Menu, X, Lock, CheckCircle2, Circle, Users2, FileText,
  ClipboardList, TrendingUp, Timer, AlertTriangle, MapPin, Loader2,
} from "lucide-react";

import { useTeacherWorkspace } from "./dashboard/useTeacherWorkspace";
import ShiftControl from "./dashboard/ShiftControl";
import AttendanceSection from "./dashboard/AttendanceSection";
import MarksSection from "./dashboard/MarksSection";
import InsightsSection from "./dashboard/InsightsSection";
import TasksSection from "./dashboard/TasksSection";
import WorkspaceSection from "./dashboard/WorkspaceSection";

// ─────────────────────────────────────────────────────────────────────────────
// TeacherDashboard — one page, no tabs.
//
// The old Home / Attendance / Marks / More tabs are gone: everything now lives
// on a single scrolling workspace with a jump rail. The shift is the spine of
// the page — check-in is a hard gate (the workspace is locked until you punch
// in) and check-out is enforced on the way out (sticky bar + sign-out guard).
// Every figure is derived from live context data in useTeacherWorkspace.
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "attendance", label: "Attendance", icon: Users2 },
  { id: "marks", label: "Marks", icon: FileText },
  { id: "insights", label: "Insights", icon: TrendingUp },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "workspace", label: "Workspace", icon: Menu },
];

const greeting = (d: Date) => {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const TeacherDashboard: React.FC = () => {
  const ws = useTeacherWorkspace();
  const { user, logout, teacherInfo, shift, daySteps, dayProgress, roster, pendingTasks, marksToday, presentCount, attendanceSubmitted, nowMs } = ws;
  const confirm = useConfirm();

  const navGroups = useNavigation();
  const modules = useMemo(
    () => navGroups.filter((g) => g.key !== "dashboard" && g.items.length > 0),
    [navGroups],
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const locked = !shift.checkedIn;

  // Leaving with an open shift loses the check-out record, so warn on unload.
  useEffect(() => {
    if (shift.phase !== "working") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shift.phase]);

  const checkOut = async () => {
    const ok = await confirm({
      title: "Check out for the day?",
      description: `You will have worked ${shift.workedLabel}. Your check-out location is verified against your campus and sent to admin for approval.`,
      type: "info",
      confirmText: "Check out",
      cancelText: "Not yet",
    });
    if (ok) await shift.punchOut();
  };

  // Sign-out guard — checking out is mandatory, so don't let the shift be
  // abandoned silently.
  const handleLogout = async () => {
    if (shift.phase === "working") {
      const ok = await confirm({
        title: "You're still checked in",
        description: "Check-out is mandatory. Sign out without it and your shift stays open — an admin will have to close it for you.",
        type: "warning",
        confirmText: "Check out & sign out",
        cancelText: "Stay on shift",
      });
      if (!ok) return;
      const done = await shift.punchOut();
      if (!done) { toast.error("Check-out failed — you are still signed in."); return; }
    }
    logout();
  };

  const stepIcon = (done: boolean) =>
    done
      ? <CheckCircle2 className="w-4 h-4 text-ark-success flex-shrink-0" />
      : <Circle className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />;

  const kpis = [
    { label: "Students", value: `${roster.length}`, tone: "text-foreground" },
    {
      label: "Today present",
      value: roster.length ? `${presentCount}/${roster.length}` : "—",
      tone: attendanceSubmitted ? "text-ark-success" : "text-ark-warning",
    },
    { label: "Marks today", value: `${marksToday.length}`, tone: marksToday.length ? "text-accent" : "text-muted-foreground" },
    { label: "Open tasks", value: `${pendingTasks.length}`, tone: pendingTasks.length ? "text-ark-warning" : "text-ark-success" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-sidebar/95 backdrop-blur-xl border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMenuOpen(true)}
            className="relative p-2 -ml-1 rounded-lg hover:bg-muted/50 transition-colors text-foreground"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
            {modules.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
          <div className="relative flex-shrink-0">
            <img src={arkLogo} alt="ARK" className="w-9 h-9 rounded-lg" />
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar ${
              shift.phase === "working" ? "bg-ark-success" : shift.phase === "done" ? "bg-muted-foreground" : "bg-ark-warning"
            }`} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-foreground text-sm truncate">
              {greeting(new Date(nowMs))}, {(teacherInfo?.name || user?.name || "").split(" ")[0]}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {teacherInfo?.className || "No class"} · {user?.campus}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ThemeToggle variant="icon" />
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* RBAC module drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar
              collapsed={false}
              onToggle={() => setMenuOpen(false)}
              onNavigate={() => setMenuOpen(false)}
            />
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute top-4 right-[-40px] p-2 text-foreground"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-28">
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          {/* 1. The shift — always first, always required */}
          <ShiftControl shift={shift} onCheckOut={checkOut} />

          {/* 2. Day checklist */}
          <section className="rounded-2xl bg-card/50 border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Today's checklist
              </p>
              <p className={`text-sm font-bold tabular-nums ${
                dayProgress === 100 ? "text-ark-success" : "text-accent"
              }`}>
                {dayProgress}%
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  dayProgress === 100 ? "bg-ark-success" : "gradient-accent"
                }`}
                style={{ width: `${dayProgress}%` }}
              />
            </div>
            <div className="space-y-2">
              {daySteps.map((step) => (
                <div key={step.key} className="flex items-start gap-2.5">
                  {stepIcon(step.done)}
                  <div className="min-w-0">
                    <p className={`text-sm ${step.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                      {step.label}
                      {step.required && !step.done && (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-ark-warning">
                          Required
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{step.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. KPIs */}
          <section className="grid grid-cols-4 gap-2">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl bg-card/60 border border-border p-3 text-center">
                <p className={`text-xl font-bold tabular-nums ${k.tone}`}>{k.value}</p>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5 leading-tight">
                  {k.label}
                </p>
              </div>
            ))}
          </section>

          {/* Jump rail — only useful once the workspace is unlocked */}
          {!locked && (
            <nav className="sticky top-[61px] z-30 -mx-4 px-4 py-2 bg-background/90 backdrop-blur-md">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 border border-border text-xs font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors whitespace-nowrap"
                  >
                    <s.icon className="w-3.5 h-3.5" /> {s.label}
                  </a>
                ))}
              </div>
            </nav>
          )}

          {/* 4. The workspace — gated behind check-in */}
          {locked ? (
            <section className="relative">
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-ark-warning/10 border border-ark-warning/20 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-ark-warning" />
                </div>
                <p className="text-sm font-semibold text-foreground">Workspace locked</p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto">
                  Attendance, marks, tasks and leave unlock the moment you check in.
                  This keeps every record tied to a verified shift.
                </p>
                <button
                  onClick={shift.punchIn}
                  disabled={shift.checkinLoading}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {shift.checkinLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                    : <><MapPin className="w-4 h-4" /> Check in now</>}
                </button>
              </div>
            </section>
          ) : (
            <>
              <AttendanceSection ws={ws} />
              <MarksSection ws={ws} />
              <InsightsSection ws={ws} />
              <TasksSection ws={ws} />
              <WorkspaceSection ws={ws} modules={modules} />
            </>
          )}
        </div>
      </main>

      {/* Sticky shift bar — replaces the old bottom tabs. Keeps the mandatory
          check-out one tap away no matter how far the teacher has scrolled. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border px-4 py-3 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {shift.phase === "not-started" && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-ark-warning flex-shrink-0" />
                <p className="text-xs text-foreground truncate">
                  <span className="font-semibold">Not checked in.</span> Your day hasn't started.
                </p>
              </div>
              <button
                onClick={shift.punchIn}
                disabled={shift.checkinLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg gradient-accent text-accent-foreground text-sm font-semibold flex-shrink-0 disabled:opacity-60"
              >
                {shift.checkinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Check In
              </button>
            </>
          )}

          {shift.phase === "working" && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ark-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-ark-success" />
                </span>
                <p className="text-xs text-foreground truncate flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                  On shift · <span className="font-semibold tabular-nums">{shift.workedLabel}</span>
                </p>
              </div>
              <button
                onClick={checkOut}
                disabled={shift.checkoutLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-card border border-border text-foreground text-sm font-semibold flex-shrink-0 hover:border-accent/50 transition-colors disabled:opacity-60"
              >
                {shift.checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Check Out
              </button>
            </>
          )}

          {shift.phase === "done" && (
            <div className="flex items-center gap-2 w-full justify-center">
              <CheckCircle2 className="w-4 h-4 text-ark-success" />
              <p className="text-xs text-foreground">
                Day closed · <span className="font-semibold tabular-nums">{shift.workedLabel}</span> logged
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
