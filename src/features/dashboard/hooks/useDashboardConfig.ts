import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/core/permissions";
import type { Role } from "@/core/constants/roles";
import {
  DEFAULT_LAYOUTS,
  WIDGET_REGISTRY,
  type WidgetEntry,
} from "../registry";
import type { WidgetId, WidgetLayoutItem } from "../types/dashboard.types";
import { useDashboardLayout } from "./useDashboardLayout";

// Re-export for type users; registry isn't part of the public hooks API.
export type ResolvedWidget = WidgetEntry & { size: WidgetEntry["defaultSize"] };

interface UseDashboardConfigResult {
  scope: string;
  /** Final, role + permission filtered, ordered widget list. */
  widgets: ResolvedWidget[];
  /** True while the DB layout query is still loading. */
  isLoading: boolean;
}

/**
 * Resolves "what widgets should this user see, in what order, at what size?"
 *
 * Resolution rules (in order):
 *   1. DB layout for the scope (if present) supplies the ordered widget list
 *      with optional `hidden` flags and size overrides.
 *   2. Otherwise the role's DEFAULT_LAYOUTS entry is used.
 *   3. Each candidate widget is then filtered by the registry's role gate.
 *   4. Then by `usePermissions().canDoAction(widget.action)` if `action` is
 *      set — granular permission still wins over role.
 *
 * Scope defaults to the user's role. Pass a custom scope (e.g. "campus-1")
 * if you start segmenting layouts by tenant.
 */
export const useDashboardConfig = (overrideScope?: string): UseDashboardConfigResult => {
  const { user } = useAuth();
  const { hasRole, canDoAction } = usePermissions();
  const role = (user?.role as Role | undefined) ?? "default";
  const scope = overrideScope ?? role;

  const { data: layout, isLoading } = useDashboardLayout(scope);

  const widgets = useMemo<ResolvedWidget[]>(() => {
    const items: WidgetLayoutItem[] =
      layout?.items?.length
        ? layout.items
        : (DEFAULT_LAYOUTS[role] ?? DEFAULT_LAYOUTS.default).map((d) => ({
            widgetId: d.widgetId,
            order: d.order,
          }));

    const sorted = [...items]
      .filter((it) => !it.hidden)
      .sort((a, b) => a.order - b.order);

    const out: ResolvedWidget[] = [];
    for (const it of sorted) {
      const entry = WIDGET_REGISTRY[it.widgetId as WidgetId];
      if (!entry) continue; // unknown id (stale DB row) — skip silently

      // Role gate. Empty `roles` = all roles allowed.
      if (entry.roles.length > 0 && !hasRole(entry.roles)) continue;
      // Action gate. usePermissions handles super-role bypass.
      if (entry.action && !canDoAction(entry.action)) continue;

      out.push({ ...entry, size: it.size ?? entry.defaultSize });
    }
    return out;
  }, [layout, role, hasRole, canDoAction]);

  return { scope, widgets, isLoading };
};
