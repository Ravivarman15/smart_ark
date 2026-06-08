import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PlayCircle, CheckCircle2, BadgeDollarSign, Eye, Ban } from "lucide-react";
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
  useRoleOptions,
} from "../hooks";
import { formatINR, periodEndFor } from "../utils/payrollCalc";
import type { PayrollPeriodType } from "../types/payroll.types";

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

  const [open, setOpen] = useState(false);
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

  return (
    <PayrollPageShell
      title="Salary Processing"
      description="Generate payroll from attendance, approve, then process payments. Paid runs sync to Finance."
      icon={<PlayCircle className="w-5 h-5" />}
      primaryAction={{ label: "Generate Payroll", onClick: () => setOpen(true) }}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View register"
                      onClick={() => navigate(`${base}/payroll/register?run=${r.id}`)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {r.status === "pending" && (
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
                    {r.status === "approved" && (
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
                    {r.status !== "paid" && r.status !== "cancelled" && (
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
    </PayrollPageShell>
  );
};

export default SalaryProcessingPage;
