import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  MailWarning,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
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
import {
  staffCredentialsService,
  type CredentialDelivery,
} from "../services/staffCredentials.service";
import { isWhatsappPhone } from "@/features/leads/utils/whatsappPhone";
import { createStaffSchema, type CreateStaffFormValues } from "../schemas/staff.schema";

// Roles that drive Lead CRM WhatsApp automation and therefore NEED a valid
// WhatsApp number on file: counselors receive lead_assigned_counselor / SLA
// nudges; management & admin receive unassigned + escalation alerts.
const WA_AUTOMATION_ROLES = ["counselor", "management", "admin"];

/**
 * Warn (don't block) when a staff member who participates in Lead CRM WhatsApp
 * automation is saved without a usable WhatsApp number — otherwise their lead
 * alerts silently land as status='skipped'. TASK 5.
 */
const warnIfWhatsappMissing = (role?: string, mobile?: string) => {
  if (!role || !WA_AUTOMATION_ROLES.includes(role)) return;
  if (isWhatsappPhone(mobile)) return;
  toast.warning(
    role === "counselor"
      ? "Counselor WhatsApp number required for Lead CRM automation."
      : "WhatsApp number required for Lead CRM automation (lead & SLA alerts).",
  );
};
import { staffService } from "../services/staff.service";
import type { InviteStaffInput, InviteStaffResult, Staff } from "../types/staff.types";
import { ProfilePictureUploader } from "./ProfilePictureUploader";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful invite — typically refetches the staff list. */
  onCreated?: () => void;
  /** Open the access editor for the freshly created staff member. */
  onConfigureAccess?: (staff: Staff) => void;
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

// ── Tiny inline form-field helper ────────────────────────────────────────────
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
 * Flow: validate → check duplicate email → `useInviteStaff` (edge function:
 * creates the auth user with a temporary password, sends the branded welcome
 * email, records onboarding). On success the form is replaced by a credential-
 * delivery panel so the admin always knows whether the email was delivered and
 * can copy the credentials when it was not.
 */
export const CreateStaffSheet = ({
  open,
  onOpenChange,
  onCreated,
  onConfigureAccess,
}: Props) => {
  const { user } = useAuth();
  const roles = useRoles();
  const invite = useInviteStaff();

  const [values, setValues] = useState<CreateStaffFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [emailChecking, setEmailChecking] = useState(false);
  const [result, setResult] = useState<InviteStaffResult | null>(null);
  // Undefined while the send is still in flight — "we don't know yet" and "it
  // didn't go" must not look the same on a panel showing a password.
  const [whatsapp, setWhatsapp] = useState<CredentialDelivery | undefined>();

  // Synchronous re-entrancy guard. `disabled` on the button covers the steady
  // state, but there is a render tick between the first click and the button
  // actually becoming disabled — a held Enter key or a fast double-click can
  // fire `submit()` again inside that window. This ref closes it immediately.
  const submitLockRef = useRef(false);

  // Reset on open so a previous run doesn't leak in.
  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
      setResult(null);
      setWhatsapp(undefined);
      submitLockRef.current = false;
    }
  }, [open]);

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
    // Re-entrancy guard — the single source of truth for "a submit is already
    // running". Blocks double-click + Enter-spam before React re-renders.
    if (submitLockRef.current) return;

    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    submitLockRef.current = true;
    setEmailChecking(true);
    try {
      // Pre-submit duplicate-email check for a snappy error chip. The edge
      // function + the DB unique index are the authoritative guards; this is
      // only a fast-path so the user sees the error without a round-trip.
      const dupe = await staffService.emailExists(values.email);
      if (dupe) {
        setErrors({ email: "A staff member with this email already exists" });
        return;
      }
      setEmailChecking(false); // hand the spinner over to invite.isPending

      const res = await invite.mutateAsync(values as InviteStaffInput);
      onCreated?.();
      setResult(res); // swap to the credential-delivery panel
      if (res.emailStatus === "sent") {
        toast.success("Staff created — welcome email delivered");
      } else {
        toast.warning("Staff created — welcome email not delivered");
      }
      warnIfWhatsappMissing(values.role, values.mobile);

      // WhatsApp the SAME credentials the email carries — never a second
      // password. An email that lands in spam is why the office ends up reading
      // passwords down the phone; this is the channel staff actually open.
      // Deliberately after the panel is shown: the account exists regardless of
      // whether this succeeds, and the panel reports the outcome itself.
      if (res.tempPassword) {
        setWhatsapp(
          await staffCredentialsService.sendWhatsapp({
            staffName: `${values.firstName} ${values.lastName}`.trim(),
            loginEmail: values.email,
            password: res.tempPassword,
            mobile: values.mobile,
            role: values.role,
            designation: values.designation,
            profileId: res.profileId,
            createdBy: user?.profileId,
          }),
        );
      } else {
        // No password came back, so there is nothing to send — say that rather
        // than leaving a spinner running forever.
        setWhatsapp({
          channel: "whatsapp",
          ok: false,
          skipped: true,
          message: "No temporary password was returned — nothing to send.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to invite staff";
      if (/already exists/i.test(msg)) {
        setErrors({ email: msg });
        toast.error("A staff member with this email already exists");
      } else {
        toast.error(msg);
      }
    } finally {
      // Release the lock so a corrected retry is allowed (a successful run
      // shows the success panel instead, so there is nothing to re-submit).
      submitLockRef.current = false;
      setEmailChecking(false);
    }
  };

  const submitting = invite.isPending || emailChecking;

  // The Staff stub for "Configure access" — the access editor only needs id /
  // name / role / email / picture, all known here.
  const createdStaff = (): Staff | null => {
    if (!result) return null;
    return {
      id: result.profileId,
      name: `${values.firstName} ${values.lastName}`.trim(),
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      role: values.role,
      status: "invited",
      active: true,
      profilePictureUrl: values.profilePictureUrl,
      onboardingStatus: result.emailStatus === "sent" ? "invite_sent" : "pending",
      inviteEmailStatus: result.emailStatus,
    };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {result ? (
          <SuccessPanel
            result={result}
            whatsapp={whatsapp}
            mobile={values.mobile}
            email={values.email}
            staffName={`${values.firstName} ${values.lastName}`.trim()}
            onConfigureAccess={
              onConfigureAccess
                ? () => {
                    const s = createdStaff();
                    if (s) onConfigureAccess(s);
                    onOpenChange(false);
                  }
                : undefined
            }
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Add Staff Member</SheetTitle>
              <SheetDescription>
                Creates the account, generates a temporary password and emails a
                professional welcome with login credentials.
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
                    onValueChange={(v) =>
                      set("gender", v as CreateStaffFormValues["gender"])
                    }
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
                  placeholder="staff@yourinstitution.com"
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
                      onValueChange={(v) =>
                        set("role", v as CreateStaffFormValues["role"])
                      }
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
                      onValueChange={(v) =>
                        set("status", v as CreateStaffFormValues["status"])
                      }
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
                      onChange={(e) =>
                        set("department", e.target.value || undefined)
                      }
                      placeholder="e.g. Academics"
                    />
                  </Field>
                  <Field label="Designation" error={errors.designation}>
                    <Input
                      value={values.designation ?? ""}
                      onChange={(e) =>
                        set("designation", e.target.value || undefined)
                      }
                      placeholder="e.g. Senior Faculty"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Joining Date" error={errors.joiningDate}>
                    <Input
                      type="date"
                      value={values.joiningDate ?? ""}
                      onChange={(e) =>
                        set("joiningDate", e.target.value || undefined)
                      }
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
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Creating
                    Staff…
                  </>
                ) : (
                  "Create & send welcome email"
                )}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ── Credential-delivery success panel ────────────────────────────────────────
const SuccessPanel = ({
  result,
  whatsapp,
  mobile,
  email,
  staffName,
  onConfigureAccess,
  onDone,
}: {
  result: InviteStaffResult;
  /** Undefined while the WhatsApp send is still running. */
  whatsapp?: CredentialDelivery;
  mobile?: string;
  email: string;
  staffName: string;
  onConfigureAccess?: () => void;
  onDone: () => void;
}) => {
  const emailDelivered = result.emailStatus === "sent";

  const copy = (text: string, label: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Copy failed"));
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          Staff account created
        </SheetTitle>
        <SheetDescription>
          {staffName} has been added to the organization.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 py-5">
        {/* Email delivery status */}
        {emailDelivered ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm text-emerald-700 dark:text-emerald-400">
              <p className="font-medium">Welcome email delivered</p>
              <p className="text-xs">
                Login credentials were emailed to {email}.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
            <MailWarning className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">
                {result.emailStatus === "skipped"
                  ? "Welcome email not sent"
                  : "Welcome email failed"}
              </p>
              <p className="text-xs">
                {result.emailStatus === "skipped"
                  ? "Brevo email is not configured. Share the credentials below with the staff member directly."
                  : result.emailError ??
                    "Email delivery failed. Share the credentials below directly."}
              </p>
            </div>
          </div>
        )}

        {/* WhatsApp delivery status — the second channel, reported separately.
            Email and WhatsApp fail for different reasons (spam vs a missing
            number), so one line for both would hide whichever went wrong. */}
        {whatsapp === undefined ? (
          <div className="rounded-lg border border-border/60 p-3 flex gap-2.5 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />
            <p>Sending credentials to WhatsApp…</p>
          </div>
        ) : whatsapp.ok ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex gap-2.5">
            <MessageCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm text-emerald-700 dark:text-emerald-400">
              <p className="font-medium">Credentials sent on WhatsApp</p>
              <p className="text-xs">Delivered to {mobile || "the number on file"}.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
            <MessageCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">
                {whatsapp.skipped ? "WhatsApp not sent" : "WhatsApp delivery failed"}
              </p>
              <p className="text-xs">
                {whatsapp.message ?? "Share the credentials below directly."}
              </p>
            </div>
          </div>
        )}

        {/* Credentials */}
        <div className="rounded-lg border border-border/60 p-3 space-y-2.5">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Login credentials
          </p>
          <CredRow label="Login email" value={email} onCopy={copy} />
          {result.tempPassword && (
            <CredRow
              label="Temp password"
              value={result.tempPassword}
              onCopy={copy}
            />
          )}
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            The staff member must change this temporary password after their
            first login.
          </p>
        </div>

        {onConfigureAccess && (
          <button
            type="button"
            onClick={onConfigureAccess}
            className="w-full rounded-lg border border-border/60 hover:bg-muted/40 transition-colors p-3 flex items-center gap-2.5 text-left"
          >
            <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Configure modules &amp; permissions
              </p>
              <p className="text-xs text-muted-foreground">
                Optional — fine-tune what this staff member can access.
              </p>
            </div>
          </button>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60 pt-4">
        <Button onClick={onDone}>Done</Button>
      </SheetFooter>
    </>
  );
};

const CredRow = ({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-mono text-foreground truncate">{value}</p>
    </div>
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={() => onCopy(value, label)}
    >
      <Copy className="w-3.5 h-3.5" />
    </Button>
  </div>
);
