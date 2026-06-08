import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PayrollPageShell, PayrollFormField } from "../components";
import { usePayrollSettings, useUpdatePayrollSettings } from "../hooks";
import type { PayrollPeriodType } from "../types/payroll.types";

const PayrollSettingsPage = () => {
  const { data } = usePayrollSettings();
  const update = useUpdatePayrollSettings();
  const [form, setForm] = useState({
    overtimeMultiplier: 1.5,
    payDay: 1,
    defaultPeriod: "monthly" as PayrollPeriodType,
    autoFinanceSync: true,
    autoNotify: true,
    salaryCategoryName: "Salary",
  });

  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  const save = () =>
    update.mutate(form, { onSuccess: () => toast.success("Settings saved") });

  return (
    <PayrollPageShell
      title="Payroll Settings"
      description="Module-wide defaults for overtime, finance sync and notifications."
      icon={<Settings2 className="w-5 h-5" />}
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <PayrollFormField label="Overtime Multiplier" hint="e.g. 1.5× the hourly rate">
              <Input
                type="number"
                step="0.1"
                value={form.overtimeMultiplier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, overtimeMultiplier: Number(e.target.value) }))
                }
              />
            </PayrollFormField>
            <PayrollFormField label="Pay Day (day of month)">
              <Input
                type="number"
                min={1}
                max={28}
                value={form.payDay}
                onChange={(e) => setForm((f) => ({ ...f, payDay: Number(e.target.value) }))}
              />
            </PayrollFormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <PayrollFormField label="Default Period">
              <Select
                value={form.defaultPeriod}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, defaultPeriod: v as PayrollPeriodType }))
                }
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
            </PayrollFormField>
            <PayrollFormField label="Salary Expense Category" hint="Finance category used on payment">
              <Input
                value={form.salaryCategoryName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salaryCategoryName: e.target.value }))
                }
              />
            </PayrollFormField>
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <p className="text-sm font-medium">Auto-sync to Finance</p>
              <p className="text-xs text-muted-foreground">
                Create a Salary expense when a run is paid.
              </p>
            </div>
            <Switch
              checked={form.autoFinanceSync}
              onCheckedChange={(v) => setForm((f) => ({ ...f, autoFinanceSync: v }))}
            />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <p className="text-sm font-medium">Auto-notify staff</p>
              <p className="text-xs text-muted-foreground">
                Send WhatsApp on shift changes and payslip readiness.
              </p>
            </div>
            <Switch
              checked={form.autoNotify}
              onCheckedChange={(v) => setForm((f) => ({ ...f, autoNotify: v }))}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </PayrollPageShell>
  );
};

export default PayrollSettingsPage;
