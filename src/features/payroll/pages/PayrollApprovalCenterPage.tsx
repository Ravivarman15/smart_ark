import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ShieldCheck,
  Lock,
  LockOpen,
  Download,
  Search,
  Users,
  Wallet,
  Gift,
  MinusCircle,
  TrendingUp,
  Loader2,
  Mail,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { usePrompt, useConfirm } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/core/permissions/usePermissions";
import {
  PayrollPageShell,
  PayrollKpiCard,
  PayrollStatusBadge,
  SalarySlipDialog,
} from "../components";
import { ApprovalDataGrid } from "../components/ApprovalDataGrid";
import { PayrollItemEditDrawer } from "../components/PayrollItemEditDrawer";
import { ApprovalSummaryDialog } from "../components/ApprovalSummaryDialog";
import { usePayrollRuns } from "../hooks/usePayrollRuns";
import {
  useApprovalGrid,
  useApprovalSummary,
  usePendingMonthlyPayroll,
  useUnlockPayroll,
  useResendPayslips,
} from "../hooks/usePayrollApproval";
import { formatINR } from "../utils/payrollCalc";
import {
  buildRegisterRows,
  buildBankTransferRows,
  buildDepartmentRows,
  buildBonusRows,
  buildDeductionRows,
  buildTaxRows,
  downloadCsv,
  downloadXlsx,
  type ReportRow,
} from "../utils/payrollReports";
import type { ApprovalGridRow } from "../types/payroll.types";

const ALL = "all";

// Human month label for the payslip email (matches ApprovalSummaryDialog).
const monthOf = (run: { periodStart: string; title: string }): string => {
  const d = new Date(`${run.periodStart}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? run.title
    : d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const REPORTS: { id: string; label: string; build: (r: ApprovalGridRow[]) => ReportRow[] }[] = [
  { id: "register", label: "Payroll Register", build: buildRegisterRows },
  { id: "bank", label: "Bank Transfer", build: buildBankTransferRows },
  { id: "department", label: "Department Salary", build: buildDepartmentRows },
  { id: "bonus", label: "Bonus Report", build: buildBonusRows },
  { id: "deduction", label: "Deduction Report", build: buildDeductionRows },
  { id: "tax", label: "Tax Report", build: buildTaxRows },
];

const PayrollApprovalCenterPage = () => {
  const [params, setParams] = useSearchParams();
  const { canDoAction } = usePermissions();
  const prompt = usePrompt();
  const confirm = useConfirm();

  const { data: runs = [] } = usePayrollRuns();
  const { data: pending } = usePendingMonthlyPayroll();

  const runId =
    params.get("run") ?? pending?.run.id ?? runs[0]?.id ?? null;
  const run = runs.find((r) => r.id === runId) ?? null;
  const locked = !!run?.locked;
  const canApprove = canDoAction("payroll.approve");

  const { data: rows = [] } = useApprovalGrid(runId);
  const { data: summary } = useApprovalSummary(runId);
  const unlock = useUnlockPayroll();
  const resend = useResendPayslips();

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState(ALL);
  const [designation, setDesignation] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [editRow, setEditRow] = useState<ApprovalGridRow | null>(null);
  const [slipRow, setSlipRow] = useState<ApprovalGridRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean))] as string[],
    [rows],
  );
  const designations = useMemo(
    () => [...new Set(rows.map((r) => r.designation).filter(Boolean))] as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(`${r.staffName} ${r.employeeCode}`.toLowerCase().includes(q))) return false;
      if (dept !== ALL && r.department !== dept) return false;
      if (designation !== ALL && r.designation !== designation) return false;
      if (status !== ALL && r.status !== status) return false;
      return true;
    });
  }, [rows, search, dept, designation, status]);

  const anomalyCount = rows.filter((r) => r.anomalies.length > 0).length;

  const exportReport = (
    report: (typeof REPORTS)[number],
    fmt: "csv" | "xlsx",
  ) => {
    const data = report.build(filtered);
    if (data.length === 0) {
      toast.error("Nothing to export for the current filters.");
      return;
    }
    const fileBase = `payroll-${report.id}-${run?.periodEnd ?? "run"}`;
    if (fmt === "csv") downloadCsv(data, fileBase);
    else downloadXlsx(data, report.label, fileBase);
  };

  const onUnlock = async () => {
    if (!runId) return;
    const reason = await prompt({
      title: "Unlock payroll",
      description: "Unlocking re-enables salary edits. This is recorded in the audit log.",
      placeholder: "Reason for unlocking…",
      type: "warning",
      confirmText: "Unlock",
      required: true,
    });
    if (reason == null) return;
    try {
      await unlock.mutateAsync({ runId, reason });
      toast.success("Payroll unlocked.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onResend = async () => {
    if (!runId || !run) return;
    const month = monthOf(run);
    const ok = await confirm({
      title: "Resend payslips",
      description: `Email every employee in this run their salary slip for ${month} again. This re-sends the email + PDF only — it does not change the run's status, lock, or Finance posting.`,
      confirmText: "Resend",
    });
    if (!ok) return;
    try {
      const emails = await resend.mutateAsync({ runId, month });
      const sent = emails.filter((e) => e.status === "sent").length;
      toast.success(`${sent}/${emails.length} payslip email(s) sent.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <PayrollPageShell
      title="Payroll Approval Center"
      description="Final review and approval stage. Adjust one-time components, resolve anomalies, then approve to lock payroll and release payslips."
      icon={<ShieldCheck className="w-5 h-5" />}
      headerExtra={
        <Select
          value={runId ?? undefined}
          onValueChange={(v) => setParams({ run: v })}
        >
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Select a payroll run" />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title}
                {r.locked ? " 🔒" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!run ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No payroll run to approve. Generate one from Salary Processing first.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Lock banner */}
          {locked && (
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <Lock className="h-4 w-4" />
                Payroll approved &amp; locked
                {run.lockedByName ? ` by ${run.lockedByName}` : ""}
                {run.emailsSentCount != null ? ` · ${run.emailsSentCount} email(s) sent` : ""}
              </div>
              {canApprove && (
                <Button variant="outline" size="sm" onClick={onUnlock} disabled={unlock.isPending}>
                  <LockOpen className="mr-2 h-4 w-4" /> Unlock
                </Button>
              )}
            </div>
          )}

          {/* Summary KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <PayrollKpiCard
              label="Employees"
              value={summary?.employees ?? run.staffCount}
              tone="info"
              icon={<Users className="h-4 w-4" />}
            />
            <PayrollKpiCard
              label="Total Payroll"
              value={formatINR(summary?.totalPayroll ?? run.totalNet)}
              tone="default"
              icon={<Wallet className="h-4 w-4" />}
            />
            <PayrollKpiCard
              label="Bonuses"
              value={formatINR(summary?.totalBonuses ?? 0)}
              tone="positive"
              icon={<Gift className="h-4 w-4" />}
            />
            <PayrollKpiCard
              label="Deductions"
              value={formatINR(summary?.totalDeductions ?? run.totalDeductions)}
              tone="negative"
              icon={<MinusCircle className="h-4 w-4" />}
            />
            <PayrollKpiCard
              label="Average Salary"
              value={formatINR(summary?.averageSalary ?? 0)}
              tone="info"
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name / ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-48 pl-8"
                />
              </div>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={designation} onValueChange={setDesignation}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Designation" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All designations</SelectItem>
                  {designations.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <PayrollStatusBadge status={run.status} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" /> Reports
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export report</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {REPORTS.map((rep) => (
                    <DropdownMenuSub key={rep.id}>
                      <DropdownMenuSubTrigger>{rep.label}</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => exportReport(rep, "csv")}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportReport(rep, "xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {canApprove && (run.status === "approved" || run.status === "paid") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onResend}
                  disabled={resend.isPending}
                >
                  {resend.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Resend payslips
                </Button>
              )}
              {canApprove && !locked && (
                <Button onClick={() => setReviewOpen(true)} disabled={rows.length === 0}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Review &amp; Approve
                </Button>
              )}
            </div>
          </div>

          <ApprovalDataGrid
            rows={filtered}
            locked={locked}
            onEdit={setEditRow}
            onSlip={setSlipRow}
          />

          <PayrollItemEditDrawer
            row={editRow}
            locked={locked}
            open={!!editRow}
            onOpenChange={(o) => !o && setEditRow(null)}
          />

          <SalarySlipDialog
            item={slipRow}
            run={run}
            open={!!slipRow}
            onOpenChange={(o) => !o && setSlipRow(null)}
          />

          <ApprovalSummaryDialog
            run={run}
            summary={summary}
            anomalyCount={anomalyCount}
            open={reviewOpen}
            onOpenChange={setReviewOpen}
          />
        </>
      )}
    </PayrollPageShell>
  );
};

export default PayrollApprovalCenterPage;
