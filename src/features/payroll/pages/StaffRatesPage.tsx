import { useState } from "react";
import { UserCog, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useStaff } from "@/features/staff";
import { PayrollPageShell, PayrollFormField } from "../components";
import { useStaffRates, useSaveStaffRate, useDeleteStaffRate } from "../hooks";
import { formatINR } from "../utils/payrollCalc";
import type { StaffRate } from "../types/payroll.types";

const StaffRatesPage = () => {
  const { data: rates = [] } = useStaffRates();
  const { data: staff = [] } = useStaff();
  const save = useSaveStaffRate();
  const del = useDeleteStaffRate();
  const [editing, setEditing] = useState<Partial<StaffRate> | null>(null);

  const submit = () => {
    if (!editing?.staffId) {
      toast.error("Select a staff member");
      return;
    }
    save.mutate(
      {
        staffId: editing.staffId,
        hourlyRate: editing.hourlyRate != null ? Number(editing.hourlyRate) : undefined,
        monthlySalary: editing.monthlySalary != null ? Number(editing.monthlySalary) : undefined,
        basicSalary: editing.basicSalary != null ? Number(editing.basicSalary) : undefined,
        isActive: editing.isActive ?? true,
        notes: editing.notes,
      },
      {
        onSuccess: () => {
          toast.success("Staff rate saved");
          setEditing(null);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  return (
    <PayrollPageShell
      title="Staff-Wise Salary"
      description="Per-staff hourly rate / monthly salary. Always takes priority over the role rate."
      icon={<UserCog className="w-5 h-5" />}
      primaryAction={{
        label: "Add Staff Rate",
        onClick: () => setEditing({ isActive: true }),
      }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hourly Rate</TableHead>
                <TableHead className="text-right">Monthly / Basic</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.staffName ?? r.staffId}</TableCell>
                  <TableCell className="capitalize">{r.role ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.hourlyRate != null ? `${formatINR(r.hourlyRate)}/hr` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatINR(r.basicSalary ?? r.monthlySalary ?? 0)}
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
              {rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No staff-specific rates. Role rates apply by default.
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
            <DialogTitle>{editing?.id ? "Edit" : "Add"} Staff Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <PayrollFormField label="Staff Member" required>
              <Select
                value={editing?.staffId}
                onValueChange={(v) => setEditing((s) => ({ ...s, staffId: v }))}
                disabled={!!editing?.id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PayrollFormField>
            <div className="grid grid-cols-3 gap-3">
              <PayrollFormField label="Hourly (₹)">
                <Input
                  type="number"
                  value={editing?.hourlyRate ?? ""}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, hourlyRate: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
              <PayrollFormField label="Monthly (₹)">
                <Input
                  type="number"
                  value={editing?.monthlySalary ?? ""}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, monthlySalary: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
              <PayrollFormField label="Basic (₹)">
                <Input
                  type="number"
                  value={editing?.basicSalary ?? ""}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, basicSalary: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Leave hourly blank to inherit the role rate. Monthly / Basic is added as a
              fixed base on top of hourly earnings.
            </p>
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

export default StaffRatesPage;
