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

// Consistent create/edit modal across all features. Form fields and
// validation live in children (each feature builds its own form), but
// the dialog chrome / submit handling is uniform.
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
    <DialogContent className={SIZE_CLASS[size]}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit();
        }}
        className="space-y-4"
      >
        {children}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled || isSubmitting}>
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
