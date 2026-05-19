import { Calendar, Mail, MapPin, Phone, Shield, UserSquare2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Staff } from "../types/staff.types";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusChip } from "./StaffStatusChip";

interface Props {
  staff: Staff | null;
  onOpenChange: (open: boolean) => void;
}

const Row = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground break-words">{value ?? "—"}</p>
    </div>
  </div>
);

/**
 * Read-only side drawer that shows a single staff's full profile.
 * Opened from `ManageStaffTable` when a row is clicked.
 */
export const StaffProfileDrawer = ({ staff, onOpenChange }: Props) => {
  const open = !!staff;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="border-b border-border/60 pb-4">
          <SheetTitle className="sr-only">Staff profile</SheetTitle>
          {staff && (
            <div className="flex items-center gap-3">
              <StaffAvatar name={staff.name} src={staff.profilePictureUrl} size="xl" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground truncate">{staff.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {staff.role}
                  {staff.designation ? ` · ${staff.designation}` : ""}
                </p>
                <div className="mt-1">
                  <StaffStatusChip status={staff.status} />
                </div>
              </div>
            </div>
          )}
        </SheetHeader>

        {staff && (
          <div className="py-4 space-y-1">
            <Row icon={Mail} label="Email" value={staff.email} />
            <Row icon={Phone} label="Mobile" value={staff.mobile} />
            <Row icon={MapPin} label="Address" value={staff.address} />
            <Row icon={UserSquare2} label="Gender" value={staff.gender} />
            <Row icon={Shield} label="Department" value={staff.department} />
            <Row icon={Shield} label="Designation" value={staff.designation} />
            <Row icon={Calendar} label="Joining Date" value={staff.joiningDate} />
            <Row icon={MapPin} label="Campus" value={staff.campus} />
            <Row icon={UserSquare2} label="Subject" value={staff.subject} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
