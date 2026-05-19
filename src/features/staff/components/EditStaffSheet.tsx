import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
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
import { useRoles } from "../hooks/useRoles";
import { useUpdateStaff } from "../hooks/useStaffMutations";
import { updateStaffSchema, type UpdateStaffFormValues } from "../schemas/staff.schema";
import type { Staff } from "../types/staff.types";
import { ProfilePictureUploader } from "./ProfilePictureUploader";

interface Props {
  staff: Staff | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium">{label}</Label>
    {children}
    {error && <p className="text-[11px] text-rose-600">{error}</p>}
  </div>
);

const seed = (s: Staff): UpdateStaffFormValues => ({
  firstName: s.firstName,
  middleName: s.middleName,
  lastName: s.lastName,
  gender: s.gender,
  mobile: s.mobile,
  email: s.email,
  address: s.address,
  profilePictureUrl: s.profilePictureUrl,
  role: s.role,
  department: s.department,
  designation: s.designation,
  joiningDate: s.joiningDate,
  status: s.status,
  subject: s.subject,
  campusId: s.campusId,
  active: s.active,
  name: s.firstName || s.lastName ? undefined : s.name,
});

/**
 * Edit Staff slide-over. Updates the profile row directly via
 * `useUpdateStaff` — no auth changes (those go through `useResetStaffPassword`
 * / `useResendInvite`).
 */
export const EditStaffSheet = ({ staff, onOpenChange, onSaved }: Props) => {
  const roles = useRoles();
  const update = useUpdateStaff();

  const [values, setValues] = useState<UpdateStaffFormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (staff) {
      setValues(seed(staff));
      setErrors({});
    }
  }, [staff]);

  const set = <K extends keyof UpdateStaffFormValues>(
    key: K,
    value: UpdateStaffFormValues[K]
  ) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!staff) return;
    const parsed = updateStaffSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0]?.toString();
        if (path && !errs[path]) errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }

    try {
      // Keep is_active in sync with status so older code paths keep working.
      const active =
        parsed.data.status === "inactive" || parsed.data.status === "suspended"
          ? false
          : parsed.data.status === "active"
            ? true
            : staff.active;

      await update.mutateAsync({
        id: staff.id,
        updates: { ...parsed.data, active },
      });
      toast.success("Staff updated");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <Sheet open={!!staff} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit {staff?.name}</SheetTitle>
        </SheetHeader>

        {staff && (
          <div className="space-y-5 py-5">
            <ProfilePictureUploader
              value={values.profilePictureUrl ?? staff.profilePictureUrl}
              onChange={(url) => set("profilePictureUrl", url)}
              ownerId={staff.id}
              name={`${values.firstName ?? ""} ${values.lastName ?? ""}`.trim() || staff.name}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="First Name" error={errors.firstName}>
                <Input
                  value={values.firstName ?? ""}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Middle Name" error={errors.middleName}>
                <Input
                  value={values.middleName ?? ""}
                  onChange={(e) => set("middleName", e.target.value || undefined)}
                />
              </Field>
              <Field label="Last Name" error={errors.lastName}>
                <Input
                  value={values.lastName ?? ""}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Mobile No" error={errors.mobile}>
                <Input
                  value={values.mobile ?? ""}
                  onChange={(e) => set("mobile", e.target.value)}
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  value={values.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Address" error={errors.address}>
              <Textarea
                value={values.address ?? ""}
                onChange={(e) => set("address", e.target.value || undefined)}
                rows={2}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Role" error={errors.role}>
                <Select
                  value={values.role}
                  onValueChange={(v) => set("role", v as UpdateStaffFormValues["role"])}
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
              </Field>
              <Field label="Status" error={errors.status}>
                <Select
                  value={values.status}
                  onValueChange={(v) => set("status", v as UpdateStaffFormValues["status"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Department" error={errors.department}>
                <Input
                  value={values.department ?? ""}
                  onChange={(e) => set("department", e.target.value || undefined)}
                />
              </Field>
              <Field label="Designation" error={errors.designation}>
                <Input
                  value={values.designation ?? ""}
                  onChange={(e) => set("designation", e.target.value || undefined)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Joining Date" error={errors.joiningDate}>
                <Input
                  type="date"
                  value={values.joiningDate ?? ""}
                  onChange={(e) => set("joiningDate", e.target.value || undefined)}
                />
              </Field>
              <Field label="Subject" error={errors.subject}>
                <Input
                  value={values.subject ?? ""}
                  onChange={(e) => set("subject", e.target.value || undefined)}
                />
              </Field>
            </div>
          </div>
        )}

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
