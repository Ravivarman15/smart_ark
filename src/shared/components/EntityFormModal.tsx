import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

// Consistent create/edit modal across all features. Form fields and validation
// live in children (each feature builds its own form), but the modal chrome /
// submit handling is uniform.
//
// Mobile-first structure: the modal is a height-capped flex column with a
// sticky header and a sticky action footer, while only the body scrolls. This
// keeps the title and the Save/Cancel buttons on screen on small/Android
// viewports (no more clipped footers or unreachable submit), respects the
// device safe-area inset, and gives 44px+ touch targets. Desktop is unchanged.
export const EntityFormModal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  submitDisabled,
  isSubmitting,
  size = "md",
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn(
        SIZE_CLASS[size],
        "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0",
      )}
    >
      <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 text-left">
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11 sm:h-10"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitDisabled || isSubmitting}
            className="h-11 sm:h-10"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
