import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar, CheckCircle2, XCircle, Plus, Clock, FileText } from "lucide-react";

const LeaveManagement: React.FC = () => {
  const { leaveRequests, addLeaveRequest, updateLeaveStatus, teachers } = useAppData();
  const { user } = useAuth();
  const { hasRole } = usePermissions();
  const isTeacher = hasRole(["teacher"]);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [formData, setFormData] = useState({ startDate: "", endDate: "", type: "casual", reason: "" });

  // If teacher, only show own requests. If admin/management, show all pending or all.
  const myRequests = leaveRequests.filter(r => r.userId === user?.profileId);
  const displayRequests = isTeacher ? myRequests : leaveRequests;

  const pendingCount = leaveRequests.filter(r => r.status === "pending").length;
  const approvedCount = leaveRequests.filter(r => r.status === "approved").length;
  const rejectedCount = leaveRequests.filter(r => r.status === "rejected").length;

  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const handleApply = async () => {
    if (!formData.startDate || !formData.endDate || !formData.reason) {
      toast.error("Please fill in all details");
      return;
    }
    setSubmitting(true);
    try {
      await addLeaveRequest({
        userId: user?.profileId || "unknown",
        userName: user?.name || "Unknown User",
        role: user?.role || "staff",
        startDate: formData.startDate,
        endDate: formData.endDate,
        type: formData.type,
        reason: formData.reason,
        status: "pending",
      });
      toast.success("Leave request submitted successfully");
      setIsApplyOpen(false);
      setFormData({ startDate: "", endDate: "", type: "casual", reason: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit leave request";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, isApprove: boolean) => {
    setActing(id);
    try {
      await updateLeaveStatus(id, isApprove ? "approved" : "rejected", user?.name);
      toast.success(`Leave request ${isApprove ? "approved" : "rejected"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update leave status";
      toast.error(msg);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Leave Management</h1>
        {isTeacher && (
          <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Apply for Leave</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date</label>
                    <Input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Leave Type</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="unpaid">Loss of Pay (unpaid)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-24 resize-none"
                    placeholder="Briefly state your reason..."
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  ></textarea>
                </div>
                <Button className="w-full" onClick={handleApply} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isTeacher && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="metric-card border-ark-warning/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending</span>
            <p className="text-2xl md:text-3xl font-display font-bold text-ark-warning">{pendingCount}</p>
          </div>
          <div className="metric-card border-ark-success/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Approved</span>
            <p className="text-2xl md:text-3xl font-display font-bold text-ark-success">{approvedCount}</p>
          </div>
          <div className="metric-card border-ark-danger/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Rejected</span>
            <p className="text-2xl md:text-3xl font-display font-bold text-ark-danger">{rejectedCount}</p>
          </div>
        </div>
      )}

      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" /> {isTeacher ? "My Leave Requests" : "All Leave Requests"}
        </h2>
        {displayRequests.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground bg-muted/10 rounded-lg border border-border/50">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No leave requests found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-muted-foreground font-medium">Date(s)</th>
                  {!isTeacher && <th className="pb-3 text-muted-foreground font-medium">Staff Name</th>}
                  <th className="pb-3 text-muted-foreground font-medium">Type</th>
                  <th className="pb-3 text-muted-foreground font-medium">Reason</th>
                  <th className="pb-3 text-muted-foreground font-medium">Applied On</th>
                  <th className="pb-3 text-muted-foreground font-medium">Status</th>
                  {!isTeacher && <th className="pb-3 text-muted-foreground font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayRequests.map((req, i) => (
                  <tr key={req.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="py-3 font-medium text-foreground">
                      {req.startDate} {req.endDate !== req.startDate && `to ${req.endDate}`}
                    </td>
                    {!isTeacher && <td className="py-3 text-foreground">{req.userName}</td>}
                    <td className="py-3 capitalize text-muted-foreground">{req.type}</td>
                    <td className="py-3 text-muted-foreground max-w-[200px] truncate" title={req.reason}>{req.reason}</td>
                    <td className="py-3 text-muted-foreground">{new Date(req.appliedOn).toLocaleDateString()}</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit capitalize
                        ${req.status === "approved" ? "bg-ark-success/15 text-ark-success" : 
                          req.status === "rejected" ? "bg-ark-danger/15 text-ark-danger" : 
                          "bg-ark-warning/15 text-ark-warning"}`}
                      >
                        {req.status === "approved" ? <CheckCircle2 className="w-3 h-3" /> : 
                         req.status === "rejected" ? <XCircle className="w-3 h-3" /> : 
                         <Clock className="w-3 h-3" />}
                        {req.status}
                      </span>
                    </td>
                    {!isTeacher && (
                      <td className="py-3 text-right">
                        {req.status === "pending" ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={acting === req.id} className="text-ark-danger hover:bg-ark-danger/10 hover:text-ark-danger" onClick={() => handleAction(req.id, false)}>Reject</Button>
                            <Button size="sm" disabled={acting === req.id} className="bg-ark-success hover:bg-ark-success/90 text-white" onClick={() => handleAction(req.id, true)}>Approve</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Processed by {req.approvedBy}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveManagement;
