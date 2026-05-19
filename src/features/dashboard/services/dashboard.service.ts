import { BaseService, AppError } from "@/shared/services";
import type { DashboardLayout, WidgetLayoutItem } from "../types/dashboard.types";

// Persistence for per-scope dashboard layouts (which widgets are visible,
// their order, override sizes). Backed by `dashboard_layouts`:
//
//   create table dashboard_layouts (
//     scope text primary key,
//     items jsonb not null default '[]',
//     updated_at timestamptz not null default now()
//   );
//
// The table is optional — if it doesn't exist (older deployments), the
// service treats a Postgres "relation does not exist" error as "no layout".
// The widget registry's defaults then take over, so the dashboard always
// renders something sensible without a migration step.
class DashboardService extends BaseService {
  async getLayout(scope: string): Promise<DashboardLayout | null> {
    const { data, error } = await this.db
      .from("dashboard_layouts" as never)
      .select("scope, items, updated_at")
      .eq("scope", scope)
      .maybeSingle();

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      // Table missing → fall back to defaults.
      if (msg.includes("does not exist") || msg.includes("schema cache")) return null;
      throw AppError.fromSupabase(error, "dashboard_layouts");
    }

    if (!data) return null;
    return {
      scope: (data as { scope: string }).scope,
      items: ((data as { items: WidgetLayoutItem[] }).items ?? []) as WidgetLayoutItem[],
      updatedAt: (data as { updated_at?: string }).updated_at,
    };
  }

  async saveLayout(layout: DashboardLayout): Promise<void> {
    const { error } = await this.db.from("dashboard_layouts" as never).upsert(
      {
        scope: layout.scope,
        items: layout.items,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "scope" }
    );
    if (error) throw AppError.fromSupabase(error, "dashboard_layouts.save");
  }
}

export const dashboardService = new DashboardService();
