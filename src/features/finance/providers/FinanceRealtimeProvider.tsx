// ──────────────────────────────────────────────────────────────────────────────
// FinanceRealtimeProvider — single Supabase realtime channel keeping
// Expense & Income state live across tabs / clients.
//
// Watches: expense_transactions, expense_categories, vendors, finance_budgets,
//          recurring_transactions, finance_audit.
// On any change, invalidates the React Query namespaces that drive the
// finance pages, dashboard KPIs (today income / expense / refund, profit
// loss), and the reports module.
//
// Mirrors AttendanceRealtimeProvider for shape and migration-safety:
// postgres_changes silently never fires when the tables aren't in the
// `supabase_realtime` publication, so the provider is a no-op on
// pre-migration databases.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";

interface Payload {
  table: string;
  schema: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

const TABLES = [
  "expense_transactions",
  "expense_categories",
  "vendors",
  "finance_budgets",
  "recurring_transactions",
  "finance_audit",
] as const;

export const FinanceRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("finance-sync");

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
      const id = (row.id as string | undefined) ?? undefined;
      const categoryId = (row.category_id as string | undefined) ?? undefined;
      const vendorId = (row.vendor_id as string | undefined) ?? undefined;

      // Broad namespaces — list views, analytics, lookups all refetch.
      qc.invalidateQueries({ queryKey: queryKeys.finance.all });

      // Dashboard KPIs (income/expense/profit-loss) read aggregates.
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      // Reports aggregate from finance — bust the whole tree.
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });

      // Targeted detail invalidations.
      if (table === "expense_transactions" && id) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.expense(id) });
        qc.invalidateQueries({ queryKey: queryKeys.finance.income(id) });
        qc.invalidateQueries({ queryKey: queryKeys.finance.attachments(id) });
        qc.invalidateQueries({
          queryKey: queryKeys.finance.audit("transaction", id),
        });
      }
      if (table === "expense_categories" && id) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.category(id) });
      }
      if (table === "vendors" && id) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.vendor(id) });
      }
      if (table === "finance_budgets" && id) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.budget(id) });
      }
      if (table === "recurring_transactions" && id) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.recurringOne(id) });
      }
      // categoryId / vendorId reference fields — invalidate the list scope
      // that filters by them so anything filtered to that grouping refreshes.
      if (categoryId) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.categories() });
      }
      if (vendorId) {
        qc.invalidateQueries({ queryKey: queryKeys.finance.vendors() });
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
