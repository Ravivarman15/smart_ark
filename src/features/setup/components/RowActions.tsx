import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Omit to hide the button — e.g. RBAC denies the edit action. */
  onEdit?: () => void;
  /** Omit to hide the button — e.g. the row cannot be deleted yet. */
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
}

/**
 * Right-aligned Edit / Delete button pair used in Setup table rows.
 * `stopPropagation` keeps clicks from also triggering an `onRowClick`.
 *
 * Both handlers are optional so a page can omit an action rather than render
 * a control that fails when pressed. A disabled-looking button that errors is
 * how users learn to distrust the whole screen; an action that is genuinely
 * unavailable should not be on it.
 */
export const RowActions = ({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: Props) => (
  <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
    {onEdit && (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        onClick={onEdit}
      >
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
