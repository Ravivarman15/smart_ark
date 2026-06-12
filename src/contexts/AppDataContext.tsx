import React, { createContext, useContext, useCallback, useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { studentsService } from "@/features/students";
import {
  feesService,
  installmentsService,
  refundsService,
} from "@/features/fees";
import {
  enquiriesService,
  followupsService,
  admissionsService,
} from "@/features/enquiries";
import {
  staffService,
  attendanceService,
  formatTime as formatLocalTime,
} from "@/features/staff";

// ── Types ────────────────────────────────────────────────────────────────────
export type TaskStatus = "pending" | "completed";
export interface Task { id: string; title: string; description: string; dueDate: string; assignedTo: string[]; statusByTeacher: Record<string, TaskStatus>; createdAt: string; }
export type AttendanceStatus = "present" | "absent";
export type AttendanceRecord = Record<string, Record<string, Record<string, AttendanceStatus>>>;
export interface TeacherInfo { id: string; name: string; email?: string; className?: string; classes?: string[]; studentsByBatch?: Record<string, string[]>; campus: string; subject: string; students?: string[]; kpiScore?: number; lateCount?: number; studentImprovement?: number; compliance?: number; portionCompletion?: number; retestHandling?: number; marksSla?: number; profileId?: string; }
export interface AdminInfo { id: string; name: string; campus: string; role: string; profileId: string; }
export interface CheckinRecord { time: string; geoValid: boolean; status: "on-time" | "late" | "absent" | "pending"; checkinTimestamp?: string; checkoutTime?: string; checkoutGeoValid?: boolean; checkoutStatus?: "on-time" | "early" | "pending"; checkoutTimestamp?: string; }
export interface RetestItem { id: string; student: string; batch: string; subject: string; marks: number; teacher: string; status: "pending" | "allocated" | "completed"; dueDate: string; retestMarks?: number; allocatedDate?: string; }
export interface Expense { id: string; amount: number; category: string; date: string; enteredBy: string; campusId?: string; description?: string; type?: "expense" | "income"; paymentMode?: string; }
export interface AdminChecklistItem { id: string; label: string; done: boolean; }
export interface DailyChecklistState { date: string; checked: Record<string, boolean>; signName: string; signTime: string; signedOff: boolean; }
export interface Installment { id: string; amount: number; date: string; receiptNo: string; method: string; }
export interface ClassScheduleEntry { batchLetter: string; name: string; timing: string; capacity: number; campus: string; }
export interface FeeRecord { id: string; student: string; batch: string; amount: number; dueSince: string; paid: boolean; paidDate?: string; campus?: string; discount?: number; finalAmount?: number; received?: number; refund?: number; pending?: number; installments?: Installment[]; taxEnabled?: boolean; receiptNo?: string; }
export interface EnquiryHistoryItem { date: string; status: "interested" | "follow-up" | "converted" | "not-interested"; notes: string; updatedBy: string; }
export interface AdmissionCall { id: string; name: string; phone: string; date: string; status: "interested" | "follow-up" | "converted" | "not-interested"; notes: string; type?: "call" | "walk-in"; priority?: "high" | "medium" | "low"; assignedTo?: string; followUpDate?: string; history?: EnquiryHistoryItem[]; }
export interface WeeklyPlan { id: string; batch: string; teacher: string; portionPlanned: string; testDate: string; status: "on-track" | "delayed" | "completed"; portionCompleted?: string; }
export interface ActionItem { text: string; done: boolean; assignedTo?: string; dueDate?: string; }
export interface MeetingNote { id: string; date: string; title: string; items: ActionItem[]; createdAt: string; linkedAlertId?: string; }
export interface BatchInfo { id: string; name: string; campus: string; avgMarks: number; portionComplete: number; retestRate: number; health: "strong" | "moderate" | "risk"; weakChapters?: string[]; teacherResponsible?: string; timing?: string; batchLetter?: string; capacity?: number; }
export interface StudentInfo { id: string; name: string; batch: string; batchId?: string; spi: number; risk: "safe" | "watch" | "critical"; lastTestDate?: string; retestStatus?: "none" | "pending" | "allocated" | "completed"; campus?: string; subject?: string; active?: boolean; parentName?: string; parentContact?: string; parentContact1?: string; parentContact2?: string; parentEmail?: string; dateOfBirth?: string; dateOfJoining?: string; }
export interface AppAlert { id: string | number; type: "danger" | "warning" | "info"; severity?: "critical" | "warning" | "info"; message: string; timestamp: string; reviewed?: boolean; }
export interface Violation { id: string; userId: string; userName: string; type: "marks-sla" | "retest-delay" | "late-checkin" | "checklist-miss" | "fee-target" | "attendance-gap"; date: string; resolved: boolean; overrideId?: string; details?: string; }
export interface OverrideRequest { id: string; userId: string; userName: string; type: string; reason: string; requestedBy: string; approvedBy?: string; status: "pending" | "approved" | "rejected"; timestamp: string; comment?: string; }
export interface LeaveRequest { id: string; userId: string; userName: string; role: string; startDate: string; endDate: string; type: string; reason: string; status: "pending" | "approved" | "rejected"; appliedOn: string; approvedBy?: string; approvedAt?: string; }
export interface MarksEntry { id: string; studentName: string; studentId: string; marks: number; totalMarks: number; subject: string; examType: string; remarks: string; date: string; teacherId: string; teacherName: string; sentToParent: boolean; }
export interface HistoricalAttendanceLog { id: string; teacherName: string; date: string; checkinTime: string; status: "on-time" | "late" | "absent"; geoValid: boolean; checkoutTime?: string; }

// Campus geo validation
const CAMPUS_LOCATIONS = [
  { name: "ARK Junior Campus", lat: 13.0059109, lng: 80.1961798 },
  { name: "ARK Senior Campus", lat: 13.0059625, lng: 80.1994691 },
];
const GEO_RADIUS_METERS = 200;

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isNearCampus(lat: number, lng: number): { valid: boolean; campus?: string } {
  for (const loc of CAMPUS_LOCATIONS) {
    if (haversineDistance(lat, lng, loc.lat, loc.lng) <= GEO_RADIUS_METERS) {
      return { valid: true, campus: loc.name };
    }
  }
  return { valid: false };
}

// ── Context Type ─────────────────────────────────────────────────────────────
interface AppDataContextType {
  tasks: Task[]; addTask: (task: Omit<Task, "id" | "statusByTeacher" | "createdAt">) => Promise<void>; markTaskComplete: (taskId: string, teacherId: string) => Promise<void>; getTasksForTeacher: (teacherId: string) => Task[];
  attendance: AttendanceRecord; submitAttendance: (teacherId: string, date: string, record: Record<string, AttendanceStatus>) => Promise<void>;
  checkins: Record<string, Record<string, CheckinRecord>>; teacherCheckin: (teacherId: string, geoValid: boolean) => Promise<void>; approveCheckin: (teacherId: string, comments?: string, overrideTime?: string) => Promise<void>; teacherCheckout: (teacherId: string, geoValid: boolean) => Promise<void>; approveCheckout: (teacherId: string, comments?: string, overrideTime?: string) => Promise<void>;
  adminCheckins: Record<string, Record<string, CheckinRecord>>; adminCheckIn: (adminId: string, geoValid: boolean) => Promise<void>; approveAdminCheckin: (adminId: string, comments?: string, overrideTime?: string) => Promise<void>; adminCheckout: (adminId: string, geoValid: boolean) => Promise<void>; approveAdminCheckout: (adminId: string, comments?: string, overrideTime?: string) => Promise<void>;
  retestQueue: RetestItem[]; allocateRetest: (id: string) => Promise<void>; completeRetest: (id: string, retestMarks: number) => Promise<void>; addRetestItem: (item: Omit<RetestItem, "id">) => Promise<void>;
  classSchedule: ClassScheduleEntry[]; updateClassSchedule: (name: string, updates: Partial<ClassScheduleEntry>) => void; addClassSchedule: (entry: ClassScheduleEntry) => void; deleteClassSchedule: (name: string) => void;
  adminChecklist: AdminChecklistItem[]; toggleChecklistItem: (id: string) => Promise<void>;
  dailyChecklistState: DailyChecklistState; toggleDailyChecklist: (id: string) => void; signOffDailyChecklist: (name: string, time: string) => void; resetDailyChecklist: () => void;
  weeklyPlans: WeeklyPlan[]; updatePlanStatus: (id: string, status: WeeklyPlan["status"]) => Promise<void>; addWeeklyPlan: (plan: Omit<WeeklyPlan, "id">) => Promise<void>; deleteWeeklyPlan: (id: string) => Promise<void>;
  feeRecords: FeeRecord[]; markFeePaid: (id: string) => Promise<void>; addFeeRecord: (fee: Omit<FeeRecord, "id">) => Promise<void>; applyDiscount: (id: string, discount: number) => Promise<void>; addInstallment: (id: string, amount: number, method: string) => Promise<void>; issueRefund: (id: string, amount: number) => Promise<void>;
  admissionCalls: AdmissionCall[]; addAdmissionCall: (call: Omit<AdmissionCall, "id" | "history">) => Promise<void>; updateCallStatus: (id: string, status: AdmissionCall["status"]) => Promise<void>; assignEnquiry: (id: string, staffId: string) => Promise<void>; addEnquiryNote: (id: string, note: string, newStatus?: AdmissionCall["status"], followUpDate?: string) => Promise<void>; approveAdmission: (id: string) => Promise<void>;
  meetingNotes: MeetingNote[]; addMeetingNote: (note: Omit<MeetingNote, "id" | "createdAt">) => Promise<void>; updateMeetingNote: (id: string, updates: Partial<MeetingNote>) => Promise<void>; deleteMeetingNote: (id: string) => Promise<void>; toggleActionItem: (noteId: string, itemIndex: number) => void;
  campuses: string[];
  teachers: TeacherInfo[]; addTeacher: (teacher: Omit<TeacherInfo, "id">) => Promise<void>; updateTeacher: (id: string, updates: Partial<TeacherInfo>) => Promise<void>; deleteTeacher: (id: string) => Promise<void>; getTeacherById: (id: string) => TeacherInfo | undefined; addStudentToTeacher: (teacherId: string, studentName: string) => void;
  admins: AdminInfo[];
  batches: BatchInfo[]; addBatch: (batch: Omit<BatchInfo, "id">) => Promise<void>; updateBatch: (id: string, updates: Partial<BatchInfo>) => Promise<void>; deleteBatch: (id: string) => Promise<void>;
  students: StudentInfo[]; addStudent: (student: Omit<StudentInfo, "id">) => Promise<void>; updateStudent: (id: string, updates: Partial<StudentInfo>) => Promise<void>; deactivateStudent: (id: string) => Promise<void>;
  alerts: AppAlert[]; addAlert: (alert: Omit<AppAlert, "id">) => void; dismissAlert: (id: string | number) => void; markAlertReviewed: (id: string | number) => void;
  violations: Violation[]; addViolation: (v: Omit<Violation, "id">) => void; resolveViolation: (id: string) => void;
  overrideRequests: OverrideRequest[]; addOverrideRequest: (o: Omit<OverrideRequest, "id" | "timestamp">) => void; approveOverride: (id: string, approvedBy: string) => void; rejectOverride: (id: string) => void;
  leaveRequests: LeaveRequest[]; addLeaveRequest: (req: Omit<LeaveRequest, "id" | "appliedOn">) => Promise<void>; updateLeaveStatus: (id: string, status: "approved" | "rejected", approvedBy?: string) => Promise<void>;
  expenses: Expense[]; addExpense: (e: Omit<Expense, "id">) => void;
  updateStudentMarks: (studentId: string, marks: number) => void;
  marksEntries: MarksEntry[]; addMarksEntry: (entry: Omit<MarksEntry, "id" | "sentToParent">) => Promise<MarksEntry>; getMarksForStudent: (studentName: string) => MarksEntry[]; markSentToParent: (entryId: string) => Promise<void>;
  strictMode: boolean; setStrictMode: (v: boolean) => void;
  walkIns: number;
  campusMetrics: any[]; ihiTrend: any[]; feeTrend: any[];
  historicalAttendance: HistoricalAttendanceLog[];
  loading: boolean;
  refreshData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

// Helper to map DB violation type to frontend type
const mapViolationType = (dbType: string): Violation["type"] => {
  const map: Record<string, Violation["type"]> = {
    marks_sla: "marks-sla", retest_delay: "retest-delay", late_checkin: "late-checkin",
    checklist_miss: "checklist-miss", fee_target: "fee-target", attendance_gap: "attendance-gap",
    walk_in_miss: "fee-target",
  };
  return map[dbType] || "marks-sla";
};

const mapCallStatus = (dbStatus: string): AdmissionCall["status"] => {
  const map: Record<string, AdmissionCall["status"]> = {
    interested: "interested", follow_up: "follow-up", converted: "converted", not_interested: "not-interested",
  };
  return map[dbStatus] || "interested";
};

// ── Provider ───────────────────────────────────────────────────────────────────
export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);

  // State - all initialized empty, no dummy data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [checkins, setCheckins] = useState<Record<string, Record<string, CheckinRecord>>>({});
  const [adminCheckins, setAdminCheckins] = useState<Record<string, Record<string, CheckinRecord>>>({});
  const [retestQueue, setRetestQueue] = useState<RetestItem[]>([]);
  const [classSchedule, setClassSchedule] = useState<ClassScheduleEntry[]>([]);
  const [adminChecklist, setAdminChecklist] = useState<AdminChecklistItem[]>([]);
  
  // Daily checklist — loaded from Supabase, NO localStorage
  const [dailyChecklistState, setDailyChecklistState] = useState<DailyChecklistState>(() => {
    const today = new Date().toISOString().split("T")[0];
    return { date: today, checked: {}, signName: "", signTime: "", signedOff: false };
  });

  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [admissionCalls, setAdmissionCalls] = useState<AdmissionCall[]>([]);
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [overrideRequests, setOverrideRequests] = useState<OverrideRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [marksEntries, setMarksEntries] = useState<MarksEntry[]>([]);
  const [strictMode, setStrictModeState] = useState(false);
  const [campusMetrics, setCampusMetrics] = useState<any[]>([]);
  const [ihiTrend, setIhiTrend] = useState<any[]>([]);
  const [feeTrend, setFeeTrend] = useState<any[]>([]);
  const [historicalAttendance, setHistoricalAttendance] = useState<HistoricalAttendanceLog[]>([]);
  const dataLoadedRef = useRef(false);

  const today = new Date().toISOString().split("T")[0];

  // ── Data Loading from Supabase ───────────────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;

    // Helper: logs error and returns data (null if failed)
    // Trailing comma on <T,> disambiguates from JSX in TSX files
    const qry = <T,>(result: { data: T | null; error: any }, label: string): T | null => {
      if (result.error) console.error(`[refreshData] ${label}:`, result.error.message ?? result.error);
      return result.data;
    };

    try {
      // Load campuses
      const campusData = qry(await supabase.from("campuses").select("*"), "campuses");
      if (campusData) setCampuses(campusData.map((c: any) => c.name));

      // Load teachers (profiles with role=teacher)
      const teacherProfiles = qry(
        await supabase.from("profiles").select("*, campuses(name)").eq("role", "teacher").eq("is_active", true),
        "teacher profiles"
      );



      // Load admins (profiles with role=admin)
      const adminProfiles = qry(
        await supabase.from("profiles").select("id, name, role, campuses(name)").eq("role", "admin").eq("is_active", true),
        "admin profiles"
      );

      if (adminProfiles && adminProfiles.length > 0) {
        setAdmins(adminProfiles.map(a => ({
          id: a.id,
          profileId: a.id,
          name: a.name,
          role: a.role as string,
          campus: (a.campuses as any)?.name || "All Campuses",
        })));
      } else {
        setAdmins([]);
      }

      // ── Load teacher data via junction tables (UUID FK — no name matching) ──
      //
      // Primary source: teacher_students (populated by migration backfill + addStudentToTeacher)
      // Fallback:       old batches.teacher_responsible text match (for teachers not yet in junction table)

      // 1. teacher_students: all active links with student + batch names
      const junctionRows = qry(
        await supabase
          .from("teacher_students")
          .select("teacher_id, student_id, batch_id, students(name, is_active), batches(name)")
          .eq("students.is_active", true),
        "teacher_students"
      ) as any[] | null;

      // 2. batches.teacher_id (UUID FK set by migration)
      const batchesForTeachersUUID = qry(
        await supabase.from("batches").select("id, name, teacher_id, teacher_responsible").not("teacher_id", "is", null),
        "batches-uuid"
      ) as any[] | null;

      // 3. Fallback: old text-match approach for teachers not yet in junction table
      const batchesForTeachersText = qry(
        await supabase.from("batches").select("name, teacher_responsible").not("teacher_responsible", "is", null),
        "batches-text"
      ) as any[] | null;

      const allStudentsForTeachers = qry(
        await supabase.from("students").select("name, batches(name, teacher_responsible)").eq("is_active", true),
        "students-for-teachers"
      ) as any[] | null;

      // 4. Load cached KPI snapshots for current month
      const now = new Date();
      const kpiSnapshots = qry(
        await supabase
          .from("kpi_snapshots")
          .select("user_id, final_kpi, attendance_score, marks_sla_score, portion_score, student_improvement_score, retest_score")
          .eq("month", now.getMonth() + 1)
          .eq("year", now.getFullYear()),
        "kpi_snapshots"
      ) as any[] | null;

      if (teacherProfiles && teacherProfiles.length > 0) {
        setTeachers(teacherProfiles.map(t => {
          // ── Batch assignment: UUID FK first, text match fallback ──
          const directBatchesUUID = (batchesForTeachersUUID || []).filter(b => b.teacher_id === t.id);
          const directBatchesText = (batchesForTeachersText || []).filter(b => b.teacher_responsible === t.name);
          const directBatches = directBatchesUUID.length > 0 ? directBatchesUUID : directBatchesText;

          // ── Student list: junction table first, text match fallback ──
          const junctionStudents = (junctionRows || []).filter(r => r.teacher_id === t.id);
          const hasJunctionData = junctionStudents.length > 0;

          let studentNames: string[];
          let studentsByBatch: Record<string, string[]>;

          if (hasJunctionData) {
            // Use authoritative junction table
            studentNames = junctionStudents
              .map(r => (r.students as any)?.name)
              .filter(Boolean) as string[];

            studentsByBatch = {};
            directBatches.forEach(b => { studentsByBatch[b.name] = []; });
            junctionStudents.forEach(r => {
              const bName = (r.batches as any)?.name || "Unassigned";
              if (!studentsByBatch[bName]) studentsByBatch[bName] = [];
              const sName = (r.students as any)?.name;
              if (sName) studentsByBatch[bName].push(sName);
            });
          } else {
            // Fallback: old text-match approach
            const studentBatches = (allStudentsForTeachers || []).filter(
              s => (s.batches as any)?.teacher_responsible === t.name
            );
            studentNames = studentBatches.map(s => s.name);
            studentsByBatch = {};
            directBatches.forEach(b => { studentsByBatch[b.name] = []; });
            studentBatches.forEach(s => {
              const bName = (s.batches as any)?.name || "Unassigned";
              if (!studentsByBatch[bName]) studentsByBatch[bName] = [];
              studentsByBatch[bName].push(s.name);
            });
          }

          const classes = directBatches.length > 0
            ? directBatches.map(b => b.name)
            : Array.from(new Set(
                junctionStudents.map(r => (r.batches as any)?.name).filter(Boolean)
              )) as string[];

          // ── KPI from cached snapshot ──
          const snap = (kpiSnapshots || []).find(k => k.user_id === t.id);
          const kpiScore          = snap?.final_kpi             || 0;
          const compliance        = snap?.attendance_score      || 0;
          const marksSla          = snap?.marks_sla_score       || 0;
          const portionCompletion = snap?.portion_score         || 0;
          const studentImprovement= snap?.student_improvement_score || 0;
          const retestHandling    = snap?.retest_score          || 0;

          return {
            id: t.id,
            profileId: t.id,
            name: t.name,
            email: t.user_id,
            campus: (t.campuses as any)?.name || "Senior Campus",
            subject: t.subject || "General",
            className: classes.join(", ") || undefined,
            classes,
            studentsByBatch,
            students: studentNames,
            kpiScore,
            compliance,
            portionCompletion,
            retestHandling,
            marksSla,
            lateCount: 0,
            studentImprovement,
          };
        }));
      } else {
        setTeachers([]);
      }


      // Load batches
      const batchData = qry(await supabase.from("batches").select("*, campuses(name)"), "batches");

      if (batchData && batchData.length > 0) {
        setBatches(batchData.map(b => ({
          id: b.id,
          name: b.name,
          campus: (b.campuses as any)?.name || "",
          avgMarks: Number(b.avg_marks) || 0,
          portionComplete: Number(b.portion_complete) || 0,
          retestRate: Number(b.retest_rate) || 0,
          health: (b.health as any) || "moderate",
          weakChapters: b.weak_chapters || [],
          teacherResponsible: b.teacher_responsible || "",
        })));
      } else {
        setBatches([]);
      }

      // Load students
      const studentData = qry(
        await supabase.from("students").select("*, batches(name), campuses(name)").eq("is_active", true),
        "students"
      );

      if (studentData && studentData.length > 0) {
        setStudents(studentData.map(s => ({
          id: s.id,
          name: s.name,
          batch: (s.batches as any)?.name || "",
          batchId: s.batch_id,
          spi: Number(s.spi) || 0,
          risk: (s.risk_level === "high_risk" ? "critical" : s.risk_level || "safe") as any,
          campus: (s.campuses as any)?.name || "",
          lastTestDate: s.last_test_date || "",
          retestStatus: (s.retest_status || "none") as any,
          active: s.is_active,
          parentName: s.parent_name || "",
          parentContact: s.parent_contact || "",
          parentEmail: s.parent_email || "",
          dateOfBirth: s.date_of_birth || "",
          dateOfJoining: s.admission_date || "",
        })));
      } else {
        setStudents([]);
      }

      // Load retests
      const retestData = qry(
        await supabase.from("retests").select("*, students(name), profiles!retests_teacher_id_fkey(name)"),
        "retests"
      );

      if (retestData && retestData.length > 0) {
        setRetestQueue(retestData.map(r => ({
          id: r.id,
          student: (r.students as any)?.name || "",
          batch: r.batch_name || "",
          subject: r.subject || "",
          marks: Number(r.retest_marks) || 0,
          teacher: (r.profiles as any)?.name || "",
          status: r.status as any,
          dueDate: r.due_date || "",
          retestMarks: r.retest_marks ? Number(r.retest_marks) : undefined,
          allocatedDate: r.allocated_at ? new Date(r.allocated_at).toISOString().split("T")[0] : undefined,
        })));
      } else {
        setRetestQueue([]);
      }

      // Load fee records
      const feeData = qry(await supabase.from("fee_transactions").select("*, campuses(name)"), "fee_transactions");

      if (feeData && feeData.length > 0) {
        setFeeRecords(feeData.map(f => ({
          id: f.id,
          student: f.student_name || "",
          batch: f.batch_name || "",
          amount: Number(f.amount) || 0,
          dueSince: f.due_since || "",
          paid: f.paid || false,
          paidDate: f.paid_at ? new Date(f.paid_at).toISOString().split("T")[0] : undefined,
          campus: (f.campuses as any)?.name || "",
          discount: 0,
          finalAmount: Number(f.amount),
          received: 0,
          refund: 0,
          pending: Number(f.amount),
          installments: [],
          taxEnabled: false,
          receiptNo: '',
        })));
      } else {
        setFeeRecords([]);
      }

      // Load admission calls
      const callData = qry(
        await supabase.from("admission_calls").select("*").order("created_at", { ascending: false }),
        "admission_calls"
      );

      if (callData && callData.length > 0) {
        setAdmissionCalls(callData.map(c => ({
          id: c.id,
          name: c.prospect_name,
          phone: c.phone || "",
          date: c.date || today,
          status: mapCallStatus(c.status || "interested"),
          notes: c.notes || "",
          type: c.is_walkin ? "walk-in" as const : "call" as const,
          priority: "medium",
          history: [],
        })));
      } else {
        setAdmissionCalls([]);
      }

      // Load alerts
      const alertData = qry(
        await supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(50),
        "alerts"
      );

      if (alertData && alertData.length > 0) {
        setAlerts(alertData.map(a => ({
          id: a.id,
          type: a.type as any,
          severity: a.severity as any,
          message: a.message,
          timestamp: new Date(a.created_at).toLocaleString(),
          reviewed: a.reviewed || false,
        })));
      } else {
        setAlerts([]);
      }

      // Load violations
      const violationData = qry(
        await supabase.from("violations").select("*").order("created_at", { ascending: false }),
        "violations"
      );

      if (violationData && violationData.length > 0) {
        setViolations(violationData.map(v => ({
          id: v.id,
          userId: v.user_id || "",
          userName: v.user_name || "",
          type: mapViolationType(v.type),
          date: v.date || today,
          resolved: v.resolved || false,
          details: v.description || "",
        })));
      } else {
        setViolations([]);
      }

      // Load override requests
      const overrideData = qry(
        await supabase.from("override_log").select("*").order("created_at", { ascending: false }),
        "override_log"
      );

      if (overrideData && overrideData.length > 0) {
        setOverrideRequests(overrideData.map(o => ({
          id: o.id,
          userId: o.requested_by || "",
          userName: o.user_name || "",
          type: o.override_type || "",
          reason: o.reason,
          requestedBy: o.requested_by_name || "",
          approvedBy: o.approved_by_name || undefined,
          status: o.status as any,
          timestamp: new Date(o.created_at).toISOString(),
          comment: o.comment || undefined,
        })));
      } else {
        setOverrideRequests([]);
      }

      // Load leave requests from DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leaveData = qry(
        await (supabase as any)
          .from("leave_requests")
          .select("*")
          .order("applied_on", { ascending: false }),
        "leave_requests"
      );

      if (leaveData && leaveData.length > 0) {
        setLeaveRequests(leaveData.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          role: r.role,
          startDate: r.start_date,
          endDate: r.end_date,
          type: r.leave_type,
          reason: r.reason,
          status: r.status as "pending" | "approved" | "rejected",
          appliedOn: r.applied_on,
          approvedBy: r.approved_by || undefined,
          approvedAt: r.approved_at || undefined,
        })));
      } else {
        setLeaveRequests([]);
      }

      // Load expenses
      const expenseData = qry(
        await supabase.from("expense_transactions").select("*").order("date", { ascending: false }),
        "expense_transactions"
      );

      if (expenseData && expenseData.length > 0) {
        setExpenses(expenseData.map(e => ({
          id: e.id,
          amount: Number(e.amount),
          category: e.category || "",
          date: e.date || today,
          enteredBy: e.entered_by || "",
          description: e.description || "",
        })));
      } else {
        setExpenses([]);
      }

      // Load admin checklist
      const { data: checklistData } = await supabase
        .from("admin_checklist")
        .select("*")
        .eq("date", today);

      const defaultItems = [
        "All marks verified (24–28 hr SLA)",
        "Retest allocated for students <75%",
        "Attendance checked for all batches",
        "Weekly plan updated",
        "Fee follow-ups completed",
      ];

      const dbMap = new Map((checklistData || []).map(c => [c.item_name, c]));
      const items = defaultItems.map((label, i) => {
        const dbRow = dbMap.get(label);
        return {
          id: dbRow ? dbRow.id : `chk-${i}`,
          label,
          done: dbRow ? dbRow.completed : false,
        };
      });

      const defaultSet = new Set(defaultItems);
      for (const c of checklistData || []) {
        if (!defaultSet.has(c.item_name)) {
          items.push({
            id: c.id,
            label: c.item_name,
            done: c.completed || false,
          });
        }
      }
      setAdminChecklist(items);

      // Load daily checklist from Supabase (replaces localStorage)
      if (user?.profileId) {
        const { data: dailyData } = await supabase
          .from("daily_checklists")
          .select("*")
          .eq("date", today)
          .eq("user_id", user.profileId)
          .maybeSingle();
        
        if (dailyData) {
          setDailyChecklistState({
            date: today,
            checked: (dailyData.checked_items as Record<string, boolean>) || {},
            signName: dailyData.sign_name || "",
            signTime: dailyData.updated_at ? new Date(dailyData.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
            signedOff: dailyData.signed_off || false,
          });
        } else {
          setDailyChecklistState({ date: today, checked: {}, signName: "", signTime: "", signedOff: false });
        }
      }

      // Load tasks from Supabase
      const taskData = qry(
        await supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        "tasks"
      );

      if (taskData && taskData.length > 0) {
        setTasks(taskData.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description || "",
          dueDate: t.due_date || "",
          assignedTo: (t.assigned_to as string[]) || [],
          statusByTeacher: (t.status_by_user as Record<string, TaskStatus>) || {},
          createdAt: t.created_at,
        })));
      } else {
        setTasks([]);
      }

      // Load strict mode setting
      const { data: settings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "strict_mode")
        .single();
      if (settings) {
        setStrictModeState(settings.value === true || settings.value === "true");
      }

      // Load IHI trend
      const { data: ihiData } = await supabase.from("ihi_trend").select("*").order("created_at");
      if (ihiData && ihiData.length > 0) {
        setIhiTrend(ihiData.map(d => ({ week: d.week, ihi: Number(d.ihi), annotation: d.annotation || "" })));
      } else {
        setIhiTrend([]);
      }

      // Load fee trend
      const { data: ftData } = await supabase.from("fee_trend").select("*").order("created_at");
      if (ftData && ftData.length > 0) {
        setFeeTrend(ftData.map(d => ({ month: d.month, collected: Number(d.collected), target: Number(d.target) })));
      } else {
        setFeeTrend([]);
      }

      // Load reports as meeting notes
      const { data: reportData } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (reportData && reportData.length > 0) {
        setMeetingNotes(reportData.map(r => ({
          id: r.id,
          date: r.date || today,
          title: r.title,
          items: (r.items as any[]) || [],
          createdAt: r.created_at,
          linkedAlertId: r.linked_alert_id || undefined,
        })));
      } else {
        setMeetingNotes([]);
      }

      // Load attendance — fetch all profiles to know which are teachers vs admins
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, role, name");
      const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
      const teacherProfileIds = new Set((profilesData || []).filter(p => p.role === "teacher").map(p => p.id));
      const adminProfileIds = new Set((profilesData || []).filter(p => p.role === "admin").map(p => p.id));

      const { data: attData } = await supabase
        .from("teacher_attendance")
        .select("*")
        .eq("date", today);

      if (attData) {
        const checkinMap: Record<string, Record<string, CheckinRecord>> = {};
        const adminCheckinMap: Record<string, Record<string, CheckinRecord>> = {};
        for (const a of attData) {
          const dbStatus = (a.status || "") as string;
          const hasClockedIn = !!a.check_in_time;
          const rec: CheckinRecord = {
            time: a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
            geoValid: a.geo_valid || false,
            status: dbStatus === "on_time" ? "on-time" : dbStatus === "late" ? "late" : (hasClockedIn && (!dbStatus || dbStatus === "absent")) ? "pending" : "absent",
            checkinTimestamp: a.check_in_time || undefined,
            checkoutTime: a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
            checkoutStatus: a.check_out_status ? (a.check_out_status === "on_time" ? "on-time" : a.check_out_status === "early" ? "early" : "pending") : undefined,
            checkoutGeoValid: a.checkout_geo_valid || false,
            checkoutTimestamp: a.check_out_time || undefined,
          };
          if (adminProfileIds.has(a.teacher_id)) {
            if (!adminCheckinMap[a.teacher_id]) adminCheckinMap[a.teacher_id] = {};
            adminCheckinMap[a.teacher_id][a.date] = rec;
          } else {
            if (!checkinMap[a.teacher_id]) checkinMap[a.teacher_id] = {};
            checkinMap[a.teacher_id][a.date] = rec;
          }
        }
        setCheckins(checkinMap);
        setAdminCheckins(adminCheckinMap);
      }

      // Load historical attendance (last 30 days) for StaffControl history tab
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: histAttData } = await supabase
        .from("teacher_attendance")
        .select("*")
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("date", { ascending: false });

      if (histAttData && histAttData.length > 0) {
        setHistoricalAttendance(histAttData.map(a => {
          const profile = profileMap.get(a.teacher_id);
          const dbStatus = (a.status || "") as string;
          return {
            id: a.id,
            teacherName: profile?.name || "Unknown",
            date: a.date,
            checkinTime: a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—",
            status: (dbStatus === "on_time" ? "on-time" : dbStatus === "late" ? "late" : "absent") as any,
            geoValid: a.geo_valid || false,
            checkoutTime: a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          };
        }));
      } else {
        setHistoricalAttendance([]);
      }

      // Load test results as marks entries
      const { data: testResultsData } = await supabase
        .from("test_results")
        .select("*, students(name), profiles!test_results_teacher_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (testResultsData && testResultsData.length > 0) {
        setMarksEntries(testResultsData.map(tr => ({
          id: tr.id,
          studentName: (tr.students as any)?.name || "",
          studentId: tr.student_id,
          marks: Number(tr.marks) || 0,
          totalMarks: Number(tr.total_marks) || 100,
          subject: "General",
          examType: "Test",
          remarks: "",
          date: tr.test_date || new Date(tr.created_at).toISOString().split("T")[0],
          teacherId: tr.teacher_id || "",
          teacherName: (tr.profiles as any)?.name || "",
          sentToParent: (tr as any).sent_at != null,
        })));
      } else {
        setMarksEntries([]);
      }

      // Load weekly plans
      const { data: planData } = await supabase.from("weekly_plans").select("*, profiles!weekly_plans_teacher_id_fkey(name), batches(name)");
      if (planData && planData.length > 0) {
        setWeeklyPlans(planData.map(p => ({
          id: p.id,
          batch: (p.batches as any)?.name || "",
          teacher: (p.profiles as any)?.name || "",
          portionPlanned: p.portion_planned || "",
          testDate: p.test_date || "",
          status: (p.status === "delayed" ? "delayed" : p.status === "completed" ? "completed" : "on-track") as any,
          portionCompleted: p.portion_completed || undefined,
        })));
      } else {
        setWeeklyPlans([]);
      }

      // Load class schedule from batches (derive from batches table)
      if (batchData && batchData.length > 0) {
        setClassSchedule(batchData.map((b, i) => ({
          batchLetter: String.fromCharCode(65 + i),
          name: b.name,
          timing: b.timing_start && b.timing_end ? `${b.timing_start} – ${b.timing_end}` : "",
          capacity: 25,
          campus: (b.campuses as any)?.name || "",
        })));
      } else {
        setClassSchedule([]);
      }

    } catch (error) {
      console.error("Error loading data from Supabase:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, today, user?.profileId]);

  // Initial data load
  useEffect(() => {
    if (isAuthenticated && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
      refreshData();
    }
    if (!isAuthenticated) {
      dataLoadedRef.current = false;
    }
  }, [isAuthenticated, refreshData]);

  // ── Targeted realtime refresh helpers (avoid full refreshData cascade) ──────
  const refreshAttendance = useCallback(async () => {
    const { data: profilesData } = await supabase.from("profiles").select("id, role, name");
    const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
    const adminProfileIds = new Set((profilesData || []).filter((p: any) => p.role === "admin").map((p: any) => p.id));
    const { data: attData } = await supabase.from("teacher_attendance").select("*").eq("date", today);
    if (!attData) return;
    const checkinMap: Record<string, Record<string, CheckinRecord>> = {};
    const adminCheckinMap: Record<string, Record<string, CheckinRecord>> = {};
    for (const a of attData) {
      const dbStatus = (a.status || "") as string;
      const hasClockedIn = !!a.check_in_time;
      const rec: CheckinRecord = {
        time: a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
        geoValid: a.geo_valid || false,
        status: dbStatus === "on_time" ? "on-time" : dbStatus === "late" ? "late" : (hasClockedIn && (!dbStatus || dbStatus === "absent")) ? "pending" : "absent",
        checkinTimestamp: a.check_in_time || undefined,
        checkoutTime: a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
        checkoutStatus: a.check_out_status ? (a.check_out_status === "on_time" ? "on-time" : a.check_out_status === "early" ? "early" : "pending") : undefined,
        checkoutGeoValid: a.checkout_geo_valid || false,
        checkoutTimestamp: a.check_out_time || undefined,
      };
      if (adminProfileIds.has(a.teacher_id)) {
        if (!adminCheckinMap[a.teacher_id]) adminCheckinMap[a.teacher_id] = {};
        adminCheckinMap[a.teacher_id][a.date] = rec;
      } else {
        if (!checkinMap[a.teacher_id]) checkinMap[a.teacher_id] = {};
        checkinMap[a.teacher_id][a.date] = rec;
      }
    }
    setCheckins(checkinMap);
    setAdminCheckins(adminCheckinMap);
    // Also refresh historical
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: histData } = await supabase.from("teacher_attendance").select("*").gte("date", thirtyDaysAgo.toISOString().split("T")[0]).order("date", { ascending: false });
    if (histData) {
      setHistoricalAttendance(histData.map((a: any) => ({
        id: a.id,
        teacherName: profileMap.get(a.teacher_id)?.name || "Unknown",
        date: a.date,
        checkinTime: a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—",
        status: (a.status === "on_time" ? "on-time" : a.status === "late" ? "late" : "absent") as any,
        geoValid: a.geo_valid || false,
        checkoutTime: a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      })));
    }
  }, [today]);

  const refreshRetests = useCallback(async () => {
    const { data } = await supabase.from("retests").select("*, students(name), profiles!retests_teacher_id_fkey(name)");
    if (data) {
      setRetestQueue(data.map((r: any) => ({
        id: r.id, student: r.students?.name || "", batch: r.batch_name || "",
        subject: r.subject || "", marks: Number(r.retest_marks) || 0,
        teacher: r.profiles?.name || "", status: r.status as any,
        dueDate: r.due_date || "", retestMarks: r.retest_marks ? Number(r.retest_marks) : undefined,
        allocatedDate: r.allocated_at ? new Date(r.allocated_at).toISOString().split("T")[0] : undefined,
      })));
    }
  }, []);

  const refreshAdminChecklist = useCallback(async () => {
    const { data: checklistData } = await supabase
      .from("admin_checklist")
      .select("*")
      .eq("date", today);

    const defaultItems = [
      "All marks verified (24–28 hr SLA)",
      "Retest allocated for students <75%",
      "Attendance checked for all batches",
      "Weekly plan updated",
      "Fee follow-ups completed",
    ];

    const dbMap = new Map((checklistData || []).map(c => [c.item_name, c]));
    const items = defaultItems.map((label, i) => {
      const dbRow = dbMap.get(label);
      return {
        id: dbRow ? dbRow.id : `chk-${i}`,
        label,
        done: dbRow ? dbRow.completed : false,
      };
    });

    const defaultSet = new Set(defaultItems);
    for (const c of checklistData || []) {
      if (!defaultSet.has(c.item_name)) {
        items.push({
          id: c.id,
          label: c.item_name,
          done: c.completed || false,
        });
      }
    }
    setAdminChecklist(items);
  }, [today]);

  const refreshDailyChecklist = useCallback(async () => {
    if (!user?.profileId) return;
    const { data } = await supabase.from("daily_checklists").select("*").eq("date", today).eq("user_id", user.profileId).maybeSingle();
    if (data) {
      setDailyChecklistState({
        date: today,
        checked: (data.checked_items as Record<string, boolean>) || {},
        signName: data.sign_name || "",
        signTime: data.updated_at ? new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "",
        signedOff: data.signed_off || false,
      });
    }
  }, [today, user?.profileId]);

  const refreshTasks = useCallback(async () => {
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) {
      setTasks(data.map((t: any) => ({
        id: t.id, title: t.title, description: t.description || "",
        dueDate: t.due_date || "", assignedTo: (t.assigned_to as string[]) || [],
        statusByTeacher: (t.status_by_user as Record<string, TaskStatus>) || {},
        createdAt: t.created_at,
      })));
    }
  }, []);

  // ── Realtime Subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel("ark-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const a = payload.new;
          setAlerts(prev => [{
            id: a.id, type: a.type as any, severity: a.severity as any,
            message: a.message, timestamp: new Date(a.created_at).toLocaleString(), reviewed: false,
          }, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setAlerts(prev => prev.map(alert => alert.id === payload.new.id ? { ...alert, reviewed: payload.new.reviewed || false } : alert));
        } else if (payload.eventType === "DELETE") {
          setAlerts(prev => prev.filter(alert => alert.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "violations" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const v = payload.new;
          setViolations(prev => [{
            id: v.id, userId: v.user_id || "", userName: v.user_name || "",
            type: mapViolationType(v.type), date: v.date || today, resolved: false, details: v.description || "",
          }, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setViolations(prev => prev.map(viol => viol.id === payload.new.id ? { ...viol, resolved: payload.new.resolved || false } : viol));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_attendance" }, () => { refreshAttendance(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "retests" }, () => { refreshRetests(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_checklists" }, () => { refreshDailyChecklist(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => { refreshTasks(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_checklist" }, () => { refreshAdminChecklist(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, today, refreshAttendance, refreshRetests, refreshDailyChecklist, refreshTasks, refreshAdminChecklist]);

  // ── Walk-ins computed value ──────────────────────────────────────────────
  const walkIns = admissionCalls.filter(c => c.date === today && c.type === "walk-in").length;

  // ── Actions (write to Supabase FIRST, then update state from response) ──

  const addTask = useCallback(async (taskData: Omit<Task, "id" | "statusByTeacher" | "createdAt">) => {
    const statusByUser: Record<string, string> = {};
    taskData.assignedTo.forEach(tid => { statusByUser[tid] = "pending"; });

    const { data, error } = await supabase.from("tasks").insert({
      title: taskData.title,
      description: taskData.description,
      due_date: taskData.dueDate || null,
      assigned_to: taskData.assignedTo,
      status_by_user: statusByUser,
      created_by: user?.profileId || null,
    } as any).select().single();

    if (error) {
      console.error("Failed to add task:", error);
      return;
    }
    if (data) {
      setTasks(prev => [{
        id: data.id,
        title: data.title,
        description: data.description || "",
        dueDate: data.due_date || "",
        assignedTo: (data.assigned_to as string[]) || [],
        statusByTeacher: (data.status_by_user as Record<string, TaskStatus>) || {},
        createdAt: data.created_at,
      }, ...prev]);
    }
  }, [user]);

  const markTaskComplete = useCallback(async (taskId: string, teacherId: string) => {
    // Fetch current status_by_user from DB
    const { data: existing } = await supabase.from("tasks").select("status_by_user").eq("id", taskId).single();
    if (!existing) return;
    const updated = { ...(existing.status_by_user as Record<string, string>), [teacherId]: "completed" };
    
    const { data, error } = await supabase.from("tasks").update({ status_by_user: updated } as any).eq("id", taskId).select().single();
    if (error) { console.error("Failed to complete task:", error); return; }
    if (data) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, statusByTeacher: data.status_by_user as Record<string, TaskStatus> } : t));
    }
  }, []);

  const getTasksForTeacher = useCallback((teacherId: string) => tasks.filter(t => t.assignedTo.includes(teacherId)), [tasks]);

  const submitAttendance = useCallback(async (teacherId: string, date: string, record: Record<string, AttendanceStatus>) => {
    // Write the whole batch in one upsert. Marker identity (id, name, role)
    // is attached so the DB audit trigger can attribute every row. The
    // payload tries the enterprise columns first; a schema-cache miss
    // (migration not yet applied) automatically downgrades to the legacy
    // column set so teachers can keep marking attendance during a rollout.
    //
    // NB: `attendance_date` mirrors `date` via a DB trigger added in
    // 20260528_attendance_enterprise.sql; we still send both so reads from
    // either column work without an extra round-trip.
    const nowIso = new Date().toISOString();
    const rows = Object.entries(record)
      .map(([studentName, status]) => {
        const student = students.find(s => s.name === studentName);
        return student
          ? {
              student_id: student.id,
              batch_id: student.batchId || null,
              attendance_date: date,
              date,
              status,
              method: "manual" as const,
              marked_by: user?.profileId ?? null,
              marked_by_name: user?.name ?? null,
              marked_by_role: user?.role ?? null,
              marked_at: nowIso,
              last_updated_by: user?.profileId ?? null,
              last_updated_at: nowIso,
              updated_at: nowIso,
            }
          : null;
      })
      .filter(Boolean) as Record<string, unknown>[];
    if (rows.length === 0) {
      setAttendance(prev => ({ ...prev, [teacherId]: { ...(prev[teacherId] || {}), [date]: record } }));
      return;
    }

    const isSchemaMiss = (err: { code?: string; message?: string } | null) => {
      if (!err) return false;
      if (err.code === "PGRST204" || err.code === "PGRST205") return true;
      const msg = (err.message ?? "").toLowerCase();
      return msg.includes("schema cache") || (msg.includes("could not find the") && msg.includes("column"));
    };

    let res = await supabase.from("student_attendance").upsert(rows as never, { onConflict: "student_id,date" });
    if (res.error && isSchemaMiss(res.error)) {
      const legacy = rows.map(r => ({
        student_id: r.student_id,
        batch_id: r.batch_id ?? null,
        date: r.date,
        status: r.status,
        marked_by: r.marked_by ?? null,
      }));
      res = await supabase.from("student_attendance").upsert(legacy as never, { onConflict: "student_id,date" });
      if (!res.error) {
        // Saved in degraded mode — surface as a soft toast on the caller.
        console.warn("[submitAttendance] degraded: marker identity not captured — run 20260528_attendance_enterprise.sql");
      }
    }
    if (res.error) {
      console.error("[submitAttendance] failed:", res.error);
      throw new Error(
        isSchemaMiss(res.error)
          ? "Attendance schema update required. Run the latest migration and reload the schema cache."
          : `Failed to save attendance: ${res.error.message}`,
      );
    }
    setAttendance(prev => ({ ...prev, [teacherId]: { ...(prev[teacherId] || {}), [date]: record } }));
  }, [students, user]);

  // ── Attendance check-in / check-out ───────────────────────────────────────
  // Both teacher and admin go through the same `teacher_attendance` table —
  // the distinction is purely the role on the profile row. Service is the
  // single writer; the two local state mirrors stay so existing pages
  // (DailyControlBoard, TeacherCheckins, AdminCheckinApprovals) keep working.
  const teacherCheckin = useCallback(async (teacherId: string, geoValid: boolean) => {
    await attendanceService.checkIn(teacherId, today, geoValid);
    const now = new Date();
    setCheckins(prev => ({
      ...prev,
      [teacherId]: {
        ...(prev[teacherId] || {}),
        [today]: { time: formatLocalTime(now), geoValid, status: "pending", checkinTimestamp: now.toISOString() },
      },
    }));
  }, [today]);

  const adminCheckIn = useCallback(async (adminId: string, geoValid: boolean) => {
    await attendanceService.checkIn(adminId, today, geoValid);
    const now = new Date();
    setAdminCheckins(prev => ({
      ...prev,
      [adminId]: {
        ...(prev[adminId] || {}),
        [today]: { time: formatLocalTime(now), geoValid, status: "pending", checkinTimestamp: now.toISOString() },
      },
    }));
  }, [today]);

  const approveAdminCheckin = useCallback(async (adminId: string, comments?: string, overrideTime?: string) => {
    const result = await attendanceService.approveCheckIn({ staffId: adminId, date: today, comments, overrideTime });
    setAdminCheckins(prev => {
      const existing = prev[adminId]?.[today] || { time: "", geoValid: false, status: "absent" as const };
      return { ...prev, [adminId]: { ...(prev[adminId] || {}), [today]: { ...existing, status: result.status, time: result.time } } };
    });
  }, [today]);

  const approveCheckin = useCallback(async (teacherId: string, comments?: string, overrideTime?: string) => {
    const result = await attendanceService.approveCheckIn({ staffId: teacherId, date: today, comments, overrideTime });
    setCheckins(prev => {
      const existing = prev[teacherId]?.[today] || { time: "", geoValid: false, status: "absent" as const };
      return { ...prev, [teacherId]: { ...(prev[teacherId] || {}), [today]: { ...existing, status: result.status, time: result.time } } };
    });
  }, [today]);

  const teacherCheckout = useCallback(async (teacherId: string, geoValid: boolean) => {
    await attendanceService.checkOut(teacherId, today, geoValid);
    const now = new Date();
    setCheckins(prev => {
      const existing = prev[teacherId]?.[today] || { time: "", geoValid: false, status: "absent" };
      return { ...prev, [teacherId]: { ...(prev[teacherId] || {}), [today]: { ...existing, checkoutTime: formatLocalTime(now), checkoutGeoValid: geoValid, checkoutStatus: "pending", checkoutTimestamp: now.toISOString() } } };
    });
  }, [today]);

  const adminCheckout = useCallback(async (adminId: string, geoValid: boolean) => {
    await attendanceService.checkOut(adminId, today, geoValid);
    const now = new Date();
    setAdminCheckins(prev => {
      const existing = prev[adminId]?.[today] || { time: "", geoValid: false, status: "absent" };
      return { ...prev, [adminId]: { ...(prev[adminId] || {}), [today]: { ...existing, checkoutTime: formatLocalTime(now), checkoutGeoValid: geoValid, checkoutStatus: "pending", checkoutTimestamp: now.toISOString() } } };
    });
  }, [today]);

  const approveCheckout = useCallback(async (teacherId: string, comments?: string, overrideTime?: string) => {
    const result = await attendanceService.approveCheckOut({ staffId: teacherId, date: today, comments, overrideTime });
    setCheckins(prev => {
      const existing = prev[teacherId]?.[today] || { time: "", geoValid: false, status: "absent" as const };
      return { ...prev, [teacherId]: { ...(prev[teacherId] || {}), [today]: { ...existing, checkoutStatus: result.status, checkoutTime: result.time } } };
    });
  }, [today]);

  const approveAdminCheckout = useCallback(async (adminId: string, comments?: string, overrideTime?: string) => {
    const result = await attendanceService.approveCheckOut({ staffId: adminId, date: today, comments, overrideTime });
    setAdminCheckins(prev => {
      const existing = prev[adminId]?.[today] || { time: "", geoValid: false, status: "absent" as const };
      return { ...prev, [adminId]: { ...(prev[adminId] || {}), [today]: { ...existing, checkoutStatus: result.status, checkoutTime: result.time } } };
    });
  }, [today]);

  const allocateRetest = useCallback(async (id: string) => {
    const { error } = await supabase.from("retests").update({ status: "allocated", allocated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[allocateRetest] DB update failed:", error.message);
      throw new Error(error.message || "Failed to allocate retest");
    }
    setRetestQueue(prev => prev.map(r => r.id === id ? { ...r, status: "allocated" as const, allocatedDate: today } : r));
  }, [today]);

  const completeRetest = useCallback(async (id: string, retestMarks: number) => {
    const { error } = await supabase.from("retests").update({ status: "completed", retest_marks: retestMarks, completed_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[completeRetest] DB update failed:", error.message);
      throw new Error(error.message || "Failed to record retest completion");
    }
    setRetestQueue(prev => prev.map(r => r.id === id ? { ...r, status: "completed" as const, retestMarks } : r));
  }, []);

  const addRetestItem = useCallback(async (item: Omit<RetestItem, "id">) => {
    const student = students.find(s => s.name === item.student);
    if (student) {
      const { data } = await supabase.from("retests").insert({
        student_id: student.id,
        subject: item.subject,
        batch_name: item.batch,
        due_date: item.dueDate,
        status: "pending",
      }).select().single();
      if (data) {
        setRetestQueue(prev => [{ ...item, id: data.id }, ...prev]);
      }
    }
  }, [students]);

  const toggleChecklistItem = useCallback(async (id: string) => {
    const item = adminChecklist.find(c => c.id === id);
    if (!item) return;
    const nextDone = !item.done;

    // Optimistic flip first so the UI feels instant; rollback if DB fails.
    setAdminChecklist(prev => prev.map(c => c.id === id ? { ...c, done: nextDone } : c));

    if (id.startsWith("chk-")) {
      const { data, error } = await supabase.from("admin_checklist").insert({
        admin_id: user?.profileId || null,
        date: today,
        item_name: item.label,
        completed: nextDone,
        completed_at: nextDone ? new Date().toISOString() : null,
      }).select("id").single();

      if (error) {
        console.error("[toggleChecklistItem] DB insert failed, rolling back:", error.message);
        setAdminChecklist(prev => prev.map(c => c.id === id ? { ...c, done: item.done } : c));
        throw new Error(error.message || "Failed to create checklist item");
      }

      if (data) {
        setAdminChecklist(prev => prev.map(c => c.label === item.label ? { ...c, id: data.id } : c));
      }
    } else {
      const { error } = await supabase.from("admin_checklist").update({
        completed: nextDone,
        completed_at: nextDone ? new Date().toISOString() : null,
      }).eq("id", id);

      if (error) {
        console.error("[toggleChecklistItem] DB update failed, rolling back:", error.message);
        setAdminChecklist(prev => prev.map(c => c.id === id ? { ...c, done: item.done } : c));
        throw new Error(error.message || "Failed to update checklist item");
      }
    }
  }, [adminChecklist, user, today]);

  const updatePlanStatus = useCallback(async (id: string, status: WeeklyPlan["status"]) => {
    const dbStatus = status === "on-track" ? "pending" : status;
    const { error } = await supabase.from("weekly_plans").update({ status: dbStatus }).eq("id", id);
    if (error) {
      console.error("[updatePlanStatus] DB update failed:", error.message);
      throw new Error(error.message || "Failed to update plan status");
    }
    setWeeklyPlans(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  }, []);

  const addWeeklyPlan = useCallback(async (plan: Omit<WeeklyPlan, "id">) => {
    // Resolve teacher_id and batch_id from display names.
    const teacherRow = teachers.find(t => t.name === plan.teacher);
    const batchRow = batches.find(b => b.name === plan.batch);
    const dbStatus = plan.status === "on-track" ? "pending" : plan.status;

    const { data, error } = await supabase.from("weekly_plans").insert({
      teacher_id: teacherRow?.id || user?.profileId || null,
      batch_id: batchRow?.id || null,
      portion_planned: plan.portionPlanned,
      test_date: plan.testDate || null,
      portion_completed: plan.portionCompleted || null,
      status: dbStatus as any,
    }).select("id").single();

    if (error) {
      console.error("[addWeeklyPlan] DB insert failed:", error.message);
      // Don't add to local state with a fake ID — temp IDs can't be updated/deleted later.
      throw new Error(error.message || "Failed to save weekly plan");
    }
    setWeeklyPlans(prev => [{ ...plan, id: data.id }, ...prev]);
  }, [teachers, batches, user]);

  const deleteWeeklyPlan = useCallback(async (id: string) => {
    await supabase.from("weekly_plans").delete().eq("id", id);
    setWeeklyPlans(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── Fees CRUD ──────────────────────────────────────────────────────────────
  // All DB access now lives in src/features/fees/services/*. Local state
  // mirror is kept so consumer pages still re-render off `feeRecords`.
  // Calculations (pending/status) use the shared utils inside the services
  // — no money math should ever be inlined here again.
  // TODO(phase-2): replace consumers with the React Query hooks
  // (useFees / useMarkFeePaid / useAddInstallment / useIssueRefund) and
  // remove the local mirror entirely.
  const markFeePaid = useCallback(async (id: string) => {
    await feesService.markPaid(id);
    setFeeRecords(prev => prev.map(f => f.id === id ? { ...f, paid: true, paidDate: today } : f));
  }, [today]);

  const addFeeRecord = useCallback(async (fee: Omit<FeeRecord, "id">) => {
    const { id } = await feesService.create(fee as any, user?.profileId);
    const newFee: FeeRecord = {
      ...fee,
      id,
      discount: fee.discount || 0,
      finalAmount: fee.finalAmount || fee.amount,
      received: fee.received || 0,
      refund: fee.refund || 0,
      pending: fee.pending !== undefined ? fee.pending : fee.amount,
      installments: fee.installments || [],
    };
    setFeeRecords(prev => [newFee, ...prev]);
  }, [user]);

  const applyDiscount = useCallback(async (id: string, discount: number) => {
    await feesService.applyDiscount(id, discount);
    setFeeRecords(prev => prev.map(f => {
      if (f.id !== id) return f;
      const finalAmount = f.amount - discount;
      const pending = finalAmount - (f.received || 0) + (f.refund || 0);
      return { ...f, discount, finalAmount, pending };
    }));
  }, []);

  const addInstallment = useCallback(async (id: string, amount: number, method: string) => {
    const result = await installmentsService.add({
      feeRefId: id,
      amount,
      method,
      createdByProfileId: user?.profileId,
    });
    const now = new Date();
    setFeeRecords(prev => prev.map(f => {
      if (f.id !== id) return f;
      const newInstallment: Installment = {
        id: result.installmentId ?? `inst-${now.getTime()}`,
        amount,
        date: now.toISOString(),
        receiptNo: result.receiptNo,
        method,
      };
      const received = (f.received || 0) + amount;
      const pending = (f.finalAmount || f.amount) - received + (f.refund || 0);
      const paid = pending <= 0;
      return {
        ...f,
        received,
        pending,
        paid,
        paidDate: paid ? now.toISOString() : f.paidDate,
        installments: [...(f.installments || []), newInstallment],
      };
    }));
  }, [user]);

  const issueRefund = useCallback(async (id: string, amount: number) => {
    await refundsService.issue({ feeRefId: id, amount });
    setFeeRecords(prev => prev.map(f => {
      if (f.id !== id) return f;
      const refund = (f.refund || 0) + amount;
      const pending = (f.finalAmount || f.amount) - (f.received || 0) + refund;
      return { ...f, refund, pending, paid: pending <= 0 };
    }));
  }, []);

  // ── Enquiry/admission CRUD ────────────────────────────────────────────────
  // Delegated to feature services. The local state mirror is kept so legacy
  // consumers keep updating; replace with `useEnquiries()` to drop the mirror.
  // TODO(phase-2): migrate EnquiryManagement.tsx to the React Query hooks.
  const addAdmissionCall = useCallback(async (call: Omit<AdmissionCall, "id" | "history">) => {
    const created = await enquiriesService.create(call as any, user?.profileId);
    const initialHistory = [{
      date: new Date().toISOString(),
      status: call.status,
      notes: call.notes,
      updatedBy: user?.name || "System",
    }];
    setAdmissionCalls(prev => [{ ...call, id: created.id, history: initialHistory }, ...prev]);
  }, [user]);

  const updateCallStatus = useCallback(async (id: string, status: AdmissionCall["status"]) => {
    await enquiriesService.updateStatus(id, status);
    setAdmissionCalls(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  }, []);

  const addMeetingNote = useCallback(async (note: Omit<MeetingNote, "id" | "createdAt">) => {
    const { data } = await supabase.from("reports").insert({
      title: note.title,
      date: note.date,
      items: note.items as any,
      linked_alert_id: note.linkedAlertId,
      created_by: user?.profileId,
    }).select().single();

    if (data) {
      setMeetingNotes(prev => [{ ...note, id: data.id, createdAt: new Date().toISOString() }, ...prev]);
    }
  }, [user]);

  const updateMeetingNote = useCallback(async (id: string, updates: Partial<MeetingNote>) => {
    await supabase.from("reports").update({
      title: updates.title,
      items: updates.items as any,
    }).eq("id", id);
    setMeetingNotes(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  const deleteMeetingNote = useCallback(async (id: string) => {
    await supabase.from("reports").delete().eq("id", id);
    setMeetingNotes(prev => prev.filter(m => m.id !== id));
  }, []);

  const toggleActionItem = useCallback(async (noteId: string, itemIndex: number) => {
    // Compute the updated items array, then persist it so done-state survives reload.
    setMeetingNotes(prev => {
      const updatedNotes = prev.map(m => {
        if (m.id !== noteId) return m;
        const updatedItems = m.items.map((item, i) =>
          i === itemIndex ? { ...item, done: !item.done } : item
        );
        // Fire-and-forget persist — failures logged; optimistic UI is acceptable here.
        supabase.from("reports").update({ items: updatedItems as any }).eq("id", noteId)
          .then(({ error }) => { if (error) console.error("[toggleActionItem] persist failed:", error.message); });
        return { ...m, items: updatedItems };
      });
      return updatedNotes;
    });
  }, []);

  // ── Staff CRUD ────────────────────────────────────────────────────────────
  // Delegated to staffService. DB column mapping (campus name → id, role,
  // is_active) lives in the service. Local state mirror kept so existing
  // consumer pages (StaffControl, TeacherRanking, etc.) keep working.
  // TODO(phase-2): swap consumers to useStaff() and drop the mirror.
  const addTeacher = useCallback(async (teacher: Omit<TeacherInfo, "id">) => {
    const created = await staffService.create({
      name: teacher.name,
      role: "teacher",
      campus: teacher.campus,
      subject: teacher.subject,
    });
    setTeachers(prev => [...prev, { ...teacher, id: created.id, profileId: created.id }]);
    // Re-sync so the teacher list reflects the real DB state.
    setTimeout(() => refreshData(), 500);
  }, [refreshData]);

  const updateTeacher = useCallback(async (id: string, updates: Partial<TeacherInfo>) => {
    await staffService.update(id, {
      name: updates.name,
      subject: updates.subject,
    });
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTeacher = useCallback(async (id: string) => {
    await staffService.deactivate(id);
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, active: false } as any : t));
  }, []);

  const getTeacherById = useCallback((id: string) => teachers.find(t => t.id === id), [teachers]);

  const addStudentToTeacher = useCallback(async (teacherId: string, studentName: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    const primaryBatchName = teacher.classes?.[0] || teacher.className?.split(",")[0].trim();
    const matchBatch = primaryBatchName ? batches.find(b => b.name === primaryBatchName) : null;

    let campusId: string | undefined;
    if (teacher.campus) {
      const { data: campusData } = await supabase.from("campuses").select("id").eq("name", teacher.campus).single();
      campusId = campusData?.id;
    }

    // Fetch standard_id from the matched batch for complete classification
    let standardId: string | null = null;
    if (matchBatch?.id) {
      const { data: batchRow } = await supabase.from("batches").select("standard_id").eq("id", matchBatch.id).single();
      standardId = (batchRow as any)?.standard_id || null;
    }

    const { data, error } = await (supabase as any).from("students").insert({
      name: studentName,
      batch_id: matchBatch?.id || null,
      standard_id: standardId,
      campus_id: campusId || null,
      spi: 0,
      risk_level: "safe",
      is_active: true,
      admission_date: new Date().toISOString().split("T")[0],
    }).select().single();

    if (error) {
      console.error("Failed to save student:", error.message);
      throw new Error(error.message);
    }

    if (data) {
      // ── Insert into teacher_students junction table (UUID-based link) ──────
      const { error: jErr } = await (supabase as any).from("teacher_students").insert({
        teacher_id: teacherId,
        student_id: data.id,
        batch_id:   matchBatch?.id || null,
        assigned_by: teacherId,
      });
      if (jErr && !jErr.message?.includes("duplicate")) {
        // Non-fatal: log but don't block the UI — refreshData will re-derive the list
        console.warn("[addStudentToTeacher] junction insert:", jErr.message);
      }

      // Optimistic local update so the teacher sees the student immediately
      setTeachers(prev => prev.map(t => {
        if (t.id !== teacherId) return t;
        const existing = t.students || [];
        if (existing.includes(studentName)) return t;
        const existingByBatch = t.studentsByBatch || {};
        const batchKey = primaryBatchName || "Unassigned";
        return {
          ...t,
          students: [...existing, studentName],
          studentsByBatch: {
            ...existingByBatch,
            [batchKey]: [...(existingByBatch[batchKey] || []), studentName],
          },
        };
      }));
      setStudents(prev => [...prev, {
        id: data.id, name: studentName,
        batch: primaryBatchName || "", spi: 0, risk: "safe",
        campus: teacher.campus, active: true,
      }]);
      // Re-sync from DB immediately so the list is authoritative on next render
      refreshData();
    }
  }, [teachers, batches, refreshData]);

  const addBatch = useCallback(async (batch: Omit<BatchInfo, "id">) => {
    // Note: We should ideally insert into DB here too, but for now we follow the existing pattern
    // and rely on ClassBatch.tsx handleSave which uses direct supabase calls.
    // However, we should trigger a data refresh to update dropdowns.
    setBatches(prev => [...prev, { ...batch, id: `b-${Date.now()}` }]);
    refreshData();
  }, [refreshData]);
  const updateBatch = useCallback((id: string, updates: Partial<BatchInfo>) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);
  const deleteBatch = useCallback((id: string) => {
    setBatches(prev => prev.filter(b => b.id !== id));
  }, []);

  const updateClassSchedule = useCallback((name: string, updates: Partial<ClassScheduleEntry>) => {
    setClassSchedule(prev => prev.map(c => c.name === name ? { ...c, ...updates } : c));
  }, []);

  const addClassSchedule = useCallback((entry: ClassScheduleEntry) => {
    setClassSchedule(prev => [...prev, entry]);
  }, []);

  const deleteClassSchedule = useCallback((name: string) => {
    setClassSchedule(prev => prev.filter(c => c.name !== name));
  }, []);

  // Daily checklist — UPSERT to Supabase, NO localStorage
  const toggleDailyChecklist = useCallback(async (id: string) => {
    const newChecked = { ...dailyChecklistState.checked, [id]: !dailyChecklistState.checked[id] };
    const newState = { ...dailyChecklistState, checked: newChecked };
    setDailyChecklistState(newState);

    if (user?.profileId) {
      await supabase.from("daily_checklists").upsert({
        date: today,
        user_id: user.profileId,
        checked_items: newChecked,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "date,user_id" });
    }
  }, [dailyChecklistState, user, today]);

  const signOffDailyChecklist = useCallback(async (name: string, time: string) => {
    setDailyChecklistState(prev => ({ ...prev, signName: name, signTime: time, signedOff: true }));

    if (user?.profileId) {
      await supabase.from("daily_checklists").upsert({
        date: today,
        user_id: user.profileId,
        checked_items: dailyChecklistState.checked,
        sign_name: name,
        signed_off: true,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "date,user_id" });
    }
  }, [user, today, dailyChecklistState.checked]);

  const resetDailyChecklist = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    setDailyChecklistState({ date: today, checked: {}, signName: "", signTime: "", signedOff: false });
  }, []);

  // ── Students CRUD ─────────────────────────────────────────────────────────
  // Delegated to the new feature service so the DB-mapping logic lives
  // in exactly one place (src/features/students/services/students.service.ts).
  // External signature is unchanged so existing consumer pages keep working.
  // TODO(phase-2): replace these consumers with `useStudents/useCreateStudent`
  // hooks directly, then remove the local `students` mirror entirely.
  const addStudent = useCallback(async (student: Omit<StudentInfo, "id">) => {
    const created = await studentsService.create(student as any);
    setStudents(prev => [...prev, { ...student, id: created.id, active: true }]);
  }, []);

  const updateStudent = useCallback(async (id: string, updates: Partial<StudentInfo>) => {
    await studentsService.update(id, updates as any);
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deactivateStudent = useCallback(async (id: string) => {
    await studentsService.deactivate(id);
    setStudents(prev => prev.map(s => s.id === id ? { ...s, active: false } : s));
  }, []);

  const addAlert = useCallback(async (alert: Omit<AppAlert, "id">) => {
    const { data } = await supabase.from("alerts").insert({
      type: alert.type,
      severity: alert.severity as any || "info",
      message: alert.message,
    }).select().single();

    if (data) {
      setAlerts(prev => [{ ...alert, id: data.id, reviewed: false }, ...prev]);
    }
  }, []);

  const dismissAlert = useCallback(async (id: string | number) => {
    await supabase.from("alerts").delete().eq("id", String(id));
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const markAlertReviewed = useCallback(async (id: string | number) => {
    await supabase.from("alerts").update({
      reviewed: true,
      reviewed_at: new Date().toISOString(),
    }).eq("id", String(id));
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, reviewed: true } : a));
  }, []);

  const addViolation = useCallback(async (v: Omit<Violation, "id">) => {
    const dbType = v.type.replace("-", "_");
    const { data } = await supabase.from("violations").insert({
      user_id: v.userId,
      user_name: v.userName,
      type: dbType as any,
      date: v.date,
      description: v.details,
      resolved: v.resolved,
      auto_generated: true,
    }).select().single();

    if (data) {
      setViolations(prev => [{ ...v, id: data.id }, ...prev]);
    }
  }, []);

  const resolveViolation = useCallback(async (id: string) => {
    await supabase.from("violations").update({ resolved: true }).eq("id", id);
    setViolations(prev => prev.map(v => v.id === id ? { ...v, resolved: true } : v));
  }, []);

  const addOverrideRequest = useCallback(async (o: Omit<OverrideRequest, "id" | "timestamp">) => {
    const { data } = await supabase.from("override_log").insert({
      requested_by: user?.profileId,
      requested_by_name: o.requestedBy,
      user_name: o.userName,
      override_type: o.type,
      reason: o.reason,
      comment: o.comment,
      status: "pending",
    }).select().single();

    if (data) {
      setOverrideRequests(prev => [{ ...o, id: data.id, timestamp: new Date().toISOString() }, ...prev]);
    }
  }, [user]);

  const approveOverride = useCallback(async (id: string, approvedBy: string) => {
    await supabase.from("override_log").update({
      status: "approved",
      approved_by: user?.profileId,
      approved_by_name: approvedBy,
    }).eq("id", id);
    setOverrideRequests(prev => prev.map(o => o.id === id ? { ...o, status: "approved" as const, approvedBy } : o));
  }, [user]);

  const rejectOverride = useCallback(async (id: string) => {
    await supabase.from("override_log").update({ status: "rejected" }).eq("id", id);
    setOverrideRequests(prev => prev.map(o => o.id === id ? { ...o, status: "rejected" as const } : o));
  }, []);

  const addLeaveRequest = useCallback(async (req: Omit<LeaveRequest, "id" | "appliedOn">): Promise<void> => {
    // Optimistic insert for UI snappiness
    const tempId = `lr-${Date.now()}`;
    const appliedOn = new Date().toISOString();
    setLeaveRequests(prev => [{ ...req, id: tempId, appliedOn }, ...prev]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("leave_requests").insert({
      user_id: req.userId,
      user_name: req.userName,
      role: req.role,
      start_date: req.startDate,
      end_date: req.endDate,
      leave_type: req.type,
      reason: req.reason,
      status: "pending",
    }).select().single();

    if (error) {
      // Roll back optimistic insert and propagate the error to the UI
      setLeaveRequests(prev => prev.filter(r => r.id !== tempId));
      console.error("[leaveRequests] Insert failed:", error.message);
      throw new Error(error.message || "Failed to submit leave request");
    }

    if (data) {
      setLeaveRequests(prev => prev.map(r =>
        r.id === tempId ? {
          id: data.id,
          userId: data.user_id,
          userName: data.user_name,
          role: data.role,
          startDate: data.start_date,
          endDate: data.end_date,
          type: data.leave_type,
          reason: data.reason,
          status: "pending" as const,
          appliedOn: data.applied_on,
        } : r
      ));
    }
  }, []);

  const updateLeaveStatus = useCallback(async (id: string, status: "approved" | "rejected", approvedBy?: string): Promise<void> => {
    // Reject client-side before any DB roundtrip if the row is still a temp optimistic one
    if (id.startsWith("lr-")) {
      throw new Error("Request is still saving — please wait a moment and try again.");
    }

    const approvedAtIso = new Date().toISOString();
    // Optimistic update
    setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status, approvedBy, approvedAt: approvedAtIso } : r));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("leave_requests")
      .update({
        status,
        approved_by: approvedBy || null,
        approved_at: approvedAtIso,
      })
      .eq("id", id);

    if (error) {
      console.error("[leaveRequests] Status update failed:", error.message);
      throw new Error(error.message || "Failed to update leave status");
    }
  }, []);

  const addExpense = useCallback(async (e: Omit<Expense, "id">) => {
    const { data } = await supabase.from("expense_transactions").insert({
      amount: e.amount,
      category: e.category,
      date: e.date,
      entered_by: user?.profileId,
      description: e.description,
    }).select().single();

    if (data) {
      setExpenses(prev => [{ ...e, id: data.id }, ...prev]);
    }
  }, [user]);

  const updateStudentMarks = useCallback(async (studentName: string, marks: number) => {
    const student = students.find(s => s.name === studentName);
    if (student) {
      let riskDb: string = "safe";
      let risk: "safe" | "watch" | "critical" = "safe";
      if (marks < 60) { riskDb = "high_risk"; risk = "critical"; }
      else if (marks < 75) { riskDb = "watch"; risk = "watch"; }
      await supabase.from("students").update({ spi: marks, risk_level: riskDb as any, last_test_date: today }).eq("id", student.id);
      setStudents(prev => prev.map(s => s.name === studentName ? { ...s, spi: marks, risk, lastTestDate: today } : s));
    }
  }, [today, students]);

  const addMarksEntry = useCallback(async (entry: Omit<MarksEntry, "id" | "sentToParent">): Promise<MarksEntry> => {
    const student = students.find(s => s.name === entry.studentName);
    const marksPct = Math.round((entry.marks / entry.totalMarks) * 100);

    let riskLevel: "safe" | "watch" | "critical" = "safe";
    if (marksPct < 60) riskLevel = "critical";
    else if (marksPct < 75) riskLevel = "watch";

    const { data: trData, error: trError } = await supabase.from("test_results").insert({
      student_id: student?.id || entry.studentId,
      marks: entry.marks,
      total_marks: entry.totalMarks,
      marks_pct: marksPct,
      teacher_id: entry.teacherId,
      test_date: entry.date,
      spi: marksPct,
      risk_level: (riskLevel === "critical" ? "high_risk" : riskLevel) as any,
      sla_status: "within" as any,
      uploaded_at: new Date().toISOString(),
    } as any).select().single();

    if (trError) {
      console.error("[addMarksEntry] test_results insert failed:", trError.message);
      throw new Error(trError.message || "Failed to save marks");
    }

    const id = trData!.id;
    const newEntry: MarksEntry = { ...entry, id, sentToParent: false };
    setMarksEntries(prev => [newEntry, ...prev]);

    if (student) {
      await supabase.from("students").update({
        spi: marksPct,
        risk_level: (riskLevel === "critical" ? "high_risk" : riskLevel) as any,
        last_test_date: entry.date,
      }).eq("id", student.id);
      setStudents(prev => prev.map(s =>
        s.id === student.id ? { ...s, spi: marksPct, risk: riskLevel, lastTestDate: entry.date } : s
      ));
    }

    return newEntry;
  }, [students]);

  const getMarksForStudent = useCallback((studentName: string) => {
    return marksEntries.filter(e => e.studentName === studentName);
  }, [marksEntries]);

  const markSentToParent = useCallback(async (entryId: string) => {
    // Persist sent timestamp so "sent" status survives a page reload.
    // test_results rows have real UUIDs; temp IDs (me-*) can't be updated.
    if (!entryId.startsWith("me-")) {
      await supabase.from("test_results").update({ sent_at: new Date().toISOString() }).eq("id", entryId);
    }
    setMarksEntries(prev => prev.map(e => e.id === entryId ? { ...e, sentToParent: true } : e));
  }, []);

  const assignEnquiry = useCallback(async (id: string, staffId: string) => {
    await enquiriesService.assign(id, staffId);
    setAdmissionCalls(prev => prev.map(c => c.id === id ? { ...c, assignedTo: staffId } : c));
  }, []);

  const addEnquiryNote = useCallback(async (id: string, note: string, newStatus?: AdmissionCall["status"], followUpDate?: string) => {
    const call = admissionCalls.find(c => c.id === id);
    if (!call) return;
    const result = await followupsService.addNote({
      enquiryId: id,
      note,
      newStatus,
      followUpDate,
      updatedByName: user?.name,
    });
    setAdmissionCalls(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = {
        ...c,
        status: result.entry.status,
        notes: note,
        history: [...(c.history || []), result.entry],
      };
      if (followUpDate) updated.followUpDate = followUpDate;
      return updated;
    }));
  }, [admissionCalls, user]);

  const approveAdmission = useCallback(async (id: string) => {
    const call = admissionCalls.find(c => c.id === id);
    if (!call) return;
    // admissionsService composes studentsService.create + (optional) feesService.create
    // and only flips the enquiry to `converted` after student creation succeeds.
    await admissionsService.approve(
      {
        enquiryId: id,
        studentName: call.name,
        batch: "Pending Allocation",
        campus: call.campus || campuses[0],
      },
      { name: user?.name, profileId: user?.profileId }
    );
    const historyItem = {
      date: new Date().toISOString(),
      status: "converted" as const,
      notes: "Converted to student!",
      updatedBy: user?.name || "System",
    };
    setAdmissionCalls(prev => prev.map(c =>
      c.id === id ? { ...c, status: "converted" as const, history: [...(c.history || []), historyItem] } : c
    ));
    // Refresh students list so the new student appears.
    await refreshData();
  }, [admissionCalls, campuses, user, refreshData]);

  const setStrictMode = useCallback(async (v: boolean) => {
    await supabase.from("system_settings").update({ value: v }).eq("key", "strict_mode");
    setStrictModeState(v);
  }, []);

  // Memoized context value — prevents all consumers from re-rendering when an
  // unrelated parent causes AppDataProvider to re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contextValue = useMemo(() => ({
    tasks, addTask, markTaskComplete, getTasksForTeacher,
    attendance, submitAttendance,
    checkins, teacherCheckin, approveCheckin, teacherCheckout, approveCheckout,
    adminCheckins, adminCheckIn, approveAdminCheckin, adminCheckout, approveAdminCheckout,
    retestQueue, allocateRetest, completeRetest, addRetestItem,
    classSchedule, updateClassSchedule, addClassSchedule, deleteClassSchedule,
    adminChecklist, toggleChecklistItem,
    dailyChecklistState, toggleDailyChecklist, signOffDailyChecklist, resetDailyChecklist,
    weeklyPlans, updatePlanStatus, addWeeklyPlan, deleteWeeklyPlan,
    feeRecords, markFeePaid, addFeeRecord, applyDiscount, addInstallment, issueRefund,
    admissionCalls, addAdmissionCall, updateCallStatus, assignEnquiry, addEnquiryNote, approveAdmission,
    meetingNotes, addMeetingNote, updateMeetingNote, deleteMeetingNote, toggleActionItem,
    campuses,
    teachers, addTeacher, updateTeacher, deleteTeacher, getTeacherById, addStudentToTeacher,
    admins,
    batches, addBatch, updateBatch, deleteBatch,
    students, addStudent, updateStudent, deactivateStudent,
    alerts, addAlert, dismissAlert, markAlertReviewed,
    violations, addViolation, resolveViolation,
    overrideRequests, addOverrideRequest, approveOverride, rejectOverride,
    leaveRequests, addLeaveRequest, updateLeaveStatus,
    expenses, addExpense,
    updateStudentMarks,
    marksEntries, addMarksEntry, getMarksForStudent, markSentToParent,
    strictMode, setStrictMode,
    walkIns,
    campusMetrics, ihiTrend, feeTrend,
    historicalAttendance,
    loading, refreshData,
  }), [
    tasks, attendance, checkins, adminCheckins, retestQueue, classSchedule,
    adminChecklist, dailyChecklistState, weeklyPlans, feeRecords, admissionCalls,
    meetingNotes, campuses, teachers, admins, batches, students, alerts, violations,
    overrideRequests, leaveRequests, expenses, marksEntries, strictMode, walkIns,
    campusMetrics, ihiTrend, feeTrend, historicalAttendance, loading,
    addTask, markTaskComplete, getTasksForTeacher, submitAttendance,
    teacherCheckin, approveCheckin, teacherCheckout, approveCheckout,
    adminCheckIn, approveAdminCheckin, adminCheckout, approveAdminCheckout,
    allocateRetest, completeRetest, addRetestItem,
    updateClassSchedule, addClassSchedule, deleteClassSchedule,
    toggleChecklistItem, toggleDailyChecklist, signOffDailyChecklist, resetDailyChecklist,
    updatePlanStatus, addWeeklyPlan, deleteWeeklyPlan,
    markFeePaid, addFeeRecord, applyDiscount, addInstallment, issueRefund,
    addAdmissionCall, updateCallStatus, assignEnquiry, addEnquiryNote, approveAdmission,
    addMeetingNote, updateMeetingNote, deleteMeetingNote, toggleActionItem,
    addTeacher, updateTeacher, deleteTeacher, getTeacherById, addStudentToTeacher,
    addBatch, updateBatch, deleteBatch,
    addStudent, updateStudent, deactivateStudent,
    addAlert, dismissAlert, markAlertReviewed,
    addViolation, resolveViolation,
    addOverrideRequest, approveOverride, rejectOverride,
    addLeaveRequest, updateLeaveStatus,
    addExpense, updateStudentMarks,
    addMarksEntry, getMarksForStudent, markSentToParent,
    setStrictMode, refreshData,
  ]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
};
