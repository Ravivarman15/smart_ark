import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/core/constants/queryKeys";

// ─────────────────────────────────────────────────────────────────────────────
// Rich per-student insights for the profile drawer: the full fee ledger + every
// payment receipt, exam performance per subject (strong / weak), and an
// attendance breakdown — everything the charts + receipt list need.
//
// Every query is best-effort (Promise.allSettled): a missing table / column
// (migration not applied) yields an empty section instead of throwing, so the
// drawer keeps rendering the data it always had.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number => Number(v ?? 0) || 0;

export interface ReceiptRow {
  id: string;
  amount: number;
  date: string;
  method: string;
  receiptNo?: string;
  notes?: string;
}

export interface FeeDetail {
  id: string;
  total: number;
  discount: number;
  received: number;
  pending: number;
  status: string;
  studentName?: string;
  batchName?: string;
  receipts: ReceiptRow[];
}

export interface ExamPoint {
  id: string;
  title: string;
  subject: string;
  date?: string;
  marks: number | null;
  total: number;
  percent: number | null;
  grade?: string;
  absent: boolean;
}

export interface SubjectPerf {
  subject: string;
  avgPercent: number;
  count: number;
}

export interface AttendanceBreakdown {
  present: number;
  absent: number;
  late: number;
  total: number;
  percent: number;
}

export interface StudentInsights {
  fee?: FeeDetail;
  exams: ExamPoint[];
  subjects: SubjectPerf[];
  strong: SubjectPerf[];
  weak: SubjectPerf[];
  overallPercent: number | null;
  attendance?: AttendanceBreakdown;
}

const feeDetail = async (studentId: string): Promise<FeeDetail | undefined> => {
  const { data, error } = await supabase
    .from("student_fees")
    .select(
      "id, total_amount, discount_amount, amount_received, amount_pending, status, student_name, batch_name"
    )
    .eq("student_id", studentId)
    .maybeSingle();
  if (error || !data) return undefined;
  const f = data as Record<string, unknown>;

  let receipts: ReceiptRow[] = [];
  const { data: instData } = await supabase
    .from("fee_installments")
    .select("id, amount, payment_date, payment_method, receipt_no, notes")
    .eq("student_fee_id", f.id as string)
    .order("payment_date", { ascending: false });
  if (instData) {
    receipts = (instData as Record<string, unknown>[])
      // Only real payments — scheduled (unpaid) installments are not receipts.
      .filter((r) => (r.payment_method as string) !== "Scheduled")
      .map((r) => ({
        id: r.id as string,
        amount: num(r.amount),
        date: (r.payment_date as string) ?? "",
        method: (r.payment_method as string) ?? "Cash",
        receiptNo: (r.receipt_no as string) ?? undefined,
        notes: (r.notes as string) ?? undefined,
      }));
  }

  return {
    id: f.id as string,
    total: num(f.total_amount),
    discount: num(f.discount_amount),
    received: num(f.amount_received),
    pending: num(f.amount_pending),
    status: (f.status as string) ?? "pending",
    studentName: (f.student_name as string) ?? undefined,
    batchName: (f.batch_name as string) ?? undefined,
    receipts,
  };
};

type ExamJoin = {
  title?: string | null;
  subject_name?: string | null;
  total_marks?: number | null;
  exam_date?: string | null;
} | null;

const examPoints = async (studentId: string): Promise<ExamPoint[]> => {
  const { data, error } = await supabase
    .from("exam_results")
    .select(
      "id, marks, grade, is_absent, entered_at, exams(title, subject_name, total_marks, exam_date)"
    )
    .eq("student_id", studentId)
    .order("entered_at", { ascending: true });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => {
    const ex = (Array.isArray(r.exams) ? r.exams[0] : r.exams) as ExamJoin;
    const total = num(ex?.total_marks) || 100;
    const absent = !!r.is_absent;
    const marks = r.marks === null || r.marks === undefined ? null : num(r.marks);
    const percent = absent || marks === null ? null : Math.round((marks / total) * 100);
    return {
      id: r.id as string,
      title: ex?.title ?? "Exam",
      subject: ex?.subject_name ?? "General",
      date: ex?.exam_date ?? (r.entered_at as string)?.slice(0, 10) ?? undefined,
      marks,
      total,
      percent,
      grade: (r.grade as string) ?? undefined,
      absent,
    };
  });
};

const attendanceBreakdown = async (
  studentId: string
): Promise<AttendanceBreakdown | undefined> => {
  const { data, error } = await supabase
    .from("student_attendance")
    .select("status")
    .eq("student_id", studentId);
  if (error || !data || data.length === 0) return undefined;
  const rows = data as { status: string | null }[];
  const total = rows.length;
  const present = rows.filter((r) => r.status === "present").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const late = rows.filter((r) => r.status === "late").length;
  return { present, absent, late, total, percent: total ? Math.round((present / total) * 100) : 0 };
};

const summariseSubjects = (exams: ExamPoint[]): SubjectPerf[] => {
  const map = new Map<string, { sum: number; count: number }>();
  for (const e of exams) {
    if (e.percent === null) continue;
    const m = map.get(e.subject) ?? { sum: 0, count: 0 };
    m.sum += e.percent;
    m.count += 1;
    map.set(e.subject, m);
  }
  return [...map.entries()]
    .map(([subject, m]) => ({ subject, avgPercent: Math.round(m.sum / m.count), count: m.count }))
    .sort((a, b) => b.avgPercent - a.avgPercent);
};

/** Shared fetch — reused by the hook and by the Student 360° report service. */
export const fetchStudentInsights = async (studentId: string): Promise<StudentInsights> => {
  const [fee, exams, attendance] = await Promise.allSettled([
    feeDetail(studentId),
    examPoints(studentId),
    attendanceBreakdown(studentId),
  ]);

  const examList = exams.status === "fulfilled" ? exams.value : [];
  const subjects = summariseSubjects(examList);
  const scored = examList.filter((e) => e.percent !== null);
  const overallPercent = scored.length
    ? Math.round(scored.reduce((a, e) => a + (e.percent as number), 0) / scored.length)
    : null;

  return {
    fee: fee.status === "fulfilled" ? fee.value : undefined,
    exams: examList,
    subjects,
    strong: subjects.slice(0, 3),
    weak: subjects.length > 3 ? subjects.slice(-3).reverse() : [],
    overallPercent,
    attendance: attendance.status === "fulfilled" ? attendance.value : undefined,
  };
};

export const useStudentInsights = (studentId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: studentId
      ? [...queryKeys.students.all, "insights", studentId]
      : ["students", "insights", "noop"],
    queryFn: () => fetchStudentInsights(studentId as string),
    enabled: !!studentId && enabled,
    staleTime: 30_000,
  });
