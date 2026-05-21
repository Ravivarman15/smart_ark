import { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useRoles } from "../hooks/useRoles";
import { useUpdateStaff } from "../hooks/useStaffMutations";
import { onboardingService } from "../services/onboarding.service";
import type { Role, Staff } from "../types/staff.types";
import { PermissionMatrix } from "./PermissionMatrix";
import { StaffAvatar } from "./StaffAvatar";

interface Props {
  staff: Staff | null;
  onOpenChange: (open: boolean) => void;
  /** Called after any change (role / modules / permissions) is applied. */
  onChanged?: () => void;
}

/**
 * Manage Access slide-over — the single place Management/Admin reassign a
 * staff member's role and tune their module + action permissions.
 *
 * Changes apply immediately:
 *   • Role        → `useUpdateStaff` (also drives which dashboard they land on)
 *   • Modules     → `PermissionMatrix` (module visibility toggles)
 *   • Permissions → `PermissionMatrix` (per-action toggles)
 *
 * Every change is mirrored into the onboarding audit log.
 */
export const StaffAccessSheet = ({ staff, onOpenChange, onChanged }: Props) => {
  const { user } = useAuth();
  const roles = useRoles();
  const updateStaff = useUpdateStaff();

  const [role, setRole] = useState<Role | undefined>(staff?.role);

  useEffect(() => {
    setRole(staff?.role);
  }, [staff]);

  const actor = { profileId: user?.profileId, name: user?.name };

  const applyRole = async () => {
    if (!staff || !role || role === staff.role) return;
    const previous = staff.role;
    try {
      await updateStaff.mutateAsync({ id: staff.id, updates: { role } });
      await onboardingService.recordRoleChange(staff.id, previous, role, actor);
      toast.success(`Role changed to ${role}`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role");
      setRole(previous);
    }
  };

  const roleDirty = !!staff && !!role && role !== staff.role;

  return (
    <Sheet open={!!staff} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent" />
            Manage Access
          </SheetTitle>
          <SheetDescription>
            Reassign role, modules and permissions. Changes apply immediately.
          </SheetDescription>
        </SheetHeader>

        {staff && (
          <div className="py-5 space-y-6">
            {/* Identity strip */}
            <div className="flex items-center gap-3">
              <StaffAvatar
                name={staff.name}
                src={staff.profilePictureUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {staff.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {staff.email ?? "No email on file"}
                </p>
              </div>
            </div>

            {/* Role & dashboard */}
            <section className="rounded-lg border border-border/60 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Role &amp; Dashboard
                </h3>
                <p className="text-xs text-muted-foreground">
                  The role decides which dashboard the staff member lands on and
                  their default module access.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium">Role</label>
                  <Select
                    value={role}
                    onValueChange={(v) => setRole(v as Role)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={applyRole}
                  disabled={!roleDirty || updateStaff.isPending}
                >
                  {updateStaff.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Applying…
                    </>
                  ) : (
                    "Apply role change"
                  )}
                </Button>
              </div>
            </section>

            {/* Modules & permissions */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Modules &amp; Permissions
                </h3>
                <p className="text-xs text-muted-foreground">
                  Toggle module visibility and per-action permissions. Unset
                  rights default to allowed.
                </p>
              </div>
              <PermissionMatrix
                staffId={staff.id}
                staffName={staff.name}
                onSaved={() => {
                  onboardingService.recordPermissionsUpdated(staff.id, actor);
                  onChanged?.();
                }}
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
