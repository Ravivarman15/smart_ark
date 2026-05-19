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
import type { Staff } from "../types/staff.types";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusChip } from "./StaffStatusChip";

interface Props {
  rows: Staff[];
  loading?: boolean;
  onView?: (staff: Staff) => void;
  onEdit?: (staff: Staff) => void;
  onDeactivate?: (staff: Staff) => void;
  onActivate?: (staff: Staff) => void;
  onResendInvite?: (staff: Staff) => void;
  onResetPassword?: (staff: Staff) => void;
}

/**
 * Modern staff table. Responsive: mobile renders compact cards, desktop
 * renders a full table. Actions are surfaced through a dropdown so the row
 * stays clean; the caller controls which actions are wired (e.g., admin
 * gets fewer actions than management).
 */
export const ManageStaffTable = ({
  rows,
  loading,
  onView,
  onEdit,
  onDeactivate,
  onActivate,
  onResendInvite,
  onResetPassword,
}: Props) => {
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
        <p className="text-sm text-muted-foreground">No staff match the current filters.</p>
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
                <p className="font-medium text-foreground text-sm truncate">{s.name}</p>
                <StaffStatusChip status={s.status} />
              </div>
              <p className="text-[11px] text-muted-foreground capitalize">
                {s.role}
                {s.designation ? ` · ${s.designation}` : ""}
                {s.campus ? ` · ${s.campus}` : ""}
              </p>
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
            <RowActions
              s={s}
              onView={onView}
              onEdit={onEdit}
              onDeactivate={onDeactivate}
              onActivate={onActivate}
              onResendInvite={onResendInvite}
              onResetPassword={onResetPassword}
            />
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
              <th className="py-2.5 px-3 font-medium">Contact</th>
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
                    <StaffAvatar name={s.name} src={s.profilePictureUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{s.name}</p>
                      {s.designation && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {s.designation}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 capitalize text-muted-foreground">{s.role}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{s.department ?? "—"}</td>
                <td className="py-2.5 px-3">
                  <div className="text-[11px] text-muted-foreground flex flex-col">
                    {s.email && <span className="truncate">{s.email}</span>}
                    {s.mobile && <span>{s.mobile}</span>}
                    {!s.email && !s.mobile && <span>—</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <StaffStatusChip status={s.status} />
                </td>
                <td
                  className="py-2.5 px-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActions
                    s={s}
                    onView={onView}
                    onEdit={onEdit}
                    onDeactivate={onDeactivate}
                    onActivate={onActivate}
                    onResendInvite={onResendInvite}
                    onResetPassword={onResetPassword}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const RowActions = ({
  s,
  onView,
  onEdit,
  onDeactivate,
  onActivate,
  onResendInvite,
  onResetPassword,
}: Pick<
  Props,
  "onView" | "onEdit" | "onDeactivate" | "onActivate" | "onResendInvite" | "onResetPassword"
> & {
  s: Staff;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <MoreVertical className="w-4 h-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
        Manage
      </DropdownMenuLabel>
      {onView && <DropdownMenuItem onClick={() => onView(s)}>View profile</DropdownMenuItem>}
      {onEdit && <DropdownMenuItem onClick={() => onEdit(s)}>Edit details</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {onResendInvite && s.email && (
        <DropdownMenuItem onClick={() => onResendInvite(s)}>Resend invite</DropdownMenuItem>
      )}
      {onResetPassword && s.email && (
        <DropdownMenuItem onClick={() => onResetPassword(s)}>Reset password</DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {s.status === "inactive" && onActivate && (
        <DropdownMenuItem onClick={() => onActivate(s)} className="text-emerald-600">
          Activate
        </DropdownMenuItem>
      )}
      {s.status !== "inactive" && onDeactivate && (
        <DropdownMenuItem onClick={() => onDeactivate(s)} className="text-rose-600">
          Deactivate
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);
