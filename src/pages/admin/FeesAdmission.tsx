import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CalendarClock,
  DollarSign,
  Search,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac";
import {
  FeeAnalyticsPanel,
  FeeReceiptDialog,
  INSTALLMENT_MODES,
  buildSchedule,
  collectionRate,
  formatINR,
  isOverdue,
  useCollectPayment,
  useQueueFeeReminders,
  useScheduleInstallments,
  useStudentFees,
  type ReceiptData,
  type StudentFee,
} from "@/features/fee";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Collection — the daily "who still owes money" workspace.
//
// Migrated onto the Fee feature module. Adds the analytics panel (collection
// rate, aging, trend) and one-click WhatsApp/SMS reminder queueing. All money
// math runs through the centralised calculation layer.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const urgency = (fee: StudentFee): string => {
  if (fee.amountPending <= 0) return "bg-green-50/40 border-green-200/40";
  if (isOverdue(fee.dueDate, fee.amountPending))
    return "bg-red-50/40 border-red-200/40";
  return "bg-yellow-50/40 border-yellow-200/40";
};

const FeesAdmission: React.FC = () => {
  const { canDo } = useCanDo();
  const { data: fees = [], isLoading, error } = useStudentFees({
    unpaidOnly: true,
  });
  const collectMut = useCollectPayment();
  const scheduleMut = useScheduleInstallments();
  const remindMut = useQueueFeeReminders();

  const [search, setSearch] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const [payTarget, setPayTarget] = useState<StudentFee | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");

  const [instTarget, setInstTarget] = useState<StudentFee | null>(null);
  const [instModeIdx, setInstModeIdx] = useState(0);
  const [instCount, setInstCount] = useState(10);
  const [instMonth, setInstMonth] = useState(new Date().getMonth());
  const [instDay, setInstDay] = useState(new Date().getDate());
  const [instYear, setInstYear] = useState(new Date().getFullYear());

  const migrationNeeded =
    !!error &&
    /student_fees|schema cache|does not exist/i.test(
      error instanceof Error ? error.message : String(error),
    );

  const filtered = useMemo(
    () =>
      fees.filter(
        (f) =>
          !search ||
          (f.studentName || "").toLowerCase().includes(search.toLowerCase()) ||
          (f.batchName || "").toLowerCase().includes(search.toLowerCase()),
      ),
    [fees, search],
  );

  const totalPending = fees.reduce((s, f) => s + f.amountPending, 0);
  const totalReceived = fees.reduce((s, f) => s + f.amountReceived, 0);

  // ── Quick pay ──────────────────────────────────────────────────────────────
  const quickPay = async () => {
    if (!payTarget) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0)
      return toast.error("Enter a valid amount");
    try {
      const res = await collectMut.mutateAsync({
        studentFeeId: payTarget.id,
        amount,
        method: payMethod,
      });
      toast.success(
        `${formatINR(res.amount)} received — Receipt ${res.receiptNo}`,
      );
      setReceipt({
        receiptNo: res.receiptNo,
        studentName: payTarget.studentName,
        batchName: payTarget.batchName,
        amount: res.amount,
        paymentMethod: payMethod,
        date: new Date().toISOString().slice(0, 10),
        amountReceivedToDate: res.amountReceived,
        amountPending: res.amountPending,
      });
      setPayTarget(null);
      setPayAmount("");
      setPayMethod("Cash");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    }
  };

  // ── Installments ───────────────────────────────────────────────────────────
  const instMode = INSTALLMENT_MODES[instModeIdx];
  const instStart = useMemo(
    () => new Date(instYear, instMonth, Math.min(instDay, 28)),
    [instYear, instMonth, instDay],
  );
  const instSchedule = useMemo(
    () =>
      instTarget
        ? buildSchedule(instTarget.amountPending, instCount, instStart, instMode)
        : [],
    [instTarget, instCount, instStart, instMode],
  );

  const openInstallment = (f: StudentFee) => {
    setInstTarget(f);
    setInstModeIdx(0);
    setInstCount(10);
    const now = new Date();
    setInstMonth(now.getMonth());
    setInstDay(now.getDate());
    setInstYear(now.getFullYear());
  };

  const scheduleInstallments = async () => {
    if (!instTarget || instSchedule.length === 0) return;
    try {
      const count = await scheduleMut.mutateAsync({
        studentFeeId: instTarget.id,
        count: instCount,
        startDate: instStart.toISOString().slice(0, 10),
        modeId: instMode.id,
      });
      toast.success(`${count} installments scheduled for ${instTarget.studentName}`);
      setInstTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scheduling failed");
    }
  };

  // ── Reminders ──────────────────────────────────────────────────────────────
  const sendReminders = async () => {
    if (filtered.length === 0)
      return toast.info("No pending fees to remind about");
    try {
      const res = await remindMut.mutateAsync(filtered);
      if (res.queued > 0) {
        toast.success(
          `${res.queued} WhatsApp reminder${res.queued === 1 ? "" : "s"} queued`,
        );
      } else if (res.skipped > 0) {
        toast.warning(
          "Reminder outbox unavailable — run the fee module migration first.",
        );
      } else {
        toast.info("Nothing to remind about");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue reminders");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Fee Collection
        </h1>
        <Button
          variant="outline"
          className="gap-2"
          onClick={sendReminders}
          disabled={remindMut.isPending}
        >
          <BellRing className="w-4 h-4" />
          {remindMut.isPending ? "Queueing…" : "Send Reminders"}
        </Button>
      </div>

      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-yellow-600" />
          <div>
            <p className="font-semibold text-sm">Database migration required</p>
            <p className="text-sm mt-0.5">
              Fee tracking tables don't exist yet. Run the migration in your
              Supabase SQL Editor, then refresh.
            </p>
          </div>
        </div>
      )}

      {/* Analytics foundation */}
      <FeeAnalyticsPanel />

      {/* Pending fees */}
      <div className="glass-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Pending Fee Students
            <span className="text-xs font-normal text-muted-foreground">
              · {formatINR(totalPending)} across {fees.length} ·{" "}
              {collectionRate(totalReceived, totalPending)}% collected
            </span>
          </h2>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search student…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-background/50"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No matching students." : "All fees collected! 🎉"}
          </p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((f) => {
              const pct =
                f.totalAmount > 0
                  ? Math.round((f.amountReceived / f.totalAmount) * 100)
                  : 0;
              return (
                <div
                  key={f.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border ${urgency(f)}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {f.studentName || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.batchName || "—"}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="font-bold text-foreground">
                        {formatINR(f.amountPending)}
                      </p>
                    </div>
                    {f.dueDate && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Next Due
                        </p>
                        <p className="text-xs font-medium text-foreground">
                          {new Date(
                            `${f.dueDate}T00:00:00`,
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs border-accent/40 text-accent hover:bg-accent/10"
                      onClick={() => openInstallment(f)}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      {f.installmentCount > 0
                        ? `${f.installmentCount} EMI`
                        : "Set EMI"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!canDo("fee.collect")}
                      onClick={() => {
                        setPayTarget(f);
                        setPayAmount("");
                        setPayMethod("Cash");
                      }}
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

      {/* Quick payment dialog */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(o) => {
          if (collectMut.isPending) return;
          if (!o) {
            setPayTarget(null);
            setPayAmount("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Collect Payment — {payTarget?.studentName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received</span>
                <span className="text-green-600">
                  {formatINR(payTarget?.amountReceived ?? 0)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Pending</span>
                <span>{formatINR(payTarget?.amountPending ?? 0)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  <option>Cash</option>
                  <option>Cheque</option>
                  <option>Bank Transfer</option>
                  <option>UPI</option>
                  <option>Card</option>
                </select>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={quickPay}
              disabled={collectMut.isPending}
            >
              {collectMut.isPending
                ? "Processing…"
                : "Confirm & Generate Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Installment dialog */}
      <Dialog
        open={!!instTarget}
        onOpenChange={(o) => !o && setInstTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Installment Setting</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Student</p>
                <p className="font-semibold text-foreground">
                  {instTarget?.studentName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs mb-0.5">
                  Pending Amount
                </p>
                <p className="font-semibold text-foreground">
                  {formatINR(instTarget?.amountPending ?? 0)}
                </p>
              </div>
            </div>
            <div className="h-px bg-border/50" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installment Mode</label>
                <select
                  value={instModeIdx}
                  onChange={(e) => setInstModeIdx(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {INSTALLMENT_MODES.map((m, i) => (
                    <option key={m.id} value={i}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Date</label>
                <div className="flex gap-1">
                  <select
                    value={instMonth}
                    onChange={(e) => setInstMonth(Number(e.target.value))}
                    className="flex-1 bg-background border border-border rounded-md px-2 py-2 text-xs"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m.slice(0, 3)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={instDay}
                    onChange={(e) =>
                      setInstDay(
                        Math.min(31, Math.max(1, Number(e.target.value))),
                      )
                    }
                    className="w-12 bg-background border border-border rounded-md px-2 py-2 text-xs text-center"
                  />
                  <input
                    type="number"
                    min={2024}
                    max={2035}
                    value={instYear}
                    onChange={(e) => setInstYear(Number(e.target.value))}
                    className="w-16 bg-background border border-border rounded-md px-2 py-2 text-xs text-center"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">No. of Installments</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={instCount}
                onChange={(e) =>
                  setInstCount(
                    Math.max(1, Math.min(60, Number(e.target.value))),
                  )
                }
              />
            </div>
            {instSchedule.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Schedule Preview ({instSchedule.length})
                </p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40 text-xs">
                  {instSchedule.map((row, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center px-3 py-1.5"
                    >
                      <span className="text-muted-foreground">
                        #{i + 1} ·{" "}
                        {row.date.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatINR(row.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              className="w-full"
              size="lg"
              onClick={scheduleInstallments}
              disabled={scheduleMut.isPending || instSchedule.length === 0}
            >
              {scheduleMut.isPending ? "Scheduling…" : "Schedule Installment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FeeReceiptDialog
        receipt={receipt}
        onOpenChange={(o) => !o && setReceipt(null)}
      />
    </div>
  );
};

export default FeesAdmission;
