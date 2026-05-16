import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Standard { id: string; name: string; display_order: number | null; }

const Standards: React.FC = () => {
  const { refreshData } = useAppData();
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Standard | null>(null);
  const [form, setForm] = useState({ name: "", display_order: "" });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: s } = await supabase.from("standards").select("*").order("display_order", { ascending: true });
    setStandards(s || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", display_order: "" });
    setDialogOpen(true);
  };

  const openEdit = (s: Standard) => {
    setEditing(s);
    setForm({ name: s.name, display_order: s.display_order?.toString() || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Standard name is required");
    const payload = { name: form.name, display_order: form.display_order ? parseInt(form.display_order) : null };
    if (editing) {
      const { error } = await supabase.from("standards").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Standard updated");
    } else {
      const { error } = await supabase.from("standards").insert(payload);
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Standard added");
    }
    setDialogOpen(false);
    load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("standards").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Failed to delete: " + error.message); }
    toast.success("Standard deleted");
    load();
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Assign Standard</h1>
          <p className="text-sm text-muted-foreground mt-1">Define class standards / levels (e.g. Grade 1, Primary, JEE Mains)</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Standard</Button>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Standard Name</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && standards.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">No standards found. Add one to get started.</td></tr>}
              {standards.map(s => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">{s.display_order ?? "-"}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
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
            <AlertDialogTitle>Delete Standard?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the standard. Any linked subjects may become orphaned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Standard" : "Add Standard"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Standard Name *</label>
              <Input placeholder="e.g. Grade 1, JEE Mains, Primary" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Order</label>
              <Input type="number" placeholder="e.g. 1" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Add Standard"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Standards;
