import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Clock, Users, Plus, Edit2, Check, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClassScheduleEntry } from "@/contexts/AppDataContext";

// Mutable local overrides for timing/capacity (session-level state)
const timingGroup = (timing: string): "morning" | "afternoon" | "evening" => {
  if (timing.startsWith("9:") || timing.startsWith("10:") || timing.startsWith("11:") || timing.startsWith("After"))
    return "morning";
  if (timing.startsWith("4:") || timing.startsWith("5:"))
    return "afternoon";
  return "evening";
};

const groupColors = {
  morning:   { bg: "bg-amber-500/10",   border: "border-amber-500/30",  badge: "bg-amber-500/20 text-amber-300",   label: "Morning · NEET" },
  afternoon: { bg: "bg-blue-500/10",    border: "border-blue-500/30",   badge: "bg-blue-500/20 text-blue-300",     label: "Afternoon · Junior" },
  evening:   { bg: "bg-purple-500/10",  border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-300", label: "Evening · Senior" },
};

const seatBarColor = (pct: number) =>
  pct >= 100 ? "bg-ark-danger" : pct >= 80 ? "bg-ark-warning" : "bg-ark-success";

const seatTextColor = (pct: number) =>
  pct >= 100 ? "text-ark-danger" : pct >= 80 ? "text-ark-warning" : "text-ark-success";

const TimetableView: React.FC = () => {
  const { students, addStudent, classSchedule, updateClassSchedule } = useAppData();

  const [editingLetter, setEditingLetter] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ timing: "", capacity: "" });

  // Add-student quick dialog
  const [addStudentBatch, setAddStudentBatch] = useState<string>("");
  const [addForm, setAddForm] = useState({ name: "", spi: "", risk: "safe" });
  const [isAddOpen, setIsAddOpen] = useState(false);

  const activeStudents = students.filter(s => s.active !== false);

  const schedule = classSchedule;

  const enrolledCount = (batchName: string) => activeStudents.filter(s => s.batch === batchName).length;

  const openEdit = (cls: typeof schedule[0]) => {
    setEditingLetter(cls.batchLetter);
    setEditForm({ timing: cls.timing, capacity: String(cls.capacity) });
  };

  const saveEdit = (letter: string, name: string) => {
    const cap = parseInt(editForm.capacity);
    if (!editForm.timing.trim() || isNaN(cap) || cap < 1) return toast.error("Enter valid timing and capacity");
    updateClassSchedule(name, { timing: editForm.timing.trim(), capacity: cap });
    setEditingLetter(null);
    toast.success("Class updated");
  };

  const openAddStudent = (batchName: string) => {
    setAddStudentBatch(batchName);
    setAddForm({ name: "", spi: "", risk: "safe" });
    setIsAddOpen(true);
  };

  const [addingStudent, setAddingStudent] = useState(false);

  const handleAddStudent = async () => {
    if (!addForm.name.trim()) return toast.error("Enter student name");
    setAddingStudent(true);
    try {
      await addStudent({ name: addForm.name.trim(), batch: addStudentBatch, spi: Number(addForm.spi) || 0, risk: addForm.risk as any });
      toast.success(`${addForm.name} added to ${addStudentBatch}`);
      setIsAddOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setAddingStudent(false);
    }
  };

  const groups = ["morning", "afternoon", "evening"] as const;

  // Total stats
  const totalCapacity = schedule.reduce((s, c) => s + c.capacity, 0);
  const totalEnrolled = schedule.reduce((s, c) => s + enrolledCount(c.name), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-6 h-6 text-accent" /> Class Timetable
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {schedule.length} classes · {totalEnrolled}/{totalCapacity} seats filled
          </p>
        </div>
        {/* Quick add student dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Student to {addStudentBatch}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Name</label><Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Student Name" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">SPI (0–100)</label><Input type="number" value={addForm.spi} onChange={e => setAddForm(f => ({ ...f, spi: e.target.value }))} placeholder="e.g. 78" /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Risk Level</label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={addForm.risk} onChange={e => setAddForm(f => ({ ...f, risk: e.target.value }))}>
                  <option value="safe">Safe</option>
                  <option value="watch">Watch</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <Button className="w-full" onClick={handleAddStudent} disabled={addingStudent}>{addingStudent ? "Adding…" : "Add Student"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary legend */}
      <div className="flex flex-wrap gap-3">
        {groups.map(g => (
          <div key={g} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${groupColors[g].badge} ${groupColors[g].border}`}>
            <span className={`w-2 h-2 rounded-full ${g === "morning" ? "bg-amber-400" : g === "afternoon" ? "bg-blue-400" : "bg-purple-400"}`} />
            {groupColors[g].label}
          </div>
        ))}
      </div>

      {/* Grouped by time of day */}
      {groups.map(group => {
        const cls = schedule.filter(c => timingGroup(c.timing) === group);
        if (!cls.length) return null;
        const gc = groupColors[group];
        return (
          <div key={group} className={`glass-card p-4 md:p-5 border ${gc.border}`}>
            <h2 className={`font-display font-semibold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider`}>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${gc.badge}`}>{gc.label}</span>
              <span className="text-muted-foreground font-normal">{cls.length} class{cls.length > 1 ? "es" : ""}</span>
            </h2>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 text-muted-foreground font-medium text-xs w-8">Batch</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Class Name</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Timing</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Campus</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Enrolled</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Capacity</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs">Seats</th>
                    <th className="pb-2 text-muted-foreground font-medium text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cls.map(c => {
                    const enrolled = enrolledCount(c.name);
                    const pct = Math.round((enrolled / c.capacity) * 100);
                    const isEditing = editingLetter === c.batchLetter;
                    return (
                      <tr key={c.batchLetter} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                        <td className="py-3">
                          <span className="w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
                            {c.batchLetter}
                          </span>
                        </td>
                        <td className="py-3 font-medium text-foreground">{c.name}</td>
                        <td className="py-3 text-muted-foreground text-xs">
                          {isEditing ? (
                            <Input value={editForm.timing} onChange={e => setEditForm(f => ({ ...f, timing: e.target.value }))} className="h-7 text-xs w-40" />
                          ) : (
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.timing}</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground text-xs">{c.campus}</td>
                        <td className="py-3">
                          <span className={`font-semibold text-sm ${seatTextColor(pct)}`}>{enrolled}</span>
                        </td>
                        <td className="py-3">
                          {isEditing ? (
                            <Input type="number" value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: e.target.value }))} className="h-7 text-xs w-16" />
                          ) : (
                            <span className="text-muted-foreground">{c.capacity}</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${seatBarColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${seatTextColor(pct)}`}>{pct}%</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-ark-success" onClick={() => saveEdit(c.batchLetter, c.name)}><Check className="w-3 h-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-ark-danger" onClick={() => setEditingLetter(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(c)}><Edit2 className="w-3 h-3" /></Button>
                                {enrolled < c.capacity && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openAddStudent(c.name)}>
                                    <Plus className="w-3 h-3" />Add
                                  </Button>
                                )}
                                {enrolled >= c.capacity && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-ark-danger/20 text-ark-danger">Full</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {cls.map(c => {
                const enrolled = enrolledCount(c.name);
                const pct = Math.round((enrolled / c.capacity) * 100);
                return (
                  <div key={c.batchLetter} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                    <span className="w-8 h-8 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {c.batchLetter}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{c.timing}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${seatBarColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className={`text-[10px] font-semibold ${seatTextColor(pct)}`}>{enrolled}/{c.capacity}</span>
                      </div>
                    </div>
                    {enrolled < c.capacity && (
                      <button onClick={() => openAddStudent(c.name)} className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center hover:bg-accent/30 transition-colors">
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Overall stats footer */}
      <div className="glass-card p-4">
        <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" /> Overall Enrollment Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-foreground">{schedule.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Classes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-foreground">{totalCapacity}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Capacity</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-accent">{totalEnrolled}</p>
            <p className="text-xs text-muted-foreground mt-1">Enrolled Students</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-ark-success">{totalCapacity - totalEnrolled}</p>
            <p className="text-xs text-muted-foreground mt-1">Available Seats</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Overall fill rate</span>
            <span>{Math.round((totalEnrolled / totalCapacity) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${seatBarColor(Math.round((totalEnrolled / totalCapacity) * 100))}`}
              style={{ width: `${Math.min(Math.round((totalEnrolled / totalCapacity) * 100), 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimetableView;
