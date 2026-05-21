import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Submit handler called when the user clicks the primary button. */
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** Optional secondary destructive action (e.g. Delete). */
  onDelete?: () => void;
  deleteLabel?: string;
  children: ReactNode;
}

/**
 * Slide-over form wrapper used by every Setup entity (year, standard,
 * subject, course type, tax, batch). Provides consistent header / footer
 * chrome so each individual form only owns its fields.
 */
export const EntityFormSheet = ({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Save",
  submitting,
  onDelete,
  deleteLabel = "Delete",
  children,
}: Props) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <form
          className="flex-1 overflow-y-auto py-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>

        <SheetFooter className="flex !justify-between gap-2 border-t border-border/60 pt-3">
          <div>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                {deleteLabel}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
