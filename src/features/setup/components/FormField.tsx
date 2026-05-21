import { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface Props {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Inline validation message (rendered red below the control). */
  error?: string;
  /** Neutral helper text shown when there is no error. */
  hint?: string;
  children: ReactNode;
}

/**
 * Labelled form-control wrapper used inside every Setup slide-over form.
 * Standardises label / required marker / error + hint placement.
 */
export const FormField = ({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: Props) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-medium">
      {label}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
    {error ? (
      <p className="text-[11px] text-destructive">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    ) : null}
  </div>
);
