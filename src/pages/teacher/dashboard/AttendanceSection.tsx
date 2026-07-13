import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Users2, Search, CheckSquare, Square, CheckCircle2, BarChart3,
  Plus, X, GraduationCap, AlertTriangle, UserCheck, UserX,
} from "lucide-react";
import type { AttendanceStatus } from "@/contexts/AppDataContext";
import type { TeacherWorkspace } from "./useTeacherWorkspace";
import StudentPerformanceDrawer from "../StudentPerformanceDrawer";

// Roster + attendance marking, inline on the dashboard (no longer a tab).

interface Props {
  ws: TeacherWorkspace;
}

const AttendanceSection: React.FC<Props> = ({ ws }) => {
  const {
    teacherInfo, teacherId, today, roster, students,
    attendanceMap, attendanceSubmitted, submittingAttendance,
    toggleStudent, setAllStudents, submitStudentAttendance, reopenAttendance,
    presentCount, absentCount, addStudentToTeacher, myMarks,
  } = ws;

  const [query, setQuery] = useState("");
  const [drawerStudent, setDrawerStudent] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return roster;
    return roster.filter((s) => s.toLowerCase().includes(query.toLowerCase()));
  }, [roster, query]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { setAddError("Enter a student name."); return; }
    if (roster.includes(name)) { setAddError("This student is already in your class."); return; }
    setAdding(true);
    setAddError("");
    try {
      await addStudentToTeacher(teacherId, name);
      toast.success(`${name} added to your class`);
      setNewName("");
      setShowAdd(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAddError(
        /row-level security|permission/i.test(msg)
          ? "Permission denied — ask an admin to allow student creation."
          : `Failed to save: ${msg}`,
      );
    } finally {
      setAdding(false);
    }
  };

  const batches = teacherInfo?.studentsByBatch && Object.keys(teacherInfo.studentsByBatch).length > 0
    ? teacherInfo.studentsByBatch
    : { "My Class": roster };
  const showBatchHeadings = Object.keys(batches).length > 1;

  return (
    <section id="attendance" className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-heading mb-0">
          <Users2 className="w-4 h-4 text-accent" /> Class Attendance
          {attendanceSubmitted && (
            <span className="status-pill-success"><CheckCircle2 className="w-3 h-3" /> Submitted</span>
          )}
        </h2>
        <button
          onClick={() => { setShowAdd(true); setAddError(""); setNewName(""); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Add Student
        </button>
      </div>

      <div className="rounded-2xl bg-card/50 border border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {teacherInfo?.className || "My Class"} · {today}
          </p>
          <div className="flex gap-2">
            <span className="status-pill-success">{presentCount} present</span>
            <span className={absentCount > 0 ? "status-pill-danger" : "status-pill"}>{absentCount} absent</span>
          </div>
        </div>

        {/* Bulk actions + search */}
        <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search students…"
                  className="w-full bg-background/60 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              {!attendanceSubmitted && (
                <>
                  <button
                    onClick={() => setAllStudents("present" as AttendanceStatus)}
                    title="Mark everyone present"
                    className="px-3 rounded-lg bg-ark-success/10 border border-ark-success/20 text-ark-success hover:bg-ark-success/20 transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAllStudents("absent" as AttendanceStatus)}
                    title="Mark everyone absent"
                    className="px-3 rounded-lg bg-ark-danger/10 border border-ark-danger/20 text-ark-danger hover:bg-ark-danger/20 transition-colors"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Roster */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-0.5">
              {Object.entries(batches).map(([batchName, batchStudents]) => {
                const list = (batchStudents as string[]).filter((s) => filtered.includes(s));
                if (list.length === 0) return null;
                return (
                  <div key={batchName} className="space-y-1.5">
                    {showBatchHeadings && (
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                        {batchName}
                      </h3>
                    )}
                    {list.map((student) => {
                      const isPresent = attendanceMap[student] !== "absent";
                      return (
                        <div
                          key={student}
                          onClick={() => !attendanceSubmitted && toggleStudent(student)}
                          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 border transition-colors ${
                            attendanceSubmitted
                              ? isPresent ? "bg-ark-success/5 border-ark-success/20" : "bg-ark-danger/5 border-ark-danger/20"
                              : "bg-background/40 border-border/60 hover:border-accent/40 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isPresent ? "bg-ark-success/15 text-ark-success" : "bg-ark-danger/15 text-ark-danger"
                            }`}>
                              {student.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <p className="text-sm font-medium text-foreground truncate">{student}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDrawerStudent(student); }}
                              title="View performance"
                              className="p-1.5 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </button>
                            <span className={isPresent ? "status-pill-success" : "status-pill-danger"}>
                              {isPresent ? "Present" : "Absent"}
                            </span>
                            {!attendanceSubmitted && (
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

        {attendanceSubmitted ? (
          <button onClick={reopenAttendance} className="btn-secondary">
            Edit today's attendance
          </button>
        ) : (
          <button
            onClick={submitStudentAttendance}
            disabled={submittingAttendance}
            className="btn-primary"
          >
            {submittingAttendance ? "Submitting…" : `Submit attendance · ${presentCount}/${roster.length} present`}
          </button>
        )}
      </div>

      {/* Add student modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Add Student</p>
                  <p className="text-[10px] text-muted-foreground">
                    To {teacherInfo?.className || "your class"}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <label className="form-label">Student full name *</label>
            <input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Rahul Sharma"
              autoFocus
              className="form-input"
            />
            {addError && (
              <p className="text-xs text-ark-danger mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {addError}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAdd} disabled={adding} className="btn-primary">
                {adding ? "Saving…" : "Add Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerStudent && (
        <StudentPerformanceDrawer
          studentName={drawerStudent}
          student={students.find((s) => s.name === drawerStudent)}
          marks={myMarks.filter((e) => e.studentName === drawerStudent)}
          onClose={() => setDrawerStudent(null)}
        />
      )}
    </section>
  );
};

export default AttendanceSection;
