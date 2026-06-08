// ──────────────────────────────────────────────────────────────────────────────
// PayrollRealtimeProvider — single Supabase realtime channel keeping Payroll
// state live across tabs / clients.
//
// Watches the eight payroll tables. On any change it invalidates the payroll
// React Query namespace (dashboard KPIs, analytics, runs, config, audit) plus
// the dashboard + finance trees (a paid run writes a Salary expense, so the
// P&L / finance dashboard must refresh too).
//
// Mirrors FinanceRealtimeProvider for shape + migration-safety: postgres_changes
// silently never fires when the tables aren't in the supabase_realtime
// publication, so this provider is a no-op on pre-migration databases.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

interface Payload {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

const TABLES = [
  "payroll_role_rates",
  "payroll_staff_rates",
  "payroll_shifts",
  "payroll_rules",
  "payroll_runs",
  "payroll_items",
  "payroll_audit",
  "payroll_settings",
] as const;

export const PayrollRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("payroll-sync");

    for (const table of TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onChange(table, payload),
      );
    }
    channel.subscribe();

    function onChange(table: string, payload: Payload) {
      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      const runId = (row.run_id as string | undefined) ?? (row.id as string | undefined);

      // Broad namespace — dashboard KPIs, analytics, runs, config all refetch.
      qc.invalidateQueries({ queryKey: queryKeys.payroll.all });

      // A paid run posts a Salary expense → finance + dashboard trees refresh.
      if (table === "payroll_runs" || table === "payroll_items") {
        qc.invalidateQueries({ queryKey: queryKeys.finance.all });
        qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        if (runId) qc.invalidateQueries({ queryKey: queryKeys.payroll.run(runId) });
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
