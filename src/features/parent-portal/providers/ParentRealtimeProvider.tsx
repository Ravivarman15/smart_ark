// ──────────────────────────────────────────────────────────────────────────────
// ParentRealtimeProvider — one Supabase channel keeping the portal live.
//
// Mirrors the shape of FeesRealtimeProvider / AttendanceRealtimeProvider so the
// pattern stays uniform across the codebase.
//
// TWO THINGS MAKE THIS ONE DIFFERENT:
//
// 1. It subscribes ONLY for a parent session. Mounting it for staff would add a
//    ninth always-on channel to every admin page for no benefit, so the effect
//    exits early unless `parent` is set.
//
// 2. Realtime honours RLS, so a parent's subscription only ever delivers rows
//    they may SELECT. The `childIds` check below is therefore a cache-precision
//    optimisation — invalidate the right child's queries — and NOT the security
//    boundary. The boundary is `is_parent_of()` in the database.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/core/constants/queryKeys";
import { useParentChildren } from "../hooks/useParentChildren";

interface Payload {
  table: string;
  schema: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

/** table → how to pull the owning student id out of a changed row. */
const STUDENT_ID_COLUMN: Record<string, string> = {
  students: "id",
  student_attendance: "student_id",
  exam_results: "student_id",
  student_fees: "student_id",
  student_documents: "student_id",
  message_queue: "recipient_student_id",
};

/**
 * Cohort-addressed tables. A row here has no student_id — it targets a batch or
 * a standard — so any change refreshes the affected child's cohort queries.
 */
const COHORT_TABLES = ["exams", "live_classes", "class_schedules"] as const;

export const ParentRealtimeProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { parent } = useAuth();
  const { data: kids } = useParentChildren(parent?.accountId);

  const childIds = useMemo(() => new Set((kids ?? []).map((k) => k.student.id)), [kids]);
  // Stable primitive dependency — a fresh Set identity on every render would
  // otherwise tear down and rebuild the channel on each paint.
  const childKey = useMemo(() => [...childIds].sort().join(","), [childIds]);

  useEffect(() => {
    if (!parent) return;

    const channel = supabase.channel(`parent-portal-${parent.accountId}`);

    for (const table of Object.keys(STUDENT_ID_COLUMN)) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (payload: Payload) => onStudentRow(table, payload),
      );
    }

    for (const table of COHORT_TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        () => onCohortRow(),
      );
    }

    channel.subscribe();

    function onStudentRow(table: string, payload: Payload) {
      const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
      const studentId = row[STUDENT_ID_COLUMN[table]] as string | undefined;
      if (!studentId || !childIds.has(studentId)) return;

      // The Home card aggregates attendance + fees + marks + classes, so any
      // of these changing must refresh it.
      qc.invalidateQueries({ queryKey: queryKeys.parentPortal.overview(studentId) });

      switch (table) {
        case "student_attendance":
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.attendance(studentId) });
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.timeline(studentId) });
          break;
        case "exam_results":
          // Marks live in the shared insights bundle behind the academics key.
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.academics(studentId) });
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.timeline(studentId) });
          break;
        case "student_fees":
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.academics(studentId) });
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.fees(studentId) });
          break;
        case "student_documents":
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.documents(studentId) });
          break;
        case "message_queue":
          qc.invalidateQueries({ queryKey: queryKeys.parentPortal.communication(studentId) });
          break;
        case "students":
          qc.invalidateQueries({
            queryKey: queryKeys.parentPortal.children(parent!.accountId),
          });
          break;
      }
    }

    // fee_installments carries a student_fee_id, not a student_id, so it can't
    // be resolved to a child without a lookup. A receipt is rare and a parent
    // must see it immediately, so refresh the whole portal namespace instead of
    // paying for a round trip to work out which child it belonged to.
    channel.on(
      "postgres_changes" as never,
      { event: "*", schema: "public", table: "fee_installments" } as never,
      () => qc.invalidateQueries({ queryKey: queryKeys.parentPortal.all }),
    );

    function onCohortRow() {
      // A cohort row cannot be attributed to one child without resolving its
      // batch/standard, so refresh the cohort-derived queries for every child.
      for (const id of childIds) {
        qc.invalidateQueries({ queryKey: queryKeys.parentPortal.exams(id) });
        qc.invalidateQueries({ queryKey: queryKeys.parentPortal.liveClasses(id) });
        qc.invalidateQueries({ queryKey: queryKeys.parentPortal.overview(id) });
        qc.invalidateQueries({
          queryKey: [...queryKeys.parentPortal.all, "schedule", id],
        });
      }
    }

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.accountId, childKey]);

  return <>{children}</>;
};
