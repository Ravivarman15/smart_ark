import React, { useState, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
// `User` is imported as a TYPE here — `lucide-react` below also exports a
// component named `User`. Without the explicit `type` modifier, esbuild
// keeps both bindings in the emitted JS and the browser bails with
// "Identifier 'User' has already been declared".
import { useAuth, type User } from "@/contexts/AuthContext";
import { useAppData, AttendanceStatus, isNearCampus, MarksEntry, CheckinRecord, TeacherInfo, Task, StudentInfo, LeaveRequest } from "@/contexts/AppDataContext";
import { sendMarksToParent, getWhatsAppLink, formatMarksMessage } from "@/lib/aisensyApi";
import { toast } from "sonner";
import arkLogo from "@/assets/ark-logo.jpeg";
import { ThemeToggle } from "@/core/theme";
import { RoleSidebar } from "@/shared/layouts";
import { useNavigation } from "@/core/navigation";
import { resolveIcon } from "@/shared/icons";
import {
  LogOut, CheckCircle2, BookOpen, Clock, FileText, MapPin,
  ClipboardList, Users2, Calendar, CheckSquare, Square,
  Home, BarChart3, Send, MessageCircle, ChevronRight,
  TrendingUp, AlertTriangle, User, Settings, Phone,
  Award, Percent, Search, Filter, X, Plus, Star,
  CalendarDays, GraduationCap, Menu, Layers,
} from "lucide-react";

type TabId = "home" | "attendance" | "marks" | "more";

const TeacherDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    teachers, getTasksForTeacher, markTaskComplete, attendance, submitAttendance,
    checkins, teacherCheckin, teacherCheckout, students, addMarksEntry, getMarksForStudent,
    markSentToParent, marksEntries, addLeaveRequest, leaveRequests, addStudentToTeacher,
  } = useAppData();

  const teacherInfo = teachers.find((t) => t.id === user?.profileId || t.id === user?.id);
  const teacherId = teacherInfo?.id || user?.profileId || user?.id || "";
  const tasks = teacherId ? getTasksForTeacher(teacherId) : [];
  const today = new Date().toISOString().split("T")[0];
  const todayCheckin = teacherId ? checkins[teacherId]?.[today] : undefined;

  const [activeTab, setActiveTab] = useState<TabId>("home");

  // ── Dynamic modules from RBAC ────────────────────────────────────
  // Drives both the hamburger drawer and the "Modules" section in More tab.
  // Any module granted via Manage Staff Role shows up here immediately
  // (the realtime provider invalidates the effective-permissions cache
  // on every RBAC change). We drop the synthetic "dashboard" group since
  // we already are the dashboard.
  const navGroups = useNavigation();
  const extraModules = useMemo(
    () => navGroups.filter((g) => g.key !== "dashboard" && g.items.length > 0),
    [navGroups],
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Attendance State ──────────────────────────────────────────────
  const existingAttendance = teacherId ? attendance[teacherId]?.[today] : undefined;
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>(() => {
    if (existingAttendance) return existingAttendance;
    return Object.fromEntries((teacherInfo?.students || []).map((s) => [s, "present" as AttendanceStatus]));
  });
  const [submitted, setSubmitted] = useState(!!existingAttendance);

  // Re-sync attendance state when context updates (e.g., after page reload)
  useEffect(() => {
    if (existingAttendance && !submitted) {
      setAttendanceMap(existingAttendance);
      setSubmitted(true);
    }
  }, [existingAttendance, submitted]);

  const [initializedDefault, setInitializedDefault] = useState(false);

  // Re-init attendance map when teacher info loads
  useEffect(() => {
    if (teacherInfo?.students && teacherInfo.students.length > 0 && !existingAttendance && !submitted && !initializedDefault) {
      setAttendanceMap(Object.fromEntries(teacherInfo.students.map((s) => [s, "present" as AttendanceStatus])));
      setInitializedDefault(true);
    }
  }, [teacherInfo?.students, existingAttendance, submitted, initializedDefault]);


  const handleAttendanceToggle = (student: string) => {
    if (submitted) return;
    setAttendanceMap((prev) => ({ ...prev, [student]: prev[student] === "present" ? "absent" : "present" }));
  };

  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const handleSubmitAttendance = async () => {
    if (!user || !teacherId) return;
    setSubmittingAttendance(true);
    try {
      await submitAttendance(teacherId, today, attendanceMap);
      setSubmitted(true);
      toast.success("Attendance submitted successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit attendance");
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const [checkinLoading, setCheckinLoading] = useState(false);
  // Wrap the now-throwing teacherCheckin() so UI surfaces DB errors instead
  // of letting them bubble to the ErrorBoundary. Also ensures loading state
  // always clears.
  const doCheckin = async (geoValid: boolean, okMessage: string, fallbackWarn?: string) => {
    try {
      await teacherCheckin(teacherId, geoValid);
      if (geoValid) toast.success(okMessage); else toast.warning(fallbackWarn || okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record check-in");
    } finally {
      setCheckinLoading(false);
    }
  };
  const handleCheckin = () => {
    if (!user || !teacherId) return;
    setCheckinLoading(true);
    if (!navigator.geolocation) {
      doCheckin(false, "Geolocation not supported — check-in submitted without geo validation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        doCheckin(
          result.valid,
          `Check-in submitted at ${result.campus} — pending admin approval`,
          "Check-in submitted but you are NOT within campus vicinity — pending approval",
        );
      },
      () => {
        doCheckin(false, "Location access denied — check-in submitted without geo validation");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const doCheckout = async (geoValid: boolean, okMessage: string, fallbackWarn?: string) => {
    try {
      await teacherCheckout(teacherId, geoValid);
      if (geoValid) toast.success(okMessage); else toast.warning(fallbackWarn || okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record check-out");
    } finally {
      setCheckoutLoading(false);
    }
  };
  const handleCheckout = () => {
    if (!user || !teacherId) return;
    setCheckoutLoading(true);
    if (!navigator.geolocation) {
      doCheckout(false, "Geolocation not supported — check-out submitted without geo validation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const result = isNearCampus(latitude, longitude);
        doCheckout(
          result.valid,
          `Check-out submitted at ${result.campus} — pending admin approval`,
          "Check-out submitted but you are NOT within campus vicinity — pending approval",
        );
      },
      () => {
        doCheckout(false, "Location access denied — check-out submitted without geo validation");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const presentCount = Object.values(attendanceMap).filter((s) => s === "present").length;
  const absentCount = Object.values(attendanceMap).filter((s) => s === "absent").length;
  const pendingTasks = tasks.filter((t) => t.statusByTeacher[teacherId] === "pending").length;

  // ── Marks State ──────────────────────────────────────────────────
  const [selectedStudent, setSelectedStudent] = useState("");
  const [marksForm, setMarksForm] = useState({
    marks: "",
    totalMarks: "100",
    subject: teacherInfo?.subject || "General",
    examType: "Weekly Test",
    remarks: "",
  });
  const [savingMarks, setSavingMarks] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [marksSearch, setMarksSearch] = useState("");

  useEffect(() => {
    if (teacherInfo?.subject) {
      setMarksForm((prev) => ({ ...prev, subject: teacherInfo.subject }));
    }
  }, [teacherInfo?.subject]);

  const teacherMarksEntries = useMemo(() => {
    return marksEntries.filter((e) => e.teacherId === teacherId);
  }, [marksEntries, teacherId]);

  const filteredStudentsForMarks = useMemo(() => {
    if (!teacherInfo?.students) return [];
    if (!marksSearch) return teacherInfo.students;
    return teacherInfo.students.filter((s) =>
      s.toLowerCase().includes(marksSearch.toLowerCase())
    );
  }, [teacherInfo?.students, marksSearch]);

  const handleSaveMarks = async () => {
    if (!selectedStudent) { toast.error("Please select a student"); return; }
    const marks = Number(marksForm.marks);
    const totalMarks = Number(marksForm.totalMarks);
    if (isNaN(marks) || marks < 0 || marks > totalMarks) {
      toast.error(`Please enter valid marks (0-${totalMarks})`);
      return;
    }
    if (!marksForm.remarks.trim()) {
      toast.error("Please add remarks for this entry");
      return;
    }

    setSavingMarks(true);
    try {
      await addMarksEntry({
        studentName: selectedStudent,
        studentId: students.find((s) => s.name === selectedStudent)?.id || "",
        marks,
        totalMarks,
        subject: marksForm.subject,
        examType: marksForm.examType,
        remarks: marksForm.remarks,
        date: today,
        teacherId,
        teacherName: teacherInfo?.name || user?.name || "",
      });
      toast.success(`Marks recorded for ${selectedStudent}`);
      setMarksForm((prev) => ({ ...prev, marks: "", remarks: "" }));
      setSelectedStudent("");
    } catch {
      toast.error("Failed to save marks");
    } finally {
      setSavingMarks(false);
    }
  };

  const handleSendWhatsApp = async (entry: MarksEntry) => {
    const student = students.find((s) => s.name === entry.studentName);
    const parentPhone = student?.parentContact;
    const parentName  = student?.parentName || undefined;

    const buildMsg = () => formatMarksMessage({
      studentName: entry.studentName,
      marks:       entry.marks,
      totalMarks:  entry.totalMarks,
      subject:     entry.subject,
      examType:    entry.examType,
      remarks:     entry.remarks,
      teacherName: entry.teacherName,
    });

    if (!parentPhone) {
      // No phone on file — copy the report text to clipboard so teacher
      // can paste it into WhatsApp manually (don't open a broken wa.me/ link)
      const msg = buildMsg();
      try {
        await navigator.clipboard.writeText(msg);
        toast.info("Parent phone not found — report copied to clipboard. Paste it in WhatsApp manually.");
      } catch {
        toast.warning("Parent phone not found. Please add the contact number in Student Control.");
      }
      return;
    }

    setSendingWhatsApp(entry.id);
    try {
      const result = await sendMarksToParent({
        parentPhone,
        parentName,
        studentName: entry.studentName,
        marks:       entry.marks,
        totalMarks:  entry.totalMarks,
        subject:     entry.subject,
        examType:    entry.examType,
        remarks:     entry.remarks,
        teacherName: entry.teacherName,
      });

      if (result.success) {
        // API call succeeded — message is confirmed delivered
        markSentToParent(entry.id);
        toast.success(result.message);
      } else {
        // API failed — open wa.me fallback but do NOT mark as sent
        // (we can't confirm delivery via a manual link click)
        const msg = buildMsg();
        const link = getWhatsAppLink(parentPhone, msg);
        if (link) window.open(link, "_blank");
        toast.warning(`API error — opened WhatsApp link instead. ${result.message}`);
      }
    } catch {
      toast.error("Failed to send WhatsApp message");
    } finally {
      setSendingWhatsApp(null);
    }
  };

  // ── Leave Request State ──────────────────────────────────────────
  const [leaveForm, setLeaveForm] = useState({
    startDate: today,
    endDate: today,
    type: "Casual Leave",
    reason: "",
  });

  const myLeaves = leaveRequests.filter((l) => l.userId === teacherId);

  const [submittingLeave, setSubmittingLeave] = useState(false);

  const handleLeaveSubmit = async () => {
    if (!leaveForm.reason.trim()) { toast.error("Please enter a reason"); return; }
    setSubmittingLeave(true);
    try {
      await addLeaveRequest({
        userId: teacherId,
        userName: teacherInfo?.name || user?.name || "",
        role: "teacher",
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        type: leaveForm.type,
        reason: leaveForm.reason,
        status: "pending",
      });
      toast.success("Leave request submitted!");
      setLeaveForm({ startDate: today, endDate: today, type: "Casual Leave", reason: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit leave request";
      toast.error(msg);
    } finally {
      setSubmittingLeave(false);
    }
  };

  // ── Attendance statistics ──────────────────────────────────────────
  const attendanceStats = useMemo(() => {
    const totalStudents = teacherInfo?.students?.length || 0;
    return { total: totalStudents, present: presentCount, absent: absentCount };
  }, [teacherInfo?.students, presentCount, absentCount]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-sidebar/95 backdrop-blur-xl border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Hamburger — opens the dynamic RoleSidebar drawer. Always shown
              so any RBAC grant beyond the dashboard surfaces immediately. */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="relative p-2 -ml-1 rounded-lg hover:bg-muted/50 transition-colors text-foreground"
            title="Open menu"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
            {extraModules.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
          <div className="relative">
            <img src={arkLogo} alt="ARK" className="w-9 h-9 rounded-lg" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ark-success border-2 border-sidebar" />
          </div>
          <div>
            <p className="font-display font-bold text-foreground text-sm">ARK Teacher Portal</p>
            <p className="text-[11px] text-muted-foreground">{user?.name} · {user?.campus}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle variant="icon" />
          <button onClick={logout} className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Sidebar drawer — mirrors the mobile pattern used by AdminLayout /
          CoordinatorLayout. Built on RoleSidebar so the module list is
          fully RBAC-driven (useNavigation → effective permissions). */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 h-full overflow-hidden">
            <RoleSidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
              onNavigate={() => setMobileMenuOpen(false)}
            />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-[-40px] p-2 text-foreground"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === "home" && <HomeTab
          todayCheckin={todayCheckin} handleCheckin={handleCheckin} checkinLoading={checkinLoading}
          handleCheckout={handleCheckout} checkoutLoading={checkoutLoading}
          pendingTasks={pendingTasks} submitted={submitted} teacherInfo={teacherInfo}
          tasks={tasks} teacherId={teacherId} markTaskComplete={markTaskComplete}
          attendanceStats={attendanceStats} teacherMarksEntries={teacherMarksEntries}
        />}
        {activeTab === "attendance" && <AttendanceTab
          teacherInfo={teacherInfo} attendanceMap={attendanceMap} submitted={submitted} submittingAttendance={submittingAttendance}
          handleAttendanceToggle={handleAttendanceToggle} handleSubmitAttendance={handleSubmitAttendance}
          setSubmitted={setSubmitted} setAttendanceMap={setAttendanceMap} today={today}
          presentCount={presentCount} absentCount={absentCount}
          teacherId={teacherId} addStudentToTeacher={addStudentToTeacher}
          setAttendanceMapEntry={(name: string, status: AttendanceStatus) =>
            setAttendanceMap(prev => ({ ...prev, [name]: status }))
          }
        />}
        {activeTab === "marks" && <MarksTab
          teacherInfo={teacherInfo} selectedStudent={selectedStudent} setSelectedStudent={setSelectedStudent}
          marksForm={marksForm} setMarksForm={setMarksForm} handleSaveMarks={handleSaveMarks}
          savingMarks={savingMarks} teacherMarksEntries={teacherMarksEntries}
          handleSendWhatsApp={handleSendWhatsApp} sendingWhatsApp={sendingWhatsApp}
          filteredStudentsForMarks={filteredStudentsForMarks} marksSearch={marksSearch}
          setMarksSearch={setMarksSearch} students={students}
        />}
        {activeTab === "more" && <MoreTab
          teacherInfo={teacherInfo} user={user} leaveForm={leaveForm}
          setLeaveForm={setLeaveForm} handleLeaveSubmit={handleLeaveSubmit}
          submittingLeave={submittingLeave}
          myLeaves={myLeaves} logout={logout}
          extraModules={extraModules}
        />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 backdrop-blur-xl border-t border-sidebar-border px-2 py-2 safe-bottom">
        <div className="max-w-2xl mx-auto flex items-center justify-around">
          {([
            { id: "home" as TabId, icon: Home, label: "Home" },
            { id: "attendance" as TabId, icon: Users2, label: "Attendance" },
            { id: "marks" as TabId, icon: FileText, label: "Marks" },
            { id: "more" as TabId, icon: Settings, label: "More" },
          ]).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
                  isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`p-1 rounded-md ${isActive ? "bg-accent/15" : ""}`}>
                  <tab.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium">{tab.label}</span>
                {tab.id === "attendance" && !submitted && (
                  <div className="absolute top-0.5 right-3 w-1.5 h-1.5 rounded-full bg-ark-warning" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TAB: HOME
// ═══════════════════════════════════════════════════════════════════
interface HomeTabProps {
  todayCheckin?: CheckinRecord;
  handleCheckin: () => void;
  checkinLoading: boolean;
  handleCheckout: () => void;
  checkoutLoading: boolean;
  pendingTasks: number;
  submitted: boolean;
  teacherInfo?: TeacherInfo;
  tasks: Task[];
  teacherId: string;
  markTaskComplete: (taskId: string, teacherId: string) => void;
  attendanceStats: { present: number; absent: number };
  teacherMarksEntries: MarksEntry[];
}
const HomeTab: React.FC<HomeTabProps> = ({
  todayCheckin, handleCheckin, checkinLoading, handleCheckout, checkoutLoading, pendingTasks, submitted, teacherInfo,
  tasks, teacherId, markTaskComplete, attendanceStats, teacherMarksEntries,
}) => (
  <div className="p-4 space-y-5 max-w-2xl mx-auto animate-in fade-in duration-300">
    {/* Check-in Card */}
    <section>
      {todayCheckin && todayCheckin.status !== "pending" ? (
        <div className="state-card-success">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-ark-success/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-ark-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Checked in at {todayCheckin.time}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todayCheckin.status === "on-time" ? "On time" : "Late"} · Geo {todayCheckin.geoValid ? "verified" : "not verified"}
              </p>
            </div>
            <span className={todayCheckin.status === "on-time" ? "status-pill-success" : "status-pill-warning"}>
              {todayCheckin.status === "on-time" ? "On Time" : "Late"}
            </span>
          </div>
        </div>
      ) : todayCheckin && todayCheckin.status === "pending" ? (
        <div className="state-card-warning">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-ark-warning/15 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-ark-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Checked in at {todayCheckin.time}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Geo {todayCheckin.geoValid ? "verified" : "not verified"} · Awaiting admin approval
              </p>
            </div>
            <span className="status-pill-warning">Pending</span>
          </div>
        </div>
      ) : (
        <button onClick={handleCheckin} disabled={checkinLoading}
          className="w-full state-card-action group disabled:opacity-50"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <MapPin className={`w-5 h-5 text-accent ${checkinLoading ? "animate-pulse" : ""}`} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-foreground">{checkinLoading ? "Verifying location…" : "Tap to check in"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{checkinLoading ? "Getting GPS coordinates" : "Location verified against your campus"}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
          </div>
        </button>
      )}
    </section>

    {/* Check-out Card (Shows if already checked in) */}
    {todayCheckin && todayCheckin.status !== "pending" && (
      <section>
        {todayCheckin.checkoutTime && todayCheckin.checkoutStatus !== "pending" ? (
          <div className="state-card-success">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-ark-success/15 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-ark-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Checked out at {todayCheckin.checkoutTime}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {todayCheckin.checkoutStatus === "on-time" ? "On time" : "Early"} · Geo {todayCheckin.checkoutGeoValid ? "verified" : "not verified"}
                </p>
              </div>
              <span className={todayCheckin.checkoutStatus === "on-time" ? "status-pill-success" : "status-pill-warning"}>
                {todayCheckin.checkoutStatus === "on-time" ? "On Time" : "Early"}
              </span>
            </div>
          </div>
        ) : todayCheckin.checkoutTime && todayCheckin.checkoutStatus === "pending" ? (
          <div className="state-card-warning">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-ark-warning/15 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-ark-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Checked out at {todayCheckin.checkoutTime}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Geo {todayCheckin.checkoutGeoValid ? "verified" : "not verified"} · Awaiting admin approval
                </p>
              </div>
              <span className="status-pill-warning">Pending</span>
            </div>
          </div>
        ) : (
          <button onClick={handleCheckout} disabled={checkoutLoading}
            className="w-full state-card-action group disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                <LogOut className={`w-5 h-5 text-accent ${checkoutLoading ? "animate-pulse" : ""}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-foreground">{checkoutLoading ? "Verifying location…" : "Tap to check out"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{checkoutLoading ? "Getting GPS coordinates" : "Location verified against your campus"}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
          </button>
        )}
      </section>
    )}

    {/* Compliance Grid */}
    <section>
      <h2 className="section-heading">
        <BarChart3 className="w-4 h-4 text-accent" /> Today's Overview
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Check-in", value: todayCheckin ? (todayCheckin.status === "pending" ? "Pending Approval" : todayCheckin.time) : "Not Checked In", done: !!todayCheckin && todayCheckin.status !== "pending", icon: MapPin },
          { label: "Pending Tasks", value: `${pendingTasks}`, done: pendingTasks === 0, icon: ClipboardList },
          { label: "Attendance", value: submitted ? "Submitted" : "Pending", done: submitted, icon: Users2 },
          { label: "My Class", value: teacherInfo?.className || "—", done: true, icon: BookOpen },
        ].map((item, i) => (
          <div key={i} className={item.done ? "state-card-success" : "state-card-warning"}>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                item.done ? "bg-ark-success/15" : "bg-ark-warning/15"
              }`}>
                <item.icon className={`w-4 h-4 ${item.done ? "text-ark-success" : "text-ark-warning"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</p>
                <p className="text-sm font-semibold text-foreground truncate">{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* Quick Stats */}
    {teacherInfo?.students && teacherInfo.students.length > 0 && (
      <section>
        <h2 className="section-heading">
          <TrendingUp className="w-4 h-4 text-accent" /> Quick Stats
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{attendanceStats.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Students</p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className="text-2xl font-bold text-ark-success">{teacherMarksEntries.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Tests Recorded</p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border p-3 text-center">
            <p className="text-2xl font-bold text-accent">{pendingTasks}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Tasks Pending</p>
          </div>
        </div>
      </section>
    )}

    {/* Tasks */}
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-accent" /> My Tasks
        {tasks.length > 0 && <span className="text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">{tasks.length}</span>}
      </h2>
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No tasks assigned</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 5).map((task) => {
            const status = task.statusByTeacher[teacherId] || "pending";
            const isCompleted = status === "completed";
            return (
              <div key={task.id} className={`rounded-xl p-3.5 border transition-all duration-200 ${
                isCompleted ? "bg-ark-success/5 border-ark-success/20" : "bg-ark-warning/5 border-ark-warning/20"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isCompleted ? "bg-ark-success/20" : "bg-ark-warning/20"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-4 h-4 text-ark-success" /> : <Clock className="w-4 h-4 text-ark-warning" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-medium text-sm ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {task.dueDate}</span>
                      {!isCompleted && teacherId && (
                        <button onClick={() => markTaskComplete(task.id, teacherId)}
                          className="text-[10px] font-semibold text-accent hover:text-accent transition-colors flex items-center gap-1 active:scale-95">
                          <CheckSquare className="w-3 h-3" /> Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// TAB: ATTENDANCE
// ═══════════════════════════════════════════════════════════════════
interface AttendanceTabProps {
  teacherInfo?: TeacherInfo;
  attendanceMap: Record<string, AttendanceStatus>;
  submitted: boolean;
  submittingAttendance: boolean;
  handleAttendanceToggle: (student: string) => void;
  handleSubmitAttendance: () => void;
  setSubmitted: (val: boolean) => void;
  setAttendanceMap: React.Dispatch<React.SetStateAction<Record<string, AttendanceStatus>>>;
  today: string;
  presentCount: number;
  absentCount: number;
  teacherId: string;
  addStudentToTeacher: (teacherId: string, name: string) => Promise<void>;
  setAttendanceMapEntry?: (name: string, status: AttendanceStatus) => void;
}
const AttendanceTab: React.FC<AttendanceTabProps> = ({
  teacherInfo, attendanceMap, submitted, submittingAttendance, handleAttendanceToggle, handleSubmitAttendance,
  setSubmitted, setAttendanceMap, today, presentCount, absentCount,
  teacherId, addStudentToTeacher, setAttendanceMapEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [addError, setAddError] = useState("");

  const [addingStudent, setAddingStudent] = useState(false);

  const handleAddStudent = async () => {
    const name = newStudentName.trim();
    if (!name) { setAddError("Please enter a student name."); return; }
    if (teacherInfo?.students?.includes(name)) {
      setAddError("This student is already in your list."); return;
    }
    setAddingStudent(true);
    setAddError("");
    try {
      await addStudentToTeacher(teacherId, name);
      // Also seed into attendanceMap as present
      if (setAttendanceMapEntry) setAttendanceMapEntry(name, "present");
      toast.success(`${name} added to class and saved to database!`);
      setNewStudentName("");
      setShowAddModal(false);
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error?.message || "Unknown error";
      if (msg.includes("row-level security") || msg.includes("permission")) {
        setAddError("Permission denied — contact admin to allow student creation.");
      } else {
        setAddError(`Failed to save: ${msg}`);
      }
      toast.error(`Could not add ${name} — ${msg}`);
    } finally {
      setAddingStudent(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!teacherInfo?.students) return [];
    if (!searchQuery) return teacherInfo.students;
    return teacherInfo.students.filter((s: string) =>
      s.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [teacherInfo?.students, searchQuery]);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users2 className="w-5 h-5 text-accent" /> Attendance
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{teacherInfo?.className || "No class"} · {today}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Add Student button */}
          <button
            onClick={() => { setShowAddModal(true); setAddError(""); setNewStudentName(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all duration-200 active:scale-95 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add Student
          </button>
          {teacherInfo?.students && (
            <div className="flex gap-2">
              <div className="bg-ark-success/10 rounded-lg px-3 py-1.5 text-center">
                <p className="text-sm font-bold text-ark-success">{presentCount}</p>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Present</p>
              </div>
              <div className="bg-ark-danger/10 rounded-lg px-3 py-1.5 text-center">
                <p className="text-sm font-bold text-ark-danger">{absentCount}</p>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Absent</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div
            className="w-full max-w-md bg-[#0f172a] border border-border rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Add Student</p>
                  <p className="text-[10px] text-muted-foreground">Add to {teacherInfo?.className || "your class"}</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Student Full Name *</label>
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => { setNewStudentName(e.target.value); setAddError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
                  placeholder="e.g. Rahul Sharma"
                  autoFocus
                  className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition-all"
                />
                {addError && (
                  <p className="text-xs text-ark-danger mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {addError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-muted/30 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStudent}
                  disabled={addingStudent}
                  className="flex-1 btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addingStudent ? (
                    <><div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" /> Saving…</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Add Student</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!teacherInfo ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Users2 className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No class assigned</p>
        </div>
      ) : (
        <>
          {/* Submitted Banner */}
          {submitted && (
            <div className="rounded-xl bg-ark-success/10 border border-ark-success/20 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-ark-success flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-ark-success">Attendance Submitted</p>
                <p className="text-xs text-muted-foreground">{presentCount} Present · {absentCount} Absent</p>
              </div>
            </div>
          )}

          {/* Search */}
          {teacherInfo.students.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students..."
                className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition-all"
              />
            </div>
          )}

          {/* Student List */}
          <div className="space-y-4">
            {Object.entries(teacherInfo.studentsByBatch || { "My Class": filteredStudents }).map(([batchName, batchStudents]) => {
              const batchFiltered = (batchStudents as string[]).filter(s => filteredStudents.includes(s));
              if (batchFiltered.length === 0) return null;
              
              return (
                <div key={batchName} className="space-y-1.5">
                  {(teacherInfo.classes?.length || 1) > 1 && (
                    <h3 className="text-[10px] font-bold text-muted-foreground px-1 uppercase tracking-wider">{batchName}</h3>
                  )}
                  {batchFiltered.map((student: string) => {
                    const isPresent = attendanceMap[student] === "present";
                    return (
                      <div key={student}
                        onClick={() => handleAttendanceToggle(student)}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all duration-200 ${
                          submitted
                            ? isPresent ? "bg-ark-success/5 border-ark-success/20" : "bg-ark-danger/5 border-ark-danger/20"
                            : "bg-card/50 border-border/50 hover:bg-muted/30 cursor-pointer active:scale-[0.99]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                            isPresent ? "bg-ark-success/15 text-ark-success" : "bg-ark-danger/15 text-ark-danger"
                          }`}>
                            {student.split(" ").map((n) => n[0]).join("")}
                          </div>
                          <p className="text-sm font-medium text-foreground">{student}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            isPresent ? "bg-ark-success/15 text-ark-success" : "bg-ark-danger/15 text-ark-danger"
                          }`}>
                            {isPresent ? "Present" : "Absent"}
                          </span>
                          {!submitted && (
                            isPresent
                              ? <CheckSquare className="w-4 h-4 text-ark-success" />
                              : <Square className="w-4 h-4 text-muted-foreground/60" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          {!submitted ? (
            <button onClick={handleSubmitAttendance} className="btn-primary" disabled={submittingAttendance}>
              {submittingAttendance ? "Submitting..." : "Submit Attendance"}
            </button>
          ) : (
            <button onClick={() => {
              setSubmitted(false);
              setAttendanceMap(Object.fromEntries(teacherInfo.students.map((s: string) => [s, "present" as AttendanceStatus])));
            }}
              className="btn-secondary">
              Re-take Attendance
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TAB: MARKS
// ═══════════════════════════════════════════════════════════════════
interface MarksTabProps {
  teacherInfo?: TeacherInfo;
  selectedStudent: string;
  setSelectedStudent: (s: string) => void;
  marksForm: { marks: string; totalMarks: string; subject: string; examType: string; remarks: string };
  setMarksForm: React.Dispatch<React.SetStateAction<{ marks: string; totalMarks: string; subject: string; examType: string; remarks: string }>>;
  handleSaveMarks: () => void;
  savingMarks: boolean;
  teacherMarksEntries: MarksEntry[];
  handleSendWhatsApp: (e: MarksEntry) => Promise<void>;
  sendingWhatsApp: string | null;
  filteredStudentsForMarks: string[];
  marksSearch: string;
  setMarksSearch: (s: string) => void;
  students: StudentInfo[];
}
const MarksTab: React.FC<MarksTabProps> = ({
  teacherInfo, selectedStudent, setSelectedStudent, marksForm, setMarksForm,
  handleSaveMarks, savingMarks, teacherMarksEntries, handleSendWhatsApp,
  sendingWhatsApp, filteredStudentsForMarks, marksSearch, setMarksSearch, students,
}) => {
  const [showForm, setShowForm] = useState(true);

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" /> Record Marks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{teacherInfo?.className || "No class"}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="p-2 rounded-lg bg-muted/30 border border-border hover:bg-muted transition-colors active:scale-95">
          {showForm ? <X className="w-4 h-4 text-muted-foreground" /> : <Plus className="w-4 h-4 text-accent" />}
        </button>
      </div>

      {!teacherInfo ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <FileText className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No class assigned</p>
        </div>
      ) : (
        <>
          {/* Marks Entry Form */}
          {showForm && (
            <div className="rounded-2xl bg-card/50 border border-border/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Entry</p>

              {/* Student Select */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Student *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text" value={marksSearch} onChange={(e) => { setMarksSearch(e.target.value); setSelectedStudent(""); }}
                    placeholder="Search student..."
                    className="w-full bg-background/50 border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                  />
                </div>
                {(marksSearch || !selectedStudent) && filteredStudentsForMarks.length > 0 && !selectedStudent && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-background/90 divide-y divide-border">
                    {filteredStudentsForMarks.slice(0, 8).map((s: string) => {
                      const stBatchName = (teacherInfo.classes?.length || 1) > 1 && teacherInfo.studentsByBatch
                        ? Object.entries(teacherInfo.studentsByBatch).find(([_, list]) => (list as string[]).includes(s))?.[0]
                        : null;
                      return (
                        <button key={s} onClick={() => { setSelectedStudent(s); setMarksSearch(s); }}
                          className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex justify-between items-center"
                        >
                          <span>{s}</span>
                          {stBatchName && <span className="text-[10px] text-muted-foreground font-medium tracking-wider max-w-[80px] truncate">{stBatchName}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedStudent && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-accent">
                    <CheckCircle2 className="w-3 h-3" /> Selected: {selectedStudent}
                  </div>
                )}
              </div>

              {/* Subject + Exam Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
                  <input type="text" value={marksForm.subject}
                    onChange={(e) => setMarksForm({ ...marksForm, subject: e.target.value })}
                    className="w-full bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Exam Type</label>
                  <select value={marksForm.examType}
                    onChange={(e) => setMarksForm({ ...marksForm, examType: e.target.value })}
                    className="w-full bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all appearance-none"
                  >
                    <option value="Weekly Test">Weekly Test</option>
                    <option value="Monthly Test">Monthly Test</option>
                    <option value="Unit Test">Unit Test</option>
                    <option value="Re-test">Re-test</option>
                    <option value="Practice Test">Practice Test</option>
                    <option value="Final Exam">Final Exam</option>
                  </select>
                </div>
              </div>

              {/* Marks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Marks Obtained *</label>
                  <input type="number" value={marksForm.marks}
                    onChange={(e) => setMarksForm({ ...marksForm, marks: e.target.value })}
                    placeholder="e.g. 78"
                    className="w-full bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Total Marks</label>
                  <input type="number" value={marksForm.totalMarks}
                    onChange={(e) => setMarksForm({ ...marksForm, totalMarks: e.target.value })}
                    className="w-full bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
                    min="1"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Teacher's Remarks *</label>
                <textarea value={marksForm.remarks}
                  onChange={(e) => setMarksForm({ ...marksForm, remarks: e.target.value })}
                  placeholder="e.g. Good improvement in algebra, needs to work on geometry..."
                  rows={3}
                  className="w-full bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all resize-none"
                />
              </div>

              {/* Save Button */}
              <button onClick={handleSaveMarks} disabled={savingMarks} className="btn-primary">
                {savingMarks ? (
                  <><div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><Award className="w-4 h-4" /> Save Marks & Remarks</>
                )}
              </button>
            </div>
          )}

          {/* Marks History */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" /> Recent Entries
              {teacherMarksEntries.length > 0 && (
                <span className="text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">{teacherMarksEntries.length}</span>
              )}
            </h3>
            {teacherMarksEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <FileText className="w-6 h-6 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No marks recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {teacherMarksEntries.slice(0, 20).map((entry: MarksEntry) => {
                  const pct = Math.round((entry.marks / entry.totalMarks) * 100);
                  const tone = pct >= 75 ? "success" : pct >= 60 ? "warning" : "danger";
                  const bgClass = tone === "success" ? "bg-ark-success/15" : tone === "warning" ? "bg-ark-warning/15" : "bg-ark-danger/15";
                  const textClass = tone === "success" ? "text-ark-success" : tone === "warning" ? "text-ark-warning" : "text-ark-danger";
                  return (
                    <div key={entry.id} className="rounded-xl bg-card/50 border border-border/50 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center flex-shrink-0`}>
                            <span className={`text-sm font-bold ${textClass}`}>{pct}%</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{entry.studentName}</p>
                            <p className="text-[10px] text-muted-foreground">{entry.subject} · {entry.examType} · {entry.marks}/{entry.totalMarks}</p>
                            {entry.remarks && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{entry.remarks}"</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className="text-[9px] text-muted-foreground">{entry.date}</span>
                          <button
                            onClick={() => handleSendWhatsApp(entry)}
                            disabled={sendingWhatsApp === entry.id}
                            className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all active:scale-95 ${
                              entry.sentToParent
                                ? "bg-ark-success/10 text-ark-success"
                                : "bg-ark-success/15 text-ark-success hover:bg-ark-success/25"
                            }`}
                          >
                            {sendingWhatsApp === entry.id ? (
                              <div className="w-3 h-3 border-2 border-ark-success/30 border-t-ark-success rounded-full animate-spin" />
                            ) : entry.sentToParent ? (
                              <><CheckCircle2 className="w-3 h-3" /> Sent</>
                            ) : (
                              <><MessageCircle className="w-3 h-3" /> WhatsApp</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TAB: MORE
// ═══════════════════════════════════════════════════════════════════
type NavGroups = ReturnType<typeof useNavigation>;

interface MoreTabProps {
  teacherInfo?: TeacherInfo;
  user: User | null;
  leaveForm: { startDate: string; endDate: string; type: string; reason: string };
  setLeaveForm: React.Dispatch<React.SetStateAction<{ startDate: string; endDate: string; type: string; reason: string }>>;
  handleLeaveSubmit: () => void;
  submittingLeave: boolean;
  myLeaves: LeaveRequest[];
  logout: () => void;
  extraModules: NavGroups;
}
const MoreTab: React.FC<MoreTabProps> = ({
  teacherInfo, user, leaveForm, setLeaveForm, handleLeaveSubmit, submittingLeave, myLeaves, logout, extraModules,
}) => (
  <div className="p-4 space-y-5 max-w-2xl mx-auto animate-in fade-in duration-300">
    {/* Profile Card */}
    <section className="rounded-2xl bg-card/60 border border-border p-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <User className="w-7 h-7 text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-foreground">{teacherInfo?.name || user?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{teacherInfo?.subject || "Teacher"} · {user?.campus}</p>
          <div className="flex items-center gap-3 mt-2">
            {teacherInfo?.className && (
              <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {teacherInfo.className}
              </span>
            )}
            {teacherInfo?.students && (
              <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                {teacherInfo.students.length} Students
              </span>
            )}
          </div>
        </div>
      </div>
    </section>

    {/* My Modules — surfaces any module the admin granted to this teacher
        via Manage Staff Role. Driven by useNavigation() → RBAC, so toggling
        a module on the role editor reflects here on next render. */}
    {extraModules.length > 0 && (
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" /> My Modules
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {extraModules.map((group) => {
            const Icon = resolveIcon(group.icon);
            // Land on the first granted item in the module.
            const firstPath = group.items[0]?.path ?? "/teacher";
            return (
              <NavLink
                key={group.key}
                to={firstPath}
                className="rounded-xl bg-card/60 border border-border p-3 flex items-center gap-3 hover:bg-muted/30 transition-all active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{group.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "feature" : "features"}
                  </p>
                </div>
              </NavLink>
            );
          })}
        </div>
      </section>
    )}

    {/* Leave Request */}
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-accent" /> Apply for Leave
      </h2>
      <div className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
            <input type="date" value={leaveForm.startDate}
              onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
            <input type="date" value={leaveForm.endDate}
              onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
              className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Leave Type</label>
          <select value={leaveForm.type}
            onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all appearance-none"
          >
            <option value="Casual Leave">Casual Leave</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Personal Leave">Personal Leave</option>
            <option value="Emergency Leave">Emergency Leave</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Reason</label>
          <textarea value={leaveForm.reason}
            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
            placeholder="Enter your reason..."
            rows={2}
            className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all resize-none"
          />
        </div>
        <button onClick={handleLeaveSubmit} disabled={submittingLeave} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
          {submittingLeave ? "Submitting..." : "Submit Leave Request"}
        </button>
      </div>
    </section>

    {/* My Leaves */}
    {myLeaves.length > 0 && (
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">My Leave Requests</h2>
        <div className="space-y-2">
          {myLeaves.slice(0, 5).map((leave) => (
            <div key={leave.id} className="rounded-xl bg-card/50 border border-border/50 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{leave.type}</p>
                <p className="text-xs text-muted-foreground">{leave.startDate} → {leave.endDate}</p>
                <p className="text-xs text-muted-foreground mt-0.5 italic">{leave.reason}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                leave.status === "approved" ? "bg-ark-success/15 text-ark-success"
                  : leave.status === "rejected" ? "bg-ark-danger/15 text-ark-danger"
                  : "bg-ark-warning/15 text-ark-warning"
              }`}>
                {leave.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    )}

    {/* Quick Actions */}
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
      <div className="space-y-2">
        <button onClick={logout}
          className="w-full rounded-xl bg-ark-danger/5 border border-ark-danger/20 p-3.5 flex items-center gap-3 hover:bg-ark-danger/10 transition-all active:scale-[0.98]">
          <div className="w-9 h-9 rounded-lg bg-ark-danger/10 flex items-center justify-center">
            <LogOut className="w-4 h-4 text-ark-danger" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-ark-danger">Sign Out</p>
            <p className="text-xs text-muted-foreground">Log out from your account</p>
          </div>
        </button>
      </div>
    </section>
  </div>
);

export default TeacherDashboard;
