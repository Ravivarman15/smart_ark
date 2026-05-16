import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface AcademicYear {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  created_at: string;
}

const AcademicYears: React.FC = () => {
  const { refreshData } = useAppData();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", is_active: false });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("academic_years").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Failed to load academic years");
    else setYears(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", start_date: "", end_date: "", is_active: false });
    setDialogOpen(true);
  };

  const openEdit = (y: AcademicYear) => {
    setEditing(y);
    setForm({ name: y.name, start_date: y.start_date || "", end_date: y.end_date || "", is_active: y.is_active || false });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Year name is required");
    if (editing) {
      const { error } = await supabase.from("academic_years").update({ name: form.name, start_date: form.start_date || null, end_date: form.end_date || null, is_active: form.is_active }).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Academic year updated");
    } else {
      const { error } = await supabase.from("academic_years").insert({ name: form.name, start_date: form.start_date || null, end_date: form.end_date || null, is_active: form.is_active });
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Academic year created");
    }
    setDialogOpen(false);
    load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("academic_years").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Failed to delete: " + error.message); }
    toast.success("Deleted");
    load();
    refreshData();
  };

  const setActive = async (id: string) => {
    // Deactivate all other years first, then activate the selected one
    await supabase.from("academic_years").update({ is_active: false }).neq("id", id);
    await supabase.from("academic_years").update({ is_active: true }).eq("id", id);
    toast.success("Active year updated");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Academic Years</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage academic/session years for the institution</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Year</Button>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Year Name</th>
                <th className="px-5 py-3 font-medium">Start Date</th>
                <th className="px-5 py-3 font-medium">End Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!loading && years.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No academic years found. Add one to get started.</td></tr>
              )}
              {years.map(y => (
                <tr key={y.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{y.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{y.start_date ? new Date(y.start_date).toLocaleDateString() : "-"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{y.end_date ? new Date(y.end_date).toLocaleDateString() : "-"}</td>
                  <td className="px-5 py-3">
                    {y.is_active
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3 h-3" /> Active</span>
                      : <button onClick={() => setActive(y.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/40 border border-border/50 px-2.5 py-1 rounded-full hover:border-accent/40 hover:text-accent transition-colors"><Circle className="w-3 h-3" /> Set Active</button>
                    }
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openEdit(y)}><Pencil className="w-3 h-3" /> Edit</Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(y.id)}><Trash2 className="w-3 h-3" /> Delete</Button>
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
            <AlertDialogTitle>Delete Academic Year?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The academic year will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Academic Year" : "Add Academic Year"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Year Name *</label>
              <Input placeholder="e.g. 2024-25 or Session 2025" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded" />
              <label htmlFor="is_active" className="text-sm font-medium">Mark as Active Year</label>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Create Year"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AcademicYears;
