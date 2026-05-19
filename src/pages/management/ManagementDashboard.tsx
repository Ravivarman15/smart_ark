import { useAuth } from "@/contexts/AuthContext";
import { DashboardGrid } from "@/features/dashboard";

/**
 * Management Dashboard — modern SaaS layout backed by the dashboard feature.
 *
 * What renders here is *not* hardcoded; it comes from `useDashboardConfig`,
 * which merges the per-scope DB layout with the registry defaults and filters
 * by role + granular permissions. To change the tile order, edit the layout
 * row in `dashboard_layouts` (or fall back to `DEFAULT_LAYOUTS` in
 * `features/dashboard/registry.ts`).
 */
const ManagementDashboard = () => {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-semibold text-foreground">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
          </h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
      </header>

      <DashboardGrid />
    </div>
  );
};

export default ManagementDashboard;
