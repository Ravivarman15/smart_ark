import React, { useState, useMemo } from "react";
import { useAppData, CheckinRecord, TeacherInfo } from "@/contexts/AppDataContext";
import {
  UserCheck, Clock, MapPin, ShieldCheck, CheckCircle2,
  XCircle, Search, Filter, AlertTriangle, Users, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type FilterTab = "all" | "on-time" | "pending" | "missed" | "pending-out";

const TeacherCheckins: React.FC = () => {
  const { teachers, checkins, approveCheckin, approveCheckout } = useAppData();
  const today = new Date().toISOString().split("T")[0];
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  // Override Dialog State
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string, name: string, type: "in" | "out" } | null>(null);
  const [overrideForm, setOverrideForm] = useState({ comments: "", overrideTime: "" });

  // Build teacher checkin data
  const teacherCheckinData = useMemo(() => {
    return teachers.map(t => {
      const checkin = checkins[t.id]?.[today] || null;
      let category: "on-time" | "pending" | "missed" | "pending-out";
      if (!checkin) {
        category = "missed";
      } else if (checkin.status === "pending") {
        category = "pending";
      } else if (checkin.checkoutStatus === "pending") {
        category = "pending-out";
      } else {
        category = "on-time"; // on-time or late — both are approved/checked-in
      }
      return { teacher: t, checkin, category };
    });
  }, [teachers, checkins, today]);

  // Counts
  const counts = useMemo(() => ({
    all: teacherCheckinData.length,
    "on-time": teacherCheckinData.filter(d => d.category === "on-time").length,
    pending: teacherCheckinData.filter(d => d.category === "pending").length,
    "pending-out": teacherCheckinData.filter(d => d.category === "pending-out").length,
    missed: teacherCheckinData.filter(d => d.category === "missed").length,
  }), [teacherCheckinData]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = teacherCheckinData;
    if (activeFilter !== "all") list = list.filter(d => d.category === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.teacher.name.toLowerCase().includes(q) || d.teacher.campus.toLowerCase().includes(q));
    }
    // Sort: pending first, pending-out second, then missed, then on-time
    return list.sort((a, b) => {
      const order = { pending: 0, "pending-out": 1, missed: 2, "on-time": 3 };
      return order[a.category] - order[b.category];
    });
  }, [teacherCheckinData, activeFilter, search]);

  const handleApprove = (teacherId: string, teacherName: string) => {
    setSelectedStaff({ id: teacherId, name: teacherName, type: "in" });
    const now = new Date();
    const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T09:30`;
    setOverrideForm({ comments: "", overrideTime: defaultTime });
    setOverrideDialogOpen(true);
  };

  const handleApproveOut = (teacherId: string, teacherName: string) => {
    setSelectedStaff({ id: teacherId, name: teacherName, type: "out" });
    const now = new Date();
    const defaultTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T16:00`;
    setOverrideForm({ comments: "", overrideTime: defaultTime });
    setOverrideDialogOpen(true);
  };

  const confirmOverrideApproval = async () => {
    if (!selectedStaff) return;
    setApprovingId(selectedStaff.type === "in" ? selectedStaff.id : selectedStaff.id + "-out");
    try {
      if (selectedStaff.type === "in") {
        await approveCheckin(selectedStaff.id, overrideForm.comments, overrideForm.overrideTime);
        toast.success(`${selectedStaff.name}'s check-in approved!`);
      } else {
        await approveCheckout(selectedStaff.id, overrideForm.comments, overrideForm.overrideTime);
        toast.success(`${selectedStaff.name}'s check-out approved!`);
      }
      setOverrideDialogOpen(false);
    } catch {
      toast.error(`Failed to approve ${selectedStaff.type === "in" ? "check-in" : "check-out"}`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveAll = async () => {
    if (approvingAll) return;
    const pendingTeachers = teacherCheckinData.filter(d => d.category === "pending");
    if (pendingTeachers.length === 0) return;
    setApprovingAll(true);
    try {
      // Run in parallel with allSettled — one failure must not abort the rest.
      const results = await Promise.allSettled(
        pendingTeachers.map(({ teacher }) => approveCheckin(teacher.id))
      );
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded > 0 && failed === 0) {
        toast.success(`${succeeded} check-in(s) approved!`);
      } else if (succeeded > 0 && failed > 0) {
        toast.warning(`${succeeded} approved, ${failed} failed — check dashboard for details`);
      } else {
        toast.error(`All ${failed} approval(s) failed`);
      }
    } finally {
      setApprovingAll(false);
    }
  };

  const filterTabs: { id: FilterTab; label: string; color: string; count: number }[] = [
    { id: "all", label: "All Teachers", color: "text-accent", count: counts.all },
    { id: "on-time", label: "Checked In/Out", color: "text-ark-success", count: counts["on-time"] },
    { id: "pending", label: "Pending In", color: "text-ark-warning", count: counts.pending },
    { id: "pending-out", label: "Pending Out", color: "text-muted-foreground", count: counts["pending-out"] },
    { id: "missed", label: "Missed", color: "text-ark-danger", count: counts.missed },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-accent" /> Teacher Check-ins
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {counts.pending > 0 && (
          <Button
            onClick={handleApproveAll}
            disabled={approvingAll}
            className="gradient-accent text-accent-foreground gap-2 disabled:opacity-60"
          >
            <ShieldCheck className={`w-4 h-4 ${approvingAll ? "animate-spin" : ""}`} />
            {approvingAll ? "Approving…" : `Approve All (${counts.pending})`}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="metric-card border-accent/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</span>
            <Users className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">{counts.all}</p>
          <p className="text-xs text-muted-foreground">Teachers today</p>
        </div>
        <div className="metric-card border-ark-success/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked In</span>
            <CheckCircle2 className="w-4 h-4 text-ark-success" />
          </div>
          <p className="text-2xl font-display font-bold text-ark-success">{counts["on-time"]}</p>
          <p className="text-xs text-muted-foreground">Approved check-ins</p>
        </div>
        <div className={`metric-card ${counts.pending > 0 ? "border-ark-warning/30 ring-1 ring-ark-warning/20" : "border-border"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</span>
            <Clock className={`w-4 h-4 text-ark-warning ${counts.pending > 0 ? "animate-pulse" : ""}`} />
          </div>
          <p className="text-2xl font-display font-bold text-ark-warning">{counts.pending}</p>
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
        </div>
        <div className="metric-card border-ark-danger/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Missed</span>
            <XCircle className="w-4 h-4 text-ark-danger" />
          </div>
          <p className="text-2xl font-display font-bold text-ark-danger">{counts.missed}</p>
          <p className="text-xs text-muted-foreground">Not checked in</p>
        </div>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 p-1 bg-muted/20 rounded-lg border border-border">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeFilter === tab.id
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeFilter === tab.id ? `${tab.color} bg-muted/50` : "text-muted-foreground"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or campus..."
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
          />
        </div>
      </div>

      {/* Pending Alert Banner */}
      {counts.pending > 0 && activeFilter !== "pending" && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-ark-warning/5 border border-ark-warning/20">
          <AlertTriangle className="w-4 h-4 text-ark-warning flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            <strong className="text-ark-warning">{counts.pending}</strong> teacher check-in{counts.pending > 1 ? "s" : ""} pending your approval
          </p>
          <button
            onClick={() => setActiveFilter("pending")}
            className="text-xs font-semibold text-ark-warning hover:opacity-80 transition-opacity"
          >
            View →
          </button>
        </div>
      )}

      {/* Teacher List */}
      <div className="glass-card p-4 md:p-5">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <UserCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">No teachers match this filter</p>
            </div>
          ) : (
            filtered.map(({ teacher, checkin, category }) => (
              <TeacherCheckinRow
                key={teacher.id}
                teacher={teacher}
                checkin={checkin}
                category={category}
                onApprove={() => handleApprove(teacher.id, teacher.name)}
                onApproveOut={() => handleApproveOut(teacher.id, teacher.name)}
                isApproving={approvingId === teacher.id}
                isApprovingOut={approvingId === teacher.id + "-out"}
              />
            ))
          )}
        </div>
      </div>

      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {selectedStaff?.type === "in" ? "Check-in" : "Check-out"} - {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Override Time (Optional)</label>
              <Input 
                type="datetime-local" 
                value={overrideForm.overrideTime} 
                onChange={e => setOverrideForm({ ...overrideForm, overrideTime: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">Adjust this if the staff logged in earlier but couldn't mark attendance.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Comments / Remarks</label>
              <Textarea 
                placeholder="e.g., Forgot to mark, internet issue, permission granted..." 
                value={overrideForm.comments}
                onChange={e => setOverrideForm({ ...overrideForm, comments: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmOverrideApproval} disabled={!!approvingId}>
              {approvingId ? "Processing..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Individual Teacher Row ─────────────────────────────────────────
const TeacherCheckinRow: React.FC<{
  teacher: TeacherInfo;
  checkin: CheckinRecord | null;
  category: "on-time" | "pending" | "missed" | "pending-out";
  onApprove: () => void;
  onApproveOut: () => void;
  isApproving: boolean;
  isApprovingOut: boolean;
}> = ({ teacher, checkin, category, onApprove, onApproveOut, isApproving, isApprovingOut }) => {
  const borderClass = category === "on-time"
    ? "border-ark-success/15 bg-ark-success/[0.02]"
    : category === "pending"
    ? "border-ark-warning/20 bg-ark-warning/[0.03]"
    : category === "pending-out"
    ? "border-border bg-muted/[0.03]"
    : "border-border bg-muted/5";

  const initials = teacher.name.split(" ").map(n => n[0]).join("").toUpperCase();

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${borderClass}`}>
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          category === "on-time" ? "bg-ark-success/15 text-ark-success"
          : category === "pending" ? "bg-ark-warning/15 text-ark-warning"
          : category === "pending-out" ? "bg-muted/30 text-muted-foreground"
          : "bg-muted/30 text-muted-foreground"
        }`}>
          {initials}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{teacher.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span>{teacher.campus}</span>
            <span className="text-border">·</span>
            <span>{teacher.subject}</span>
            {checkin && (
              <>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {checkin.time}
                </span>
                <span className="text-border">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {checkin.geoValid
                    ? <span className="text-ark-success">Geo ✓</span>
                    : <span className="text-ark-danger">Geo ✗</span>
                  }
                </span>
                {checkin.checkoutTime && (
                  <>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-1">
                      <LogOut className="w-3 h-3" /> {checkin.checkoutTime}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status / Action */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {category === "on-time" && (
          <div className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              checkin?.status === "on-time"
                ? "bg-ark-success/15 text-ark-success"
                : "bg-ark-warning/15 text-ark-warning"
            }`}>
              {checkin?.status === "on-time" ? "On Time" : "Late"}
            </span>
            <CheckCircle2 className="w-4 h-4 text-ark-success" />
          </div>
        )}
        {category === "pending-out" && (
          <Button
            size="sm"
            disabled={isApprovingOut}
            className="bg-muted/40 hover:bg-muted/60 border border-border text-foreground text-xs gap-1.5 disabled:opacity-50"
            onClick={onApproveOut}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isApprovingOut ? "animate-spin" : ""}`} />
            {isApprovingOut ? "Approving..." : "Approve Out"}
          </Button>
        )}
        {category === "pending" && (
          <Button
            size="sm"
            disabled={isApproving}
            className="gradient-accent text-accent-foreground text-xs gap-1.5 disabled:opacity-50"
            onClick={onApprove}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isApproving ? "animate-spin" : ""}`} />
            {isApproving ? "Approving..." : "Approve"}
          </Button>
        )}
        {category === "missed" && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-ark-danger/10 text-ark-danger">
            Not Checked In
          </span>
        )}
      </div>
    </div>
  );
};

export default TeacherCheckins;
