import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { BookOpen, CheckCircle2, AlertCircle, RotateCcw, Clock, Plus, Trash2, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    "on-track": "bg-ark-success/20 text-ark-success", "delayed": "bg-ark-danger/20 text-ark-danger",
    "completed": "bg-accent/20 text-accent", "pending": "bg-ark-warning/20 text-ark-warning",
    "allocated": "bg-blue-500/20 text-blue-400",
  };
  return map[status] || "bg-muted text-muted-foreground";
};

// Time-of-day color coding for timetable grid
const timingColor = (timing: string) => {
  if (timing.startsWith("9:") || timing.startsWith("10:") || timing.startsWith("11:")) return "bg-amber-500/15 border-amber-500/30 text-amber-300";
  if (timing.startsWith("4:") || timing.startsWith("5:")) return "bg-blue-500/15 border-blue-500/30 text-blue-300";
  if (timing.startsWith("6:") || timing.startsWith("7:")) return "bg-purple-500/15 border-purple-500/30 text-purple-300";
  return "bg-muted/30 border-border text-muted-foreground";
};

const AcademicControl: React.FC = () => {
  const { weeklyPlans, updatePlanStatus, addWeeklyPlan, deleteWeeklyPlan, retestQueue, allocateRetest, completeRetest, addRetestItem, adminChecklist, toggleChecklistItem, batches, teachers, students, classSchedule } = useAppData();
  const confirm = useConfirm();

  const [retestMarksInput, setRetestMarksInput] = useState<Record<string, string>>({});
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [planForm, setPlanForm] = useState({
    batch: classSchedule[0]?.name || "",
    teacher: teachers?.[0]?.name || "",
    portionPlanned: "",
    testDate: ""
  });

  const handleCompleteRetest = (id: string) => {
    const marks = parseInt(retestMarksInput[id] || "0");
    if (marks > 0 && marks <= 100) {
      completeRetest(id, marks);
      setRetestMarksInput(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast.success("Retest verified");
    } else {
      toast.error("Enter valid marks");
    }
  };

  const handleAddPlan = async () => {
    if (!planForm.batch || !planForm.portionPlanned || !planForm.testDate) return toast.error("Please fill all fields");
    try {
      await addWeeklyPlan({ ...planForm, status: "on-track" });
      setIsPlanOpen(false);
      toast.success("Weekly plan added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save plan");
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (
      await confirm({
        type: "danger",
        title: "Remove Plan",
        description: "Remove this weekly plan? This action cannot be undone.",
        confirmText: "Remove",
      })
    ) {
      deleteWeeklyPlan(id);
      toast.success("Plan removed");
    }
  };

  // Retest add form
  const [isRetestOpen, setIsRetestOpen] = useState(false);
  const [retestForm, setRetestForm] = useState({
    student: "",
    batch: classSchedule[0]?.name || "",
    subject: "",
    marks: "",
    teacher: teachers?.[0]?.name || "",
    dueDate: ""
  });

  const handleAddRetest = () => {
    if (!retestForm.student || !retestForm.subject || !retestForm.marks || !retestForm.dueDate) return toast.error("Please fill all fields");
    const marks = Number(retestForm.marks);
    if (marks < 0 || marks > 100) return toast.error("Marks must be between 0 and 100");
    addRetestItem({
      student: retestForm.student,
      batch: retestForm.batch,
      subject: retestForm.subject,
      marks,
      teacher: retestForm.teacher,
      status: "pending",
      dueDate: retestForm.dueDate,
    });
    setRetestForm({ student: "", batch: classSchedule[0]?.name || "", subject: "", marks: "", teacher: teachers?.[0]?.name || "", dueDate: "" });
    setIsRetestOpen(false);
    toast.success("Student added to retest queue");
  };

  const allChecklistDone = adminChecklist.every(c => c.done);

  // Build a combined batch list (from schedule + any DB-loaded batches not in schedule)
  const scheduleBatchNames = classSchedule.map(s => s.name);
  const dbOnlyBatches = batches.filter(b => !scheduleBatchNames.includes(b.name));

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Academic Control</h1>

      {/* Collapsible Timetable Quick-Reference */}
      <div className="glass-card p-4">
        <button
          onClick={() => setShowSchedule(v => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" /> Class Schedule Reference
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{classSchedule.length} classes</span>
            {showSchedule ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {showSchedule && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {classSchedule.map(cls => (
              <div key={cls.batchLetter} className={`flex items-center gap-3 p-2.5 rounded-lg border ${timingColor(cls.timing)}`}>
                <span className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">
                  {cls.batchLetter}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{cls.name}</p>
                  <p className="text-[10px] text-muted-foreground">{cls.timing} · Cap: {cls.capacity}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!showSchedule && (
          <div className="mt-3 flex gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Morning — NEET</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">Afternoon — Junior</span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">Evening — Senior</span>
          </div>
        )}
      </div>

      {/* Weekly Plans */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" /> Weekly Plan Allocation
          </h2>
          <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Plan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Weekly Plan</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Class / Batch</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={planForm.batch}
                    onChange={e => setPlanForm({ ...planForm, batch: e.target.value })}
                  >
                    <optgroup label="── From Timetable ──">
                      {classSchedule.map(cls => (
                        <option key={cls.batchLetter} value={cls.name}>
                          [{cls.batchLetter}] {cls.name} — {cls.timing}
                        </option>
                      ))}
                    </optgroup>
                    {dbOnlyBatches.length > 0 && (
                      <optgroup label="── Other Batches ──">
                        {dbOnlyBatches.map(b => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {/* Show timing hint */}
                  {(() => {
                    const match = classSchedule.find(c => c.name === planForm.batch);
                    return match ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {match.timing} · {match.campus} · Batch {match.batchLetter}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Teacher</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={planForm.teacher} onChange={e => setPlanForm({ ...planForm, teacher: e.target.value })}>
                    {teachers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2"><label className="text-sm font-medium">Portion Planned</label><Input value={planForm.portionPlanned} onChange={e => setPlanForm({ ...planForm, portionPlanned: e.target.value })} placeholder="e.g. Chapter 5: Forces" /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Test Date</label><Input type="date" value={planForm.testDate} onChange={e => setPlanForm({ ...planForm, testDate: e.target.value })} /></div>
                <Button className="w-full" onClick={handleAddPlan}>Save Plan</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3 md:space-y-0">
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {weeklyPlans.map((plan) => {
              const cls = classSchedule.find(c => c.name === plan.batch);
              return (
                <div key={plan.id} className="bg-muted/20 rounded-lg p-3 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">{plan.batch}</p>
                      {cls && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{cls.timing}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(plan.status)}`}>{plan.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.teacher} · {plan.portionPlanned}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-2">
                      {plan.status !== "completed" && (
                        <>
                          <button onClick={() => updatePlanStatus(plan.id, "completed")} className="text-xs text-ark-success hover:underline">✓ Complete</button>
                          {plan.status !== "delayed" && <button onClick={() => updatePlanStatus(plan.id, "delayed")} className="text-xs text-ark-danger hover:underline">✗ Delay</button>}
                        </>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-600" onClick={() => handleDeletePlan(plan.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left">
                <th className="pb-3 text-muted-foreground font-medium">Batch</th>
                <th className="pb-3 text-muted-foreground font-medium">Timing</th>
                <th className="pb-3 text-muted-foreground font-medium">Teacher</th>
                <th className="pb-3 text-muted-foreground font-medium">Portion</th>
                <th className="pb-3 text-muted-foreground font-medium">Test Date</th>
                <th className="pb-3 text-muted-foreground font-medium">Status</th>
                <th className="pb-3 text-muted-foreground font-medium text-right">Actions</th>
              </tr></thead>
              <tbody>
                {weeklyPlans.map((plan) => {
                  const cls = classSchedule.find(c => c.name === plan.batch);
                  return (
                    <tr key={plan.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="py-3">
                        <p className="text-foreground font-medium">{plan.batch}</p>
                        {cls && <p className="text-[10px] text-muted-foreground">Batch {cls.batchLetter}</p>}
                      </td>
                      <td className="py-3">
                        {cls ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{cls.timing}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 text-foreground">{plan.teacher}</td>
                      <td className="py-3 text-foreground">{plan.portionPlanned}</td>
                      <td className="py-3 text-muted-foreground">{plan.testDate}</td>
                      <td className="py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusBadge(plan.status)}`}>{plan.status}</span></td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {plan.status !== "completed" && (
                            <div className="flex gap-2">
                              <button onClick={() => updatePlanStatus(plan.id, "completed")} className="text-xs text-ark-success hover:underline">Complete</button>
                              {plan.status !== "delayed" && <button onClick={() => updatePlanStatus(plan.id, "delayed")} className="text-xs text-ark-danger hover:underline">Delay</button>}
                            </div>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => handleDeletePlan(plan.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {weeklyPlans.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No weekly plans found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Retest Allocation */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-accent" /> Retest Allocation Panel
          </h2>
          <Dialog open={isRetestOpen} onOpenChange={setIsRetestOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Student</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Student to Retest</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Student Name</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={retestForm.student} onChange={e => setRetestForm({ ...retestForm, student: e.target.value })}>
                    <option value="">Select student...</option>
                    {students.map(s => <option key={s.id} value={s.name}>{s.name} ({s.batch})</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Class / Batch</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={retestForm.batch} onChange={e => setRetestForm({ ...retestForm, batch: e.target.value })}>
                    <optgroup label="── From Timetable ──">
                      {classSchedule.map(cls => (
                        <option key={cls.batchLetter} value={cls.name}>
                          [{cls.batchLetter}] {cls.name} — {cls.timing}
                        </option>
                      ))}
                    </optgroup>
                    {dbOnlyBatches.length > 0 && (
                      <optgroup label="── Other Batches ──">
                        {dbOnlyBatches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="space-y-2"><label className="text-sm font-medium">Subject</label><Input value={retestForm.subject} onChange={e => setRetestForm({ ...retestForm, subject: e.target.value })} placeholder="e.g. Mathematics" /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Original Marks (%)</label><Input type="number" min="0" max="100" value={retestForm.marks} onChange={e => setRetestForm({ ...retestForm, marks: e.target.value })} placeholder="e.g. 52" /></div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assigned Teacher</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={retestForm.teacher} onChange={e => setRetestForm({ ...retestForm, teacher: e.target.value })}>
                    {teachers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2"><label className="text-sm font-medium">Due Date</label><Input type="date" value={retestForm.dueDate} onChange={e => setRetestForm({ ...retestForm, dueDate: e.target.value })} /></div>
                <Button className="w-full" onClick={handleAddRetest}>Add to Retest Queue</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="space-y-3">
          {retestQueue.map((r) => {
            const cls = classSchedule.find(c => c.name === r.batch);
            return (
              <div key={r.id} className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${r.status === "completed" ? "border-ark-success/30 bg-ark-success/5" : r.status === "allocated" ? "border-blue-500/30 bg-blue-500/5" : "border-ark-warning/30 bg-ark-warning/5"}`}>
                <div>
                  <p className="font-medium text-foreground text-sm">{r.student}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.batch} · {r.subject} · <span className="text-ark-danger font-medium">{r.marks}%</span>
                    {cls && <span className="ml-1 opacity-70">· {cls.timing}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>{r.status}</span>
                  {r.status === "pending" && (
                    <button onClick={() => { allocateRetest(r.id); toast.success("Retest allocated"); }} className="px-3 py-1 bg-accent/20 text-accent rounded-lg text-xs font-medium hover:bg-accent/30 transition-colors">
                      Allocate
                    </button>
                  )}
                  {r.status === "allocated" && (
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max="100" placeholder="Marks" value={retestMarksInput[r.id] || ""}
                        onChange={(e) => setRetestMarksInput(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-16 bg-muted/50 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent" />
                      <button onClick={() => handleCompleteRetest(r.id)} className="px-2 py-1 bg-ark-success/20 text-ark-success rounded text-xs font-medium hover:bg-ark-success/30 transition-colors">Done</button>
                    </div>
                  )}
                  {r.status === "completed" && r.retestMarks !== undefined && (
                    <span className="text-xs text-ark-success font-medium bg-ark-success/10 px-2 rounded">New: {r.retestMarks}%</span>
                  )}
                </div>
              </div>
            );
          })}
          {retestQueue.length === 0 && (
            <div className="py-6 text-center text-muted-foreground text-sm">No retests in queue.</div>
          )}
        </div>
      </div>

      {/* End-of-Day Checklist */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-accent" /> End-of-Day Verification
        </h2>
        <div className="space-y-2">
          {adminChecklist.map((item) => (
            <button key={item.id} onClick={() => toggleChecklistItem(item.id)}
              className={`flex items-center gap-3 p-3 rounded-lg w-full text-left transition-all ${item.done ? "bg-ark-success/10 border border-ark-success/20" : "bg-ark-danger/10 border border-ark-danger/20 hover:bg-ark-danger/15"}`}>
              {item.done ? <CheckCircle2 className="w-5 h-5 text-ark-success flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-ark-danger flex-shrink-0" />}
              <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.label}</span>
            </button>
          ))}
        </div>
        {allChecklistDone && (
          <div className="mt-4 p-3 bg-ark-success/10 border border-ark-success/30 rounded-lg text-center animate-in fade-in zoom-in duration-300">
            <p className="text-sm font-medium text-ark-success flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> All items verified — day can be closed</p>
          </div>
        )}
        {!allChecklistDone && (
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Admin cannot close day until all items are verified
          </p>
        )}
      </div>
    </div>
  );
};

export default AcademicControl;
