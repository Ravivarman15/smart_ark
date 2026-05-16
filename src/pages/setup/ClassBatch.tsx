import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Batch {
  id: string; name: string; campus_id: string; standard_id: string | null;
  timing_start: string | null; timing_end: string | null;
  health: string | null; teacher_responsible: string | null;
}
interface Campus { id: string; name: string; }
interface Standard { id: string; name: string; }

const HEALTH_OPTIONS = ["strong", "moderate", "risk"];

const ClassBatch: React.FC = () => {
  const { refreshData } = useAppData();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState({ name: "", campus_id: "", standard_id: "", timing_start: "", timing_end: "", health: "moderate" });
  const [filterCampus, setFilterCampus] = useState("all");
  const [filterStandard, setFilterStandard] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: b, error: bErr }, { data: c }, { data: s }] = await Promise.all([
      // Use select("*") so the query doesn't error if standard_id isn't migrated yet
      (supabase as any).from("batches").select("*").order("name"),
      supabase.from("campuses").select("id, name"),
      supabase.from("standards").select("id, name").order("display_order", { ascending: true }),
    ]);
    if (bErr) toast.error("Failed to load batches: " + bErr.message);
    setBatches((b || []) as Batch[]);
    setCampuses(c || []);
    setStandards(s || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = batches.filter(b => {
    if (filterCampus !== "all" && b.campus_id !== filterCampus) return false;
    if (filterStandard !== "all" && (b.standard_id || "") !== filterStandard) return false;
    return true;
  });
  const getCampusName = (id: string | null) => campuses.find(c => c.id === id)?.name || "—";
  const getStdName = (id: string | null) => standards.find(s => s.id === id)?.name || "—";

  const healthColor = (h: string | null) => {
    if (h === "strong") return "text-green-600 bg-green-50 border-green-200";
    if (h === "moderate") return "text-yellow-600 bg-yellow-50 border-yellow-200";
    if (h === "risk") return "text-red-600 bg-red-50 border-red-200";
    return "text-muted-foreground bg-muted/30 border-border/50";
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", campus_id: campuses[0]?.id || "", standard_id: standards[0]?.id || "", timing_start: "", timing_end: "", health: "moderate" });
    setDialogOpen(true);
  };

  const openEdit = (b: Batch) => {
    setEditing(b);
    setForm({ name: b.name, campus_id: b.campus_id || "", standard_id: b.standard_id || "", timing_start: b.timing_start || "", timing_end: b.timing_end || "", health: b.health || "moderate" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Batch name is required");
    const payload: any = {
      name: form.name,
      campus_id: form.campus_id || null,
      standard_id: form.standard_id || null,
      timing_start: form.timing_start || null,
      timing_end: form.timing_end || null,
      health: form.health,
    };
    if (editing) {
      const { error } = await supabase.from("batches").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Batch updated");
    } else {
      const { error } = await supabase.from("batches").insert({ ...payload, avg_marks: 0, portion_complete: 0, retest_rate: 0 });
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Batch created");
    }
    setDialogOpen(false);
    load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("batches").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Cannot delete: " + error.message); }
    toast.success("Batch deleted");
    load();
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Class / Batch</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage class batches — link each batch to a standard for student assignment</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Batch</Button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Campus:</label>
          <select value={filterCampus} onChange={e => setFilterCampus(e.target.value)} className="bg-background border border-border rounded-md px-3 py-1.5 text-sm">
            <option value="all">All</option>
            {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Standard:</label>
          <select value={filterStandard} onChange={e => setFilterStandard(e.target.value)} className="bg-background border border-border rounded-md px-3 py-1.5 text-sm">
            <option value="all">All</option>
            {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Batch Name</th>
                <th className="px-5 py-3 font-medium">Standard</th>
                <th className="px-5 py-3 font-medium">Campus</th>
                <th className="px-5 py-3 font-medium">Timing</th>
                <th className="px-5 py-3 font-medium">Teacher</th>
                <th className="px-5 py-3 font-medium">Health</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No batches found.</td></tr>}
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{getStdName(b.standard_id)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{getCampusName(b.campus_id)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {b.timing_start && b.timing_end ? `${b.timing_start} – ${b.timing_end}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{b.teacher_responsible || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${healthColor(b.health)}`}>{b.health || "—"}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openEdit(b)}><Pencil className="w-3 h-3" /> Edit</Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(b.id)}><Trash2 className="w-3 h-3" /> Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class / Batch?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the batch. Students assigned to it will need to be reassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Batch" : "Add Class / Batch"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch Name *</label>
              <Input placeholder="e.g. Batch A, Morning Batch, JEE 2025" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Standard</label>
                <select value={form.standard_id} onChange={e => setForm({ ...form, standard_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">-- No Standard --</option>
                  {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus</label>
                <select value={form.campus_id} onChange={e => setForm({ ...form, campus_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">-- Select Campus --</option>
                  {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Time</label>
                <Input type="time" value={form.timing_start} onChange={e => setForm({ ...form, timing_start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Time</label>
                <Input type="time" value={form.timing_end} onChange={e => setForm({ ...form, timing_end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Health Status</label>
              <select value={form.health} onChange={e => setForm({ ...form, health: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                {HEALTH_OPTIONS.map(h => <option key={h} value={h} className="capitalize">{h.charAt(0).toUpperCase() + h.slice(1)}</option>)}
              </select>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Create Batch"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassBatch;
