import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { ShieldAlert, CheckCircle2, AlertTriangle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const typeLabel = (t: string) => {
  const map: Record<string, string> = {
    "marks-sla": "Marks SLA",
    "retest-delay": "Retest Delay",
    "late-checkin": "Late Check-in",
    "checklist-miss": "Checklist Miss",
    "fee-target": "Fee/Admission",
    "attendance-gap": "Attendance Gap",
  };
  return map[t] || t;
};

const typeColor = (t: string) => {
  if (t === "marks-sla" || t === "retest-delay") return "bg-ark-danger/20 text-ark-danger";
  if (t === "late-checkin") return "bg-ark-warning/20 text-ark-warning";
  return "bg-accent/20 text-accent";
};

const ComplianceViolations: React.FC = () => {
  const { violations, resolveViolation, overrideRequests, approveOverride, rejectOverride, teachers } = useAppData();
  const today = new Date().toISOString().split("T")[0];

  const unresolvedViolations = violations.filter(v => !v.resolved);
  const pendingOverrides = overrideRequests.filter(o => o.status === "pending");
  const resolvedViolations = violations.filter(v => v.resolved);

  // Teacher-level compliance summary
  const teacherCompliance = teachers.map(t => {
    const teacherViolations = violations.filter(v => v.userId === t.id && !v.resolved);
    const lateCount = t.lateCount || 0;
    const slaBreaches = teacherViolations.filter(v => v.type === "marks-sla").length;
    const retestDelays = teacherViolations.filter(v => v.type === "retest-delay").length;
    const totalIssues = teacherViolations.length;
    const status = totalIssues === 0 ? "green" : totalIssues <= 2 ? "yellow" : "red";
    return { ...t, violations: teacherViolations, lateCount, slaBreaches, retestDelays, totalIssues, status };
  }).sort((a, b) => b.totalIssues - a.totalIssues);

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Compliance & Violations</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="metric-card border-ark-danger/30">
          <ShieldAlert className="w-4 h-4 text-ark-danger" />
          <p className="text-2xl font-display font-bold text-ark-danger">{unresolvedViolations.length}</p>
          <p className="text-xs text-muted-foreground">Open Violations</p>
        </div>
        <div className="metric-card border-ark-warning/30">
          <Clock className="w-4 h-4 text-ark-warning" />
          <p className="text-2xl font-display font-bold text-ark-warning">{pendingOverrides.length}</p>
          <p className="text-xs text-muted-foreground">Pending Overrides</p>
        </div>
        <div className="metric-card border-ark-success/30">
          <CheckCircle2 className="w-4 h-4 text-ark-success" />
          <p className="text-2xl font-display font-bold text-ark-success">{resolvedViolations.length}</p>
          <p className="text-xs text-muted-foreground">Resolved</p>
        </div>
        <div className="metric-card">
          <p className="text-2xl font-display font-bold text-foreground">{overrideRequests.filter(o => o.status === "approved").length}</p>
          <p className="text-xs text-muted-foreground">Approved Overrides</p>
        </div>
      </div>

      {/* Teacher Compliance Summary */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Staff Compliance Summary
        </h2>
        <div className="space-y-2">
          {teacherCompliance.map(t => (
            <div key={t.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-2 ${t.status === "green" ? "border-ark-success/20 bg-ark-success/5" : t.status === "yellow" ? "border-ark-warning/20 bg-ark-warning/5" : "border-ark-danger/20 bg-ark-danger/5"}`}>
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.subject} · {t.campus}</p>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className={t.lateCount > 5 ? "text-ark-danger font-medium" : "text-muted-foreground"}>Late: {t.lateCount}</span>
                <span className={t.slaBreaches > 0 ? "text-ark-danger font-medium" : "text-muted-foreground"}>SLA: {t.slaBreaches}</span>
                <span className={t.retestDelays > 0 ? "text-ark-warning font-medium" : "text-muted-foreground"}>Retest: {t.retestDelays}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === "green" ? "bg-ark-success/20 text-ark-success" : t.status === "yellow" ? "bg-ark-warning/20 text-ark-warning" : "bg-ark-danger/20 text-ark-danger"}`}>
                  {t.status === "green" ? "Clean" : t.status === "yellow" ? "Warning" : "Escalated"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Violations */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-ark-danger" /> Active Violations
        </h2>
        <div className="space-y-2">
          {unresolvedViolations.map(v => (
            <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-ark-danger/20 bg-ark-danger/5 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${typeColor(v.type)}`}>{typeLabel(v.type)}</span>
                  <span className="text-xs text-muted-foreground">{v.date}</span>
                </div>
                <p className="text-sm text-foreground font-medium mt-1">{v.userName}</p>
                <p className="text-xs text-muted-foreground">{v.details}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                  await resolveViolation(v.id);
                  toast.success("Violation resolved");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to resolve violation");
                } finally {
                  btn.disabled = false;
                }
              }}>
                Resolve
              </Button>
            </div>
          ))}
          {unresolvedViolations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No active violations 🎉</p>}
        </div>
      </div>

      {/* Override Requests */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-ark-warning" /> Override Requests
        </h2>
        <div className="space-y-2">
          {overrideRequests.map(o => (
            <div key={o.id} className={`p-3 rounded-lg border gap-2 ${o.status === "pending" ? "border-ark-warning/20 bg-ark-warning/5" : o.status === "approved" ? "border-ark-success/20 bg-ark-success/5 opacity-70" : "border-muted bg-muted/10 opacity-50"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{o.userName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">{o.type}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${o.status === "pending" ? "bg-ark-warning/20 text-ark-warning" : o.status === "approved" ? "bg-ark-success/20 text-ark-success" : "bg-ark-danger/20 text-ark-danger"}`}>{o.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Reason: {o.reason}</p>
                  <p className="text-xs text-muted-foreground">Requested by: {o.requestedBy} · {new Date(o.timestamp).toLocaleString()}</p>
                  {o.approvedBy && <p className="text-xs text-ark-success">Approved by: {o.approvedBy}</p>}
                  {o.comment && <p className="text-xs text-muted-foreground italic">Comment: {o.comment}</p>}
                </div>
                {o.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" className="text-xs" onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      try {
                        await approveOverride(o.id, "Management");
                        toast.success("Override approved");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to approve override");
                      } finally {
                        btn.disabled = false;
                      }
                    }}>Approve</Button>
                    <Button size="sm" variant="outline" className="text-xs" onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      try {
                        await rejectOverride(o.id);
                        toast.success("Override rejected");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to reject override");
                      } finally {
                        btn.disabled = false;
                      }
                    }}>Reject</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {overrideRequests.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No override requests.</p>}
        </div>
      </div>
    </div>
  );
};

export default ComplianceViolations;
