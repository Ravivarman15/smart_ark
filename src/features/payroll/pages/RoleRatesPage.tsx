import { useState } from "react";
import { BadgeIndianRupee, Pencil, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollPageShell, PayrollFormField } from "../components";
import {
  useRoleRates,
  useSaveRoleRate,
  useDeleteRoleRate,
} from "../hooks";
import { formatINR } from "../utils/payrollCalc";
import type { RoleRate } from "../types/payroll.types";

const DEFAULT_ROLES = [
  "Teacher",
  "Senior Teacher",
  "Coordinator",
  "Management",
  "Office Staff",
  "Receptionist",
  "Counsellor",
  "Marketing Staff",
  "Support Staff",
];

const RoleRatesPage = () => {
  const { data: rates = [], isLoading } = useRoleRates();
  const save = useSaveRoleRate();
  const del = useDeleteRoleRate();
  const [editing, setEditing] = useState<Partial<RoleRate> | null>(null);

  const openNew = () => setEditing({ role: "", hourlyRate: 0, monthlySalary: 0, isActive: true });

  const submit = () => {
    if (!editing?.role) {
      toast.error("Role is required");
      return;
    }
    save.mutate(
      {
        role: editing.role,
        hourlyRate: Number(editing.hourlyRate) || 0,
        monthlySalary: Number(editing.monthlySalary) || 0,
        isActive: editing.isActive ?? true,
        notes: editing.notes,
      },
      {
        onSuccess: () => {
          toast.success("Role rate saved");
          setEditing(null);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  return (
    <PayrollPageShell
      title="Role-Wise Salary"
      description="Hourly rate and monthly base per role. Staff-specific rates override these."
      icon={<BadgeIndianRupee className="w-5 h-5" />}
      primaryAction={{ label: "Add Role Rate", onClick: openNew }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hourly Rate</TableHead>
                <TableHead className="text-right">Monthly Base</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium capitalize">{r.label || r.role}</TableCell>
                  <TableCell className="text-right">{formatINR(r.hourlyRate)}/hr</TableCell>
                  <TableCell className="text-right">{formatINR(r.monthlySalary)}</TableCell>
                  <TableCell>
                    <span className={r.isActive ? "text-emerald-600" : "text-muted-foreground"}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        del.mutate(r.id, { onSuccess: () => toast.success("Deleted") })
                      }
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No role rates configured. Add one to start.
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
            <DialogTitle>{editing?.id ? "Edit" : "Add"} Role Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <PayrollFormField label="Role" required>
              <Input
                list="payroll-role-suggestions"
                value={editing?.role ?? ""}
                onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))}
                placeholder="e.g. Teacher"
              />
              <datalist id="payroll-role-suggestions">
                {DEFAULT_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </PayrollFormField>
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField label="Hourly Rate (₹)">
                <Input
                  type="number"
                  value={editing?.hourlyRate ?? 0}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, hourlyRate: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
              <PayrollFormField label="Monthly Base (₹)">
                <Input
                  type="number"
                  value={editing?.monthlySalary ?? 0}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, monthlySalary: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
            </div>
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

export default RoleRatesPage;
