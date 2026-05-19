import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { useAuth } from "@/contexts/AuthContext";
import { useRoles } from "../hooks/useRoles";
import { useInviteStaff } from "../hooks/useStaffMutations";
import { createStaffSchema, type CreateStaffFormValues } from "../schemas/staff.schema";
import { staffService } from "../services/staff.service";
import type { InviteStaffInput } from "../types/staff.types";
import { ProfilePictureUploader } from "./ProfilePictureUploader";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful invite — typically refetches the staff list. */
  onCreated?: () => void;
}

const EMPTY: CreateStaffFormValues = {
  firstName: "",
  middleName: undefined,
  lastName: "",
  gender: "male",
  mobile: "",
  email: "",
  address: undefined,
  profilePictureUrl: undefined,
  role: "teacher",
  department: undefined,
  designation: undefined,
  joiningDate: new Date().toISOString().split("T")[0],
  status: "invited",
  campus: undefined,
  campusId: undefined,
  subject: undefined,
};

// ── Tiny inline form-field helpers ───────────────────────────────────────────
const Field = ({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium">
      {label}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </Label>
    {children}
    {error && <p className="text-[11px] text-rose-600">{error}</p>}
  </div>
);

/**
 * Slide-over Create Staff form.
 *
 * Flow: validate → check duplicate email → call `useInviteStaff` which hits
 * the `invite-staff` edge function (auth invite + profile upsert).
 *
 * Profile image upload happens BEFORE submit, so an in-flight invite either
 * has a picture URL or doesn't — never a half state.
 */
export const CreateStaffSheet = ({ open, onOpenChange, onCreated }: Props) => {
  const { user } = useAuth();
  const roles = useRoles();
  const invite = useInviteStaff();

  const [values, setValues] = useState<CreateStaffFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailChecking, setEmailChecking] = useState(false);

  // Reset on open so a previous failure doesn't leak in
  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
    }
  }, [open]);

  // Picture upload uses the current auth user id as a temporary folder until
  // the real profile id exists. Folder rename is cheap; keeping a stable id
  // for the duration of the form simplifies things.
  const tempOwnerId = useMemo(
    () => user?.profileId ?? user?.id ?? `pending-${crypto.randomUUID()}`,
    [user?.profileId, user?.id]
  );

  const set = <K extends keyof CreateStaffFormValues>(
    key: K,
    value: CreateStaffFormValues[K]
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const { [key as string]: _drop, ...rest } = e;
        return rest;
      });
    }
  };

  const validate = (v: CreateStaffFormValues): Record<string, string> => {
    const parsed = createStaffSchema.safeParse(v);
    if (parsed.success) return {};
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0]?.toString();
      if (path && !out[path]) out[path] = issue.message;
    }
    return out;
  };

  const submit = async () => {
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Pre-submit duplicate-email check for a snappy error chip.
    setEmailChecking(true);
    try {
      const dupe = await staffService.emailExists(values.email);
      if (dupe) {
        setErrors({ email: "A staff member with this email already exists" });
        return;
      }
    } finally {
      setEmailChecking(false);
    }

    try {
      await invite.mutateAsync(values as InviteStaffInput);
      toast.success("Invite email sent. The new staff will set their password on first login.");
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to invite staff";
      if (/already exists/i.test(msg)) {
        setErrors({ email: msg });
      } else {
        toast.error(msg);
      }
    }
  };

  const submitting = invite.isPending || emailChecking;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Staff Member</SheetTitle>
          <SheetDescription>
            Sends a Supabase Auth invite. The new user sets their own password on first login.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-5">
          <ProfilePictureUploader
            value={values.profilePictureUrl}
            onChange={(url) => set("profilePictureUrl", url)}
            ownerId={tempOwnerId}
            name={`${values.firstName} ${values.lastName}`.trim()}
          />

          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="First Name" required error={errors.firstName}>
              <Input
                value={values.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="John"
              />
            </Field>
            <Field label="Middle Name" error={errors.middleName}>
              <Input
                value={values.middleName ?? ""}
                onChange={(e) => set("middleName", e.target.value || undefined)}
              />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input
                value={values.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Doe"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Gender" required error={errors.gender}>
              <Select
                value={values.gender}
                onValueChange={(v) => set("gender", v as CreateStaffFormValues["gender"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mobile No" required error={errors.mobile}>
              <Input
                value={values.mobile}
                onChange={(e) => set("mobile", e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>
          </div>

          <Field label="Email" required error={errors.email}>
            <Input
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="staff@thearktuition.com"
            />
          </Field>

          <Field label="Address" error={errors.address}>
            <Textarea
              value={values.address ?? ""}
              onChange={(e) => set("address", e.target.value || undefined)}
              rows={2}
              placeholder="Street, city, state, PIN"
            />
          </Field>

          {/* Role & employment */}
          <div className="border-t border-border/60 pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Role" required error={errors.role}>
                <Select
                  value={values.role}
                  onValueChange={(v) => set("role", v as CreateStaffFormValues["role"])}
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
                  onValueChange={(v) => set("status", v as CreateStaffFormValues["status"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invited">Invited (default)</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
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
                  placeholder="e.g. Academics"
                />
              </Field>
              <Field label="Designation" error={errors.designation}>
                <Input
                  value={values.designation ?? ""}
                  onChange={(e) => set("designation", e.target.value || undefined)}
                  placeholder="e.g. Senior Faculty"
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
                  placeholder="e.g. Mathematics"
                />
              </Field>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending invite…
              </>
            ) : (
              "Create & Invite"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
