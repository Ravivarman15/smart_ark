import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { FileText, Plus, Trash2, CheckCircle2, Circle, Clock, User, AlertTriangle, Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const Reports: React.FC = () => {
  const { meetingNotes, addMeetingNote, deleteMeetingNote, toggleActionItem, alerts, updateMeetingNote } = useAppData();
  const confirm = useConfirm();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formItems, setFormItems] = useState<{ text: string; assignedTo: string; dueDate: string }[]>([{ text: "", assignedTo: "", dueDate: "" }]);
  const [selectedAlertId, setSelectedAlertId] = useState("");

  const handleAddItem = () => setFormItems([...formItems, { text: "", assignedTo: "", dueDate: "" }]);
  const handleItemChange = (i: number, field: string, value: string) => {
    const updated = [...formItems];
    (updated[i] as any)[field] = value;
    setFormItems(updated);
  };
  const handleRemoveItem = (i: number) => setFormItems(formItems.filter((_, idx) => idx !== i));

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    if (!formTitle.trim()) return toast.error("Please enter a title");
    const items = formItems.filter(t => t.text.trim()).map(item => ({ text: item.text.trim(), done: false, assignedTo: item.assignedTo, dueDate: item.dueDate }));
    if (items.length === 0) return toast.error("Add at least one action item");
    setSaving(true);
    try {
      await addMeetingNote({
        date: formDate,
        title: formTitle.trim(),
        items,
        linkedAlertId: selectedAlertId || undefined,
      });
      setFormTitle("");
      setFormDate(new Date().toISOString().split("T")[0]);
      setFormItems([{ text: "", assignedTo: "", dueDate: "" }]);
      setSelectedAlertId("");
      setIsAddOpen(false);
      toast.success("Meeting note added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save meeting note");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        type: "danger",
        title: "Delete Meeting Note",
        description: "Delete this meeting note? This action cannot be undone.",
        confirmText: "Delete",
      }))
    )
      return;
    try {
      await deleteMeetingNote(id);
      toast.success("Meeting note removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete meeting note");
    }
  };

  const today = new Date().toISOString().split("T")[0];

  // Count overdue action items across all meetings
  const totalOverdue = meetingNotes.reduce((sum, m) =>
    sum + m.items.filter(item => !item.done && item.dueDate && item.dueDate < today).length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Reports & MoM</h1>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> New Meeting</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Meeting Note</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm">Title</label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Weekly Academic Review" />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Date</label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              {/* Link to Alert */}
              <div className="space-y-2">
                <label className="text-sm flex items-center gap-1"><Bell className="w-3 h-3" /> Link to Alert (optional)</label>
                <select value={selectedAlertId} onChange={e => setSelectedAlertId(e.target.value)}
                  className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">None</option>
                  {alerts.map(a => (
                    <option key={a.id} value={String(a.id)}>{a.message.substring(0, 60)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm">Action Items</label>
                {formItems.map((item, i) => (
                  <div key={i} className="space-y-2 p-3 bg-muted/20 rounded-lg border border-border/50">
                    <div className="flex gap-2">
                      <Input value={item.text} onChange={e => handleItemChange(i, "text", e.target.value)} placeholder={`Action item ${i + 1}`} />
                      {formItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="shrink-0 text-red-500 hover:text-red-600" onClick={() => handleRemoveItem(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={item.assignedTo} onChange={e => handleItemChange(i, "assignedTo", e.target.value)} placeholder="Assigned to" />
                      <Input type="date" value={item.dueDate} onChange={e => handleItemChange(i, "dueDate", e.target.value)} />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-1"><Plus className="w-3 h-3" /> Add Item</Button>
              </div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Meeting Note"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="metric-card">
          <p className="text-2xl font-display font-bold text-foreground">{meetingNotes.length}</p>
          <p className="text-xs text-muted-foreground">Total Meetings</p>
        </div>
        <div className="metric-card border-ark-warning/30">
          <p className="text-2xl font-display font-bold text-ark-warning">
            {meetingNotes.reduce((sum, m) => sum + m.items.filter(i => !i.done).length, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Pending Items</p>
        </div>
        <div className="metric-card border-ark-danger/30">
          <AlertTriangle className="w-4 h-4 text-ark-danger" />
          <p className="text-2xl font-display font-bold text-ark-danger">{totalOverdue}</p>
          <p className="text-xs text-muted-foreground">Overdue Items</p>
        </div>
      </div>

      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" /> Meeting Notes & Action Items
        </h2>
        <div className="space-y-4">
          {meetingNotes.map((m) => {
            const pending = m.items.filter(item => !item.done).length;
            const overdue = m.items.filter(item => !item.done && item.dueDate && item.dueDate < today).length;
            const linkedAlert = m.linkedAlertId ? alerts.find(a => String(a.id) === m.linkedAlertId) : null;

            return (
              <div key={m.id} className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.date}</p>
                    {linkedAlert && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-ark-warning/10 text-ark-warning mt-1 inline-flex items-center gap-1">
                        <Bell className="w-2.5 h-2.5" /> Linked: {linkedAlert.message.substring(0, 40)}…
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm text-foreground">{m.items.length} items</p>
                      {pending > 0 && <p className="text-xs text-ark-warning">{pending} pending</p>}
                      {overdue > 0 && <p className="text-xs text-ark-danger animate-pulse">{overdue} overdue! ⚠️</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {m.items.map((item, idx) => {
                    const isOverdue = !item.done && item.dueDate && item.dueDate < today;
                    const daysOverdue = isOverdue ? Math.ceil((new Date(today).getTime() - new Date(item.dueDate!).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    return (
                      <div key={idx} className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors hover:bg-muted/20 ${item.done ? "opacity-60" : ""} ${isOverdue ? "bg-ark-danger/5 border border-ark-danger/10" : ""}`}>
                        <button
                          onClick={async () => {
                            try {
                              await toggleActionItem(m.id, idx);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed to update action item");
                            }
                          }}
                          className="shrink-0"
                        >
                          {item.done
                            ? <CheckCircle2 className="w-4 h-4 text-ark-success" />
                            : <Circle className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                        <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.text}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                          {item.assignedTo && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30"><User className="w-3 h-3" />{item.assignedTo}</span>
                          )}
                          {item.dueDate && (
                            <span className={`flex items-center gap-1 ${isOverdue ? "text-ark-danger font-medium" : ""}`}>
                              <Clock className="w-3 h-3" />{item.dueDate}
                              {isOverdue && <span className="text-ark-danger text-[10px]">({daysOverdue}d late)</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {meetingNotes.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">No meeting notes yet. Click "New Meeting" to add one.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
