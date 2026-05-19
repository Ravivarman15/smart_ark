import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES } from "@/core/constants/roles";

interface Props {
  open: boolean;
  /** Role currently being edited — excluded from the picker. */
  currentRole: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sourceRole: string) => void;
}

/**
 * "Copy permissions from another role" dialog. Pure UI — the actual data
 * fetch + write happens in the parent so this stays reusable across pages.
 */
export const CopyFromRoleDialog = ({ open, currentRole, onOpenChange, onConfirm }: Props) => {
  const [source, setSource] = useState<string>("");
  const options = ROLES.filter((r) => r !== currentRole);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy permissions from…</DialogTitle>
          <DialogDescription>
            Overwrites the current grants for{" "}
            <span className="font-medium capitalize">{currentRole}</span>. Per-user overrides
            are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger>
              <SelectValue placeholder="Source role" />
            </SelectTrigger>
            <SelectContent>
              {options.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!source} onClick={() => source && onConfirm(source)}>
            Copy permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
