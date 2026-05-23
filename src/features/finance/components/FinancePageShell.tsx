import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  headerExtra?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

export const FinancePageShell = ({
  title,
  description,
  icon,
  primaryAction,
  headerExtra,
  toolbar,
  children,
}: ShellProps) => (
  <div className="space-y-5">
    <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {headerExtra}
        {primaryAction && (
          <Button onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            <Plus className="w-4 h-4 mr-2" />
            {primaryAction.label}
          </Button>
        )}
      </div>
    </header>
    {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
    <div>{children}</div>
  </div>
);

export const FinanceFormField = ({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) => (
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
