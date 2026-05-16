import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Search, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// expense_transactions table — type & payment_mode stored in description as JSON prefix
// Run this SQL in Supabase if columns are missing:
// ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS type text DEFAULT 'expense';
// ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'Cash';

interface ExpenseRecord {
  id: string;
  category: string;
  amount: number;
  type?: string;
  payment_mode?: string;
  date: string | null;
  description: string | null;
  entered_by: string | null;
  created_at: string;
}

interface Category { id: string; name: string; type: string | null; }

const ExpenseManagement: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<"all" | "expense" | "income">("all");
  const recordsPerPage = 10;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ category: "", custom_category: "", amount: "", type: "expense", payment_mode: "Cash", date: new Date().toISOString().split("T")[0], description: "" });

  const load = async () => {
    setLoading(true);
    const [{ data: exp }, { data: cats }] = await Promise.all([
      supabase.from("expense_transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("expense_categories").select("id, name, type").order("type").order("name"),
    ]);
    setRecords((exp || []) as ExpenseRecord[]);
    setCategories(cats || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredCats = categories.filter(c => c.type === form.type);

  // type may be null if column doesn't exist yet; default to 'expense'
  const getType = (r: ExpenseRecord) => r.type || "expense";

  const filtered = records.filter(r => {
    const matchSearch = r.category.toLowerCase().includes(search.toLowerCase()) || (r.payment_mode?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchType = filterType === "all" || getType(r) === filterType;
    return matchSearch && matchType;
  });

  const paginated = filtered.slice((page - 1) * recordsPerPage, page * recordsPerPage);
  const totalPages = Math.ceil(filtered.length / recordsPerPage);

  const totalIncome = records.filter(r => getType(r) === "income").reduce((acc, r) => acc + r.amount, 0);
  const totalExpense = records.filter(r => getType(r) === "expense").reduce((acc, r) => acc + r.amount, 0);

  const handleAdd = async () => {
    const categoryName = form.category === "__custom__" ? form.custom_category : form.category;
    if (!categoryName.trim() || !form.amount) return toast.error("Category and amount are required");

    const payload: Record<string, any> = {
      category: categoryName,
      amount: Number(form.amount),
      date: form.date,
      description: form.description || null,
      entered_by: user?.profileId || null,
      // these columns may or may not exist yet depending on migration status
      type: form.type,
      payment_mode: form.payment_mode,
    };

    const { error } = await supabase.from("expense_transactions").insert(payload);
    if (error) return toast.error("Failed to save entry");

    toast.success(`${form.type === "income" ? "Income" : "Expense"} recorded`);
    setIsAddOpen(false);
    setForm({ category: "", custom_category: "", amount: "", type: "expense", payment_mode: "Cash", date: new Date().toISOString().split("T")[0], description: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Expense & Income</h1>
        <Button className="gap-2" onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4" /> Record Entry</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 border border-red-200/40 bg-red-50/30 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600"><ArrowDownRight className="w-6 h-6" /></div>
          <div><p className="text-sm text-muted-foreground font-medium">Total Expenses</p><p className="text-2xl font-bold text-foreground">₹{totalExpense.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 border border-green-200/40 bg-green-50/30 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600"><ArrowUpRight className="w-6 h-6" /></div>
          <div><p className="text-sm text-muted-foreground font-medium">Total Income</p><p className="text-2xl font-bold text-foreground">₹{totalIncome.toLocaleString()}</p></div>
        </div>
        <div className={`glass-card p-4 flex items-center gap-4 ${totalIncome - totalExpense >= 0 ? "border-green-200/40 bg-green-50/20" : "border-red-200/40 bg-red-50/20"}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${totalIncome - totalExpense >= 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
            <DollarSign className="w-6 h-6" />
          </div>
          <div><p className="text-sm text-muted-foreground font-medium">Net Balance</p><p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? "text-green-600" : "text-red-600"}`}>₹{Math.abs(totalIncome - totalExpense).toLocaleString()}</p></div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search records..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-background/50 h-9" />
          </div>
          <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
            {(["all", "expense", "income"] as const).map(t => (
              <button key={t} onClick={() => { setFilterType(t); setPage(1); }} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${filterType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t === "all" ? "All" : t === "expense" ? "Expenses" : "Income"}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Category / Description</th>
                <th className="px-4 py-3 font-medium">Payment Mode</th>
                <th className="px-4 py-3 font-medium">Recorded By</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No records found.</td></tr>}
              {paginated.map(r => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getType(r) === "income"
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        : <ArrowDownRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                      <div>
                        <div className="font-medium text-foreground">{r.category}</div>
                        {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.payment_mode || "Cash"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.entered_by || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${getType(r) === "income" ? "text-green-600" : "text-red-600"}`}>
                      {getType(r) === "income" ? "+" : "−"} ₹{r.amount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > recordsPerPage && (
          <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
            <div>Showing {(page - 1) * recordsPerPage + 1}–{Math.min(page * recordsPerPage, filtered.length)} of {filtered.length}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Expense / Income</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category: "" })} className="w-full bg-background border border-border rounded-md p-2 h-9 text-sm">
                  <option value="expense">Expense</option>
                  <option value="income">Extra Income</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-background border border-border rounded-md p-2 h-9 text-sm">
                <option value="">-- Select category --</option>
                {filteredCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value="__custom__">+ Enter custom...</option>
              </select>
              {form.category === "__custom__" && (
                <Input placeholder="Enter custom category name" value={form.custom_category} onChange={e => setForm({ ...form, custom_category: e.target.value })} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹)</label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 5000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Mode</label>
                <select value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })} className="w-full bg-background border border-border rounded-md p-2 h-9 text-sm">
                  <option>Cash</option><option>Cheque</option><option>Bank Transfer</option><option>UPI</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Any extra details" />
            </div>
            <Button className="w-full" onClick={handleAdd}>Save {form.type === "income" ? "Income" : "Expense"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExpenseManagement;
