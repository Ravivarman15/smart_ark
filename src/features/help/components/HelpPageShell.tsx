import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  backTo?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export const HelpPageShell = ({
  title,
  description,
  icon,
  backTo,
  toolbar,
  children,
}: Props) => (
  <div className="space-y-5">
    <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3">
        {backTo && (
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to={backTo}>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </Button>
        )}
        {icon && (
          <span className="flex w-9 h-9 items-center justify-center rounded-md bg-sky-100 text-sky-700 shrink-0">
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
      {toolbar && <div className="flex items-center gap-2 flex-wrap">{toolbar}</div>}
    </header>
    <div>{children}</div>
  </div>
);
