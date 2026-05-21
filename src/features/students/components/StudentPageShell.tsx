import { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Right-aligned primary CTA. */
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  /** Extra header-right content (rendered left of the primary action). */
  headerExtra?: ReactNode;
  /** Toolbar slot between header and content (filters / search). */
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Uniform page chrome for every Student module page. */
export const StudentPageShell = ({
  title,
  description,
  icon,
  primaryAction,
  headerExtra,
  toolbar,
  children,
}: Props) => (
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
