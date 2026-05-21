import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
}

/** Right-aligned Edit / Delete pair for table rows. */
export const RowActions = ({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: Props) => (
  <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
    {onEdit && (
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onEdit}>
        <Pencil className="w-3 h-3" /> {editLabel}
      </Button>
    )}
    {onDelete && (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
        onClick={onDelete}
      >
        <Trash2 className="w-3 h-3" /> {deleteLabel}
      </Button>
    )}
  </div>
);
