import { useState } from "react";
import { Wallet, Clock, TrendingUp, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import {
  PayrollPageShell,
  PayrollKpiCard,
  PayrollStatusBadge,
  SalarySlipDialog,
} from "../components";
import { useMyPayrollItems } from "../hooks";
import { formatINR, formatMinutes } from "../utils/payrollCalc";
import type { PayrollItem, PayrollRun } from "../types/payroll.types";

const MySalaryPage = () => {
  const { user } = useAuth();
  const { data: items = [] } = useMyPayrollItems(user?.profileId);
  const [slip, setSlip] = useState<{ item: PayrollItem; run: PayrollRun } | null>(null);

  const latest = items[0];
  const totalEarned = items
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.netSalary, 0);
  const totalOvertime = items.reduce((s, i) => s + i.overtimeMinutes, 0);

  return (
    <PayrollPageShell
      title="My Salary"
      description="Your earnings, attendance-based pay, overtime and payslips."
      icon={<Wallet className="w-5 h-5" />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <PayrollKpiCard
          label="Latest Net Salary"
          value={formatINR(latest?.netSalary ?? 0)}
          hint={latest ? latest.status : "—"}
          tone="positive"
          icon={<Wallet className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Total Earned (Paid)"
          value={formatINR(totalEarned)}
          tone="info"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Total Overtime"
          value={formatMinutes(totalOvertime)}
          tone="warning"
          icon={<Clock className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Payslips"
          value={items.length}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
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
                  <TableCell className="text-sm">
                    {i.run?.title ?? "—"}
                    <div className="text-xs text-muted-foreground">
                      {i.run?.periodStart} → {i.run?.periodEnd}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatMinutes(i.workedMinutes)} · {i.attendancePct}%
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
                    {i.run && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSlip({ item: i, run: i.run as PayrollRun })}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    No salary records yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SalarySlipDialog
        item={slip?.item ?? null}
        run={slip?.run ?? null}
        open={!!slip}
        onOpenChange={(o) => !o && setSlip(null)}
      />
    </PayrollPageShell>
  );
};

export default MySalaryPage;
