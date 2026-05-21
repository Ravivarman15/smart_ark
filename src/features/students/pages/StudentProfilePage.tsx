import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarCheck,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, RiskBadge, StatTile, StatusBadge, StudentAvatar } from "../components";
import { useStudent } from "../hooks/useStudent";
import { useAttendanceHistory } from "../hooks/useStudentAttendance";
import { useStudentDocuments } from "../hooks/useStudentDocuments";
import { useStudentFeedback } from "../hooks/useStudentFeedback";
import { useStudentMessages, useSendMessage } from "../hooks/useStudentChat";
import { ATTENDANCE_META, DOCUMENT_CATEGORY_LABELS } from "../utils/constants";
import { formatDate, formatDateTime } from "../utils/helpers";

const InfoRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-border/30 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground text-right">{value || "—"}</span>
  </div>
);

const StudentProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = pathname.replace(/\/[^/]+$/, "");

  const { data: student, isLoading } = useStudent(id);
  const { data: attendance = [] } = useAttendanceHistory(id);
  const { data: documents = [] } = useStudentDocuments({ studentId: id });
  const { data: feedback = [] } = useStudentFeedback({ studentId: id });
  const { data: messages = [] } = useStudentMessages(id);
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState("");

  const attendancePct = useMemo(() => {
    if (attendance.length === 0) return 0;
    const present = attendance.filter((a) => a.status === "present").length;
    return Math.round((present / attendance.length) * 100);
  }, [attendance]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!student) {
    return (
      <EmptyState title="Student not found" description="This record may have been removed." />
    );
  }

  const send = () => {
    if (!draft.trim() || !id) return;
    sendMessage.mutate({ studentId: id, body: draft.trim() }, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(base)}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>
        <Button
          size="sm"
          onClick={() => navigate(`${base}/registration?id=${student.id}`)}
        >
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          Edit
        </Button>
      </header>

      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <StudentAvatar name={student.name} imageUrl={student.profileImageUrl} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-display font-semibold text-foreground">
              {student.name}
            </h1>
            <RiskBadge risk={student.risk} />
            <StatusBadge active={student.active} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {student.rollNumber ? `#${student.rollNumber} · ` : ""}
            {student.standardName || "No standard"} · {student.batch || "No batch"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="SPI" value={student.spi || "—"} icon={<Star className="w-4 h-4" />} />
        <StatTile
          label="Attendance"
          value={`${attendancePct}%`}
          tone={attendancePct >= 75 ? "positive" : attendancePct >= 50 ? "warning" : "danger"}
          icon={<CalendarCheck className="w-4 h-4" />}
        />
        <StatTile label="Documents" value={documents.length} icon={<FileText className="w-4 h-4" />} />
        <StatTile
          label="Feedback"
          value={feedback.length}
          icon={<MessageSquare className="w-4 h-4" />}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="chat">Communication</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-2">Personal</h3>
              <InfoRow label="Gender" value={student.gender} />
              <InfoRow label="Blood group" value={student.bloodGroup} />
              <InfoRow label="Date of birth" value={formatDate(student.dateOfBirth)} />
              <InfoRow label="Joined" value={formatDate(student.dateOfJoining)} />
              <InfoRow label="Contact" value={student.studentContact} />
              <InfoRow label="Email" value={student.studentEmail} />
              <InfoRow label="Address" value={student.address} />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-2">Academic</h3>
              <InfoRow label="Standard" value={student.standardName} />
              <InfoRow label="Batch" value={student.batch} />
              <InfoRow label="Course type" value={student.courseTypeName} />
              <InfoRow label="Campus" value={student.campus} />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-2">Parent</h3>
              <InfoRow label="Name" value={student.parentName} />
              <InfoRow label="Primary contact" value={student.parentContact} />
              <InfoRow label="Secondary contact" value={student.parentContact2} />
              <InfoRow label="Email" value={student.parentEmail} />
            </div>
            <div className="glass-card p-4">
              <h3 className="text-sm font-display font-semibold mb-2">Guardian</h3>
              <InfoRow label="Name" value={student.guardianName} />
              <InfoRow label="Relation" value={student.guardianRelation} />
              <InfoRow label="Contact" value={student.guardianContact} />
              {student.notes && <InfoRow label="Notes" value={student.notes} />}
            </div>
          </div>
        </TabsContent>

        {/* Attendance */}
        <TabsContent value="attendance" className="mt-4">
          <div className="glass-card p-0 overflow-hidden">
            {attendance.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck className="w-5 h-5" />}
                title="No attendance records"
                description="Attendance marked for this student will appear here."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Date</th>
                    <th className="px-5 py-2.5 text-left font-medium">Status</th>
                    <th className="px-5 py-2.5 text-left font-medium">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {attendance.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-2.5">{formatDate(a.date)}</td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            ATTENDANCE_META[a.status].className
                          }`}
                        >
                          {ATTENDANCE_META[a.status].label}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 capitalize text-muted-foreground">
                        {a.method ?? "manual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-4">
          {documents.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<FileText className="w-5 h-5" />}
                title="No documents"
                description="Upload documents from the Share Documents page."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((d) => (
                <div key={d.id} className="glass-card p-3 flex items-center gap-3">
                  <FileText className="w-5 h-5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
                      {d.isShared ? " · Shared" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Feedback */}
        <TabsContent value="feedback" className="mt-4">
          {feedback.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<MessageSquare className="w-5 h-5" />}
                title="No feedback yet"
                description="Staff feedback recorded for this student will appear here."
              />
            </div>
          ) : (
            <div className="space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="glass-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium capitalize text-accent">
                      {f.category.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(f.createdAt)}
                      {f.rating ? ` · ${f.rating}★` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mt-1">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Communication */}
        <TabsContent value="chat" className="mt-4">
          <div className="glass-card p-4 space-y-3">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No messages yet. Start the conversation below.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border/50 pt-3">
              <Input
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <Button size="icon" onClick={send} disabled={sendMessage.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentProfilePage;
