import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData, isNearCampus } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  UserCheck, BookOpen, AlertTriangle, RotateCcw, UserX,
  DollarSign, Phone, CheckCircle2, Clock, TrendingDown, Users, ChevronDown, ChevronUp,
  MapPin, ChevronRight, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const MetricCard: React.FC<{
  icon: React.ElementType; label: string; value: string | number; subtitle?: string;
  variant?: "default" | "success" | "warning" | "danger"; onClick?: () => void;
}> = ({ icon: Icon, label, value, subtitle, variant = "default", onClick }) => {
  const vc = { default: "border-border", success: "border-ark-success/30", warning: "border-ark-warning/30", danger: "border-ark-danger/30" };
  const ic = { default: "text-accent", success: "text-ark-success", warning: "text-ark-warning", danger: "text-ark-danger" };
  return (
    <div className={`metric-card ${vc[variant]} animate-slide-up ${onClick ? "cursor-pointer hover:bg-muted/20" : ""}`} onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${ic[variant]}`} />
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
};

const DailyControlBoard: React.FC = () => {
  const { teachers, coordinators, management, admins, checkins, adminCheckins, adminCheckIn, adminCheckout, retestQueue, feeRecords, admissionCalls, attendance, adminChecklist, weeklyPlans, students, toggleChecklistItem, walkIns, violations, overrideRequests } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [showChecklist, setShowChecklist] = useState(false);
  const [showRetestList, setShowRetestList] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const checklistRef = useRef<HTMLDivElement>(null);
  const retestRef = useRef<HTMLDivElement>(null);

  // Admin's own check-in status
  const myCheckin = user?.profileId ? adminCheckins[user.profileId]?.[today] : null;

  const handleAdminCheckin = async () => {
    if (!user?.profileId) return toast.error("Profile not found");
    setCheckinLoading(true);
    if (!navigator.geolocation) {
      await adminCheckIn(user.profileId, false);
      toast.error("Geolocation not supported — check-in submitted without geo validation");
      setCheckinLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        await adminCheckIn(user.profileId!, result.valid);
        if (result.valid) toast.success(`Check-in submitted at ${result.campus} — pending Augustine's approval`);
        else toast.warning("Check-in submitted but you are NOT within campus vicinity — pending approval");
        setCheckinLoading(false);
      },
      async () => {
        await adminCheckIn(user.profileId!, false);
        toast.error("Location access denied — check-in submitted without geo validation");
        setCheckinLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const handleAdminCheckout = async () => {
    if (!user?.profileId) return toast.error("Profile not found");
    setCheckoutLoading(true);
    if (!navigator.geolocation) {
      await adminCheckout(user.profileId, false);
      toast.error("Geolocation not supported — check-out submitted without geo validation");
      setCheckoutLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        await adminCheckout(user.profileId!, result.valid);
        if (result.valid) toast.success(`Check-out submitted at ${result.campus} — pending Augustine's approval`);
        else toast.warning("Check-out submitted but you are NOT within campus vicinity — pending approval");
        setCheckoutLoading(false);
      },
      async () => {
        await adminCheckout(user.profileId!, false);
        toast.error("Location access denied — check-out submitted without geo validation");
        setCheckoutLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Combine all staff (teachers, coordinators, management, admins) to get total checkin counts
  const allStaff = useMemo(() => {
    const list = [
      ...teachers,
      ...coordinators,
      ...management,
      ...admins,
    ];
    const seen = new Set();
    return list.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [teachers, coordinators, management, admins]);

  const todayCheckins = useMemo(() => {
    return allStaff.map(s => {
      const checkin = checkins[s.id]?.[today] || adminCheckins[s.id]?.[today] || null;
      return { staff: s, checkin };
    });
  }, [allStaff, checkins, adminCheckins, today]);

  const onTime = todayCheckins.filter(c => c.checkin?.status === "on-time").length;
  const late = todayCheckins.filter(c => c.checkin?.status === "late").length;
  const pendingCheckins = todayCheckins.filter(c => c.checkin?.status === "pending" || c.checkin?.checkoutStatus === "pending");
  const notCheckedIn = allStaff.length - todayCheckins.filter(c => c.checkin).length;

  const retestPending = retestQueue.filter(r => r.status === "pending");
  const feesPaid = feeRecords.filter(f => f.paid).length;
  const feesTotal = feeRecords.length;
  const feePercent = feesTotal > 0 ? Math.round((feesPaid / feesTotal) * 100) : 0;
  const todayCalls = admissionCalls.filter(c => c.date === today).length;
  const checklistDone = adminChecklist.filter(c => c.done).length;
  const checklistTotal = adminChecklist.length;

  // Marks pending with severity
  const marksPendingItems = retestQueue.filter(r => r.status !== "completed");
  const marksCritical = marksPendingItems.filter(r => r.dueDate < today).length;
  const marksWarning = marksPendingItems.length - marksCritical;

  // Absent >3 days
  const studentsAbsent3 = (() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split("T")[0];
    });
    const absentCounts: Record<string, number> = {};
    Object.values(attendance).forEach(teacherAtt => {
      last7.forEach(date => {
        const dayRecord = teacherAtt[date];
        if (dayRecord) {
          Object.entries(dayRecord).forEach(([student, status]) => {
            if (status === "absent") absentCounts[student] = (absentCounts[student] || 0) + 1;
          });
        }
      });
    });
    return Object.values(absentCounts).filter(c => c >= 3).length;
  })();

  // SLA breach counter
  const slaBreaches = violations.filter(v => !v.resolved).length;
  const pendingOverrides = overrideRequests.filter(o => o.status === "pending").length;

  // End-of-day lock check
  const canSignOff = checklistDone === checklistTotal && retestPending.length === 0;

  const alertItems = [
    ...(retestPending.length > 2 ? [{
      msg: `${retestPending.length} retest allocations pending`,
      type: "danger" as const,
      severity: "critical" as const,
      onResolve: () => {
        setShowRetestList(true);
        toast.info("Retest allocations section opened below.");
        setTimeout(() => {
          retestRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }] : []),
    ...(feePercent < 75 ? [{
      msg: `Fee collection at ${feePercent}% — below target`,
      type: "warning" as const,
      severity: "warning" as const,
      onResolve: () => {
        navigate("/admin/fees");
      }
    }] : []),
    ...(notCheckedIn > 0 ? [{
      msg: `${notCheckedIn} staff not checked in`,
      type: "warning" as const,
      severity: "warning" as const,
      onResolve: () => {
        navigate("/admin/teacher-checkins");
      }
    }] : []),
    ...(checklistDone < checklistTotal ? [{
      msg: `Admin checklist: ${checklistDone}/${checklistTotal} complete`,
      type: "warning" as const,
      severity: "info" as const,
      onResolve: () => {
        setShowChecklist(true);
        toast.info("End-of-day checklist section opened below.");
        setTimeout(() => {
          checklistRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }] : []),
    ...(marksCritical > 0 ? [{
      msg: `${marksCritical} marks verifications overdue >48hrs`,
      type: "danger" as const,
      severity: "critical" as const,
      onResolve: () => {
        setShowRetestList(true);
        toast.info("Retest allocations section opened below.");
        setTimeout(() => {
          retestRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Daily Control Board</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Admin Self Check-in */}
      <section>
        {myCheckin && myCheckin.status !== "pending" ? (
          <div className="state-card-success">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-ark-success/15 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-ark-success" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Checked in at {myCheckin.time}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {myCheckin.status === "on-time" ? "On time" : "Late"} · Geo: {myCheckin.geoValid ? "Verified" : "Not verified"}
                </p>
              </div>
              <span className={myCheckin.status === "on-time" ? "status-pill-success" : "status-pill-warning"}>
                {myCheckin.status === "on-time" ? "On Time" : "Late"}
              </span>
            </div>
          </div>
        ) : myCheckin && myCheckin.status === "pending" ? (
          <div className="state-card-warning">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-ark-warning/15 flex items-center justify-center">
                <Clock className="w-6 h-6 text-ark-warning animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Checked in at {myCheckin.time}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Geo: {myCheckin.geoValid ? "Verified" : "Not verified"} · Awaiting approval
                </p>
              </div>
              <span className="status-pill-warning animate-pulse">Pending</span>
            </div>
          </div>
        ) : (
          <button onClick={handleAdminCheckin} disabled={checkinLoading}
            className="state-card-action w-full text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <MapPin className={`w-6 h-6 text-accent ${checkinLoading ? "animate-pulse" : ""}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{checkinLoading ? "Verifying Location..." : "Tap to Check In"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{checkinLoading ? "Getting GPS coordinates" : "Check-in will be approved by Management"}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </button>
        )}
      </section>

      {/* Admin Self Check-out */}
      {myCheckin && (
        <section>
          {myCheckin.checkoutTime && myCheckin.checkoutStatus !== "pending" ? (
            <div className="state-card-success">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-ark-success/15 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-ark-success" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Checked out at {myCheckin.checkoutTime}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {myCheckin.checkoutStatus === "on-time" ? "On time" : "Early"} · Geo: {myCheckin.checkoutGeoValid ? "Verified" : "Not verified"}
                  </p>
                </div>
                <span className="status-pill-success">
                  {myCheckin.checkoutStatus === "on-time" ? "On Time" : "Early"}
                </span>
              </div>
            </div>
          ) : myCheckin.checkoutTime && myCheckin.checkoutStatus === "pending" ? (
            <div className="state-card-warning animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-ark-warning/15 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-ark-warning animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Checked out at {myCheckin.checkoutTime}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Geo: {myCheckin.checkoutGeoValid ? "Verified" : "Not verified"} · Awaiting approval
                  </p>
                </div>
                <span className="status-pill-warning animate-pulse">Pending</span>
              </div>
            </div>
          ) : (
            <button onClick={handleAdminCheckout} disabled={checkoutLoading}
              className="state-card-action w-full text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center">
                  <LogOut className={`w-6 h-6 text-muted-foreground ${checkoutLoading ? "animate-pulse" : ""}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{checkoutLoading ? "Verifying Location..." : "Tap to Check Out"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{checkoutLoading ? "Getting GPS coordinates" : "Check-out will be approved by Management"}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </button>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Staff Check-in: On Time / Pending / Missed */}
        <div className={`metric-card col-span-2 lg:col-span-1 cursor-pointer hover:bg-muted/20 ${pendingCheckins.length > 0 ? 'border-ark-warning/30' : 'border-accent/30'}`}
          onClick={() => navigate("/admin/teacher-checkins")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff Check-in</span>
            <UserCheck className="w-4 h-4 text-accent" />
          </div>
          <div className="grid grid-cols-3 gap-1 mt-1">
            <div className="text-center">
              <p className="text-lg font-bold text-ark-success">{onTime}</p>
              <p className="text-[10px] text-muted-foreground">On Time</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-ark-warning">{late}</p>
              <p className="text-[10px] text-muted-foreground">Late</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-ark-danger">{notCheckedIn}</p>
              <p className="text-[10px] text-muted-foreground">Absent</p>
            </div>
          </div>
          {pendingCheckins.length > 0 && (
            <p className="text-[10px] text-ark-warning mt-1.5 text-center animate-pulse">{pendingCheckins.length} pending approval — tap to review</p>
          )}
        </div>
        <MetricCard icon={RotateCcw} label="Retest Pending" value={retestPending.length}
          subtitle="Awaiting allocation" variant={retestPending.length > 3 ? "danger" : "default"}
          onClick={() => setShowRetestList(!showRetestList)} />
        <MetricCard icon={DollarSign} label="Fee Collection" value={`${feePercent}%`}
          subtitle={`${feesPaid}/${feesTotal} paid`} variant={feePercent >= 90 ? "success" : feePercent >= 75 ? "warning" : "danger"} />
        {/* Calls + Walk-ins */}
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Admission</span>
            <Phone className="w-4 h-4 text-accent" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <p className="text-lg font-bold text-foreground">{todayCalls}</p>
              <p className="text-[10px] text-muted-foreground">Calls <span className="text-accent">/10</span></p>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{walkIns}</p>
              <p className="text-[10px] text-muted-foreground">Walk-ins <span className="text-accent">/2</span></p>
            </div>
          </div>
        </div>
        <MetricCard icon={CheckCircle2} label="Checklist" value={`${checklistDone}/${checklistTotal}`}
          subtitle="End-of-day items" variant={checklistDone === checklistTotal ? "success" : "warning"}
          onClick={() => setShowChecklist(!showChecklist)} />
        <MetricCard icon={UserX} label="Absent >3 Days" value={studentsAbsent3}
          subtitle="Students need follow-up" variant={studentsAbsent3 > 0 ? "danger" : "success"} />
        {/* Marks Pending with severity */}
        <div className="metric-card border-ark-warning/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Marks Pending</span>
            <Clock className="w-4 h-4 text-ark-warning" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">{marksPendingItems.length}</p>
          <div className="flex gap-2 text-xs">
            {marksCritical > 0 && <span className="text-ark-danger font-medium">{marksCritical} &gt;48hrs</span>}
            {marksWarning > 0 && <span className="text-ark-warning font-medium">{marksWarning} &lt;24hrs</span>}
          </div>
        </div>
        <MetricCard icon={AlertTriangle} label="SLA Breaches" value={slaBreaches}
          subtitle="Unresolved violations" variant={slaBreaches > 0 ? "danger" : "success"} />
        <MetricCard icon={Users} label="Override Requests" value={pendingOverrides}
          subtitle="Awaiting approval" variant={pendingOverrides > 0 ? "warning" : "default"} />
      </div>


      {/* Clickable Retest List */}
      {showRetestList && retestPending.length > 0 && (
        <div ref={retestRef} className="glass-card p-4 md:p-5 animate-in fade-in slide-in-from-top-2">
          <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-accent" /> Pending Retest Allocations
          </h2>
          <div className="space-y-2">
            {retestPending.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50 text-sm">
                <div>
                  <span className="font-medium text-foreground">{r.student}</span>
                  <span className="text-muted-foreground ml-2">· {r.subject} · {r.marks}%</span>
                </div>
                <span className="text-xs text-muted-foreground">Due: {r.dueDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clickable Checklist */}
      {showChecklist && (
        <div ref={checklistRef} className="glass-card p-4 md:p-5 animate-in fade-in slide-in-from-top-2">
          <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-accent" /> End-of-Day Checklist
          </h2>
          <div className="space-y-2">
            {adminChecklist.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  try {
                    await toggleChecklistItem(item.id);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to update checklist item");
                  }
                }}
                className={`flex items-center gap-3 w-full text-left p-2 rounded-lg transition-colors hover:bg-muted/20 ${item.done ? "opacity-60" : ""}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${item.done ? "bg-ark-success border-ark-success" : "border-muted-foreground"}`}>
                  {item.done && <CheckCircle2 className="w-3 h-3 text-foreground" />}
                </div>
                <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.label}</span>
              </button>
            ))}
          </div>
          {!canSignOff && (
            <p className="text-xs text-ark-danger mt-3">Cannot sign off until all checklist items are complete and retests allocated.</p>
          )}
        </div>
      )}

      {/* Alerts with severity & resolve */}
      {alertItems.length > 0 && (
        <div className="glass-card p-4 md:p-5">
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent" /> Active Alerts
          </h2>
          <div className="space-y-2">
            {alertItems.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${a.type === "danger" ? "border-ark-danger/30 bg-ark-danger/5" : "border-ark-warning/30 bg-ark-warning/5"}`}>
                <TrendingDown className={`w-4 h-4 flex-shrink-0 mt-0.5 ${a.type === "danger" ? "text-ark-danger" : "text-ark-warning"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${a.severity === "critical" ? "bg-ark-danger/20 text-ark-danger" : a.severity === "warning" ? "bg-ark-warning/20 text-ark-warning" : "bg-accent/20 text-accent"}`}>
                      {a.severity}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mt-1">{a.msg}</p>
                </div>
                 <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={a.onResolve}>
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyControlBoard;
