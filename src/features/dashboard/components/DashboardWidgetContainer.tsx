import { type ReactNode, Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import type { WidgetSize } from "../types/dashboard.types";

interface Props {
  size?: WidgetSize;
  loading?: boolean;
  error?: unknown;
  children: ReactNode;
  className?: string;
}

// Maps a logical widget size to a grid column span. The grid container is a
// 12-column responsive grid; sizes scale up at larger breakpoints.
const SIZE_CLASSES: Record<WidgetSize, string> = {
  sm: "col-span-12 sm:col-span-6 lg:col-span-3",
  md: "col-span-12 sm:col-span-6 lg:col-span-4",
  lg: "col-span-12 lg:col-span-6",
  xl: "col-span-12",
};

/**
 * Standard frame for every dashboard widget. Handles:
 *   - loading skeleton
 *   - error fallback (so one broken widget doesn't blank the page)
 *   - lazy children via Suspense (charts are dynamically imported elsewhere)
 *   - responsive sizing through the WidgetSize → grid column map
 */
export const DashboardWidgetContainer = ({
  size = "sm",
  loading,
  error,
  children,
  className = "",
}: Props) => {
  return (
    <div className={`${SIZE_CLASSES[size]} ${className}`}>
      <Card className="h-full p-4 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40 border border-border/60 shadow-sm hover:shadow-md transition-shadow">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-rose-600 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error instanceof Error ? error.message : "Failed to load"}</span>
          </div>
        ) : (
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>{children}</Suspense>
        )}
      </Card>
    </div>
  );
};
