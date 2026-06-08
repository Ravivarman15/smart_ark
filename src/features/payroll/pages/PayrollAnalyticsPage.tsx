import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayrollPageShell } from "../components";
import { usePayrollAnalytics } from "../hooks";
import { formatINR } from "../utils/payrollCalc";

const COLORS = ["#0ea5e9", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

const PayrollAnalyticsPage = () => {
  const { data: a } = usePayrollAnalytics();

  return (
    <PayrollPageShell
      title="Payroll Analytics"
      description="Salary trends, role and department cost, and salary distribution."
      icon={<BarChart3 className="w-5 h-5" />}
    >
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Payroll Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={a?.monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
                <Line type="monotone" dataKey="gross" name="Gross" stroke="#6366f1" strokeWidth={2} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#0ea5e9" strokeWidth={2} />
                <Line type="monotone" dataKey="overtime" name="Overtime" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role-wise Cost</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={a?.roleCost ?? []}
                  dataKey="amount"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => e.label}
                >
                  {(a?.roleCost ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department-wise Cost</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a?.departmentCost ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={110} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="amount" name="Net cost" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salary Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a?.salaryDistribution ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `${v} staff`} />
                <Bar dataKey="count" name="Staff" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </PayrollPageShell>
  );
};

export default PayrollAnalyticsPage;
