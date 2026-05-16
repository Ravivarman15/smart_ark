import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DollarSign, Search, AlertCircle, CheckCircle2, Users,
  TrendingUp, CalendarClock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
interface StudentFee {
  id: string;
  student_name: string | null;
  batch_name: string | null;
  total_amount: number;
  discount_amount: number;
  amount_received: number;
  amount_pending: number;
  seat_confirmation_amount: number;
  first_payment_amount: number;
  installment_count: number;
  due_date: string | null;
  status: string | null;
}

interface FeeStructure {
  id: string; name: string; total_amount: number | null;
  seat_confirmation_amount: number | null; first_payment_amount: number | null;
  installment_count: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const urgencyColor = (pending: number, total: number) => {
  const pct = total > 0 ? pending / total : 0;
  if (pct === 0)   return "bg-green-50/40 border-green-200/40";
  if (pct > 0.7)   return "bg-red-50/40 border-red-200/40";
  return "bg-yellow-50/40 border-yellow-200/40";
};

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];

const MODES: { label: string; months?: number; days?: number }[] = [
  { label: "Monthly",      months: 1  },
  { label: "Quarterly",    months: 3  },
  { label: "Half-Yearly",  months: 6  },
  { label: "Weekly",       days:   7  },
  { label: "Fortnightly",  days:  14  },
];

/** Advance a date by one installment period */
function advanceDate(date: Date, mode: typeof MODES[0]): Date {
  const d = new Date(date);
  if (mode.months) d.setMonth(d.getMonth() + mode.months);
  else if (mode.days) d.setDate(d.getDate() + mode.days);
  return d;
}

function buildSchedule(
  pendingAmount: number,
  count: number,
  startDate: Date,
  mode: typeof MODES[0],
): { date: Date; amount: number }[] {
  if (count <= 0) return [];
  const base     = Math.floor((pendingAmount / count) * 100) / 100;
  const lastAmt  = Math.round((pendingAmount - base * (count - 1)) * 100) / 100;
  const rows: { date: Date; amount: number }[] = [];
  let cur = new Date(startDate);
  for (let i = 0; i < count; i++) {
    rows.push({ date: new Date(cur), amount: i === count - 1 ? lastAmt : base });
    if (i < count - 1) cur = advanceDate(cur, mode);
  }
  return rows;
}

// ── Component ──────────────────────────────────────────────────────────────────
const FeesAdmission: React.FC = () => {
  const { user } = useAuth();
  const [fees, setFees]                   = useState<StudentFee[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [search, setSearch]               = useState("");

  // ── Quick payment dialog ───────────────────────────────────────────────────
  const [payTarget, setPayTarget] = useState<StudentFee | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [paying, setPaying]       = useState(false);

  // ── Installment dialog ─────────────────────────────────────────────────────
  const [instTarget, setInstTarget]       = useState<StudentFee | null>(null);
  const [instModeIdx, setInstModeIdx]     = useState(0);           // index into MODES
  const [instCount, setInstCount]         = useState(10);
  const [instMonth, setInstMonth]         = useState(new Date().getMonth());    // 0-based
  const [instDay, setInstDay]             = useState(new Date().getDate());
  const [instYear, setInstYear]           = useState(new Date().getFullYear());
  const [scheduling, setScheduling]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [{ data: sf, error: sfErr }, { data: fs, error: fsErr }] = await Promise.all([
      (supabase as any).from("student_fees").select("*").neq("status","paid").order("amount_pending",{ ascending: false }),
      (supabase as any).from("fee_structures").select("id,name,total_amount,seat_confirmation_amount,first_payment_amount,installment_count"),
    ]);
    if (sfErr) {
      const isMigrationError = sfErr.message?.includes("student_fees") || sfErr.message?.includes("schema cache") || sfErr.message?.includes("does not exist");
      setLoadError(isMigrationError
        ? "SQL migration not yet run — fee tracking tables don't exist yet."
        : "Failed to load fees: " + sfErr.message);
    } else {
      setFees((sf || []) as StudentFee[]);
    }
    if (!fsErr) setFeeStructures((fs || []) as FeeStructure[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = fees.filter(f =>
    !search ||
    (f.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.batch_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPending   = fees.reduce((s, f) => s + f.amount_pending, 0);
  const totalCollected = fees.reduce((s, f) => s + f.amount_received, 0);

  // ── Installment schedule preview ──────────────────────────────────────────
  const instMode     = MODES[instModeIdx];
  const instStartDate = useMemo(() => {
    const d = new Date(instYear, instMonth, Math.min(instDay, 28));
    return d;
  }, [instYear, instMonth, instDay]);

  const instSchedule = useMemo(() => {
    if (!instTarget || instCount <= 0) return [];
    return buildSchedule(instTarget.amount_pending, instCount, instStartDate, instMode);
  }, [instTarget, instCount, instStartDate, instMode]);

  const instAmountEach = instTarget && instCount > 0
    ? Math.floor((instTarget.amount_pending / instCount) * 100) / 100
    : 0;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleQuickPay = async () => {
    if (paying) return; // guard against double-submit
    if (!payTarget || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return toast.error("Invalid amount");
    if (amount > payTarget.amount_pending)  return toast.error("Exceeds pending amount");
    setPaying(true);
    const receiptNo = `REC-${Date.now().toString(36).toUpperCase()}`;
    const today     = new Date().toISOString().split("T")[0];
    let insertedInstallmentId: string | null = null;
    try {
      const { data: instRow, error: instErr } = await supabase.from("fee_installments").insert({
        student_fee_id: payTarget.id,
        amount,
        payment_date:   today,
        payment_method: payMethod,
        receipt_no:     receiptNo,
        created_by:     user?.profileId || null,
      }).select("id").single();
      if (instErr) throw new Error(instErr.message);
      insertedInstallmentId = instRow?.id ?? null;

      const newReceived = payTarget.amount_received + amount;
      const newPending  = payTarget.amount_pending  - amount;
      const { error: updateErr } = await supabase.from("student_fees").update({
        amount_received: newReceived,
        amount_pending:  Math.max(0, newPending),
        status: newPending <= 0 ? "paid" : "partial",
      }).eq("id", payTarget.id);

      if (updateErr) {
        // Compensating action — delete the installment we just inserted so
        // the DB isn't left in a partial state that would double-book on retry.
        if (insertedInstallmentId) {
          const { error: delErr } = await supabase.from("fee_installments").delete().eq("id", insertedInstallmentId);
          if (delErr) {
            // Delete also failed — installment is stranded; tell admin so they can reconcile.
            toast.error(
              `Balance update failed AND installment rollback failed. Receipt ${receiptNo} is stranded — please delete it manually in Supabase. (${updateErr.message})`,
              { duration: 15000 }
            );
            return;
          }
        }
        throw new Error(updateErr.message);
      }

      toast.success(`₹${amount.toLocaleString()} received — Receipt: ${receiptNo}`);
      setPayTarget(null); setPayAmount(""); setPayMethod("Cash");
      await load();
    } catch (err: any) {
      toast.error("Payment failed: " + (err?.message || "Unknown error"));
    } finally { setPaying(false); }
  };

  const handleScheduleInstallments = async () => {
    if (!instTarget || instSchedule.length === 0) return;
    setScheduling(true);
    try {
      // Remove any existing "Scheduled" (un-paid) entries for this student fee
      await supabase.from("fee_installments")
        .delete()
        .eq("student_fee_id", instTarget.id)
        .eq("payment_method", "Scheduled");

      // Insert new scheduled installments
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

      // Update student_fees with count and first due date
      const { error: updErr } = await supabase.from("student_fees").update({
        installment_count: instSchedule.length,
        due_date:          instSchedule[0].date.toISOString().split("T")[0],
      }).eq("id", instTarget.id);
      if (updErr) throw new Error(updErr.message);

      toast.success(`${instSchedule.length} installments scheduled for ${instTarget.student_name}!`);
      setInstTarget(null);
      await load();
    } catch (err: any) {
      toast.error("Scheduling failed: " + err.message);
    } finally { setScheduling(false); }
  };

  const openInstallmentDialog = (fee: StudentFee) => {
    setInstTarget(fee);
    setInstModeIdx(0);
    setInstCount(10);
    const now = new Date();
    setInstMonth(now.getMonth());
    setInstDay(now.getDate());
    setInstYear(now.getFullYear());
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Fee Collection</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-4 border border-red-200/40 bg-red-50/20">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Pending Collection</p>
            <p className="text-2xl font-bold text-foreground">₹{totalPending.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{fees.length} students</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4 border border-green-200/40 bg-green-50/20">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Collected So Far</p>
            <p className="text-2xl font-bold text-foreground">₹{totalCollected.toLocaleString()}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Collection Rate</p>
            <p className="text-2xl font-bold text-foreground">
              {totalCollected + totalPending > 0
                ? Math.round((totalCollected / (totalCollected + totalPending)) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Fee Structures */}
      {feeStructures.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-accent" /> Active Fee Structures
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {feeStructures.map(f => {
              const seat = f.seat_confirmation_amount || 0;
              const first = f.first_payment_amount || 0;
              const total = f.total_amount || 0;
              const remaining = total - seat - first;
              const count = f.installment_count || 2;
              return (
                <div key={f.id} className="p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
                  <p className="font-semibold text-foreground">{f.name}</p>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Total</span><span className="font-medium text-foreground">₹{total.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Seat Conf.</span><span>₹{seat.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>1st Payment</span><span>₹{first.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>{count} installments</span><span>≈ ₹{count > 0 ? Math.round(remaining / count).toLocaleString() : 0} each</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Fees List */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Pending Fee Students
          </h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-background/50" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : loadError ? (
          <div className="text-center py-8">
            <p className="text-sm text-destructive font-medium">{loadError}</p>
            <p className="text-xs text-muted-foreground mt-1">Run the migration SQL in your Supabase SQL Editor, then refresh.</p>
            <button onClick={load} className="mt-3 text-xs underline text-accent">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No matching students." : "All fees collected! 🎉"}
          </p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map(f => {
              const pct = f.total_amount > 0 ? Math.round((f.amount_received / f.total_amount) * 100) : 0;
              return (
                <div key={f.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border ${urgencyColor(f.amount_pending, f.total_amount)}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{f.student_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{f.batch_name || "—"}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="font-bold text-foreground">₹{f.amount_pending.toLocaleString()}</p>
                    </div>
                    {f.due_date && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Next Due</p>
                        <p className="text-xs font-medium text-foreground">
                          {new Date(f.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    )}
                    {/* Installment button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs border-accent/40 text-accent hover:bg-accent/10"
                      onClick={() => openInstallmentDialog(f)}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      {f.installment_count > 0 ? `${f.installment_count} EMI` : "Set EMI"}
                    </Button>
                    {/* Collect button */}
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => { setPayTarget(f); setPayAmount(""); setPayMethod("Cash"); }}
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Collect
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Payment Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!payTarget} onOpenChange={open => {
        if (paying) return; // don't let the user dismiss mid-write
        if (!open) { setPayTarget(null); setPayAmount(""); }
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Collect Payment — {payTarget?.student_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Fee</span><span>₹{payTarget?.total_amount.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Received</span><span className="text-green-600">₹{payTarget?.amount_received.toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold"><span>Pending</span><span>₹{payTarget?.amount_pending.toLocaleString()}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Enter amount" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm">
                  <option>Cash</option><option>Cheque</option><option>Bank Transfer</option><option>UPI</option>
                </select>
              </div>
            </div>
            <Button className="w-full" onClick={handleQuickPay} disabled={paying}>
              {paying ? "Processing..." : "Confirm & Generate Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Installment Setting Dialog ─────────────────────────────────────── */}
      <Dialog open={!!instTarget} onOpenChange={open => { if (!open) setInstTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Installment Setting</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Student info row */}
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

            {/* Mode + Date row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installment Mode <span className="text-red-500">*</span></label>
                <select
                  value={instModeIdx}
                  onChange={e => setInstModeIdx(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {MODES.map((m, i) => (
                    <option key={m.label} value={i}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Installment Date <span className="text-red-500">*</span></label>
                <div className="flex gap-1">
                  <select
                    value={instMonth}
                    onChange={e => setInstMonth(Number(e.target.value))}
                    className="flex-1 bg-background border border-border rounded-md px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m.slice(0,3)}</option>)}
                  </select>
                  <input
                    type="number" min={1} max={31}
                    value={instDay}
                    onChange={e => setInstDay(Math.min(31, Math.max(1, Number(e.target.value))))}
                    className="w-12 bg-background border border-border rounded-md px-2 py-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    type="number" min={2024} max={2035}
                    value={instYear}
                    onChange={e => setInstYear(Number(e.target.value))}
                    className="w-16 bg-background border border-border rounded-md px-2 py-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            </div>

            {/* Count + Amount row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">No of Installments <span className="text-red-500">*</span></label>
                <Input
                  type="number" min={1} max={60}
                  value={instCount}
                  onChange={e => setInstCount(Math.max(1, Math.min(60, Number(e.target.value))))}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installment Amount</label>
                <div className="h-10 flex items-center px-3 rounded-md bg-muted/40 border border-border/60 text-sm font-semibold text-foreground">
                  ₹{instAmountEach > 0 ? instAmountEach.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </div>
              </div>
            </div>

            {/* Schedule Preview */}
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

            {/* Action */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleScheduleInstallments}
              disabled={scheduling || instSchedule.length === 0}
            >
              {scheduling ? "Scheduling…" : "Schedule Installment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeesAdmission;
