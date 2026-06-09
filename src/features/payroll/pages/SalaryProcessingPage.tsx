import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PlayCircle,
  CheckCircle2,
  BadgeDollarSign,
  Eye,
  Ban,
  Pencil,
  Trash2,
  PauseCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollPageShell, PayrollStatusBadge } from "../components";
import {
  usePayrollRuns,
  useGeneratePayroll,
  useApprovePayroll,
  useProcessPayment,
  useSetRunStatus,
  useHoldPayrollRun,
  useResumePayrollRun,
  useDeletePayrollRun,
  useUpdatePayrollRun,
  useRoleOptions,
} from "../hooks";
import { formatINR, periodEndFor } from "../utils/payrollCalc";
import type { PayrollPeriodType, PayrollRun } from "../types/payroll.types";
import { useCanDo } from "@/features/rbac/hooks/useCanDo";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const SalaryProcessingPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.split("/payroll")[0] || "";
  const { data: runs = [] } = usePayrollRuns();
  const { data: roles = [] } = useRoleOptions();
  const gen = useGeneratePayroll();
  const approve = useApprovePayroll();
  const pay = useProcessPayment();
  const setStatus = useSetRunStatus();
  const hold = useHoldPayrollRun();
  const resume = useResumePayrollRun();
  const del = useDeletePayrollRun();
  const updateRun = useUpdatePayrollRun();
  const { canDo } = useCanDo();

  const [open, setOpen] = useState(false);
  const [editRun, setEditRun] = useState<PayrollRun | null>(null);
  const [editForm, setEditForm] = useState({ title: "", notes: "" });
  const [deleteTarget, setDeleteTarget] = useState<PayrollRun | null>(null);
  const [form, setForm] = useState({
    title: `Payroll — ${new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
    periodType: "monthly" as PayrollPeriodType,
    periodStart: monthStart(),
    periodEnd: today(),
    role: "all",
    notes: "",
  });

  const updatePeriod = (periodType: PayrollPeriodType, start: string) =>
    setForm((f) => ({ ...f, periodType, periodStart: start, periodEnd: periodEndFor(start, periodType) }));

  const generate = () => {
    gen.mutate(
      {
        title: form.title,
        periodType: form.periodType,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        role: form.role === "all" ? undefined : form.role,
        notes: form.notes,
      },
      {
        onSuccess: (runId) => {
          toast.success("Payroll generated");
          setOpen(false);
          navigate(`${base}/payroll/register?run=${runId}`);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  const openEdit = (r: PayrollRun) => {
    setEditForm({ title: r.title, notes: r.notes ?? "" });
    setEditRun(r);
  };

  const saveEdit = () => {
    if (!editRun) return;
    updateRun.mutate(
      { runId: editRun.id, patch: { title: editForm.title, notes: editForm.notes } },
      {
        onSuccess: () => {
          toast.success("Payroll run updated");
          setEditRun(null);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    del.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Payroll run deleted");
        setDeleteTarget(null);
      },
      onError: (e) => toast.error(String((e as Error).message)),
    });
  };

  return (
    <PayrollPageShell
      title="Salary Processing"
      description="Generate payroll from attendance, approve, then process payments. Paid runs sync to Finance."
      icon={<PlayCircle className="w-5 h-5" />}
      primaryAction={
        canDo("payroll.create")
          ? { label: "Generate Payroll", onClick: () => setOpen(true) }
          : undefined
      }
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.periodStart} → {r.periodEnd}
                  </TableCell>
                  <TableCell className="text-right">{r.staffCount}</TableCell>
                  <TableCell className="text-right">{formatINR(r.totalNet)}</TableCell>
                  <TableCell>
                    <PayrollStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {canDo("payroll.view") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View register"
                        onClick={() => navigate(`${base}/payroll/register?run=${r.id}`)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    {r.status === "pending" && canDo("payroll.approve") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Approve"
                        onClick={() =>
                          approve.mutate(r.id, { onSuccess: () => toast.success("Approved") })
                        }
                      >
                        <CheckCircle2 className="w-4 h-4 text-sky-600" />
                      </Button>
                    )}
                    {r.status === "approved" && canDo("payroll.process") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Process payment"
                        onClick={() =>
                          pay.mutate(
                            { runId: r.id, paymentMethod: "bank_transfer" },
                            { onSuccess: () => toast.success("Paid · synced to Finance") },
                          )
                        }
                      >
                        <BadgeDollarSign className="w-4 h-4 text-emerald-600" />
                      </Button>
                    )}
                    {(r.status === "pending" || r.status === "approved") &&
                      canDo("payroll.hold") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Hold"
                          onClick={() =>
                            hold.mutate(r.id, {
                              onSuccess: () => toast.success("Run put on hold"),
                              onError: (e) => toast.error(String((e as Error).message)),
                            })
                          }
                        >
                          <PauseCircle className="w-4 h-4 text-orange-600" />
                        </Button>
                      )}
                    {r.status === "on_hold" && canDo("payroll.hold") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Resume"
                        onClick={() =>
                          resume.mutate(r.id, {
                            onSuccess: (next) =>
                              toast.success(`Run resumed (${next})`),
                            onError: (e) => toast.error(String((e as Error).message)),
                          })
                        }
                      >
                        <RotateCcw className="w-4 h-4 text-sky-600" />
                      </Button>
                    )}
                    {r.status !== "paid" && r.status !== "cancelled" && canDo("payroll.edit") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    {r.status !== "paid" &&
                      r.status !== "cancelled" &&
                      canDo("payroll.cancel") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Cancel"
                        onClick={() =>
                          setStatus.mutate(
                            { runId: r.id, status: "cancelled" },
                            { onSuccess: () => toast.success("Cancelled") },
                          )
                        }
                      >
                        <Ban className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                    {r.status !== "paid" && canDo("payroll.delete") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No payroll runs yet. Generate your first run above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Payroll</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Period</label>
                <Select
                  value={form.periodType}
                  onValueChange={(v) => updatePeriod(v as PayrollPeriodType, form.periodStart)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Role filter</label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Period Start</label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => updatePeriod(form.periodType, e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Period End</label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Worked hours, overtime and attendance are read automatically from the Attendance
              module for the selected period. No manual entry required.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={gen.isPending}>
              {gen.isPending ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit run — title & notes only. Computed totals and per-staff lines stay
          driven by attendance; change the period by regenerating the run. */}
      <Dialog open={!!editRun} onOpenChange={(o) => !o && setEditRun(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payroll Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              To change the staff, period or amounts, cancel this run and generate a new
              one — those values are computed from attendance.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRun(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={updateRun.isPending || !editForm.title.trim()}>
              {updateRun.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payroll run?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteTarget?.title}” and all its salary lines.
              Any linked Finance expense is reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PayrollPageShell>
  );
};

export default SalaryProcessingPage;
