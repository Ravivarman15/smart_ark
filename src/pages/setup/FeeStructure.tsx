import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
// useAuth no longer needed — created_by column doesn't exist on fee_structures
import { useAppData } from "@/contexts/AppDataContext";
import { Plus, Pencil, Trash2, Percent, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface FeeStructure {
  id: string; name: string; course_type_id: string | null; standard_id: string | null;
  total_amount: number | null; tax_id: string | null; academic_year_id: string | null;
  seat_confirmation_amount: number | null; first_payment_amount: number | null;
  installment_count: number | null; created_at: string;
}
interface CourseType { id: string; name: string; }
interface Standard { id: string; name: string; }
interface Tax { id: string; name: string; percentage: number; }
interface AcademicYear { id: string; name: string; }

const FeeStructure: React.FC = () => {
  const { refreshData } = useAppData();
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [form, setForm] = useState({
    name: "", course_type_id: "", standard_id: "", total_amount: "",
    tax_id: "", academic_year_id: "",
    seat_confirmation_amount: "", first_payment_amount: "", installment_count: "2",
  });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: ct }, { data: std }, { data: t }, { data: y }] = await Promise.all([
      supabase.from("fee_structures").select("*").order("created_at", { ascending: false }),
      supabase.from("course_types").select("id, name"),
      supabase.from("standards").select("id, name").order("display_order", { ascending: true }),
      supabase.from("taxes").select("id, name, percentage").eq("is_active", true),
      supabase.from("academic_years").select("id, name").order("created_at", { ascending: false }),
    ]);
    setStructures((s || []) as FeeStructure[]);
    setCourseTypes(ct || []);
    setStandards(std || []);
    setTaxes(t || []);
    setYears(y || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getName = (arr: any[], id: string | null) => arr.find(a => a.id === id)?.name || "—";
  const getTax = (id: string | null) => {
    const t = taxes.find(t => t.id === id);
    return t ? `${t.name} (${t.percentage}%)` : "—";
  };
  const getTaxAmount = (amount: number | null, taxId: string | null) => {
    if (!amount || !taxId) return 0;
    const t = taxes.find(t => t.id === taxId);
    return t ? (amount * t.percentage / 100) : 0;
  };

  // Calculate installment amounts for display
  const calcInstallments = (s: FeeStructure) => {
    const total = s.total_amount || 0;
    const taxAmt = getTaxAmount(s.total_amount, s.tax_id);
    const grossTotal = total + taxAmt;
    const seatConf = s.seat_confirmation_amount || 0;
    const firstPay = s.first_payment_amount || 0;
    const remaining = grossTotal - seatConf - firstPay;
    const count = s.installment_count || 2;
    const perInstallment = count > 0 ? Math.round(remaining / count) : 0;
    return { grossTotal, remaining, perInstallment, count };
  };

  const openAdd = () => {
    setEditing(null);
    const activeYear = years[0];
    setForm({
      name: "", course_type_id: courseTypes[0]?.id || "", standard_id: standards[0]?.id || "",
      total_amount: "", tax_id: "", academic_year_id: activeYear?.id || "",
      seat_confirmation_amount: "", first_payment_amount: "", installment_count: "2",
    });
    setDialogOpen(true);
  };

  const openEdit = (s: FeeStructure) => {
    setEditing(s);
    setForm({
      name: s.name, course_type_id: s.course_type_id || "", standard_id: s.standard_id || "",
      total_amount: s.total_amount?.toString() || "", tax_id: s.tax_id || "",
      academic_year_id: s.academic_year_id || "",
      seat_confirmation_amount: s.seat_confirmation_amount?.toString() || "",
      first_payment_amount: s.first_payment_amount?.toString() || "",
      installment_count: s.installment_count?.toString() || "2",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Structure name is required");
    if (!form.total_amount) return toast.error("Total amount is required");
    const payload: any = {
      name: form.name,
      course_type_id: form.course_type_id || null,
      standard_id: form.standard_id || null,
      total_amount: parseFloat(form.total_amount),
      tax_id: form.tax_id || null,
      academic_year_id: form.academic_year_id || null,
      seat_confirmation_amount: form.seat_confirmation_amount ? parseFloat(form.seat_confirmation_amount) : 0,
      first_payment_amount: form.first_payment_amount ? parseFloat(form.first_payment_amount) : 0,
      installment_count: parseInt(form.installment_count) || 2,
    };
    if (editing) {
      const { error } = await supabase.from("fee_structures").update(payload).eq("id", editing.id);
      if (error) { console.error(error); return toast.error("Failed to update: " + error.message); }
      toast.success("Fee structure updated");
    } else {
      const { error } = await supabase.from("fee_structures").insert([payload]);
      if (error) { console.error(error); return toast.error("Failed to create: " + error.message); }
      toast.success("Fee structure created");
    }
    setDialogOpen(false);
    await load();
    refreshData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("fee_structures").delete().eq("id", id);
    if (error) { console.error(error); return toast.error("Cannot delete: " + error.message); }
    toast.success("Fee structure deleted");
    await load();
    refreshData();
  };

  // Live preview of installment breakdown
  const previewTotal = form.total_amount ? parseFloat(form.total_amount) : 0;
  const previewTaxAmt = (() => {
    if (!previewTotal || !form.tax_id) return 0;
    const t = taxes.find(t => t.id === form.tax_id);
    return t ? previewTotal * t.percentage / 100 : 0;
  })();
  const previewGross = previewTotal + previewTaxAmt;
  const previewSeat = form.seat_confirmation_amount ? parseFloat(form.seat_confirmation_amount) : 0;
  const previewFirst = form.first_payment_amount ? parseFloat(form.first_payment_amount) : 0;
  const previewRemaining = previewGross - previewSeat - previewFirst;
  const previewCount = parseInt(form.installment_count) || 2;
  const previewPerInst = previewCount > 0 && previewRemaining > 0 ? Math.round(previewRemaining / previewCount) : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Fee Structures</h1>
          <p className="text-sm text-muted-foreground mt-1">Create fee templates with installment plans for student admission</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Create Fee Structure</Button>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-5 py-3 font-medium">Structure Name</th>
                <th className="px-5 py-3 font-medium">Academic Year</th>
                <th className="px-5 py-3 font-medium">Standard</th>
                <th className="px-5 py-3 font-medium">Total Fee</th>
                <th className="px-5 py-3 font-medium">Seat Conf.</th>
                <th className="px-5 py-3 font-medium">1st Payment</th>
                <th className="px-5 py-3 font-medium">Installments</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && structures.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">No fee structures found. Create one to use in admission.</td></tr>
              )}
              {structures.map(s => {
                const { grossTotal, perInstallment, count } = calcInstallments(s);
                return (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{getName(years, s.academic_year_id)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{getName(standards, s.standard_id)}</td>
                    <td className="px-5 py-3 font-medium">₹{grossTotal.toLocaleString()}</td>
                    <td className="px-5 py-3 text-muted-foreground">₹{(s.seat_confirmation_amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-muted-foreground">₹{(s.first_payment_amount || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="text-xs">{count}×</span> ₹{perInstallment.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openEdit(s)}><Pencil className="w-3 h-3" /> Edit</Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setPendingDelete(s.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee Structure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the fee structure. Students linked to it must be reassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Fee Structure" : "Create Fee Structure"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Basic Info */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Structure Name *</label>
              <Input placeholder="e.g. Regular 2025 – Grade 10" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Academic Year</label>
                <select value={form.academic_year_id} onChange={e => setForm({ ...form, academic_year_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">-- Select Year --</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Standard</label>
                <select value={form.standard_id} onChange={e => setForm({ ...form, standard_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">-- Select Standard --</option>
                  {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Course Type</label>
                <select value={form.course_type_id} onChange={e => setForm({ ...form, course_type_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">-- Select Type --</option>
                  {courseTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apply Tax</label>
                <select value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">No Tax</option>
                  {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>)}
                </select>
              </div>
            </div>

            <div className="border-t border-border/40 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Percent className="w-3 h-3" /> Payment Schedule</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base Amount (₹) *</label>
                  <Input type="number" placeholder="e.g. 60000" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Seat Confirmation (₹)</label>
                  <Input type="number" placeholder="e.g. 5000" value={form.seat_confirmation_amount} onChange={e => setForm({ ...form, seat_confirmation_amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">First Payment (₹)</label>
                  <Input type="number" placeholder="e.g. 16500" value={form.first_payment_amount} onChange={e => setForm({ ...form, first_payment_amount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">No. of Installments</label>
                  <select value={form.installment_count} onChange={e => setForm({ ...form, installment_count: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                    <option value="2">2 Installments</option>
                    <option value="3">3 Installments</option>
                    <option value="4">4 Installments</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Live Breakdown Preview */}
            {previewTotal > 0 && (
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold text-foreground flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-accent" /> Payment Breakdown Preview</p>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex justify-between"><span>Base Amount</span><span className="font-medium text-foreground">₹{previewTotal.toLocaleString()}</span></div>
                  {previewTaxAmt > 0 && <div className="flex justify-between"><span>Tax ({taxes.find(t => t.id === form.tax_id)?.percentage}%)</span><span>+ ₹{previewTaxAmt.toLocaleString()}</span></div>}
                  <div className="flex justify-between font-medium text-foreground border-t border-border/40 pt-1 mt-1"><span>Gross Total</span><span>₹{previewGross.toLocaleString()}</span></div>
                  {previewSeat > 0 && <div className="flex justify-between"><span>Step 1 — Seat Confirmation</span><span className="text-green-600">₹{previewSeat.toLocaleString()}</span></div>}
                  {previewFirst > 0 && <div className="flex justify-between"><span>Step 2 — First Payment</span><span className="text-green-600">₹{previewFirst.toLocaleString()}</span></div>}
                  <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-1 mt-1">
                    <span>Step 3 — Balance ({previewCount} installments)</span>
                    <span>₹{previewRemaining > 0 ? previewRemaining.toLocaleString() : 0}</span>
                  </div>
                  {previewPerInst > 0 && (
                    <div className="flex justify-between pl-4 text-xs"><span>Each installment</span><span>≈ ₹{previewPerInst.toLocaleString()}</span></div>
                  )}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSave}>{editing ? "Save Changes" : "Create Fee Structure"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeeStructure;
