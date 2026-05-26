// ──────────────────────────────────────────────────────────────────────────────
// RbacRealtimeProvider — single Supabase realtime channel that keeps every
// permission consumer in sync without a page refresh.
//
// What it watches
// ───────────────
//   - profiles                          (role changes, deactivation)
//   - staff_rights                      (legacy module visibility)
//   - staff_action_rights               (legacy action gates)
//   - rbac_role_permissions             (catalog v2 module grants)
//   - rbac_user_permission_overrides    (per-user catalog v2 overrides)
//   - rbac_role_actions                 (catalog v2 action grants)
//   - rbac_user_action_overrides        (per-user action overrides)
//
// What it invalidates
// ───────────────────
// On every event we (a) invalidate the matching React Query namespace so any
// component subscribed via useEffectivePermissions / useEffectiveActions /
// useSidebarAccess / useCanDo refetches; (b) if the row affects the *current*
// user, we also nudge the legacy StaffRightsContext and the current-profile
// query so AuthContext.user.role reflects DB changes live.
//
// Why it's a provider, not a hook
// ───────────────────────────────
// The channel must be exactly one subscription per app lifetime — multiple
// subscribers would each get their own socket and inflate fanout cost. A
// provider mounted once at AppProviders root guarantees that.
//
// Migration safety
// ────────────────
// Every table is optional — Supabase realtime emits no error when a table
// is absent (the postgres_changes filter just won't fire). The provider is a
// no-op pre-migration.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, CURRENT_PROFILE_QUERY_KEY } from "@/contexts/AuthContext";
import { useStaffRights } from "@/contexts/StaffRightsContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { rbacDebug } from "../utils/rbacDebug";

interface Payload {
  table: string;
  schema: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  // Supabase types this as `Record<string, any>` — we narrow per-table below.
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

const TABLES = [
  "profiles",
  "staff_rights",
  "staff_action_rights",
  "rbac_role_permissions",
  "rbac_user_permission_overrides",
  "rbac_role_actions",
  "rbac_user_action_overrides",
  // Role catalog (Phase 5) — listening so the Role Center reflects renames
  // and archive/restore actions instantly in every session.
  "rbac_roles",
] as const;

export const RbacRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const staffRights = useStaffRights();

  useEffect(() => {
    if (!user) return; // unauthenticated — nothing to subscribe to.

    const channel = supabase.channel("rbac-sync");

    // Each table is registered as a separate `.on(...)` handler so the
    // callback knows which table fired without parsing the payload.
    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onChange(table, payload)
      );
    }

    const status = channel.subscribe();
    rbacDebug("subscribe", { channel: "rbac-sync", status });

    function onChange(table: string, payload: Payload) {
      rbacDebug("realtime", { table, eventType: payload.eventType, row: payload.new ?? payload.old });

      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      const affectedProfileId =
        (row.profile_id as string | undefined) ??
        (row.user_profile_id as string | undefined) ??
        // profiles.id is the row id itself
        (table === "profiles" ? (row.id as string | undefined) : undefined);
      const affectedRole = (row.role as string | undefined) ?? undefined;
      const isCurrentUser = affectedProfileId === user.profileId;
      const isCurrentRole = affectedRole === user.role;

      switch (table) {
        case "profiles": {
          // Always invalidate the current-profile query and the staff list
          // (sidebar / role-based gates depend on profile.role).
          qc.invalidateQueries({ queryKey: CURRENT_PROFILE_QUERY_KEY });
          qc.invalidateQueries({ queryKey: ["staff"] });
          rbacDebug("invalidate", { keys: ["current-profile", "staff"] });
          // If THIS user's role changed, blow the entire RBAC cache so the
          // sidebar / route guards reload from scratch.
          if (isCurrentUser) {
            qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
            staffRights.refresh();
            rbacDebug("invalidate", { keys: ["rbac.all"], reason: "self profile change" });
          }
          return;
        }
        case "staff_rights":
        case "staff_action_rights": {
          // Legacy tables — refresh StaffRightsContext for the affected user.
          if (isCurrentUser) {
            staffRights.refresh();
            rbacDebug("refetch", { context: "StaffRights", reason: "self legacy rights change" });
          }
          // Also bust catalog v2 caches in case overrides cross-reference.
          qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
          rbacDebug("invalidate", { keys: ["rbac.all"], table });
          return;
        }
        case "rbac_role_permissions":
        case "rbac_user_permission_overrides":
        case "rbac_role_actions":
        case "rbac_user_action_overrides":
        case "rbac_roles":
        case "rbac_permission_audit":
        case "rbac_role_audit": {
          // Hard-bust the whole namespace. This used to be surgical (one
          // queryKey per event), but a single grant change can ripple through
          // the resolver into the role-usage stats, the audit lists, the
          // sidebar filter, the role-catalog entry, and the diagnostics view.
          // The matching mutation hooks already do this wide bust locally;
          // the realtime path mirrors it so remote sessions stay in lockstep.
          qc.invalidateQueries({ queryKey: queryKeys.rbac.all });
          qc.invalidateQueries({ queryKey: queryKeys.permissions.all });
          rbacDebug("invalidate", {
            keys: ["rbac.all", "permissions.all"],
            table,
            affectedRole,
            affectedProfileId,
            isCurrentUser,
            isCurrentRole,
          });
          return;
        }
      }
    }

    return () => {
      rbacDebug("unsubscribe", { channel: "rbac-sync" });
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId, user?.role]);

  return <>{children}</>;
};
