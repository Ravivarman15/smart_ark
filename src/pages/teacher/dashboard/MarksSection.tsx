import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileText, Search, Award, MessageCircle, CheckCircle2, ChevronDown,
} from "lucide-react";
import { sendMarksToParent, getWhatsAppLink, formatMarksMessage } from "@/lib/aisensyApi";
import type { MarksEntry } from "@/contexts/AppDataContext";
import type { TeacherWorkspace } from "./useTeacherWorkspace";
import { scoreTone } from "./scoreTone";

// Marks entry + recent history + parent WhatsApp delivery, inline on the
// dashboard (no longer a tab).

interface Props {
  ws: TeacherWorkspace;
}

const EXAM_TYPES = [
  "Weekly Test", "Monthly Test", "Unit Test", "Re-test", "Practice Test", "Final Exam",
];

const MarksSection: React.FC<Props> = ({ ws }) => {
  const {
    teacherInfo, teacherId, today, roster, students, user,
    myMarks, addMarksEntry, markSentToParent, classInsights,
  } = ws;

  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    marks: "",
    totalMarks: "100",
    subject: teacherInfo?.subject || "General",
    examType: "Weekly Test",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (teacherInfo?.subject) setForm((p) => ({ ...p, subject: teacherInfo.subject }));
  }, [teacherInfo?.subject]);

  const suggestions = useMemo(() => {
    if (!search) return roster.slice(0, 8);
    return roster.filter((s) => s.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  }, [roster, search]);

  const handleSave = async () => {
    if (!selected) { toast.error("Select a student first"); return; }
    const marks = Number(form.marks);
    const totalMarks = Number(form.totalMarks);
    if (Number.isNaN(marks) || marks < 0 || marks > totalMarks) {
      toast.error(`Enter valid marks between 0 and ${totalMarks}`);
      return;
    }
    if (!form.remarks.trim()) { toast.error("Add a remark for this entry"); return; }

    setSaving(true);
    try {
      await addMarksEntry({
        studentName: selected,
        studentId: students.find((s) => s.name === selected)?.id || "",
        marks, totalMarks,
        subject: form.subject,
        examType: form.examType,
        remarks: form.remarks,
        date: today,
        teacherId,
        teacherName: teacherInfo?.name || user?.name || "",
      });
      toast.success(`Marks recorded for ${selected}`);
      setForm((p) => ({ ...p, marks: "", remarks: "" }));
      setSelected("");
      setSearch("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsApp = async (entry: MarksEntry) => {
    const student = students.find((s) => s.name === entry.studentName);
    const parentPhone = student?.parentContact;
    const payload = {
      studentName: entry.studentName,
      marks: entry.marks,
      totalMarks: entry.totalMarks,
      subject: entry.subject,
      examType: entry.examType,
      remarks: entry.remarks,
      teacherName: entry.teacherName,
    };

    if (!parentPhone) {
      // No number on file — hand the teacher the text rather than opening a
      // broken wa.me link.
      try {
        await navigator.clipboard.writeText(formatMarksMessage(payload));
        toast.info("No parent number on file — report copied to clipboard.");
      } catch {
        toast.warning("No parent number on file. Add it in Student Control.");
      }
      return;
    }

    setSending(entry.id);
    try {
      const result = await sendMarksToParent({ parentPhone, parentName: student?.parentName, ...payload });
      if (result.success) {
        markSentToParent(entry.id);
        toast.success(result.message);
      } else {
        // API failed — offer the manual link, but don't claim it was delivered.
        const link = getWhatsAppLink(parentPhone, formatMarksMessage(payload));
        if (link) window.open(link, "_blank");
        toast.warning(`Delivery API failed — opened WhatsApp instead. ${result.message}`);
      }
    } catch {
      toast.error("Failed to send WhatsApp message");
    } finally {
      setSending(null);
    }
  };

  return (
    <section id="marks" className="scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-heading mb-0">
          <FileText className="w-4 h-4 text-accent" /> Marks &amp; Parent Updates
          {classInsights.pendingParentUpdates > 0 && (
            <span className="status-pill-warning">
              {classInsights.pendingParentUpdates} unsent
            </span>
          )}
        </h2>
        <button
          onClick={() => setOpen(!open)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          aria-label={open ? "Collapse form" : "Expand form"}
        >
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </div>

      {open && (
        <div className="rounded-2xl bg-card/50 border border-border/60 p-4 space-y-3 mb-3">
          <div>
            <label className="form-label">Student *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(""); }}
                placeholder={roster.length ? "Search your class…" : "No students linked yet"}
                disabled={roster.length === 0}
                className="form-input pl-9 disabled:opacity-50"
              />
            </div>
            {!selected && suggestions.length > 0 && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-background/90 divide-y divide-border">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelected(s); setSearch(s); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <p className="mt-1.5 text-xs text-accent flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {selected} selected
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Subject</label>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Exam type</label>
              <select
                value={form.examType}
                onChange={(e) => setForm({ ...form, examType: e.target.value })}
                className="form-input appearance-none"
              >
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Marks obtained *</label>
              <input
                type="number" min="0" value={form.marks}
                onChange={(e) => setForm({ ...form, marks: e.target.value })}
                placeholder="e.g. 78"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Out of</label>
              <input
                type="number" min="1" value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Remarks *</label>
            <textarea
              rows={2}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="e.g. Strong in algebra, needs practice on geometry…"
              className="form-input resize-none"
            />
          </div>

          <button onClick={handleSave} disabled={saving || roster.length === 0} className="btn-primary">
            {saving
              ? <><div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" /> Saving…</>
              : <><Award className="w-4 h-4" /> Save marks</>}
          </button>
        </div>
      )}

      {/* Recent entries */}
      {myMarks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <FileText className="w-6 h-6 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No marks recorded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myMarks.slice(0, 8).map((entry) => {
            const pct = entry.totalMarks > 0 ? Math.round((entry.marks / entry.totalMarks) * 100) : 0;
            const tone = scoreTone(pct);
            return (
              <div key={entry.id} className="rounded-xl bg-card/50 border border-border/60 p-3 flex items-start gap-3">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.chip}`}>
                  <span className={`text-sm font-bold ${tone.text}`}>{pct}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{entry.studentName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.subject} · {entry.examType} · {entry.marks}/{entry.totalMarks} · {entry.date}
                  </p>
                  {entry.remarks && (
                    <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">"{entry.remarks}"</p>
                  )}
                </div>
                <button
                  onClick={() => handleWhatsApp(entry)}
                  disabled={sending === entry.id}
                  className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors ${
                    entry.sentToParent
                      ? "bg-ark-success/10 text-ark-success"
                      : "bg-accent/15 text-accent hover:bg-accent/25"
                  }`}
                >
                  {sending === entry.id
                    ? <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : entry.sentToParent
                      ? <><CheckCircle2 className="w-3 h-3" /> Sent</>
                      : <><MessageCircle className="w-3 h-3" /> Notify</>}
                </button>
              </div>
            );
          })}
          {myMarks.length > 8 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Showing 8 of {myMarks.length} entries
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default MarksSection;
