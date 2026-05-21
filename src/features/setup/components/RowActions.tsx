import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
}

/**
 * Right-aligned Edit / Delete button pair used in Setup table rows.
 * `stopPropagation` keeps clicks from also triggering an `onRowClick`.
 */
export const RowActions = ({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: Props) => (
  <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs"
      onClick={onEdit}
    >
      <Pencil className="w-3 h-3" /> {editLabel}
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
      onClick={onDelete}
    >
      <Trash2 className="w-3 h-3" /> {deleteLabel}
    </Button>
  </div>
);
