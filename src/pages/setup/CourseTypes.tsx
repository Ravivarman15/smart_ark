import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface CourseType { id: string; name: string; description: string | null; created_at: string; }

const CourseTypes: React.FC = () => {
  const { refreshData } = useAppData();
  const [types, setTypes] = useState<CourseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseType | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("course_types").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Failed to load");
    else setTypes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", description: "" }); setDialogOpen(true); };
  const openEdit = (t: CourseType) => { setEditing(t); setForm({ name: t.name, description: t.description || "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Course type name is required");
    const payload = { name: form.name, description: form.description || null };
    if (editing) {
      const { error } = await supabase.from("course_types").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Course type updated");
    } else {
      const { error } = await supabase.from("course_types").insert(payload);
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Course type created");
    }
    setDialogOpen(false);
    load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("course_types").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Cannot delete: " + error.message); }
    toast.success("Deleted");
    load();
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Course Types</h1>
          <p className="text-sm text-muted-foreground mt-1">Define course categories (e.g. Regular, Crash Course, Online)</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Course Type</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-3 text-center text-muted-foreground py-8">Loading...</div>}
        {!loading && types.length === 0 && (
          <div className="col-span-3 glass-card p-8 text-center text-muted-foreground">No course types found. Add one to get started.</div>
        )}
        {types.map(t => (
          <div key={t.id} className="glass-card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{t.name}</h3>
                {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-auto pt-2 border-t border-border/30">
              <Button size="sm" variant="outline" className="flex-1 h-7 gap-1.5 text-xs" onClick={() => openEdit(t)}><Pencil className="w-3 h-3" /> Edit</Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(t.id)}><Trash2 className="w-3 h-3" /> Delete</Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course Type?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the course type. Linked fee structures or batches may be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Course Type" : "Add Course Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Course Type Name *</label>
              <Input placeholder="e.g. Regular, Crash Course, Online" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (Optional)</label>
              <Input placeholder="Brief description of this course type" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Create Course Type"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseTypes;
