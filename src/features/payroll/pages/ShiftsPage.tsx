import { useState } from "react";
import { Clock4, Pencil, Trash2, Send } from "lucide-react";
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
import {
  useShifts,
  useSaveShift,
  useDeleteShift,
  useRoleOptions,
  useDepartmentOptions,
} from "../hooks";
import type { Shift, ShiftScope } from "../types/payroll.types";

const ShiftsPage = () => {
  const { data: shifts = [] } = useShifts();
  const { data: roles = [] } = useRoleOptions();
  const { data: depts = [] } = useDepartmentOptions();
  const { data: staff = [] } = useStaff();
  const save = useSaveShift();
  const del = useDeleteShift();
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);

  const submit = () => {
    if (!editing?.scopeRef) {
      toast.error("Choose who this shift applies to");
      return;
    }
    // Notify affected staff for staff-scoped shift changes.
    const notify =
      editing.scope === "staff" && editing.scopeRef ? [editing.scopeRef] : [];
    save.mutate(
      {
        input: {
          scope: (editing.scope as ShiftScope) ?? "role",
          scopeRef: editing.scopeRef,
          scopeLabel: editing.scopeLabel,
          startTime: editing.startTime ?? "09:00",
          endTime: editing.endTime ?? "18:00",
          expectedDailyMinutes: editing.expectedDailyMinutes ?? 480,
          workingDays: editing.workingDays ?? 22,
          isActive: editing.isActive ?? true,
          notes: editing.notes,
        },
        id: editing.id,
        notify,
      },
      {
        onSuccess: () => {
          toast.success(
            notify.length
              ? "Shift saved · staff notified on WhatsApp"
              : "Shift saved",
          );
          setEditing(null);
        },
        onError: (e) => toast.error(String((e as Error).message)),
      },
    );
  };

  return (
    <PayrollPageShell
      title="Shift Assignment"
      description="Assign start / end time and expected hours per role, staff or department. Staff are auto-notified on changes."
      icon={<Clock4 className="w-5 h-5" />}
      primaryAction={{
        label: "Add Shift",
        onClick: () =>
          setEditing({ scope: "role", startTime: "09:00", endTime: "18:00", isActive: true }),
      }}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applies To</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead className="text-right">Daily Mins</TableHead>
                <TableHead className="text-right">Working Days</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="capitalize">
                    <span className="font-medium">{s.scope}</span>
                    {": "}
                    {s.scopeLabel || s.scopeRef}
                  </TableCell>
                  <TableCell>
                    {s.startTime} – {s.endTime}
                  </TableCell>
                  <TableCell className="text-right">{s.expectedDailyMinutes}</TableCell>
                  <TableCell className="text-right">{s.workingDays}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => del.mutate(s.id, { onSuccess: () => toast.success("Deleted") })}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {shifts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No shifts configured.
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
            <DialogTitle>{editing?.id ? "Edit" : "Add"} Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField label="Scope">
                <Select
                  value={editing?.scope}
                  onValueChange={(v) =>
                    setEditing((s) => ({ ...s, scope: v as ShiftScope, scopeRef: "", scopeLabel: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                  </SelectContent>
                </Select>
              </PayrollFormField>
              <PayrollFormField label="Target" required>
                {editing?.scope === "staff" ? (
                  <Select
                    value={editing?.scopeRef}
                    onValueChange={(v) => {
                      const st = staff.find((x) => x.id === v);
                      setEditing((s) => ({ ...s, scopeRef: v, scopeLabel: st?.name }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : editing?.scope === "department" ? (
                  <Select
                    value={editing?.scopeRef}
                    onValueChange={(v) => setEditing((s) => ({ ...s, scopeRef: v, scopeLabel: v }))}
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
                ) : (
                  <Select
                    value={editing?.scopeRef}
                    onValueChange={(v) => setEditing((s) => ({ ...s, scopeRef: v, scopeLabel: v }))}
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
                )}
              </PayrollFormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField label="Start Time">
                <Input
                  type="time"
                  value={editing?.startTime ?? "09:00"}
                  onChange={(e) => setEditing((s) => ({ ...s, startTime: e.target.value }))}
                />
              </PayrollFormField>
              <PayrollFormField label="End Time">
                <Input
                  type="time"
                  value={editing?.endTime ?? "18:00"}
                  onChange={(e) => setEditing((s) => ({ ...s, endTime: e.target.value }))}
                />
              </PayrollFormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PayrollFormField label="Expected Daily Minutes">
                <Input
                  type="number"
                  value={editing?.expectedDailyMinutes ?? 480}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, expectedDailyMinutes: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
              <PayrollFormField label="Working Days / Month">
                <Input
                  type="number"
                  value={editing?.workingDays ?? 22}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, workingDays: Number(e.target.value) }))
                  }
                />
              </PayrollFormField>
            </div>
            {editing?.scope === "staff" && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Send className="w-3 h-3" /> The staff member will receive a WhatsApp + in-app
                notification about the new timing.
              </p>
            )}
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

export default ShiftsPage;
