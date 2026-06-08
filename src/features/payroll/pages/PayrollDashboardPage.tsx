import { useNavigate, useLocation } from "react-router-dom";
import {
  Wallet,
  Clock,
  TimerReset,
  TrendingUp,
  Gift,
  MinusCircle,
  Users,
  CalendarClock,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollPageShell, PayrollKpiCard, PayrollStatusBadge } from "../components";
import { usePayrollOverview, usePayrollAnalytics } from "../hooks";
import { formatINR, formatMinutes } from "../utils/payrollCalc";

const PayrollDashboardPage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.split("/payroll")[0] || "";
  const { data: o } = usePayrollOverview();
  const { data: a } = usePayrollAnalytics();

  return (
    <PayrollPageShell
      title="Payroll Dashboard"
      description="Salary expense, working hours and payroll status at a glance."
      icon={<Wallet className="w-5 h-5" />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PayrollKpiCard
          label="Total Salary Expense"
          value={formatINR(o?.totalSalaryExpense ?? 0)}
          hint="Paid, all-time"
          tone="info"
          icon={<Wallet className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="This Month"
          value={formatINR(o?.monthSalaryExpense ?? 0)}
          hint={`${o?.runsThisMonth ?? 0} run(s)`}
          tone="positive"
          icon={<CalendarClock className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Pending Payroll"
          value={formatINR(o?.pendingPayroll ?? 0)}
          hint="Awaiting payment"
          tone="warning"
          icon={<TimerReset className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Paid Payroll"
          value={formatINR(o?.paidPayroll ?? 0)}
          tone="positive"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Overtime Cost"
          value={formatINR(o?.overtimeCost ?? 0)}
          tone="default"
          icon={<Clock className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Incentive Cost"
          value={formatINR(o?.incentiveCost ?? 0)}
          tone="default"
          icon={<Gift className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Deductions"
          value={formatINR(o?.deductionTotal ?? 0)}
          tone="negative"
          icon={<MinusCircle className="w-4 h-4" />}
        />
        <PayrollKpiCard
          label="Today's Hours"
          value={formatMinutes(o?.todayWorkedMinutes ?? 0)}
          hint={`${o?.staffOnPayroll ?? 0} on payroll`}
          tone="info"
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Payroll Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a?.monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="net" name="Net" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="overtime" name="Overtime" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Payroll Runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(a?.recentRuns ?? []).map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`${base}/payroll/register?run=${r.id}`)}
                  >
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.periodStart}
                    </TableCell>
                    <TableCell className="text-right">{formatINR(r.totalNet)}</TableCell>
                    <TableCell>
                      <PayrollStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {(a?.recentRuns ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                      No payroll runs yet. Generate one from Salary Processing.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PayrollPageShell>
  );
};

export default PayrollDashboardPage;
