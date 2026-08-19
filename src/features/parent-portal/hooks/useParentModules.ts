// ── Parent Portal — which pages this organization offers ─────────────────────
//
// One hook, both audiences. The parent's sidebar and route guard read it to
// know what exists; the administrator's settings screen reads it to know what
// they are editing. Two hooks would be two answers, and the failure mode of
// that is an administrator switching a page off and a parent still seeing it.
//
// Both inputs resolve through `current_org_id()`, which is populated for a
// parent principal exactly as it is for a staff one — `my_module_entitlements()`
// is SECURITY DEFINER and takes no argument, so a parent asks the same question
// about the same organization and cannot ask it about another.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useModuleEntitlements } from "@/features/rbac/hooks/useModuleEntitlements";
import {
  enabledParentModules,
  parentModuleForPath,
  resolveParentModules,
  type ParentModuleId,
  type ParentModuleMap,
} from "../constants/parentModules";
import { parentPortalModulesService } from "../services/parentPortalModules.service";

export const PARENT_MODULES_QUERY_KEY = ["parent-portal", "modules"] as const;

/** The organization's stored hidden set. */
export const useParentModuleSettings = () =>
  useQuery({
    queryKey: PARENT_MODULES_QUERY_KEY,
    queryFn: () => parentPortalModulesService.get(),
    // The list changes when an administrator saves it, which is rare. Five
    // minutes matches the entitlement cache beside it so the two halves of one
    // resolved answer do not go stale at different times.
    staleTime: 5 * 60_000,
  });

export interface ResolvedParentModules {
  map: ParentModuleMap;
  enabled: Set<ParentModuleId>;
  /** True until BOTH inputs have settled. */
  isLoading: boolean;
}

/**
 * The resolved state of every parent-portal page for the caller's organization.
 *
 * `isLoading` is deliberately exposed rather than smoothed over. A menu that
 * renders every page and then removes four of them a moment later is worse than
 * one that waits — the parent has already started reading, and links moving
 * under a thumb on a phone is how a tap lands on the wrong page.
 */
export const useParentModules = (): ResolvedParentModules => {
  const settings = useParentModuleSettings();
  const entitlements = useModuleEntitlements();

  const map = useMemo(
    () => resolveParentModules(settings.data?.disabled, entitlements.data?.flags),
    [settings.data?.disabled, entitlements.data?.flags],
  );

  return {
    map,
    enabled: useMemo(() => enabledParentModules(map), [map]),
    isLoading: settings.isLoading || entitlements.isLoading,
  };
};

/**
 * "Should I render something that leads to this path?"
 *
 * The menu and the route gate are not the whole story: the Home page is a wall
 * of cards that both LINK to other pages and PRINT their headline figure. An
 * institution that hides Fees & Receipts because it settles at the counter has
 * not been served by a dashboard tile that still announces the outstanding
 * balance — the tile is the page's answer, in miniature. So the card goes, not
 * just its link.
 *
 * Unknown paths return true: this decides what to hide, and nothing should
 * vanish because it was never registered.
 */
export const useParentPathVisible = (): ((to: string | undefined) => boolean) => {
  const { map } = useParentModules();
  return useMemo(
    () => (to?: string) => {
      if (!to) return true;
      const mod = parentModuleForPath(to);
      return mod ? !!map[mod.id]?.enabled : true;
    },
    [map],
  );
};

/**
 * Save an organization's hidden set.
 *
 * Invalidates rather than writing the response into the cache: the stored value
 * is sanitised on the way in, so the only trustworthy version of what was saved
 * is the one the server hands back on the next read.
 */
export const useSaveParentModules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ disabled, updatedBy }: { disabled: ParentModuleId[]; updatedBy?: string }) =>
      parentPortalModulesService.save(disabled, updatedBy),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PARENT_MODULES_QUERY_KEY });
    },
  });
};
