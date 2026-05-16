import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Category { id: string; name: string; type: string | null; created_at: string; }

const ExpenseCategories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", type: "expense" });
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("expense_categories").select("*").order("type").order("name");
    if (error) toast.error("Failed to load categories");
    else setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = categories.filter(c => c.type === tab);

  const openAdd = () => { setEditing(null); setForm({ name: "", type: tab }); setDialogOpen(true); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ name: c.name, type: c.type || "expense" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Category name is required");
    const payload = { name: form.name, type: form.type };
    if (editing) {
      const { error } = await supabase.from("expense_categories").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Category updated");
    } else {
      const { error } = await supabase.from("expense_categories").insert(payload);
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Category added");
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Cannot delete: " + error.message); }
    toast.success("Category deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Expense & Income Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage categories used when recording expenses and income</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Category</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("expense")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "expense" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ArrowDownRight className="w-3.5 h-3.5 text-red-500" /> Expense Types
        </button>
        <button
          onClick={() => setTab("income")}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "income" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-green-500" /> Income Types
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-3 text-center text-muted-foreground py-8">Loading...</div>}
        {!loading && filtered.length === 0 && (
          <div className="col-span-3 glass-card p-8 text-center text-muted-foreground">
            No {tab} categories found. Add one to use it when recording entries.
          </div>
        )}
        {filtered.map(c => (
          <div key={c.id} className={`glass-card p-4 flex items-center justify-between border ${c.type === "income" ? "border-green-200/40" : "border-red-200/40"}`}>
            <div className="flex items-center gap-3">
              {c.type === "income"
                ? <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><ArrowUpRight className="w-4 h-4 text-green-600" /></div>
                : <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"><ArrowDownRight className="w-4 h-4 text-red-600" /></div>
              }
              <span className="font-medium text-foreground">{c.name}</span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setPendingDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the category. Existing transactions using it will retain the category name as text.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category Name *</label>
              <Input placeholder={form.type === "expense" ? "e.g. Electricity, Salaries, Maintenance" : "e.g. Fee Income, Donation, Event Income"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Add Category"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseCategories;
