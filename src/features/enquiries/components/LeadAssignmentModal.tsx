import { useState } from "react";
import { EntityFormModal } from "@/shared/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAssignEnquiry } from "../hooks";

interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enquiryId: string;
  enquiryName?: string;
  staff: StaffOption[];
  currentAssignee?: string;
  onSuccess?: () => void;
}

// Reusable lead-assignment modal. Caller passes the eligible staff list
// (typically filtered by role + active status) — keeps this component
// agnostic of where staff data comes from.
export const LeadAssignmentModal = ({
  open,
  onOpenChange,
  enquiryId,
  enquiryName,
  staff,
  currentAssignee,
  onSuccess,
}: Props) => {
  const [staffId, setStaffId] = useState(currentAssignee ?? "");
  const assign = useAssignEnquiry();

  const submit = async () => {
    if (!staffId) {
      toast.error("Choose a staff member");
      return;
    }
    try {
      await assign.mutateAsync({ id: enquiryId, staffProfileId: staffId });
      toast.success("Enquiry assigned");
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assignment failed");
    }
  };

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Assign enquiry"
      description={enquiryName ? `Assigning: ${enquiryName}` : undefined}
      submitLabel="Assign"
      isSubmitting={assign.isPending}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor="lead-assignee">Staff member</Label>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger id="lead-assignee">
            <SelectValue placeholder="Choose staff" />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.role && <span className="text-muted-foreground ml-2">({s.role})</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </EntityFormModal>
  );
};
