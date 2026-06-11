// ──────────────────────────────────────────────────────────────────────────────
// TasksRealtimeProvider — one Supabase channel keeping the Tasks module live.
//
// Watches tasks + child tables. On any change we invalidate the whole `tasks`
// React Query namespace so every open list / board / dashboard / detail drawer
// refetches (across sessions). One subscription per app lifetime.
//
// Migration safety: Supabase realtime emits no error for a table that isn't in
// the publication yet — the postgres_changes filter simply never fires. So this
// provider is a no-op pre-migration and lights up automatically once
// 20260616_tasks_module.sql is applied.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

const TABLES = [
  "tasks",
  "task_comments",
  "task_checklist_items",
  "task_attachments",
  "task_watchers",
  "task_activity",
] as const;

export const TasksRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("tasks-sync");
    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => qc.invalidateQueries({ queryKey: queryKeys.tasks.all }),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
