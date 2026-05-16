import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Standard { id: string; name: string; }
interface Subject { id: string; name: string; code: string | null; standard_id: string | null; }

const Subjects: React.FC = () => {
  const { refreshData } = useAppData();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState({ name: "", code: "", standard_id: "" });
  const [filterStd, setFilterStd] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: sub }, { data: std }] = await Promise.all([
      supabase.from("subjects").select("*").order("name"),
      supabase.from("standards").select("id, name").order("display_order"),
    ]);
    setSubjects(sub || []);
    setStandards(std || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filterStd === "all" ? subjects : subjects.filter(s => s.standard_id === filterStd);
  const getStdName = (id: string | null) => standards.find(s => s.id === id)?.name || "—";

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", code: "", standard_id: standards[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ name: s.name, code: s.code || "", standard_id: s.standard_id || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Subject name is required");
    const payload = { name: form.name, code: form.code || null, standard_id: form.standard_id || null };
    if (editing) {
      const { error } = await supabase.from("subjects").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Subject updated");
    } else {
      const { error } = await supabase.from("subjects").insert(payload);
      if (error) { console.error(error); return toast.error("Failed to add subject: " + error.message); }
      toast.success("Subject added");
    }
    setDialogOpen(false);
    load();
    // Trigger global refresh so other pages (like Student Control) see the new batch
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Failed to delete: " + error.message); }
    toast.success("Subject deleted");
    load();
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Assign Subject</h1>
          <p className="text-sm text-muted-foreground mt-1">Map subjects to standards (e.g. Maths → Grade 10)</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Subject</Button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Filter by Standard:</label>
        <select value={filterStd} onChange={e => setFilterStd(e.target.value)} className="bg-background border border-border rounded-md px-3 py-1.5 text-sm">
          <option value="all">All Standards</option>
          {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Subject Name</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Standard</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No subjects found.</td></tr>}
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{s.code || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{getStdName(s.standard_id)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openEdit(s)}><Pencil className="w-3 h-3" /> Edit</Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(s.id)}><Trash2 className="w-3 h-3" /> Delete</Button>
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
            <AlertDialogTitle>Delete Subject?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the subject. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Subject" : "Add Subject"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject Name *</label>
              <Input placeholder="e.g. Mathematics, Physics" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject Code</label>
              <Input placeholder="e.g. MATH01" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Standard</label>
              <select value={form.standard_id} onChange={e => setForm({ ...form, standard_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="">-- No Standard --</option>
                {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Add Subject"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Subjects;
