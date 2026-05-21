import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional inline CTA (usually mirrors the page's primary action). */
  action?: { label: string; onClick: () => void };
}

/**
 * Neutral empty-state block shown inside tables / grids when a Setup
 * collection has no rows yet.
 */
export const EmptyState = ({ icon, title, description, action }: Props) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 text-center">
    <span className="flex w-11 h-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {icon ?? <Inbox className="w-5 h-5" />}
    </span>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description && (
      <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
    )}
    {action && (
      <Button size="sm" variant="outline" className="mt-1" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
);
