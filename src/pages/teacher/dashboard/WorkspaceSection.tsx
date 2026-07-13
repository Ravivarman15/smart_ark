import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, Layers, Plus, X } from "lucide-react";
import { useNavigation } from "@/core/navigation";
import { resolveIcon } from "@/shared/icons";
import type { TeacherWorkspace } from "./useTeacherWorkspace";

// RBAC-granted modules + leave. The leave form stays folded away behind a
// button — a teacher opens it a few times a year, so it should not occupy the
// dashboard the rest of the time.

interface Props {
  ws: TeacherWorkspace;
  /** Module groups the teacher has been granted (RBAC-driven). */
  modules: ReturnType<typeof useNavigation>;
}

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Personal Leave", "Emergency Leave"];

const WorkspaceSection: React.FC<Props> = ({ ws, modules }) => {
  const { teacherInfo, teacherId, user, today, myLeaves, addLeaveRequest } = ws;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    startDate: today, endDate: today, type: LEAVE_TYPES[0], reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const pendingLeaves = myLeaves.filter((l) => l.status === "pending").length;

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
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="workspace" className="scroll-mt-24 space-y-5">
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-heading mb-0">
            <CalendarDays className="w-4 h-4 text-accent" /> Leave
            {pendingLeaves > 0 && <span className="status-pill-warning">{pendingLeaves} pending</span>}
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-xs font-semibold"
          >
            {showForm
              ? <><X className="w-3.5 h-3.5" /> Cancel</>
              : <><Plus className="w-3.5 h-3.5" /> Request leave</>}
          </button>
        </div>

        {showForm && (
          <div className="rounded-2xl bg-card/50 border border-border/60 p-4 space-y-3 mb-3">
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
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        )}

        {myLeaves.length > 0 && (
          <div className="space-y-2">
            {myLeaves.slice(0, 4).map((leave) => (
              <div
                key={leave.id}
                className="rounded-xl bg-card/50 border border-border/60 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{leave.type}</p>
                  <p className="text-xs text-muted-foreground">{leave.startDate} → {leave.endDate}</p>
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
