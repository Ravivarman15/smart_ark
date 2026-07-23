import React, { useMemo, useState } from "react";
import { Users, GraduationCap, UserPlus, X, ShieldCheck, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useTeachers } from "@/features/setup/hooks";
import { useStandards } from "@/features/setup/hooks";
import {
  useStaffLinks,
  useStandardLinks,
  useAllocationMutations,
} from "@/features/allocation/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Management → Staff Allocation. The single dynamic screen where Management:
//   • assigns / removes / transfers staff to coordinators (many-to-many)
//   • assigns the standards each coordinator is responsible for (scope)
// Nothing hardcoded — coordinators, staff and standards all come from the DB.
// ─────────────────────────────────────────────────────────────────────────────

const StaffAllocation: React.FC = () => {
  const confirm = useConfirm();
  const { data: people = [] } = useTeachers();
  const { data: standards = [] } = useStandards();
  const {
    assignStaff,
    removeStaff,
    transferStaff,
    assignStandard,
    removeStandard,
  } = useAllocationMutations();

  const coordinators = useMemo(
    () => people.filter((p) => p.role === "coordinator"),
    [people],
  );
  const assignableStaff = useMemo(
    () => people.filter((p) => p.role === "teacher" || p.role === "coordinator"),
    [people],
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const selected = coordinators.find((c) => c.id === selectedId);

  const { data: staffLinks = [] } = useStaffLinks(selectedId || undefined);
  const { data: standardLinks = [] } = useStandardLinks(selectedId || undefined);

  const assignedStaffIds = new Set(staffLinks.map((l) => l.staffId));
  const assignedStandardIds = new Set(standardLinks.map((l) => l.standardId));

  const [addStaffId, setAddStaffId] = useState<string>("");
  const [transferTo, setTransferTo] = useState<string>("");

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";

  const handleAssignStaff = async () => {
    if (!selectedId || !addStaffId) return;
    try {
      await assignStaff.mutateAsync({ coordinatorId: selectedId, staffId: addStaffId });
      toast.success(`${nameOf(addStaffId)} assigned to ${selected?.name}`);
      setAddStaffId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!selectedId) return;
    const ok = await confirm({
      title: "Remove staff",
      description: `Remove ${nameOf(staffId)} from ${selected?.name}? Their existing schedules are kept.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    try {
      await removeStaff.mutateAsync({ coordinatorId: selectedId, staffId });
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const handleTransfer = async (staffId: string) => {
    if (!selectedId || !transferTo) return toast.error("Pick a target coordinator");
    try {
      await transferStaff.mutateAsync({
        fromCoordinatorId: selectedId,
        toCoordinatorId: transferTo,
        staffId,
      });
      toast.success(`${nameOf(staffId)} transferred to ${nameOf(transferTo)}`);
      setTransferTo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to transfer");
    }
  };

  const toggleStandard = async (standardId: string, on: boolean) => {
    if (!selectedId) return;
    try {
      if (on) await assignStandard.mutateAsync({ coordinatorId: selectedId, standardId });
      else await removeStandard.mutateAsync({ coordinatorId: selectedId, standardId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update scope");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Staff Allocation</h1>
          <p className="text-sm text-muted-foreground">
            Assign staff and standards to coordinators. Coordinators can only schedule the staff you assign here.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coordinators list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Coordinators ({coordinators.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {coordinators.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No coordinators yet. Create staff with the “coordinator” role first.
              </p>
            )}
            {coordinators.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Allocation detail */}
        <div className="lg:col-span-2 space-y-6">
          {!selected ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a coordinator to manage their staff and standards.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Standards scope */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GraduationCap className="h-4 w-4" /> Standards Scope — {selected.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {standards.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No standards configured.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {standards.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted"
                        >
                          <Checkbox
                            checked={assignedStandardIds.has(s.id)}
                            onCheckedChange={(v) => toggleStandard(s.id, Boolean(v))}
                          />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Assigned staff */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" /> Assigned Staff ({staffLinks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={addStaffId} onValueChange={setAddStaffId}>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Add staff…" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableStaff
                          .filter((p) => p.id !== selectedId && !assignedStaffIds.has(p.id))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} <span className="text-muted-foreground">· {p.role}</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAssignStaff} disabled={!addStaffId || assignStaff.isPending}>
                      <UserPlus className="h-4 w-4 mr-1" /> Assign
                    </Button>
                  </div>

                  {staffLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Transfer target picker (applies to per-row transfer) */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ArrowRightLeft className="h-4 w-4" /> Transfer target:
                        <Select value={transferTo} onValueChange={setTransferTo}>
                          <SelectTrigger className="w-56 h-8">
                            <SelectValue placeholder="Choose coordinator…" />
                          </SelectTrigger>
                          <SelectContent>
                            {coordinators
                              .filter((c) => c.id !== selectedId)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {staffLinks.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <span className="text-sm">{nameOf(l.staffId)}</span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!transferTo}
                              onClick={() => handleTransfer(l.staffId)}
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveStaff(l.staffId)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Dynamic</Badge>
                Unlimited coordinators, staff and standards — everything is configured here, no code changes.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffAllocation;
