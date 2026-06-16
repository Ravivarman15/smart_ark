import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData, isNearCampus } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  MapPin, ChevronRight, CheckCircle2, Clock, LogOut, Users, BookOpen,
  RotateCcw, AlertTriangle, BarChart3, TrendingUp, Calendar, UserCheck,
  ClipboardList, ListChecks, ArrowRight, Plus, Target, Activity,
  PieChart as PieChartIcon, Zap, FileText
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  PieChart, Pie, Legend
} from "recharts";
import { toast } from "sonner";

/* ── Shared UI Components ──────────────────────────────────────────────────── */

const MetricCard: React.FC<{
  icon: React.ElementType; label: string; value: string | number; subtitle?: string;
  variant?: "default" | "success" | "warning" | "danger"; onClick?: () => void;
}> = ({ icon: Icon, label, value, subtitle, variant = "default", onClick }) => {
  const vc = {
    default: "border-border",
    success: "border-ark-success/30",
    warning: "border-ark-warning/30",
    danger: "border-ark-danger/30"
  };
  const ic = {
    default: "text-accent",
    success: "text-ark-success",
    warning: "text-ark-warning",
    danger: "text-ark-danger"
  };
  return (
    <div className={`metric-card ${vc[variant]} animate-slide-up ${onClick ? "cursor-pointer hover:bg-muted/20" : ""}`} onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${ic[variant]}`} />
      </div>
      <p className="text-2xl font-display font-bold text-foreground mt-1">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
};

const QuickActionCard: React.FC<{
  icon: React.ElementType; title: string; description: string; onClick: () => void;
  accentClass?: string;
}> = ({ icon: Icon, title, description, onClick, accentClass = "text-accent" }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 hover:border-accent/30 transition-all group text-left w-full"
  >
    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
      <Icon className={`w-4 h-4 ${accentClass}`} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
  </button>
);

const EmptyState: React.FC<{
  icon: React.ElementType; title: string; description: string;
  actionLabel?: string; onAction?: () => void;
}> = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center mb-3">
      <Icon className="w-6 h-6 text-muted-foreground/50" />
    </div>
    <p className="text-sm font-semibold text-muted-foreground">{title}</p>
    <p className="text-xs text-muted-foreground/70 mt-1 max-w-[240px]">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> {actionLabel}
      </button>
    )}
  </div>
);

/* ── Main Dashboard ────────────────────────────────────────────────────────── */

const CoordinatorDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    teachers, checkins, teacherCheckin, teacherCheckout, batches, students,
    retestQueue, tasks, weeklyPlans, leaveRequests
  } = useAppData();

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const todayCheckin = user?.profileId ? checkins[user.profileId]?.[today] : undefined;

  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // ── Self Check-in / Check-out Geolocation Handlers ───────────────────────
  const doCheckin = async (geoValid: boolean, okMessage: string, fallbackWarn?: string) => {
    try {
      if (!user?.profileId) return;
      await teacherCheckin(user.profileId, geoValid);
      if (geoValid) toast.success(okMessage); else toast.warning(fallbackWarn || okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record check-in");
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleCheckin = () => {
    if (!user?.profileId) return;
    setCheckinLoading(true);
    if (!navigator.geolocation) {
      doCheckin(false, "Geolocation not supported — check-in submitted without geo validation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        doCheckin(
          result.valid,
          `Check-in submitted at ${result.campus} — pending admin approval`,
          "Check-in submitted but you are NOT within campus vicinity — pending approval",
        );
      },
      () => {
        doCheckin(false, "Location access denied — check-in submitted without geo validation");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const doCheckout = async (geoValid: boolean, okMessage: string, fallbackWarn?: string) => {
    try {
      if (!user?.profileId) return;
      await teacherCheckout(user.profileId, geoValid);
      if (geoValid) toast.success(okMessage); else toast.warning(fallbackWarn || okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record check-out");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCheckout = () => {
    if (!user?.profileId) return;
    setCheckoutLoading(true);
    if (!navigator.geolocation) {
      doCheckout(false, "Geolocation not supported — check-out submitted without geo validation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        doCheckout(
          result.valid,
          `Check-out submitted at ${result.campus} — pending admin approval`,
          "Check-out submitted but you are NOT within campus vicinity — pending approval",
        );
      },
      () => {
        doCheckout(false, "Location access denied — check-out submitted without geo validation");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── Metrics calculations ──────────────────────────────────────────────────

  // Batch / Portion
  const avgPortion = useMemo(() => {
    if (batches.length === 0) return 0;
    const total = batches.reduce((acc, b) => acc + (b.portionComplete || 0), 0);
    return Math.round(total / batches.length);
  }, [batches]);

  // Retests
  const pendingRetests = useMemo(() => {
    return retestQueue.filter(r => r.status !== "completed");
  }, [retestQueue]);

  // Risk
  const atRiskCount = useMemo(() => {
    return students.filter(s => s.risk === "watch" || s.risk === "critical").length;
  }, [students]);

  // Teacher check-in data
  const teacherCheckinData = useMemo(() => {
    return teachers.map(t => {
      const checkin = checkins[t.id]?.[today] || null;
      let status: "on-time" | "late" | "absent" | "pending" = "absent";
      if (checkin) status = checkin.status;
      return { teacher: t, checkin, status };
    });
  }, [teachers, checkins, today]);

  const teachersPresent = teacherCheckinData.filter(d => d.status === "on-time" || d.status === "late").length;
  const teachersAbsent = teachers.length - teachersPresent;

  // ── TASK metrics ──────────────────────────────────────────────────────────
  const totalTasks = tasks.length;
  const overdueTasks = useMemo(() => {
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      const allDone = Object.values(t.statusByTeacher).length > 0 &&
        Object.values(t.statusByTeacher).every(s => s === "completed");
      return t.dueDate < today && !allDone;
    });
  }, [tasks, today]);

  const completedTasks = useMemo(() => {
    return tasks.filter(t => {
      const statuses = Object.values(t.statusByTeacher);
      return statuses.length > 0 && statuses.every(s => s === "completed");
    });
  }, [tasks]);

  const pendingTasks = useMemo(() => {
    return tasks.filter(t => {
      const statuses = Object.values(t.statusByTeacher);
      return statuses.length === 0 || !statuses.every(s => s === "completed");
    });
  }, [tasks]);

  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // Recent tasks (last 5)
  const recentTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);
  }, [tasks]);

  // Task status pie data
  const taskPieData = useMemo(() => {
    const completed = completedTasks.length;
    const overdue = overdueTasks.length;
    const inProgress = pendingTasks.length - overdue;
    return [
      { name: "Completed", value: completed, fill: "hsl(var(--ark-success))" },
      { name: "In Progress", value: Math.max(0, inProgress), fill: "hsl(var(--accent))" },
      { name: "Overdue", value: overdue, fill: "hsl(var(--ark-danger))" },
    ].filter(d => d.value > 0);
  }, [completedTasks, overdueTasks, pendingTasks]);

  // ── Charts ────────────────────────────────────────────────────────────────

  const portionChartData = useMemo(() => {
    return batches.map(b => ({
      name: b.name,
      completion: b.portionComplete || 0,
    }));
  }, [batches]);

  const riskLevelsData = useMemo(() => {
    const critical = students.filter(s => s.risk === "critical").length;
    const watch = students.filter(s => s.risk === "watch").length;
    const safe = students.filter(s => s.risk === "safe").length;
    return [
      { name: "Critical Risk", count: critical, color: "hsl(var(--ark-danger))" },
      { name: "Watch Risk", count: watch, color: "hsl(var(--ark-warning))" },
      { name: "Safe Status", count: safe, color: "hsl(var(--ark-success))" },
    ].filter(d => d.count > 0);
  }, [students]);

  // Weekly plan status
  const planStats = useMemo(() => {
    const onTrack = weeklyPlans.filter(p => p.status === "on-track").length;
    const delayed = weeklyPlans.filter(p => p.status === "delayed").length;
    const completed = weeklyPlans.filter(p => p.status === "completed").length;
    return { onTrack, delayed, completed, total: weeklyPlans.length };
  }, [weeklyPlans]);

  // Pending leaves
  const pendingLeaves = useMemo(() => {
    return leaveRequests.filter(l => l.status === "pending");
  }, [leaveRequests]);

  // Teacher attendance donut
  const attendanceDonutData = useMemo(() => {
    const onTime = teacherCheckinData.filter(d => d.status === "on-time").length;
    const late = teacherCheckinData.filter(d => d.status === "late").length;
    const pending = teacherCheckinData.filter(d => d.status === "pending").length;
    const absent = teacherCheckinData.filter(d => d.status === "absent").length;
    return [
      { name: "On Time", value: onTime, fill: "hsl(var(--ark-success))" },
      { name: "Late", value: late, fill: "hsl(var(--ark-warning))" },
      { name: "Pending", value: pending, fill: "hsl(var(--accent))" },
      { name: "Absent", value: absent, fill: "hsl(var(--destructive))" },
    ].filter(d => d.value > 0);
  }, [teacherCheckinData]);

  // Get task status helper
  const getTaskStatus = (task: typeof tasks[0]) => {
    const statuses = Object.values(task.statusByTeacher);
    if (statuses.length === 0) return "pending";
    if (statuses.every(s => s === "completed")) return "completed";
    if (task.dueDate && task.dueDate < today) return "overdue";
    return "in-progress";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Coordinator Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Geolocation check-in / out section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Check-in Card */}
        <div>
          {todayCheckin && todayCheckin.status !== "pending" ? (
            <div className="state-card-success">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-ark-success/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-ark-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Checked in at {todayCheckin.time}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {todayCheckin.status === "on-time" ? "On time" : "Late"} · Geo {todayCheckin.geoValid ? "verified" : "not verified"}
                  </p>
                </div>
                <span className={todayCheckin.status === "on-time" ? "status-pill-success" : "status-pill-warning"}>
                  {todayCheckin.status === "on-time" ? "On Time" : "Late"}
                </span>
              </div>
            </div>
          ) : todayCheckin && todayCheckin.status === "pending" ? (
            <div className="state-card-warning">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-ark-warning/15 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-ark-warning animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Checked in at {todayCheckin.time}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Geo {todayCheckin.geoValid ? "verified" : "not verified"} · Awaiting admin approval
                  </p>
                </div>
                <span className="status-pill-warning">Pending</span>
              </div>
            </div>
          ) : (
            <button onClick={handleCheckin} disabled={checkinLoading}
              className="w-full state-card-action group disabled:opacity-50 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <MapPin className={`w-5 h-5 text-accent ${checkinLoading ? "animate-pulse" : ""}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{checkinLoading ? "Verifying location…" : "Tap to check in"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{checkinLoading ? "Getting GPS coordinates" : "Location verified against your campus"}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
            </button>
          )}
        </div>

        {/* Check-out Card (Shows if already checked in) */}
        <div>
          {todayCheckin ? (
            todayCheckin.checkoutTime && todayCheckin.checkoutStatus !== "pending" ? (
              <div className="state-card-success">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-ark-success/15 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-ark-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Checked out at {todayCheckin.checkoutTime}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {todayCheckin.checkoutStatus === "on-time" ? "On time" : "Early"} · Geo {todayCheckin.checkoutGeoValid ? "verified" : "not verified"}
                    </p>
                  </div>
                  <span className={todayCheckin.checkoutStatus === "on-time" ? "status-pill-success" : "status-pill-warning"}>
                    {todayCheckin.checkoutStatus === "on-time" ? "On Time" : "Early"}
                  </span>
                </div>
              </div>
            ) : todayCheckin.checkoutTime && todayCheckin.checkoutStatus === "pending" ? (
              <div className="state-card-warning">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-ark-warning/15 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-ark-warning animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Checked out at {todayCheckin.checkoutTime}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Geo {todayCheckin.checkoutGeoValid ? "verified" : "not verified"} · Awaiting admin approval
                    </p>
                  </div>
                  <span className="status-pill-warning">Pending</span>
                </div>
              </div>
            ) : (
              <button onClick={handleCheckout} disabled={checkoutLoading}
                className="w-full state-card-action group disabled:opacity-50 text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                    <LogOut className={`w-5 h-5 text-accent ${checkoutLoading ? "animate-pulse" : ""}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{checkoutLoading ? "Verifying location…" : "Tap to check out"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{checkoutLoading ? "Getting GPS coordinates" : "Location verified against your campus"}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
              </button>
            )
          ) : (
            <div className="state-card-warning opacity-70">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-muted-foreground">Check out unavailable</p>
                  <p className="text-xs text-muted-foreground mt-0.5">You must check in first before checking out.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* KPI Cards Grid — Academic + Task combined */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Total Teachers"
          value={teachers.length}
          subtitle={`${teachersPresent} present · ${teachersAbsent} absent`}
          onClick={() => navigate("/coordinator/teachers")}
        />
        <MetricCard
          icon={ClipboardList}
          label="Total Tasks"
          value={totalTasks}
          subtitle={`${completedTasks.length} done · ${pendingTasks.length} active`}
          variant={overdueTasks.length > 0 ? "danger" : pendingTasks.length > 0 ? "warning" : "success"}
          onClick={() => navigate("/coordinator/tasks/dashboard")}
        />
        <MetricCard
          icon={BookOpen}
          label="Avg Batch Portion"
          value={`${avgPortion}%`}
          subtitle={`${batches.length} active batches`}
          variant={avgPortion >= 85 ? "success" : avgPortion >= 50 ? "warning" : "danger"}
          onClick={() => navigate("/coordinator/academic")}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Students At Risk"
          value={atRiskCount}
          subtitle="Watch/critical status"
          variant={atRiskCount > 5 ? "danger" : atRiskCount > 0 ? "warning" : "success"}
          onClick={() => navigate("/coordinator/students")}
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Target}
          label="Task Completion"
          value={`${taskCompletionRate}%`}
          subtitle={`${overdueTasks.length} overdue`}
          variant={taskCompletionRate >= 80 ? "success" : taskCompletionRate >= 50 ? "warning" : "danger"}
          onClick={() => navigate("/coordinator/tasks/dashboard")}
        />
        <MetricCard
          icon={RotateCcw}
          label="Pending Retests"
          value={pendingRetests.length}
          subtitle="Need teacher attention"
          variant={pendingRetests.length > 5 ? "danger" : pendingRetests.length > 0 ? "warning" : "success"}
          onClick={() => navigate("/coordinator/academic")}
        />
        <MetricCard
          icon={Activity}
          label="Weekly Plans"
          value={planStats.total}
          subtitle={`${planStats.onTrack} on track · ${planStats.delayed} delayed`}
          variant={planStats.delayed > 2 ? "danger" : planStats.delayed > 0 ? "warning" : "success"}
          onClick={() => navigate("/coordinator/academic")}
        />
        <MetricCard
          icon={Calendar}
          label="Pending Leaves"
          value={pendingLeaves.length}
          subtitle="Awaiting approval"
          variant={pendingLeaves.length > 3 ? "warning" : "default"}
        />
      </div>

      {/* Task Section + Attendance Donut */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Tasks */}
        <div className="glass-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-accent" /> Recent Tasks
            </h2>
            <button
              onClick={() => navigate("/coordinator/tasks/dashboard")}
              className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {recentTasks.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No tasks yet"
                description="Assign tasks to your teachers to track their progress and deadlines."
                actionLabel="Assign a Task"
                onAction={() => navigate("/coordinator/tasks/dashboard")}
              />
            ) : (
              recentTasks.map((task) => {
                const status = getTaskStatus(task);
                const assignedCount = task.assignedTo.length;
                const completedCount = Object.values(task.statusByTeacher).filter(s => s === "completed").length;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => navigate("/coordinator/tasks/dashboard")}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      status === "completed" ? "bg-ark-success/15" :
                      status === "overdue" ? "bg-destructive/15" :
                      "bg-accent/15"
                    }`}>
                      {status === "completed" ? <CheckCircle2 className="w-4 h-4 text-ark-success" /> :
                       status === "overdue" ? <AlertTriangle className="w-4 h-4 text-destructive" /> :
                       <Clock className="w-4 h-4 text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{task.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" /> {completedCount}/{assignedCount}
                        </span>
                        {task.dueDate && (
                          <span className={`text-[10px] flex items-center gap-1 ${
                            status === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}>
                            <Calendar className="w-3 h-3" /> {task.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                      status === "completed" ? "bg-ark-success/15 text-ark-success" :
                      status === "overdue" ? "bg-destructive/15 text-destructive" :
                      "bg-accent/15 text-accent"
                    }`}>
                      {status === "completed" ? "Done" : status === "overdue" ? "Overdue" : "Active"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Task Status Donut */}
        <div className="glass-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-accent" /> Task Distribution
          </h2>
          {taskPieData.length === 0 ? (
            <EmptyState
              icon={PieChartIcon}
              title="No task data"
              description="Create and assign tasks to see their status distribution here."
              actionLabel="Go to Tasks"
              onAction={() => navigate("/coordinator/tasks/dashboard")}
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={taskPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {taskPieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: string) => [`${value} tasks`, name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {totalTasks > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 rounded-lg bg-ark-success/10">
                <p className="text-lg font-bold text-ark-success">{completedTasks.length}</p>
                <p className="text-[10px] text-muted-foreground">Completed</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-accent/10">
                <p className="text-lg font-bold text-accent">{pendingTasks.length - overdueTasks.length}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-destructive/10">
                <p className="text-lg font-bold text-destructive">{overdueTasks.length}</p>
                <p className="text-[10px] text-muted-foreground">Overdue</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts + Detail lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Panel: Portion completion chart */}
        <div className="glass-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent" /> Batch Portion Completion
          </h2>
          {portionChartData.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No batch data"
              description="Batch completion percentages will appear here once batches are configured with portion data."
              actionLabel="View Academics"
              onAction={() => navigate("/coordinator/academic")}
            />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={portionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => [`${value}%`, "Completion"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="completion" radius={[4, 4, 0, 0]}>
                  {portionChartData.map((d, index) => (
                    <Cell key={index} fill={d.completion >= 80 ? "hsl(var(--ark-success))" : d.completion >= 50 ? "hsl(var(--ark-warning))" : "hsl(var(--ark-danger))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Right Panel: Teacher Attendance Donut */}
        <div className="glass-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-accent" /> Today's Attendance Overview
          </h2>
          {teachers.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No teachers registered"
              description="Teacher attendance data will appear here once teachers are added to the system."
            />
          ) : attendanceDonutData.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No check-ins yet"
              description="Teacher attendance data will populate throughout the day as teachers check in."
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={attendanceDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {attendanceDonutData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: string) => [`${value} teachers`, name]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {[
                  { label: "On Time", count: teacherCheckinData.filter(d => d.status === "on-time").length, cls: "text-ark-success bg-ark-success/10" },
                  { label: "Late", count: teacherCheckinData.filter(d => d.status === "late").length, cls: "text-ark-warning bg-ark-warning/10" },
                  { label: "Pending", count: teacherCheckinData.filter(d => d.status === "pending").length, cls: "text-accent bg-accent/10" },
                  { label: "Absent", count: teacherCheckinData.filter(d => d.status === "absent").length, cls: "text-destructive bg-destructive/10" },
                ].map(item => (
                  <div key={item.label} className={`text-center p-1.5 rounded-lg ${item.cls}`}>
                    <p className="text-sm font-bold">{item.count}</p>
                    <p className="text-[9px] font-medium">{item.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Student Risk Breakdown */}
        <div className="glass-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent" /> Student Risk Breakdown
          </h2>
          {riskLevelsData.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No student data"
              description="Student risk levels will appear here once students are added and assessed."
              actionLabel="View Students"
              onAction={() => navigate("/coordinator/students")}
            />
          ) : (
            <div className="space-y-4">
              {riskLevelsData.map((risk, index) => {
                const totalStudents = students.length;
                const percentage = totalStudents > 0 ? Math.round((risk.count / totalStudents) * 100) : 0;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{risk.name}</span>
                      <span className="text-muted-foreground">{risk.count} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: risk.color }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                Total mapped student roster size: {students.length} students.
              </div>
            </div>
          )}
        </div>

        {/* Retest Queue backlog */}
        <div className="glass-card p-4 md:p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-accent" /> Retest Backlog
          </h2>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {pendingRetests.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                title="All clear! 🎉"
                description="No pending retest allocations. All retests have been handled."
              />
            ) : (
              pendingRetests.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                  <div>
                    <span className="font-semibold text-foreground">{r.student}</span>
                    <span className="text-muted-foreground ml-2">· {r.subject} · {r.batch}</span>
                    <p className="text-[10px] text-muted-foreground mt-1">Original score: {r.marks}% · Assigned: {r.teacher}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      r.status === "allocated" ? "bg-accent/15 text-accent" : "bg-ark-warning/15 text-ark-warning"
                    }`}>
                      {r.status === "allocated" ? "Allocated" : "Pending"}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">Due: {r.dueDate}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Today's Teacher Attendance Logs */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-accent" /> Today's Teacher Attendance Log
          </h2>
          <span className="text-[11px] text-muted-foreground font-medium">
            {teachersPresent}/{teachers.length} present
          </span>
        </div>
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {teacherCheckinData.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No teachers registered"
              description="Teacher attendance logs will appear here once teachers are added to the system."
            />
          ) : (
            teacherCheckinData.map(({ teacher, checkin, status }) => (
              <div key={teacher.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs">
                <div>
                  <span className="font-semibold text-foreground">{teacher.name}</span>
                  <span className="text-muted-foreground ml-2">· {teacher.campus}</span>
                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                    <span>In: {checkin?.time || "—"}</span>
                    {checkin?.checkoutTime && <span>Out: {checkin.checkoutTime}</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  status === "on-time" ? "bg-ark-success/15 text-ark-success" :
                  status === "late" ? "bg-ark-warning/15 text-ark-warning" :
                  status === "pending" ? "bg-accent/15 text-accent animate-pulse" :
                  "bg-destructive/15 text-destructive"
                }`}>
                  {status === "on-time" ? "On Time" :
                   status === "late" ? "Late" :
                   status === "pending" ? "Pending Approval" : "Absent"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" /> Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <QuickActionCard
            icon={ClipboardList}
            title="Assign Task"
            description="Create and assign new tasks to teachers"
            onClick={() => navigate("/coordinator/tasks/dashboard")}
          />
          <QuickActionCard
            icon={BookOpen}
            title="Academic Control"
            description="Manage batches, portions, and weekly plans"
            onClick={() => navigate("/coordinator/academic")}
          />
          <QuickActionCard
            icon={Users}
            title="Teacher Overview"
            description="View teacher profiles and performance"
            onClick={() => navigate("/coordinator/teachers")}
          />
          <QuickActionCard
            icon={RotateCcw}
            title="Retest Management"
            description="Allocate and track pending retests"
            onClick={() => navigate("/coordinator/academic")}
          />
          <QuickActionCard
            icon={FileText}
            title="Exams Module"
            description="Create and manage examination papers"
            onClick={() => navigate("/coordinator/exams")}
            accentClass="text-ark-warning"
          />
          <QuickActionCard
            icon={TrendingUp}
            title="Student Progress"
            description="Monitor student risk levels and marks"
            onClick={() => navigate("/coordinator/students")}
            accentClass="text-ark-success"
          />
        </div>
      </div>
    </div>
  );
};

export default CoordinatorDashboard;
