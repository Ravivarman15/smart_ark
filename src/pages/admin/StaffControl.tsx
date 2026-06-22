import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Users, Clock, CheckCircle2, XCircle, Plus, Edit, Filter, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePrompt } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const StaffControl: React.FC = () => {
  const { teachers, checkins, campuses, addTeacher, updateTeacher, addOverrideRequest, historicalAttendance } = useAppData();
  const prompt = usePrompt();
  const today = new Date().toISOString().split("T")[0];

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [editingTeacher, setEditingTeacher] = useState<{ id: string; name: string; email: string; campus: string; subject: string; } | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", campus: campuses?.[0] || "", subject: "" });
  const [campusFilter, setCampusFilter] = useState("All");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const subjects = [...new Set(teachers.map(t => t.subject))];

  const logs = teachers.map(t => {
    const checkin = checkins[t.id]?.[today];
    const geoViolations = Object.values(checkins[t.id] || {}).filter(c => !c.geoValid).length;
    return {
      id: t.id,
      teacher: t.name,
      campus: t.campus,
      subject: t.subject,
      email: t.email,
      checkinTime: checkin?.time || "—",
      status: checkin?.status || "absent" as const,
      geoValid: checkin?.geoValid ?? false,
      geoViolations,
      lateCount: t.lateCount || 0,
    };
  });

  const filtered = logs.filter(log => {
    if (campusFilter !== "All" && log.campus !== campusFilter) return false;
    if (subjectFilter !== "All" && log.subject !== subjectFilter) return false;
    if (statusFilter !== "All" && log.status !== statusFilter) return false;
    return true;
  });

  const onTime = logs.filter(a => a.status === "on-time").length;
  const late = logs.filter(a => a.status === "late").length;
  const absent = logs.filter(a => a.status === "absent").length;

  const openAdd = () => {
    setFormData({ name: "", email: "", campus: campuses?.[0] || "", subject: "" });
    setEditingTeacher(null);
    setIsAddOpen(true);
  };

  const openEdit = (t: { id: string; teacher: string; email?: string; campus: string; subject: string; }) => {
    setFormData({ name: t.teacher, email: t.email || "", campus: t.campus, subject: t.subject });
    setEditingTeacher({ id: t.id, name: t.teacher, email: t.email || "", campus: t.campus, subject: t.subject });
    setIsAddOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.name || !formData.campus) return toast.error("Please fill required fields");
    setSaving(true);
    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher.id, formData);
        toast.success("Teacher updated");
      } else {
        await addTeacher(formData as Parameters<typeof addTeacher>[0]);
        toast.success("Teacher added — they will appear after the next data sync");
      }
      setIsAddOpen(false);
    } catch (err: any) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleOverride = async (id: string, name: string) => {
    const reason = await prompt({
      type: "info",
      title: "Override Request",
      description: `Enter an override reason for ${name}:`,
      placeholder: "Reason for override",
      confirmText: "Submit",
    });
    if (!reason || !reason.trim()) return;
    try {
      await addOverrideRequest({
        userId: id,
        userName: name,
        type: "late-checkin",
        reason: reason.trim(),
        requestedBy: "Admin",
        status: "pending",
      });
      toast.success("Override request submitted for management approval");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit override request");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Staff & Attendance Control</h1>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Teacher</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingTeacher ? "Edit Teacher" : "Add Teacher"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><label className="text-sm">Name</label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Teacher Name" /></div>
              <div className="space-y-2"><label className="text-sm">Email</label><Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="teacher@ark.edu" /></div>
              <div className="space-y-2">
                <label className="text-sm">Campus</label>
                {campuses.length === 0 ? (
                  <p className="text-xs text-ark-danger bg-ark-danger/10 border border-ark-danger/20 rounded-md px-3 py-2">
                    No campuses available. Ask management to add a campus first.
                  </p>
                ) : (
                  <select className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" value={formData.campus} onChange={e => setFormData({ ...formData, campus: e.target.value })}>
                    {campuses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <div className="space-y-2"><label className="text-sm">Subject</label><Input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} placeholder="e.g. Mathematics" /></div>
              <Button className="w-full" onClick={handleSave} disabled={saving || campuses.length === 0}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="metric-card border-ark-success/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">On Time</span>
          <p className="text-2xl md:text-3xl font-display font-bold text-ark-success">{onTime}</p>
        </div>
        <div className="metric-card border-ark-warning/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Late</span>
          <p className="text-2xl md:text-3xl font-display font-bold text-ark-warning">{late}</p>
        </div>
        <div className="metric-card border-ark-danger/30">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Absent</span>
          <p className="text-2xl md:text-3xl font-display font-bold text-ark-danger">{absent}</p>
        </div>
      </div>

      <div className="flex border-b border-border mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "today" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("today")}
        >
          Today's Overview
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "history" ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("history")}
        >
          Attendance History
        </button>
      </div>

      {activeTab === "today" && (
        <>
          {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <select value={campusFilter} onChange={e => setCampusFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground min-w-0 flex-1 sm:flex-none">
          <option value="All">All Campuses</option>
          {campuses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground min-w-0 flex-1 sm:flex-none">
          <option value="All">All Subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground min-w-0 flex-1 sm:flex-none">
          <option value="All">All Status</option>
          <option value="on-time">On Time</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
      </div>

      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" /> Today's Attendance Log
        </h2>
        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {filtered.map((log, i) => (
            <div key={i} className={`p-3 rounded-lg border ${log.status === "on-time" ? "border-ark-success/20" : log.status === "late" ? "border-ark-warning/20" : "border-ark-danger/20"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-foreground text-sm">{log.teacher}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${log.status === "on-time" ? "bg-ark-success/20 text-ark-success" : log.status === "late" ? "bg-ark-warning/20 text-ark-warning" : "bg-ark-danger/20 text-ark-danger"}`}>
                  {log.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{log.campus}</span>
                <span>{log.checkinTime}</span>
                {log.geoValid ? <CheckCircle2 className="w-3 h-3 text-ark-success" /> : <XCircle className="w-3 h-3 text-ark-danger" />}
                {log.geoViolations > 0 && <span className="text-ark-danger">Geo: {log.geoViolations}</span>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">Monthly Late: <span className={log.lateCount > 5 ? "text-ark-danger font-bold" : "text-foreground"}>{log.lateCount}</span></span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(log)}><Edit className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => handleOverride(log.id, log.teacher)}>Override</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left">
              <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
              <th className="pb-3 text-muted-foreground font-medium">Campus</th>
              <th className="pb-3 text-muted-foreground font-medium">Check-in</th>
              <th className="pb-3 text-muted-foreground font-medium">Status</th>
              <th className="pb-3 text-muted-foreground font-medium">Geo</th>
              <th className="pb-3 text-muted-foreground font-medium">Geo Violations</th>
              <th className="pb-3 text-muted-foreground font-medium">Monthly Late</th>
              <th className="pb-3 text-muted-foreground font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="py-3 text-foreground font-medium">{log.teacher}</td>
                  <td className="py-3 text-muted-foreground">{log.campus}</td>
                  <td className="py-3 text-muted-foreground">{log.checkinTime}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${log.status === "on-time" ? "bg-ark-success/20 text-ark-success" : log.status === "late" ? "bg-ark-warning/20 text-ark-warning" : "bg-ark-danger/20 text-ark-danger"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3">{log.geoValid ? <CheckCircle2 className="w-4 h-4 text-ark-success" /> : <XCircle className="w-4 h-4 text-ark-danger" />}</td>
                  <td className="py-3">
                    {log.geoViolations > 0 ? <span className="text-ark-danger font-medium">{log.geoViolations}</span> : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="py-3">
                    <span className={log.lateCount > 5 ? "text-ark-danger font-medium" : "text-foreground"}>{log.lateCount}</span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(log)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => handleOverride(log.id, log.teacher)}>Override</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No teachers match filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeTab === "history" && (
        <div className="glass-card p-4 md:p-5 animate-in fade-in slide-in-from-bottom-2">
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" /> Historical Attendance Logs
          </h2>
          {historicalAttendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No attendance history available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="pb-3 text-muted-foreground font-medium">Date</th>
                  <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
                  <th className="pb-3 text-muted-foreground font-medium">Check-in Time</th>
                  <th className="pb-3 text-muted-foreground font-medium">Status</th>
                  <th className="pb-3 text-muted-foreground font-medium">Geo Valid</th>
                </tr></thead>
                <tbody>
                  {historicalAttendance.map((log) => (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="py-3 text-muted-foreground">{log.date}</td>
                      <td className="py-3 text-foreground font-medium">{log.teacherName}</td>
                      <td className="py-3 text-muted-foreground">{log.checkinTime}</td>
                      <td className="py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${log.status === "on-time" ? "bg-ark-success/20 text-ark-success" : log.status === "late" ? "bg-ark-warning/20 text-ark-warning" : "bg-ark-danger/20 text-ark-danger"}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3">
                        {log.geoValid ? <CheckCircle2 className="w-4 h-4 text-ark-success" /> : <XCircle className="w-4 h-4 text-ark-danger" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StaffControl;
