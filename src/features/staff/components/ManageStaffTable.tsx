import { Mail, MoreVertical, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ProtectedMenuItem } from "@/features/rbac";
import type { Staff } from "../types/staff.types";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusChip } from "./StaffStatusChip";
import { OnboardingStatusBadge } from "./OnboardingStatusBadge";

interface Props {
  rows: Staff[];
  loading?: boolean;
  onView?: (staff: Staff) => void;
  onEdit?: (staff: Staff) => void;
  onManageAccess?: (staff: Staff) => void;
  onDeactivate?: (staff: Staff) => void;
  onActivate?: (staff: Staff) => void;
  onResendInvite?: (staff: Staff) => void;
  onResetPassword?: (staff: Staff) => void;
  onVerifyAuth?: (staff: Staff) => void;
  onChangeLoginEmail?: (staff: Staff) => void;
  onDelete?: (staff: Staff) => void;
}

type ActionProps = Pick<
  Props,
  | "onView"
  | "onEdit"
  | "onManageAccess"
  | "onDeactivate"
  | "onActivate"
  | "onResendInvite"
  | "onResetPassword"
  | "onVerifyAuth"
  | "onChangeLoginEmail"
  | "onDelete"
>;

/**
 * Modern staff table. Responsive: mobile renders compact cards, desktop
 * renders a full table with profile, role, department, onboarding + status.
 * Actions are surfaced through a dropdown so the row stays clean.
 */
export const ManageStaffTable = ({
  rows,
  loading,
  onView,
  onEdit,
  onManageAccess,
  onDeactivate,
  onActivate,
  onResendInvite,
  onResetPassword,
  onVerifyAuth,
  onChangeLoginEmail,
  onDelete,
}: Props) => {
  const actions: ActionProps = {
    onView,
    onEdit,
    onManageAccess,
    onDeactivate,
    onActivate,
    onResendInvite,
    onResetPassword,
    onVerifyAuth,
    onChangeLoginEmail,
    onDelete,
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No staff match the current filters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-border/60 bg-card/60 p-3 flex items-start gap-3"
          >
            <StaffAvatar name={s.name} src={s.profilePictureUrl} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-foreground text-sm truncate">
                  {s.name}
                </p>
                <StaffStatusChip status={s.status} />
              </div>
              <p className="text-[11px] text-muted-foreground capitalize">
                {s.role}
                {s.designation ? ` · ${s.designation}` : ""}
                {s.campus ? ` · ${s.campus}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <OnboardingStatusBadge
                  status={s.onboardingStatus}
                  emailStatus={s.inviteEmailStatus}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                {s.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {s.email}
                  </span>
                )}
                {s.mobile && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {s.mobile}
                  </span>
                )}
              </div>
            </div>
            <RowActions s={s} {...actions} />
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="py-2.5 px-3 font-medium">Staff</th>
              <th className="py-2.5 px-3 font-medium">Role</th>
              <th className="py-2.5 px-3 font-medium">Department</th>
              <th className="py-2.5 px-3 font-medium">Onboarding</th>
              <th className="py-2.5 px-3 font-medium">Status</th>
              <th className="py-2.5 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((s) => (
              <tr
                key={s.id}
                className="hover:bg-muted/20 transition-colors"
                onClick={() => onView?.(s)}
                role={onView ? "button" : undefined}
                style={{ cursor: onView ? "pointer" : undefined }}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2.5">
                    <StaffAvatar
                      name={s.name}
                      src={s.profilePictureUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {s.email ?? s.designation ?? "—"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 capitalize text-muted-foreground">
                  {s.role}
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">
                  {s.department ?? "—"}
                </td>
                <td className="py-2.5 px-3">
                  <OnboardingStatusBadge
                    status={s.onboardingStatus}
                    emailStatus={s.inviteEmailStatus}
                  />
                </td>
                <td className="py-2.5 px-3">
                  <StaffStatusChip status={s.status} />
                </td>
                <td
                  className="py-2.5 px-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActions s={s} {...actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/**
 * Row-action menu. Lifecycle + credential actions are wrapped in
 * `ProtectedMenuItem`, so they render greyed-out unless the signed-in user
 * holds the matching RBAC action right. "Preview profile" stays ungated —
 * it is read-only and available to anyone who can open this page.
 */
const RowActions = ({
  s,
  onView,
  onEdit,
  onManageAccess,
  onDeactivate,
  onActivate,
  onResendInvite,
  onResetPassword,
  onVerifyAuth,
  onChangeLoginEmail,
  onDelete,
}: ActionProps & { s: Staff }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <MoreVertical className="w-4 h-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Manage
      </DropdownMenuLabel>
      {onView && (
        <DropdownMenuItem onClick={() => onView(s)}>
          Preview profile
        </DropdownMenuItem>
      )}
      {onEdit && (
        <ProtectedMenuItem action="staff.edit" onClick={() => onEdit(s)}>
          Edit details
        </ProtectedMenuItem>
      )}
      {onManageAccess && (
        <ProtectedMenuItem
          action="staff.edit"
          onClick={() => onManageAccess(s)}
        >
          Manage access &amp; role
        </ProtectedMenuItem>
      )}
      <DropdownMenuSeparator />
      {onResendInvite && s.email && (
        <ProtectedMenuItem
          action="staff.invite.resend"
          onClick={() => onResendInvite(s)}
        >
          Resend welcome email
        </ProtectedMenuItem>
      )}
      {onResetPassword && s.email && (
        <ProtectedMenuItem
          action="staff.password.reset"
          onClick={() => onResetPassword(s)}
        >
          Reset password
        </ProtectedMenuItem>
      )}
      {onVerifyAuth && (
        <ProtectedMenuItem
          action="staff.invite.resend"
          onClick={() => onVerifyAuth(s)}
        >
          Check auth sync
        </ProtectedMenuItem>
      )}
      {onChangeLoginEmail && (
        <ProtectedMenuItem
          action="staff.edit"
          onClick={() => onChangeLoginEmail(s)}
        >
          Change login email
        </ProtectedMenuItem>
      )}
      <DropdownMenuSeparator />
      {s.status === "inactive" && onActivate && (
        <ProtectedMenuItem
          action="staff.deactivate"
          onClick={() => onActivate(s)}
          className="text-emerald-600"
        >
          Activate account
        </ProtectedMenuItem>
      )}
      {s.status !== "inactive" && onDeactivate && (
        <ProtectedMenuItem
          action="staff.deactivate"
          onClick={() => onDeactivate(s)}
          className="text-rose-600"
        >
          Deactivate account
        </ProtectedMenuItem>
      )}
      {onDelete && (
        <>
          <DropdownMenuSeparator />
          <ProtectedMenuItem
            action="staff.delete"
            onClick={() => onDelete(s)}
            className="text-rose-600"
          >
            Delete staff
          </ProtectedMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);
