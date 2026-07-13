import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, Layers, User, GraduationCap } from "lucide-react";
import { useNavigation } from "@/core/navigation";
import { resolveIcon } from "@/shared/icons";
import type { TeacherWorkspace } from "./useTeacherWorkspace";

// Profile, RBAC-granted modules, and leave — the "everything else" strip that
// used to live behind the More tab.

interface Props {
  ws: TeacherWorkspace;
  /** Module groups the teacher has been granted (RBAC-driven). */
  modules: ReturnType<typeof useNavigation>;
}

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Personal Leave", "Emergency Leave"];

const WorkspaceSection: React.FC<Props> = ({ ws, modules }) => {
  const { teacherInfo, teacherId, user, today, roster, myLeaves, addLeaveRequest } = ws;

  const [form, setForm] = useState({
    startDate: today, endDate: today, type: LEAVE_TYPES[0], reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submitLeave = async () => {
    if (!form.reason.trim()) { toast.error("Enter a reason for your leave"); return; }
    if (form.endDate < form.startDate) { toast.error("End date cannot be before the start date"); return; }
    setSubmitting(true);
    try {
      await addLeaveRequest({
        userId: teacherId,
        userName: teacherInfo?.name || user?.name || "",
        role: "teacher",
        startDate: form.startDate,
        endDate: form.endDate,
        type: form.type,
        reason: form.reason,
        status: "pending",
      });
      toast.success("Leave request submitted");
      setForm({ startDate: today, endDate: today, type: LEAVE_TYPES[0], reason: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="workspace" className="scroll-mt-24 space-y-5">
      {/* Profile */}
      <div className="rounded-2xl bg-card/60 border border-border p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
          <User className="w-6 h-6 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground truncate">
            {teacherInfo?.name || user?.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {teacherInfo?.subject || "Teacher"} · {user?.campus}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {teacherInfo?.className && (
              <span className="status-pill-info">
                <GraduationCap className="w-3 h-3" /> {teacherInfo.className}
              </span>
            )}
            <span className="status-pill-info">{roster.length} students</span>
          </div>
        </div>
      </div>

      {/* RBAC-granted modules */}
      {modules.length > 0 && (
        <div>
          <h2 className="section-heading">
            <Layers className="w-4 h-4 text-accent" /> My Modules
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {modules.map((group) => {
              const Icon = resolveIcon(group.icon);
              return (
                <NavLink
                  key={group.key}
                  to={group.items[0]?.path ?? "/teacher"}
                  className="rounded-xl bg-card/60 border border-border p-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{group.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {group.items.length} {group.items.length === 1 ? "feature" : "features"}
                    </p>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}

      {/* Leave */}
      <div>
        <h2 className="section-heading">
          <CalendarDays className="w-4 h-4 text-accent" /> Leave
          {myLeaves.some((l) => l.status === "pending") && (
            <span className="status-pill-warning">
              {myLeaves.filter((l) => l.status === "pending").length} pending
            </span>
          )}
        </h2>

        <div className="rounded-2xl bg-card/50 border border-border/60 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">From</label>
              <input
                type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">To</label>
              <input
                type="date" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="form-input"
              />
            </div>
          </div>
          <div>
            <label className="form-label">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="form-input appearance-none"
            >
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Reason</label>
            <textarea
              rows={2} value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Why do you need this leave?"
              className="form-input resize-none"
            />
          </div>
          <button onClick={submitLeave} disabled={submitting} className="btn-primary">
            {submitting ? "Submitting…" : "Request leave"}
          </button>
        </div>

        {myLeaves.length > 0 && (
          <div className="space-y-2 mt-3">
            {myLeaves.slice(0, 4).map((leave) => (
              <div
                key={leave.id}
                className="rounded-xl bg-card/50 border border-border/60 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{leave.type}</p>
                  <p className="text-xs text-muted-foreground">{leave.startDate} → {leave.endDate}</p>
                  {leave.reason && (
                    <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">{leave.reason}</p>
                  )}
                </div>
                <span className={
                  leave.status === "approved" ? "status-pill-success"
                    : leave.status === "rejected" ? "status-pill-danger"
                      : "status-pill-warning"
                }>
                  {leave.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default WorkspaceSection;
