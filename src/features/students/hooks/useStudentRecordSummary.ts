import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/core/constants/queryKeys";
import type { RecordSummaries } from "../services/studentExport.service";

// ─────────────────────────────────────────────────────────────────────────────
// Cross-feature roll-up for the student profile drawer + record download.
//
// Pulls a tiny attendance / fee / exam summary for ONE student. Every query is
// best-effort: a missing table or column (migration not applied) yields an
// undefined section instead of throwing, so the drawer still renders the
// personal/academic data it always has. Kept under the `students` query
// namespace so the realtime layer (which busts queryKeys.students.all on any
// students/attendance/fee change) refreshes it without bespoke wiring.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => Number(v ?? 0) || 0;

const attendanceSummary = async (
  studentId: string,
): Promise<RecordSummaries["attendance"]> => {
  const { data, error } = await supabase
    .from("student_attendance")
    .select("status")
    .eq("student_id", studentId);
  if (error || !data) return undefined;
  const rows = data as { status: string | null }[];
  const total = rows.length;
  const present = rows.filter((r) => r.status === "present").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const late = rows.filter((r) => r.status === "late").length;
  return {
    total,
    present,
    absent,
    late,
    percent: total ? Math.round((present / total) * 100) : 0,
  };
};

const feeSummary = async (studentId: string): Promise<RecordSummaries["fee"]> => {
  const { data, error } = await supabase
    .from("student_fees")
    .select("total_amount, amount_received, amount_pending, status")
    .eq("student_id", studentId);
  if (error || !data || data.length === 0) return undefined;
  const rows = data as {
    total_amount: number | null;
    amount_received: number | null;
    amount_pending: number | null;
    status: string | null;
  }[];
  const total = rows.reduce((a, r) => a + num(r.total_amount), 0);
  const received = rows.reduce((a, r) => a + num(r.amount_received), 0);
  const pending = rows.reduce((a, r) => a + num(r.amount_pending), 0);
  const status = pending <= 0 ? "Paid" : received > 0 ? "Partial" : "Pending";
  return { total, received, pending, status };
};

const examSummary = async (studentId: string): Promise<RecordSummaries["exam"]> => {
  const { data, error } = await supabase
    .from("exam_results")
    .select("marks, grade, is_absent, entered_at")
    .eq("student_id", studentId)
    .order("entered_at", { ascending: false });
  if (error || !data || data.length === 0) return undefined;
  const rows = data as {
    marks: number | null;
    grade: string | null;
    is_absent: boolean | null;
  }[];
  const scored = rows.filter((r) => !r.is_absent && r.marks !== null);
  const average = scored.length
    ? scored.reduce((a, r) => a + num(r.marks), 0) / scored.length
    : null;
  return { count: rows.length, average, lastGrade: rows[0]?.grade ?? undefined };
};

const fetchSummaries = async (studentId: string): Promise<RecordSummaries> => {
  const [att, fee, exam] = await Promise.allSettled([
    attendanceSummary(studentId),
    feeSummary(studentId),
    examSummary(studentId),
  ]);
  return {
    attendance: att.status === "fulfilled" ? att.value : undefined,
    fee: fee.status === "fulfilled" ? fee.value : undefined,
    exam: exam.status === "fulfilled" ? exam.value : undefined,
  };
};

export const useStudentRecordSummary = (studentId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: studentId
      ? [...queryKeys.students.all, "record-summary", studentId]
      : ["students", "record-summary", "noop"],
    queryFn: () => fetchSummaries(studentId as string),
    enabled: !!studentId && enabled,
    staleTime: 30_000,
  });
