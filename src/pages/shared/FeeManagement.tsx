import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign, Search, Receipt, Percent, CreditCard,
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle, CalendarClock, Pencil,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ── Installment helpers ────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];

const INST_MODES = [
  { label: "Monthly",     months: 1  },
  { label: "Quarterly",   months: 3  },
  { label: "Half-Yearly", months: 6  },
  { label: "Weekly",      days:   7  },
  { label: "Fortnightly", days:  14  },
] as const;

type InstMode = typeof INST_MODES[number];

function advanceDate(d: Date, mode: InstMode): Date {
  const r = new Date(d);
  if ("months" in mode && mode.months) r.setMonth(r.getMonth() + mode.months);
  else if ("days" in mode && mode.days) r.setDate(r.getDate() + mode.days);
  return r;
}

function buildSchedule(pending: number, count: number, start: Date, mode: InstMode) {
  if (count <= 0) return [];
  const base    = Math.floor((pending / count) * 100) / 100;
  const lastAmt = Math.round((pending - base * (count - 1)) * 100) / 100;
  const rows: { date: Date; amount: number }[] = [];
  let cur = new Date(start);
  for (let i = 0; i < count; i++) {
    rows.push({ date: new Date(cur), amount: i === count - 1 ? lastAmt : base });
    if (i < count - 1) cur = advanceDate(cur, mode);
  }
  return rows;
}

interface StudentFee {
  id: string;
  student_id: string;
  fee_structure_id: string | null;
  student_name: string | null;
  batch_name: string | null;
  total_amount: number;
  seat_confirmation_amount: number;
  first_payment_amount: number;
  installment_count: number;
  discount_amount: number;
  amount_received: number;
  amount_pending: number;
  due_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

interface FeeInstallment {
  id: string;
  student_fee_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  receipt_no: string | null;
  notes: string | null;
  created_at: string;
}

const statusColor = (status: string | null, pending: number) => {
  if (pending <= 0) return "text-green-600 bg-green-50 border-green-200";
  if (status === "overdue") return "text-red-600 bg-red-50 border-red-200";
  return "text-yellow-600 bg-yellow-50 border-yellow-200";
};

const FeeManagement: React.FC = () => {
  const { user } = useAuth();
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [installments, setInstallments] = useState<Record<string, FeeInstallment[]>>({});
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Discount dialog
  const [discountTarget, setDiscountTarget] = useState<StudentFee | null>(null);
  const [discountAmt, setDiscountAmt] = useState("");

  // Payment dialog
  const [paymentTarget, setPaymentTarget] = useState<StudentFee | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "Cash", notes: "" });
  const [paying, setPaying] = useState(false);

  // Due date dialog
  const [dueDateTarget, setDueDateTarget] = useState<StudentFee | null>(null);
  const [dueDate, setDueDate] = useState("");

  // Installment dialog
  const [instTarget,   setInstTarget]   = useState<StudentFee | null>(null);
  const [instModeIdx,  setInstModeIdx]  = useState(0);
  const [instCount,    setInstCount]    = useState(10);
  const [instMonth,    setInstMonth]    = useState(new Date().getMonth());
  const [instDay,      setInstDay]      = useState(new Date().getDate());
  const [instYear,     setInstYear]     = useState(new Date().getFullYear());
  const [scheduling,   setScheduling]   = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<StudentFee | null>(null);
  const [editForm, setEditForm] = useState({
    total_amount: "", seat_confirmation_amount: "", first_payment_amount: "",
    installment_count: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Receipt preview
  const [receiptData, setReceiptData] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("student_fees")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (error.message?.includes("student_fees") || error.message?.includes("schema cache") || error.message?.includes("does not exist")) {
        setMigrationNeeded(true);
      } else {
        toast.error("Failed to load fees: " + error.message);
      }
    } else {
      setMigrationNeeded(false);
    }
    setFees((data || []) as StudentFee[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadInstallments = async (feeId: string) => {
    if (installments[feeId]) return; // already loaded
    const { data } = await supabase
      .from("fee_installments")
      .select("*")
      .eq("student_fee_id", feeId)
      .order("payment_date", { ascending: false });
    setInstallments(prev => ({ ...prev, [feeId]: (data || []) as FeeInstallment[] }));
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      loadInstallments(id);
    }
    setExpanded(next);
  };

  // Filtered / paginated
  const filtered = fees.filter(f =>
    !search ||
    (f.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.batch_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // Summaries
  const totalCollected = fees.reduce((s, f) => s + f.amount_received, 0);
  const totalPending = fees.reduce((s, f) => s + f.amount_pending, 0);
  const totalFees = fees.reduce((s, f) => s + f.total_amount, 0);

  // ── Apply Discount ───────────────────────────────────────────
  const applyDiscount = async () => {
    if (!discountTarget || !discountAmt) return;
    const discount = parseFloat(discountAmt);
    if (isNaN(discount) || discount < 0) return toast.error("Invalid discount amount");
    const adjustedTotal = discountTarget.total_amount - discount;
    const newPending = adjustedTotal - discountTarget.amount_received;
    const { error } = await supabase
      .from("student_fees")
      .update({ discount_amount: discount, amount_pending: Math.max(0, newPending) })
      .eq("id", discountTarget.id);
    if (error) return toast.error("Failed to apply discount: " + error.message);
    toast.success("Discount applied — fee recalculated");
    setDiscountTarget(null);
    setDiscountAmt("");
    await load();
  };

  // ── Collect Payment ──────────────────────────────────────────
  const collectPayment = async () => {
    if (!paymentTarget || !payForm.amount) return;
    const amount = parseFloat(payForm.amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Invalid payment amount");
    if (amount > paymentTarget.amount_pending) return toast.error("Payment exceeds pending amount");

    setPaying(true);
    try {
      const receiptNo = `REC-${Date.now().toString(36).toUpperCase()}`;
      const today = new Date().toISOString().split("T")[0];

      // Insert installment record
      const { error: instErr } = await supabase.from("fee_installments").insert({
        student_fee_id: paymentTarget.id,
        amount,
        payment_date: today,
        payment_method: payForm.method,
        receipt_no: receiptNo,
        notes: payForm.notes || null,
        created_by: user?.profileId || null,
      });
      if (instErr) return toast.error("Failed to record payment: " + instErr.message);

      // Update student_fees totals
      const newReceived = paymentTarget.amount_received + amount;
      const newPending = paymentTarget.amount_pending - amount;
      const { error: feeErr } = await supabase
        .from("student_fees")
        .update({
          amount_received: newReceived,
          amount_pending: Math.max(0, newPending),
          status: newPending <= 0 ? "paid" : "partial",
        })
        .eq("id", paymentTarget.id);
      if (feeErr) return toast.error("Failed to update fee record: " + feeErr.message);

      toast.success(`₹${amount.toLocaleString()} collected — Receipt ${receiptNo}`);

      // Show receipt
      setReceiptData({
        studentName: paymentTarget.student_name,
        batchName: paymentTarget.batch_name,
        amount,
        receiptNo,
        paymentMethod: payForm.method,
        date: today,
      });

      setPaymentTarget(null);
      setPayForm({ amount: "", method: "Cash", notes: "" });
      // Reload installments for this fee
      setInstallments(prev => ({ ...prev, [paymentTarget.id]: [] }));
      await load();
    } finally {
      setPaying(false);
    }
  };

  // ── Set Due Date ──────────────────────────────────────────────
  const saveDueDate = async () => {
    if (!dueDateTarget || !dueDate) return;
    const { error } = await supabase.from("student_fees").update({ due_date: dueDate }).eq("id", dueDateTarget.id);
    if (error) return toast.error("Failed: " + error.message);
    toast.success("Due date set");
    setDueDateTarget(null);
    setDueDate("");
    await load();
  };

  // ── Installment schedule ─────────────────────────────────────────────────
  const instMode     = INST_MODES[instModeIdx];
  const instStartDate = useMemo(
    () => new Date(instYear, instMonth, Math.min(instDay, 28)),
    [instYear, instMonth, instDay]
  );
  const instSchedule = useMemo(
    () => instTarget && instCount > 0
      ? buildSchedule(instTarget.amount_pending, instCount, instStartDate, instMode)
      : [],
    [instTarget, instCount, instStartDate, instMode]
  );
  const instAmountEach = instTarget && instCount > 0
    ? Math.floor((instTarget.amount_pending / instCount) * 100) / 100
    : 0;

  const openInstallmentDialog = (f: StudentFee) => {
    setInstTarget(f);
    setInstModeIdx(0);
    setInstCount(f.installment_count > 0 ? f.installment_count : 10);
    const now = new Date();
    setInstMonth(now.getMonth());
    setInstDay(now.getDate());
    setInstYear(now.getFullYear());
  };

  const handleScheduleInstallments = async () => {
    if (!instTarget || instSchedule.length === 0) return;
    setScheduling(true);
    try {
      // Remove existing scheduled (unpaid) entries
      await supabase.from("fee_installments")
        .delete()
        .eq("student_fee_id", instTarget.id)
        .eq("payment_method", "Scheduled");

      // Insert new schedule
      const rows = instSchedule.map((row, i) => ({
        student_fee_id: instTarget.id,
        amount:         row.amount,
        payment_date:   row.date.toISOString().split("T")[0],
        payment_method: "Scheduled",
        notes:          `Installment ${i + 1} of ${instSchedule.length}`,
        created_by:     user?.profileId || null,
      }));
      const { error: insErr } = await supabase.from("fee_installments").insert(rows);
      if (insErr) throw new Error(insErr.message);

      // Update student_fees
      const { error: updErr } = await supabase.from("student_fees").update({
        installment_count: instSchedule.length,
        due_date:          instSchedule[0].date.toISOString().split("T")[0],
      }).eq("id", instTarget.id);
      if (updErr) throw new Error(updErr.message);

      toast.success(`${instSchedule.length} installments scheduled for ${instTarget.student_name}!`);
      setInstTarget(null);
      // Refresh installments for that row if expanded
      setInstallments(prev => ({ ...prev, [instTarget.id]: [] }));
      await load();
    } catch (err: any) {
      toast.error("Scheduling failed: " + err.message);
    } finally {
      setScheduling(false);
    }
  };

  // ── Edit Fee Record ──────────────────────────────────────────────────────
  const openEditDialog = (f: StudentFee) => {
    setEditTarget(f);
    setEditForm({
      total_amount:              f.total_amount?.toString() || "0",
      seat_confirmation_amount:  f.seat_confirmation_amount?.toString() || "0",
      first_payment_amount:      f.first_payment_amount?.toString() || "0",
      installment_count:         f.installment_count?.toString() || "0",
      notes:                     f.notes || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const totalAmount   = parseFloat(editForm.total_amount) || 0;
    const seatAmt       = parseFloat(editForm.seat_confirmation_amount) || 0;
    const firstAmt      = parseFloat(editForm.first_payment_amount) || 0;
    const instCount     = parseInt(editForm.installment_count) || 0;

    if (totalAmount <= 0) return toast.error("Total fee must be greater than 0");

    // Recalculate pending from fresh total minus existing discount & received
    const newPending  = Math.max(0, totalAmount - editTarget.discount_amount - editTarget.amount_received);
    const newStatus   = newPending <= 0 ? "paid" : editTarget.amount_received > 0 ? "partial" : "pending";

    setSaving(true);
    try {
      const { error } = await supabase.from("student_fees").update({
        total_amount:             totalAmount,
        seat_confirmation_amount: seatAmt,
        first_payment_amount:     firstAmt,
        installment_count:        instCount,
        amount_pending:           newPending,
        status:                   newStatus,
        notes:                    editForm.notes || null,
      }).eq("id", editTarget.id);

      if (error) return toast.error("Failed to save: " + error.message);

      toast.success(`Fee record updated for ${editTarget.student_name}`);
      setEditTarget(null);
      await load(); // refreshes totals automatically
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Fees Management</h1>
        <p className="text-sm text-muted-foreground">Students are added here automatically when created in Student Control.</p>
      </div>

      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-yellow-600" />
          <div>
            <p className="font-semibold text-sm">Database migration required</p>
            <p className="text-sm mt-0.5">The fee tracking tables haven't been created yet. Run the SQL migration script in your <strong>Supabase SQL Editor</strong> (<code>supabase/migrations/20260415000000_smart_ark_full_extension.sql</code>), then refresh this page.</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-4 border border-green-200/40 bg-green-50/20">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Collected</p>
            <p className="text-2xl font-bold text-foreground">₹{totalCollected.toLocaleString()}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4 border border-red-200/40 bg-red-50/20">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Pending</p>
            <p className="text-2xl font-bold text-foreground">₹{totalPending.toLocaleString()}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Total Fee Value</p>
            <p className="text-2xl font-bold text-foreground">₹{totalFees.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-72">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by student or batch..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9 bg-background/50" />
      </div>

      {/* Table */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium">Total Fee</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Pending</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading && <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  No fee records found. Add students with fee structures in Student Control.
                </td></tr>
              )}
              {paginated.map(f => (
                <React.Fragment key={f.id}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => toggleExpand(f.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {expanded.has(f.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{f.student_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{f.batch_name || "—"}</td>
                    <td className="px-4 py-3 font-medium">₹{f.total_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.discount_amount > 0 ? <span className="text-green-600">−₹{f.discount_amount.toLocaleString()}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-green-600 font-medium">₹{f.amount_received.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-foreground">₹{f.amount_pending.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{f.due_date || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${statusColor(f.status, f.amount_pending)}`}>
                        {f.amount_pending <= 0 ? "Paid" : f.status || "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {f.amount_pending > 0 && (
                          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => { setPaymentTarget(f); setPayForm({ amount: "", method: "Cash", notes: "" }); }}>
                            <CreditCard className="w-3 h-3" /> Collect
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-accent/40 text-accent hover:bg-accent/10" onClick={() => openInstallmentDialog(f)}>
                          <CalendarClock className="w-3 h-3" />
                          {f.installment_count > 0 ? `${f.installment_count} EMI` : "Set EMI"}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setDiscountTarget(f); setDiscountAmt(f.discount_amount?.toString() || ""); }}>
                          <Percent className="w-3 h-3" /> Discount
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setDueDateTarget(f); setDueDate(f.due_date || ""); }}>
                          Set Due
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => openEditDialog(f)}>
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded: installment history + fee breakdown */}
                  {expanded.has(f.id) && (
                    <tr className="bg-muted/10">
                      <td colSpan={10} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Fee Structure Breakdown */}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Schedule</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between"><span className="text-muted-foreground">Seat Confirmation</span><span>₹{f.seat_confirmation_amount.toLocaleString()}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">First Payment</span><span>₹{f.first_payment_amount.toLocaleString()}</span></div>
                              {(() => {
                                const adj = f.total_amount - f.discount_amount;
                                const remaining = adj - f.seat_confirmation_amount - f.first_payment_amount;
                                const perInst = f.installment_count > 0 ? Math.round(remaining / f.installment_count) : 0;
                                return (
                                  <div className="flex justify-between font-medium"><span className="text-muted-foreground">Balance ({f.installment_count} installments of ≈ ₹{perInst.toLocaleString()})</span><span>₹{remaining.toLocaleString()}</span></div>
                                );
                              })()}
                              {f.discount_amount > 0 && <div className="flex justify-between text-green-600"><span>Discount Applied</span><span>−₹{f.discount_amount.toLocaleString()}</span></div>}
                            </div>
                          </div>

                          {/* Payment History */}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment History</p>
                            {(installments[f.id] || []).length === 0 ? (
                              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {(installments[f.id] || []).map(inst => (
                                  <div key={inst.id} className="flex items-center justify-between text-sm p-2 bg-background rounded-lg border border-border/50">
                                    <div>
                                      <span className="font-medium text-foreground">₹{inst.amount.toLocaleString()}</span>
                                      <span className="text-xs text-muted-foreground ml-2">{inst.payment_method}</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs text-muted-foreground">{inst.payment_date}</p>
                                      {inst.receipt_no && (
                                        <button
                                          onClick={() => setReceiptData({
                                            studentName: f.student_name,
                                            batchName: f.batch_name,
                                            amount: inst.amount,
                                            receiptNo: inst.receipt_no,
                                            paymentMethod: inst.payment_method,
                                            date: inst.payment_date,
                                          })}
                                          className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                                        >
                                          <Receipt className="w-3 h-3" /> {inst.receipt_no}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {f.notes && <p className="mt-3 text-xs text-muted-foreground italic">{f.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > perPage && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-border/50 text-sm text-muted-foreground">
            <span>Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Discount Dialog */}
      <Dialog open={!!discountTarget} onOpenChange={open => { if (!open) { setDiscountTarget(null); setDiscountAmt(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Discount — {discountTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Total Fee</span><span className="font-medium text-foreground">₹{discountTarget?.total_amount.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Current Discount</span><span>₹{discountTarget?.discount_amount.toLocaleString()}</span></div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Discount Amount (₹)</label>
              <Input type="number" value={discountAmt} onChange={e => setDiscountAmt(e.target.value)} placeholder="e.g. 5000" />
              {discountAmt && !isNaN(parseFloat(discountAmt)) && discountTarget && (
                <p className="text-xs text-muted-foreground">
                  Adjusted total: ₹{(discountTarget.total_amount - parseFloat(discountAmt)).toLocaleString()} |
                  New pending: ₹{Math.max(0, discountTarget.total_amount - parseFloat(discountAmt) - discountTarget.amount_received).toLocaleString()}
                </p>
              )}
            </div>
            <Button className="w-full" onClick={applyDiscount}>Apply Discount</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!paymentTarget} onOpenChange={open => { if (!open) { setPaymentTarget(null); setPayForm({ amount: "", method: "Cash", notes: "" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Collect Payment — {paymentTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Total Fee</span><span className="font-medium text-foreground">₹{paymentTarget?.total_amount.toLocaleString()}</span></div>
              {(paymentTarget?.discount_amount || 0) > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−₹{paymentTarget?.discount_amount.toLocaleString()}</span></div>}
              <div className="flex justify-between"><span>Already Received</span><span className="text-green-600">₹{paymentTarget?.amount_received.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-1"><span>Pending</span><span>₹{paymentTarget?.amount_pending.toLocaleString()}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Amount (₹) *</label>
                <Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} placeholder="Enter amount" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Method</label>
                <select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option>Cash</option><option>Cheque</option><option>Bank Transfer</option><option>UPI</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Any additional notes" />
            </div>
            <Button className="w-full" onClick={collectPayment} disabled={paying}>
              {paying ? "Processing..." : "Confirm Payment & Generate Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Due Date Dialog */}
      <Dialog open={!!dueDateTarget} onOpenChange={open => { if (!open) { setDueDateTarget(null); setDueDate(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Due Date — {dueDateTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Due Date</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={saveDueDate}>Save Due Date</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Installment Setting Dialog ─────────────────────────────────────── */}
      <Dialog open={!!instTarget} onOpenChange={open => { if (!open) setInstTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Installment Setting</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            {/* Info row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Student Name</p>
                <p className="font-semibold text-foreground">{instTarget?.student_name}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs mb-0.5">Pending Amount</p>
                <p className="font-semibold text-foreground">₹{instTarget?.amount_pending.toLocaleString()}</p>
              </div>
            </div>
            <div className="h-px bg-border/50" />

            {/* Mode + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installment Mode <span className="text-red-500">*</span></label>
                <select value={instModeIdx} onChange={e => setInstModeIdx(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                  {INST_MODES.map((m, i) => <option key={m.label} value={i}>{m.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Installment Date <span className="text-red-500">*</span></label>
                <div className="flex gap-1">
                  <select value={instMonth} onChange={e => setInstMonth(Number(e.target.value))}
                    className="flex-1 bg-background border border-border rounded-md px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent">
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m.slice(0,3)}</option>)}
                  </select>
                  <input type="number" min={1} max={31} value={instDay}
                    onChange={e => setInstDay(Math.min(31, Math.max(1, Number(e.target.value))))}
                    className="w-12 bg-background border border-border rounded-md px-2 py-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent" />
                  <input type="number" min={2024} max={2035} value={instYear}
                    onChange={e => setInstYear(Number(e.target.value))}
                    className="w-16 bg-background border border-border rounded-md px-2 py-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
              </div>
            </div>

            {/* Count + Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">No of Installments <span className="text-red-500">*</span></label>
                <Input type="number" min={1} max={60} value={instCount}
                  onChange={e => setInstCount(Math.max(1, Math.min(60, Number(e.target.value))))}
                  className="bg-background" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installment Amount</label>
                <div className="h-10 flex items-center px-3 rounded-md bg-muted/40 border border-border/60 text-sm font-semibold text-foreground">
                  ₹{instAmountEach > 0 ? instAmountEach.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </div>
              </div>
            </div>

            {/* Schedule preview */}
            {instSchedule.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Schedule Preview ({instSchedule.length} installments)
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40 text-xs">
                  {instSchedule.map((row, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-1.5 hover:bg-muted/20">
                      <span className="text-muted-foreground">
                        #{i + 1} · {row.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="font-medium text-foreground">₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" size="lg" onClick={handleScheduleInstallments}
              disabled={scheduling || instSchedule.length === 0}>
              {scheduling ? "Scheduling…" : "Schedule Installment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Fee Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Fee Record — {editTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <div><span className="font-medium text-foreground">Already Received:</span> ₹{editTarget?.amount_received.toLocaleString()}</div>
              <div><span className="font-medium text-foreground">Discount Applied:</span> ₹{editTarget?.discount_amount.toLocaleString()}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total Fee (₹) <span className="text-red-500">*</span></label>
                <Input
                  type="number" min={0}
                  value={editForm.total_amount}
                  onChange={e => setEditForm({ ...editForm, total_amount: e.target.value })}
                  placeholder="e.g. 80000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Seat Confirmation (₹)</label>
                <Input
                  type="number" min={0}
                  value={editForm.seat_confirmation_amount}
                  onChange={e => setEditForm({ ...editForm, seat_confirmation_amount: e.target.value })}
                  placeholder="e.g. 10000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">First Payment (₹)</label>
                <Input
                  type="number" min={0}
                  value={editForm.first_payment_amount}
                  onChange={e => setEditForm({ ...editForm, first_payment_amount: e.target.value })}
                  placeholder="e.g. 20000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">No. of Installments</label>
                <Input
                  type="number" min={0}
                  value={editForm.installment_count}
                  onChange={e => setEditForm({ ...editForm, installment_count: e.target.value })}
                  placeholder="e.g. 6"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </div>

            {/* Live recalculation preview */}
            {editForm.total_amount && editTarget && (
              <div className="text-xs bg-blue-50/60 border border-blue-200/50 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-blue-700 mb-1">After Save:</p>
                <div className="flex justify-between text-muted-foreground">
                  <span>New Total</span>
                  <span className="font-medium text-foreground">₹{(parseFloat(editForm.total_amount) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>New Pending</span>
                  <span className="font-medium text-red-600">
                    ₹{Math.max(0, (parseFloat(editForm.total_amount) || 0) - editTarget.discount_amount - editTarget.amount_received).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Preview */}
      {receiptData && (
        <Dialog open={!!receiptData} onOpenChange={open => { if (!open) setReceiptData(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex justify-between font-bold"><span>ARK School</span><span>{receiptData.receiptNo}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between"><span className="text-muted-foreground">Student</span><span>{receiptData.studentName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Batch</span><span>{receiptData.batchName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{receiptData.date}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{receiptData.paymentMethod}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between font-bold text-lg"><span>Amount Paid</span><span>₹{receiptData.amount?.toLocaleString()}</span></div>
              </div>
              <Button className="w-full" variant="outline" onClick={() => window.print()}>
                <Receipt className="w-4 h-4 mr-2" /> Print Receipt
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default FeeManagement;
