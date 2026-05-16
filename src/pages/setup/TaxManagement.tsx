import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2, Percent, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Tax { id: string; name: string; percentage: number; is_active: boolean | null; }

const TaxManagement: React.FC = () => {
  const { refreshData } = useAppData();
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState({ name: "", percentage: "", is_active: true });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("taxes").select("*").order("name");
    if (error) toast.error("Failed to load taxes");
    else setTaxes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", percentage: "", is_active: true }); setDialogOpen(true); };
  const openEdit = (t: Tax) => { setEditing(t); setForm({ name: t.name, percentage: t.percentage.toString(), is_active: t.is_active ?? true }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Tax name is required");
    if (!form.percentage || isNaN(parseFloat(form.percentage))) return toast.error("Valid percentage is required");
    const payload = { name: form.name, percentage: parseFloat(form.percentage), is_active: form.is_active };
    if (editing) {
      const { error } = await supabase.from("taxes").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Tax updated");
    } else {
      const { error } = await supabase.from("taxes").insert(payload);
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Tax created");
    }
    setDialogOpen(false);
    await load();
    refreshData();
  };

  const toggleActive = async (t: Tax) => {
    const { error } = await supabase.from("taxes").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) return toast.error("Failed to update");
    toast.success(`Tax ${t.is_active ? "disabled" : "enabled"}`);
    await load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("taxes").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Cannot delete: " + error.message); }
    toast.success("Tax deleted");
    await load();
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Tax Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure tax rates applied to fee structures</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Tax</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-3 text-center text-muted-foreground py-8">Loading...</div>}
        {!loading && taxes.length === 0 && (
          <div className="col-span-3 glass-card p-8 text-center text-muted-foreground">No taxes configured. Add one to apply to fee structures.</div>
        )}
        {taxes.map(t => (
          <div key={t.id} className={`glass-card p-4 flex flex-col gap-3 border ${t.is_active ? "border-accent/20" : "border-border/40 opacity-60"}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{t.name}</h3>
                <div className="flex items-center gap-1 mt-1 text-2xl font-bold text-accent">
                  <Percent className="w-4 h-4" />
                  {t.percentage}%
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-50 text-green-600 border border-green-200" : "bg-muted text-muted-foreground border border-border/50"}`}>
                {t.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <Button size="sm" variant="outline" className="flex-1 h-7 gap-1.5 text-xs" onClick={() => toggleActive(t)}>
                {t.is_active ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                {t.is_active ? "Disable" : "Enable"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 gap-1.5 text-xs" onClick={() => openEdit(t)}><Pencil className="w-3 h-3" /> Edit</Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(t.id)}><Trash2 className="w-3 h-3" /></Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the tax entry. Fee structures using it may be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Tax" : "Add Tax"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tax Name *</label>
              <Input placeholder="e.g. GST, Service Tax, VAT" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Percentage (%) *</label>
              <Input type="number" step="0.01" placeholder="e.g. 18" value={form.percentage} onChange={e => setForm({ ...form, percentage: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="tax_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded" />
              <label htmlFor="tax_active" className="text-sm font-medium">Active (available to apply on fees)</label>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Create Tax"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaxManagement;
