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
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Use a wider sheet for multi-section forms (registration). */
  wide?: boolean;
  children: ReactNode;
}

/** Slide-over form wrapper for the Student module. */
export const FormSheet = ({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Save",
  submitting,
  onDelete,
  deleteLabel = "Delete",
  wide,
  children,
}: Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      className={`w-full flex flex-col ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}
    >
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
