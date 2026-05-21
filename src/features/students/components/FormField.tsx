import { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface Props {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Labelled form-control wrapper with inline error / hint. */
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
