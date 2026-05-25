import { useState } from "react";
import { UserPlus, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignees } from "../hooks";
import type { SupportTicket } from "../types/help.types";

const UNASSIGN = "__unassign__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: SupportTicket;
  onAssign: (input: {
    assignedToProfileId: string | null;
    assignedToName: string | null;
  }) => Promise<unknown> | void;
}

export const AssignmentDialog = ({ open, onOpenChange, ticket, onAssign }: Props) => {
  const assignees = useAssignees();
  const [selected, setSelected] = useState<string | undefined>(
    ticket.assignedToProfileId,
  );
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      if (selected === UNASSIGN || !selected) {
        await onAssign({ assignedToProfileId: null, assignedToName: null });
      } else {
        const target = assignees.data?.find((a) => a.profileId === selected);
        await onAssign({
          assignedToProfileId: selected,
          assignedToName: target?.name ?? null,
        });
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign ticket #{ticket.ticketNo ?? "—"}</DialogTitle>
          <DialogDescription>
            Pick a staff member to take ownership. They will be the responder on
            this ticket and the SLA clock will keep ticking.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Select
            value={selected ?? ""}
            onValueChange={setSelected}
            disabled={assignees.isLoading || busy}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  assignees.isLoading ? "Loading…" : "Select assignee…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGN}>
                <span className="inline-flex items-center gap-1.5">
                  <UserX className="w-4 h-4" /> Unassigned
                </span>
              </SelectItem>
              {(assignees.data ?? []).map((a) => (
                <SelectItem key={a.profileId} value={a.profileId}>
                  <span className="inline-flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" />
                    {a.name}{" "}
                    <span className="text-xs text-muted-foreground">· {a.role}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
