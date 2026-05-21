import { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Right-aligned primary CTA (usually "Add X"). */
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Toolbar slot between header and content (filters, search, etc.). */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Standard shell for every Setup page. Keeps headers, spacing and the
 * primary "Add" button uniform across the module.
 */
export const SetupPageShell = ({
  title,
  description,
  icon,
  primaryAction,
  toolbar,
  children,
}: Props) => {
  return (
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
        {primaryAction && (
          <Button onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            <Plus className="w-4 h-4 mr-2" />
            {primaryAction.label}
          </Button>
        )}
      </header>

      {toolbar && (
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
      )}

      <div>{children}</div>
    </div>
  );
};
