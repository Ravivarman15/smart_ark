// ──────────────────────────────────────────────────────────────────────────────
// FeesRealtimeProvider — single Supabase realtime channel keeping fee state
// live across tabs / clients.
//
// Watches: student_fees, fee_structures, fee_structure_revisions, fee_refunds.
// On any change, invalidates the React Query namespaces that drive the fee
// pages, dashboard KPIs (today fee due, fee overdue, total pending), and the
// reports module.
//
// Mirrors AttendanceRealtimeProvider for shape and migration-safety:
// postgres_changes silently never fires when the tables aren't in the
// `supabase_realtime` publication (`alter publication supabase_realtime add
// table ...`), so the provider is a no-op on pre-migration databases.
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
  "student_fees",
  "fee_structures",
  "fee_structure_revisions",
  "fee_refunds",
] as const;

export const FeesRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("fees-sync");

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
      const studentId = (row.student_id as string | undefined) ?? undefined;
      const structureId = (row.fee_structure_id as string | undefined) ?? undefined;
      const id = (row.id as string | undefined) ?? undefined;

      // Broad namespaces — covers list views, analytics, lookups.
      qc.invalidateQueries({ queryKey: queryKeys.fees.all });

      // Dashboard KPI tiles read fee aggregates — bust the whole namespace
      // so today-fee-due, overdue, upcoming and total-pending all refetch.
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });

      // Reports aggregate from fee tables — bust the entire reports tree.
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });

      // Targeted invalidation for the most-watched detail views.
      if (studentId) {
        qc.invalidateQueries({ queryKey: queryKeys.fees.studentFee(studentId) });
        if (id) {
          qc.invalidateQueries({ queryKey: queryKeys.fees.installments(id) });
        }
      }
      if (structureId) {
        qc.invalidateQueries({
          queryKey: queryKeys.fees.structureRevisions(structureId),
        });
      }

      // Fee refunds list — separate from student_fees but lives under the
      // same fees namespace. Already covered by .all above, but the explicit
      // call keeps grep-ability when refund flows change.
      if (table === "fee_refunds") {
        qc.invalidateQueries({ queryKey: queryKeys.fees.refunds() });
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId]);

  return <>{children}</>;
};
