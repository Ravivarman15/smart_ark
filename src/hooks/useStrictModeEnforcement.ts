import { useEffect, useRef } from "react";
import { useAppData } from "@/contexts/AppDataContext";

/**
 * Strict Mode Auto-Enforcement Hook
 * Runs periodic checks and auto-creates violations + KPI penalties when strict mode is ON.
 */
export function useStrictModeEnforcement() {
  const {
    strictMode, teachers, checkins, retestQueue, admissionCalls, attendance,
    students, adminChecklist, violations, addViolation, addAlert, walkIns,
  } = useAppData();

  const lastRunRef = useRef<string>("");
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!strictMode) return;
    // Run once per day per session
    const runKey = `${today}-${strictMode}`;
    if (lastRunRef.current === runKey) return;
    lastRunRef.current = runKey;

    const existingViolationKeys = new Set(violations.map(v => `${v.userId}-${v.type}-${v.date}`));
    const addIfNew = (v: Parameters<typeof addViolation>[0]) => {
      const key = `${v.userId}-${v.type}-${v.date}`;
      if (!existingViolationKeys.has(key)) {
        addViolation(v);
        existingViolationKeys.add(key);
      }
    };

    // 1. Marks > 48 hrs → Teacher KPI deduction
    const pendingRetests = retestQueue.filter(r => r.status === "pending");
    pendingRetests.forEach(r => {
      const dueDate = new Date(r.dueDate);
      const now = new Date();
      const hoursDiff = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
      if (hoursDiff > 48) {
        const teacher = teachers.find(t => t.name === r.teacher);
        if (teacher) {
          addIfNew({
            userId: teacher.id,
            userName: teacher.name,
            type: "marks-sla",
            date: today,
            resolved: false,
            details: `Marks upload overdue >48hrs for ${r.student} (${r.subject}). Auto KPI deduction applied.`,
          });
        }
      }
    });

    // 2. Retest allocation > 24 hrs → Admin KPI deduction
    const overdueAllocations = pendingRetests.filter(r => {
      const dueDate = new Date(r.dueDate);
      const now = new Date();
      return (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60) > 24;
    });
    if (overdueAllocations.length > 0) {
      addIfNew({
        userId: "a1",
        userName: "Admin",
        type: "retest-delay",
        date: today,
        resolved: false,
        details: `${overdueAllocations.length} retest allocation(s) pending >24hrs. Auto admin KPI deduction.`,
      });
      addAlert({
        type: "danger",
        severity: "critical",
        message: `⚡ STRICT MODE: ${overdueAllocations.length} retest allocations overdue >24hrs. Admin KPI penalized.`,
        timestamp: new Date().toLocaleString(),
      });
    }

    // 3. Retest completion > 5 days → Teacher KPI deduction
    const allocatedRetests = retestQueue.filter(r => r.status === "allocated" && r.allocatedDate);
    allocatedRetests.forEach(r => {
      const allocDate = new Date(r.allocatedDate!);
      const now = new Date();
      const daysDiff = (now.getTime() - allocDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 5) {
        const teacher = teachers.find(t => t.name === r.teacher);
        if (teacher) {
          addIfNew({
            userId: teacher.id,
            userName: teacher.name,
            type: "retest-delay",
            date: today,
            resolved: false,
            details: `Retest for ${r.student} allocated ${Math.floor(daysDiff)} days ago, not completed. Auto KPI deduction.`,
          });
        }
      }
    });

    // 4. Walk-ins < 2/day → Admission KPI penalty
    if (walkIns < 2) {
      addIfNew({
        userId: "a1",
        userName: "Admin",
        type: "fee-target",
        date: today,
        resolved: false,
        details: `Walk-ins today: ${walkIns}/2. Below minimum target. Admission KPI penalty applied.`,
      });
    }

    // 5. Absentee > 3 days without follow-up → Student Care KPI penalty
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split("T")[0];
    });
    const absentCounts: Record<string, number> = {};
    Object.values(attendance).forEach(teacherAtt => {
      last7.forEach(date => {
        const dayRecord = teacherAtt[date];
        if (dayRecord) {
          Object.entries(dayRecord).forEach(([student, status]) => {
            if (status === "absent") absentCounts[student] = (absentCounts[student] || 0) + 1;
          });
        }
      });
    });
    const chronicallyAbsent = Object.entries(absentCounts).filter(([_, c]) => c >= 3);
    if (chronicallyAbsent.length > 0) {
      addIfNew({
        userId: "a1",
        userName: "Admin",
        type: "attendance-gap",
        date: today,
        resolved: false,
        details: `${chronicallyAbsent.length} student(s) absent >3 days without follow-up. Student Care KPI penalty.`,
      });
    }

    // 6. Late check-in auto-violation for teachers
    teachers.forEach(t => {
      const todayCheckin = checkins[t.id]?.[today];
      if (todayCheckin?.status === "late") {
        const lateCount = t.lateCount || 0;
        if (lateCount > 5) {
          addIfNew({
            userId: t.id,
            userName: t.name,
            type: "late-checkin",
            date: today,
            resolved: false,
            details: `Late check-in (${lateCount} times this month). Auto KPI deduction under strict mode.`,
          });
        }
      }
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strictMode, today, retestQueue, teachers, checkins, walkIns, attendance, violations, addAlert, addViolation]);
}
