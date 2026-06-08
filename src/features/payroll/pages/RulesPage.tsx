import { useState } from "react";
import { SlidersHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { PayrollPageShell, PayrollFormField } from "../components";
import {
  useRules,
  useSaveRule,
  useDeleteRule,
  useRoleOptions,
  useDepartmentOptions,
} from "../hooks";
import type {
  CalcMethod,
  PayrollRule,
  RuleAppliesTo,
  RuleType,
} from "../types/payroll.types";

const RULE_TYPES: RuleType[] = ["overtime", "incentive", "allowance", "deduction", "penalty"];
const CALC_METHODS: CalcMethod[] = ["flat", "percent", "per_hour", "per_day", "multiplier"];
const APPLIES: RuleAppliesTo[] = ["all", "role", "staff", "department"];

const RulesPage = () => {
  const { data: rules = [] } = useRules();
  const { data: roles = [] } = useRoleOptions();
  const { data: depts = [] } = useDepartmentOptions();
  const save = useSaveRule();
  const del = useDeleteRule();
  const [editing, setEditing] = useState<Partial<PayrollRule> | null>(null);

  const submit = () => {
    if (!editing?.name) {
      toast.error("Name is required");
      return;
    }
    save.mutate(
      {
        input: {
          ruleType: (editing.ruleType as RuleType) ?? "incentive",
          name: editing.name,
          calcMethod: (editing.calcMethod as CalcMethod) ?? "flat",
          value: Number(editing.value) || 0,
          appliesTo: (editing.appliesTo as RuleAppliesTo) ?? "all",
          appliesRef: editing.appliesRef,
          isActive: editing.isActive ?? true,
          sortOrder: editing.sortOrder ?? 0,
          notes: editing.notes,
        },
        id: editing.id,
      },
      {
        onSuccess: () => {
          toast.success("Rule saved");
          setEditing(null);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  return (
    <PayrollPageShell
      title="Overtime, Incentive & Deduction Rules"
      description="Define reusable rules that the calculation engine applies automatically."
      icon={<SlidersHorizontal className="w-5 h-5" />}
      primaryAction={{
        label: "Add Rule",
        onClick: () =>
          setEditing({ ruleType: "incentive", calcMethod: "flat", appliesTo: "all", isActive: true }),
      }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.ruleType}</TableCell>
                  <TableCell>{r.calcMethod.replace("_", " ")}</TableCell>
                  <TableCell className="text-right">
                    {r.calcMethod === "percent" ? `${r.value}%` : r.value}
                  </TableCell>
                  <TableCell className="capitalize">
                    {r.appliesTo}
                    {r.appliesRef ? `: ${r.appliesRef}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => del.mutate(r.id, { onSuccess: () => toast.success("Deleted") })}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No rules yet. Overtime uses the settings multiplier until you add one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "Add"} Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <PayrollFormField label="Name" required>
              <Input
                value={editing?.name ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Punctuality Bonus"
              />
            </PayrollFormField>
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField label="Type">
                <Select
                  value={editing?.ruleType}
                  onValueChange={(v) => setEditing((s) => ({ ...s, ruleType: v as RuleType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PayrollFormField>
              <PayrollFormField label="Calculation">
                <Select
                  value={editing?.calcMethod}
                  onValueChange={(v) => setEditing((s) => ({ ...s, calcMethod: v as CalcMethod }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALC_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PayrollFormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField
                label="Value"
                hint={editing?.calcMethod === "percent" ? "Percent of earnings" : undefined}
              >
                <Input
                  type="number"
                  value={editing?.value ?? 0}
                  onChange={(e) => setEditing((s) => ({ ...s, value: Number(e.target.value) }))}
                />
              </PayrollFormField>
              <PayrollFormField label="Applies To">
                <Select
                  value={editing?.appliesTo}
                  onValueChange={(v) =>
                    setEditing((s) => ({ ...s, appliesTo: v as RuleAppliesTo, appliesRef: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPLIES.map((a) => (
                      <SelectItem key={a} value={a} className="capitalize">
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PayrollFormField>
            </div>
            {editing?.appliesTo === "role" && (
              <PayrollFormField label="Role">
                <Select
                  value={editing?.appliesRef}
                  onValueChange={(v) => setEditing((s) => ({ ...s, appliesRef: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PayrollFormField>
            )}
            {editing?.appliesTo === "department" && (
              <PayrollFormField label="Department">
                <Select
                  value={editing?.appliesRef}
                  onValueChange={(v) => setEditing((s) => ({ ...s, appliesRef: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {depts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PayrollFormField>
            )}
            {editing?.appliesTo === "staff" && (
              <PayrollFormField label="Staff Profile ID" hint="Paste the staff member's profile id">
                <Input
                  value={editing?.appliesRef ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s, appliesRef: e.target.value }))}
                />
              </PayrollFormField>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={editing?.isActive ?? true}
                onCheckedChange={(v) => setEditing((s) => ({ ...s, isActive: v }))}
              />
              <span className="text-sm">Active</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PayrollPageShell>
  );
};

export default RulesPage;
