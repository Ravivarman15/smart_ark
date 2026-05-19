import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardConfig } from "../hooks/useDashboardConfig";
import { DashboardWidgetContainer } from "./DashboardWidgetContainer";

interface Props {
  /** Override the scope (defaults to the user's role). */
  scope?: string;
  /** Optional empty-state when no widgets resolve for this user. */
  emptyState?: React.ReactNode;
}

/**
 * The grid every dashboard page renders. Pulls the resolved widget list from
 * `useDashboardConfig` and lays them out in a 12-column responsive grid.
 *
 * Each widget is wrapped in `DashboardWidgetContainer` so failures inside one
 * widget don't blank the whole page (Suspense fallback + per-tile loading).
 */
export const DashboardGrid = ({ scope, emptyState }: Props) => {
  const { widgets, isLoading } = useDashboardConfig(scope);

  if (isLoading && widgets.length === 0) {
    return (
      <div className="grid grid-cols-12 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Skeleton className="h-28 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <>{emptyState ?? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No widgets configured for this role.
        </p>
      )}</>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      {widgets.map(({ id, Component, size }) => (
        <DashboardWidgetContainer key={id} size={size}>
          <Component />
        </DashboardWidgetContainer>
      ))}
    </div>
  );
};
