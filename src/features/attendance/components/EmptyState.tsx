import { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Centered placeholder for empty rosters / registers / timelines. */
export const EmptyState = ({ icon, title, description, action }: Props) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
    {icon && (
      <span className="flex w-10 h-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        {icon}
      </span>
    )}
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
