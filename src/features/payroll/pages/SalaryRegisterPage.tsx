import { useMemo, useState } from "react";
import { useDocumentBranding } from "@/features/branding/documents";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet, FileText, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import {
  PayrollPageShell,
  PayrollKpiCard,
  PayrollStatusBadge,
  SalarySlipDialog,
} from "../components";
import { usePayrollRuns, usePayrollRun } from "../hooks";
import { formatINR, formatMinutes } from "../utils/payrollCalc";
import type { PayrollItem } from "../types/payroll.types";

const SalaryRegisterPage = () => {
  const [params, setParams] = useSearchParams();
  const runId = params.get("run");
  const { data: runs = [] } = usePayrollRuns();
  const { data: detail } = usePayrollRun(runId);
  const [search, setSearch] = useState("");
  const [slipItem, setSlipItem] = useState<PayrollItem | null>(null);
  // Letterhead for the printed register — the same resolver the payslips use,
  // so a register and the slips inside it always name the same institution.
  const { branding } = useDocumentBranding();

  const items = useMemo(() => {
    const list = detail?.items ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (i) =>
        (i.staffName ?? "").toLowerCase().includes(q) ||
        (i.role ?? "").toLowerCase().includes(q) ||
        (i.department ?? "").toLowerCase().includes(q),
    );
  }, [detail, search]);

  // Single source of truth for export rows — every format (CSV / Excel / PDF /
  // Print) reflects the current search filter so exports always match the view.
  const exportRows = () =>
    items.map((i) => ({
      Staff: i.staffName,
      Role: i.role,
      Department: i.department,
      "Worked (min)": i.workedMinutes,
      "Overtime (min)": i.overtimeMinutes,
      "Attendance %": i.attendancePct,
      Basic: i.basicSalary,
      Hourly: i.hourlyEarnings,
      Overtime: i.overtimeEarnings,
      Incentives: i.incentives,
      Allowances: i.allowances,
      Gross: i.grossEarnings,
      Deductions: i.deductions,
      Penalties: i.penalties,
      Net: i.netSalary,
      Status: i.status,
    }));

  const fileBase = () => `salary-register-${(detail?.title ?? "run").replace(/\s+/g, "-")}`;

  const exportXlsx = () => {
    if (!detail) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salary Register");
    XLSX.writeFile(wb, `${fileBase()}.xlsx`);
  };

  const exportCsv = () => {
    if (!detail) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Print / Save-as-PDF — a standalone, ARK-branded register document. Using the
  // browser print dialog gives a reliable "Save as PDF" without a heavy renderer.
  const printRegister = () => {
    if (!detail) return;
    const w = window.open("", "_blank", "width=1024,height=720");
    if (!w) return;
    const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
    const body = items
      .map(
        (i) =>
          `<tr><td>${i.staffName ?? ""}</td><td>${i.role ?? ""}</td>` +
          `<td>${i.department ?? ""}</td><td style="text-align:right">${i.attendancePct}%</td>` +
          `<td style="text-align:right">${fmt(i.grossEarnings)}</td>` +
          `<td style="text-align:right">${fmt(i.overtimeEarnings)}</td>` +
          `<td style="text-align:right">${fmt(i.deductions + i.penalties)}</td>` +
          `<td style="text-align:right;font-weight:600">${fmt(i.netSalary)}</td>` +
          `<td>${i.status}</td></tr>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>${detail.title} — Salary Register</title>` +
        `<style>*{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;padding:28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `h1{color:#0B2D56;font-size:18px;margin:0}p{color:#64748b;font-size:12px;margin:2px 0 16px}` +
        `table{width:100%;border-collapse:collapse;font-size:11.5px}th{background:#0B2D56;color:#fff;text-align:left;padding:7px 8px}` +
        `td{padding:6px 8px;border-bottom:1px solid #e2e8f0}tfoot td{font-weight:700;border-top:2px solid #0B2D56}` +
        `@media print{body{padding:0}}</style></head><body>` +
        `<h1>${branding.organizationName} — Salary Register</h1>` +
        `<p>${detail.title} · ${detail.periodStart} → ${detail.periodEnd} · ${items.length} staff · Status: ${detail.status}</p>` +
        `<table><thead><tr><th>Staff</th><th>Role</th><th>Department</th><th>Att%</th>` +
        `<th>Gross</th><th>Overtime</th><th>Deductions</th><th>Net</th><th>Status</th></tr></thead>` +
        `<tbody>${body}</tbody>` +
        `<tfoot><tr><td colspan="4">Totals</td><td style="text-align:right">${fmt(detail.totalGross)}</td>` +
        `<td style="text-align:right">${fmt(detail.totalOvertime)}</td>` +
        `<td style="text-align:right">${fmt(detail.totalDeductions)}</td>` +
        `<td style="text-align:right">${fmt(detail.totalNet)}</td><td></td></tr></tfoot></table>` +
        `</body></html>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <PayrollPageShell
      title="Salary Register"
      description="Per-staff salary breakdown for a payroll run. Generate professional slips and export."
      icon={<FileSpreadsheet className="w-5 h-5" />}
      headerExtra={
        <Select
          value={runId ?? undefined}
          onValueChange={(v) => setParams({ run: v })}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a run" />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!detail ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select a payroll run to view its salary register.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <PayrollKpiCard label="Staff" value={detail.staffCount} />
            <PayrollKpiCard label="Gross" value={formatINR(detail.totalGross)} tone="info" />
            <PayrollKpiCard label="Overtime" value={formatINR(detail.totalOvertime)} tone="warning" />
            <PayrollKpiCard
              label="Deductions"
              value={formatINR(detail.totalDeductions)}
              tone="negative"
            />
            <PayrollKpiCard label="Net" value={formatINR(detail.totalNet)} tone="positive" />
          </div>

          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <PayrollStatusBadge status={detail.status} />
              <span className="text-sm text-muted-foreground">
                {detail.periodStart} → {detail.periodEnd}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileText className="w-4 h-4 mr-2" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportXlsx}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={printRegister}>
                    <Printer className="w-4 h-4 mr-2" /> PDF / Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Worked</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="font-medium">{i.staffName}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {i.role}
                          {i.department ? ` · ${i.department}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatMinutes(i.workedMinutes)}
                        <span className="text-muted-foreground"> · {i.attendancePct}%</span>
                      </TableCell>
                      <TableCell className="text-right">{formatINR(i.grossEarnings)}</TableCell>
                      <TableCell className="text-right">{formatINR(i.overtimeEarnings)}</TableCell>
                      <TableCell className="text-right">
                        {formatINR(i.deductions + i.penalties)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatINR(i.netSalary)}
                      </TableCell>
                      <TableCell>
                        <PayrollStatusBadge status={i.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setSlipItem(i)}>
                          <FileText className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No staff lines match your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <SalarySlipDialog
            item={slipItem}
            run={detail}
            open={!!slipItem}
            onOpenChange={(o) => !o && setSlipItem(null)}
          />
        </>
      )}
    </PayrollPageShell>
  );
};

export default SalaryRegisterPage;
