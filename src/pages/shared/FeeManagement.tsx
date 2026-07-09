import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  Pencil,
  Percent,
  Receipt,
  Search,
  Undo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCanDo } from "@/features/rbac";
import {
  FeeReceiptDialog,
  RefundDialog,
  INSTALLMENT_MODES,
  buildSchedule,
  formatINR,
  isOverdue,
  useApproveDiscount,
  useApplyDiscount,
  useCollectPayment,
  useFeeInstallments,
  useRejectDiscount,
  useScheduleInstallments,
  useSetDueDate,
  useStudentFees,
  useUpdateStudentFee,
  type ReceiptData,
  type StudentFee,
} from "@/features/fee";

// ─────────────────────────────────────────────────────────────────────────────
// Fees Management — the per-student fee ledger.
//
// Migrated onto the Fee feature module: collection, discount, installment and
// edit logic all run through services + the centralised calculation layer. The
// page owns dialog/UI state only. Adds the discount-approval workflow, refunds
// and RBAC gating on every money action.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const PER_PAGE = 15;

const statusChip = (fee: StudentFee): { label: string; cls: string } => {
  if (fee.amountPending <= 0)
    return {
      label: "Paid",
      cls: "text-green-600 bg-green-50 border-green-200",
    };
  if (isOverdue(fee.dueDate, fee.amountPending))
    return { label: "Overdue", cls: "text-red-600 bg-red-50 border-red-200" };
  return {
    label: fee.status === "partial" ? "Partial" : "Pending",
    cls: "text-yellow-600 bg-yellow-50 border-yellow-200",
  };
};

// ── Expanded row: schedule breakdown + payment history ───────────────────────
const ExpandedRow = ({
  fee,
  onReceipt,
}: {
  fee: StudentFee;
  onReceipt: (r: ReceiptData) => void;
}) => {
  const { data: installments = [], isLoading } = useFeeInstallments(fee.id);
  const payments = installments.filter((i) => !i.scheduled);
  const scheduled = installments.filter((i) => i.scheduled);

  return (
    <td colSpan={10} className="px-6 py-4 bg-muted/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Payment Schedule
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Seat Confirmation</span>
              <span>{formatINR(fee.seatConfirmationAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">First Payment</span>
              <span>{formatINR(fee.firstPaymentAmount)}</span>
            </div>
            {fee.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>
                  Discount{" "}
                  {fee.discountStatus !== "approved"
                    ? `(${fee.discountStatus})`
                    : ""}
                </span>
                <span>− {formatINR(fee.discountAmount)}</span>
              </div>
            )}
            {scheduled.length > 0 && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">
                  Scheduled installments
                </p>
                {scheduled.map((s) => (
                  <div
                    key={s.id}
                    className="flex justify-between text-xs text-muted-foreground"
                  >
                    <span>{s.paymentDate}</span>
                    <span>{formatINR(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Payment History
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm p-2 bg-background rounded-lg border border-border/50"
                >
                  <div>
                    <span className="font-medium text-foreground">
                      {formatINR(p.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {p.paymentMethod}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {p.paymentDate}
                    </p>
                    {p.receiptNo && (
                      <button
                        onClick={() =>
                          onReceipt({
                            receiptNo: p.receiptNo as string,
                            studentName: fee.studentName,
                            batchName: fee.batchName,
                            amount: p.amount,
                            paymentMethod: p.paymentMethod,
                            date: p.paymentDate,
                            amountReceivedToDate: fee.amountReceived,
                            amountPending: fee.amountPending,
                            notes: p.notes,
                          })
                        }
                        className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                      >
                        <Receipt className="w-3 h-3" /> {p.receiptNo}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {fee.notes && (
        <p className="mt-3 text-xs text-muted-foreground italic">{fee.notes}</p>
      )}
    </td>
  );
};

const FeeManagement: React.FC = () => {
  const { canDo } = useCanDo();
  const { data: fees = [], isLoading, error } = useStudentFees();

  const collectMut = useCollectPayment();
  const discountMut = useApplyDiscount();
  const approveDiscMut = useApproveDiscount();
  const rejectDiscMut = useRejectDiscount();
  const editMut = useUpdateStudentFee();
  const dueDateMut = useSetDueDate();
  const scheduleMut = useScheduleInstallments();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [paymentTarget, setPaymentTarget] = useState<StudentFee | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    method: "Cash",
    notes: "",
  });
  const [discountTarget, setDiscountTarget] = useState<StudentFee | null>(null);
  const [discountAmt, setDiscountAmt] = useState("");
  const [dueDateTarget, setDueDateTarget] = useState<StudentFee | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [refundTarget, setRefundTarget] = useState<StudentFee | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const [instTarget, setInstTarget] = useState<StudentFee | null>(null);
  const [instModeIdx, setInstModeIdx] = useState(0);
  const [instCount, setInstCount] = useState(10);
  const [instMonth, setInstMonth] = useState(new Date().getMonth());
  const [instDay, setInstDay] = useState(new Date().getDate());
  const [instYear, setInstYear] = useState(new Date().getFullYear());

  const [editTarget, setEditTarget] = useState<StudentFee | null>(null);
  const [editForm, setEditForm] = useState({
    total: "",
    seat: "",
    first: "",
    count: "",
    notes: "",
  });

  const migrationNeeded =
    !!error &&
    /student_fees|schema cache|does not exist/i.test(
      error instanceof Error ? error.message : String(error),
    );

  // ── Derived ────────────────────────────────────────────────────────────────
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const totals = useMemo(
    () => ({
      collected: fees.reduce((s, f) => s + f.amountReceived, 0),
      pending: fees.reduce((s, f) => s + f.amountPending, 0),
      total: fees.reduce((s, f) => s + f.totalAmount, 0),
    }),
    [fees],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const collect = async () => {
    if (!paymentTarget) return;
    const amount = parseFloat(payForm.amount);
    if (isNaN(amount) || amount <= 0)
      return toast.error("Enter a valid payment amount");
    try {
      const res = await collectMut.mutateAsync({
        studentFeeId: paymentTarget.id,
        amount,
        method: payForm.method,
        notes: payForm.notes || undefined,
      });
      toast.success(
        `${formatINR(res.amount)} collected — Receipt ${res.receiptNo}`,
      );
      // Report exactly what happened to the receipt delivery (Email + WhatsApp),
      // so a silent non-send is impossible.
      const d = res.delivery;
      if (d) {
        const parts: string[] = [];
        if (d.email === "sent") parts.push("Email sent ✓");
        else if (d.email === "duplicate") parts.push("Email already sent");
        else if (d.email === "failed") parts.push(`Email failed: ${d.emailError ?? "unknown"}`);
        else if (d.email === "skipped" && d.emailError) parts.push(d.emailError);
        if (d.whatsapp === "queued" || d.whatsapp === "sent")
          parts.push(d.whatsappError ? `WhatsApp: ${d.whatsappError}` : "WhatsApp sent ✓");
        else if (d.whatsapp === "duplicate") parts.push("WhatsApp already sent");
        else if (d.whatsapp === "failed") parts.push(`WhatsApp failed: ${d.whatsappError ?? "unknown"}`);
        else if (d.whatsapp === "skipped" && d.whatsappError) parts.push(d.whatsappError);
        const hasError =
          d.email === "failed" || d.whatsapp === "failed" || !!d.whatsappError || !!d.emailError;
        if (parts.length > 0) {
          (hasError ? toast.warning : toast.success)(`Receipt — ${parts.join(" · ")}`, {
            duration: 7000,
          });
        }
      }
      setReceipt({
        receiptNo: res.receiptNo,
        studentName: paymentTarget.studentName,
        batchName: paymentTarget.batchName,
        amount: res.amount,
        paymentMethod: payForm.method,
        date: new Date().toISOString().slice(0, 10),
        amountReceivedToDate: res.amountReceived,
        amountPending: res.amountPending,
        notes: payForm.notes || undefined,
      });
      setPaymentTarget(null);
      setPayForm({ amount: "", method: "Cash", notes: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    }
  };

  const applyDiscount = async () => {
    if (!discountTarget) return;
    const amount = parseFloat(discountAmt);
    if (isNaN(amount) || amount < 0)
      return toast.error("Enter a valid discount amount");
    try {
      await discountMut.mutateAsync({
        studentFeeId: discountTarget.id,
        discountAmount: amount,
      });
      toast.success(
        canDo("fee.discount.approve")
          ? "Discount applied"
          : "Discount submitted for approval",
      );
      setDiscountTarget(null);
      setDiscountAmt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply discount");
    }
  };

  const decideDiscount = async (fee: StudentFee, approve: boolean) => {
    try {
      if (approve) await approveDiscMut.mutateAsync(fee.id);
      else await rejectDiscMut.mutateAsync(fee.id);
      toast.success(approve ? "Discount approved" : "Discount rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const saveDueDate = async () => {
    if (!dueDateTarget || !dueDate) return;
    try {
      await dueDateMut.mutateAsync({ id: dueDateTarget.id, dueDate });
      toast.success("Due date set");
      setDueDateTarget(null);
      setDueDate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

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
    setInstCount(f.installmentCount > 0 ? f.installmentCount : 10);
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

  const openEdit = (f: StudentFee) => {
    setEditTarget(f);
    setEditForm({
      total: String(f.totalAmount || 0),
      seat: String(f.seatConfirmationAmount || 0),
      first: String(f.firstPaymentAmount || 0),
      count: String(f.installmentCount || 0),
      notes: f.notes || "",
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const total = parseFloat(editForm.total) || 0;
    if (total <= 0) return toast.error("Total fee must be greater than 0");
    try {
      await editMut.mutateAsync({
        id: editTarget.id,
        input: {
          totalAmount: total,
          seatConfirmationAmount: parseFloat(editForm.seat) || 0,
          firstPaymentAmount: parseFloat(editForm.first) || 0,
          installmentCount: parseInt(editForm.count) || 0,
          notes: editForm.notes || undefined,
        },
      });
      toast.success(`Fee record updated for ${editTarget.studentName}`);
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Fees Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Students appear here automatically when created in Student Control.
        </p>
      </div>

      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-300/60 bg-yellow-50/40 text-yellow-800">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-yellow-600" />
          <div>
            <p className="font-semibold text-sm">Database migration required</p>
            <p className="text-sm mt-0.5">
              Run the fee tracking migration in your Supabase SQL Editor, then
              refresh this page.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-4 border border-green-200/40 bg-green-50/20">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">
              Total Collected
            </p>
            <p className="text-2xl font-bold text-foreground">
              {formatINR(totals.collected)}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4 border border-red-200/40 bg-red-50/20">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">
              Total Pending
            </p>
            <p className="text-2xl font-bold text-foreground">
              {formatINR(totals.pending)}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">
              Total Fee Value
            </p>
            <p className="text-2xl font-bold text-foreground">
              {formatINR(totals.total)}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-72">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by student or batch…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9 h-9 bg-background/50"
        />
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
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No fee records found.
                  </td>
                </tr>
              )}
              {paged.map((f) => {
                const chip = statusChip(f);
                return (
                  <React.Fragment key={f.id}>
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(f.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {expanded.has(f.id) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {f.studentName || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {f.batchName || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatINR(f.totalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {f.discountAmount > 0 ? (
                          f.discountStatus === "pending" ? (
                            <div className="flex items-center gap-1">
                              <span className="text-amber-600 text-xs">
                                {formatINR(f.discountAmount)} pending
                              </span>
                              {canDo("fee.discount.approve") && (
                                <>
                                  <button
                                    onClick={() => decideDiscount(f, true)}
                                    className="text-[10px] text-green-600 hover:underline"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => decideDiscount(f, false)}
                                    className="text-[10px] text-red-600 hover:underline"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          ) : f.discountStatus === "rejected" ? (
                            <span className="text-muted-foreground text-xs">
                              rejected
                            </span>
                          ) : (
                            <span className="text-green-600">
                              − {formatINR(f.discountAmount)}
                            </span>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-green-600 font-medium">
                        {formatINR(f.amountReceived)}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        {formatINR(f.amountPending)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {f.dueDate || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {f.amountPending > 0 && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={!canDo("fee.collect")}
                              onClick={() => {
                                setPaymentTarget(f);
                                setPayForm({
                                  amount: "",
                                  method: "Cash",
                                  notes: "",
                                });
                              }}
                            >
                              <CreditCard className="w-3 h-3" /> Collect
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-accent/40 text-accent hover:bg-accent/10"
                            onClick={() => openInstallment(f)}
                          >
                            <CalendarClock className="w-3 h-3" />
                            {f.installmentCount > 0
                              ? `${f.installmentCount} EMI`
                              : "Set EMI"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={!canDo("fee.discount")}
                            onClick={() => {
                              setDiscountTarget(f);
                              setDiscountAmt(
                                f.discountAmount ? String(f.discountAmount) : "",
                              );
                            }}
                          >
                            <Percent className="w-3 h-3" /> Discount
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              setDueDateTarget(f);
                              setDueDate(f.dueDate || "");
                            }}
                          >
                            Set Due
                          </Button>
                          {f.amountReceived > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                              disabled={!canDo("fee.refund")}
                              onClick={() => setRefundTarget(f)}
                            >
                              <Undo2 className="w-3 h-3" /> Refund
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                            disabled={!canDo("fee.edit")}
                            onClick={() => openEdit(f)}
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expanded.has(f.id) && (
                      <tr>
                        <ExpandedRow fee={f} onReceipt={setReceipt} />
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > PER_PAGE && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-border/50 text-sm text-muted-foreground">
            <span>
              Showing {(safePage - 1) * PER_PAGE + 1}–
              {Math.min(safePage * PER_PAGE, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Discount dialog */}
      <Dialog
        open={!!discountTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDiscountTarget(null);
            setDiscountAmt("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Apply Discount — {discountTarget?.studentName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Total Fee</span>
                <span className="font-medium text-foreground">
                  {formatINR(discountTarget?.totalAmount ?? 0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Discount Amount (₹)
              </label>
              <Input
                type="number"
                value={discountAmt}
                onChange={(e) => setDiscountAmt(e.target.value)}
                placeholder="e.g. 5000"
              />
              {!canDo("fee.discount.approve") && (
                <p className="text-[11px] text-amber-600">
                  This discount will be submitted for admin approval before it
                  reduces the balance.
                </p>
              )}
            </div>
            <Button
              className="w-full"
              onClick={applyDiscount}
              disabled={discountMut.isPending}
            >
              {discountMut.isPending ? "Applying…" : "Apply Discount"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog
        open={!!paymentTarget}
        onOpenChange={(o) => {
          if (collectMut.isPending) return;
          if (!o) {
            setPaymentTarget(null);
            setPayForm({ amount: "", method: "Cash", notes: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Collect Payment — {paymentTarget?.studentName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Already Received</span>
                <span className="text-green-600">
                  {formatINR(paymentTarget?.amountReceived ?? 0)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-1">
                <span>Pending</span>
                <span>{formatINR(paymentTarget?.amountPending ?? 0)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Payment Amount (₹) *
                </label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={(e) =>
                    setPayForm({ ...payForm, amount: e.target.value })
                  }
                  placeholder="Enter amount"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Method</label>
                <select
                  value={payForm.method}
                  onChange={(e) =>
                    setPayForm({ ...payForm, method: e.target.value })
                  }
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input
                value={payForm.notes}
                onChange={(e) =>
                  setPayForm({ ...payForm, notes: e.target.value })
                }
                placeholder="Any additional notes"
              />
            </div>
            <Button
              className="w-full"
              onClick={collect}
              disabled={collectMut.isPending}
            >
              {collectMut.isPending
                ? "Processing…"
                : "Confirm Payment & Generate Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Due date dialog */}
      <Dialog
        open={!!dueDateTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDueDateTarget(null);
            setDueDate("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Due Date — {dueDateTarget?.studentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Due Date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={saveDueDate}>
              Save Due Date
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

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit Fee Record — {editTarget?.studentName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <div>
                <span className="font-medium text-foreground">Received:</span>{" "}
                {formatINR(editTarget?.amountReceived ?? 0)}
              </div>
              <div>
                <span className="font-medium text-foreground">Discount:</span>{" "}
                {formatINR(editTarget?.discountAmount ?? 0)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total Fee (₹) *</label>
                <Input
                  type="number"
                  value={editForm.total}
                  onChange={(e) =>
                    setEditForm({ ...editForm, total: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Seat Confirmation (₹)
                </label>
                <Input
                  type="number"
                  value={editForm.seat}
                  onChange={(e) =>
                    setEditForm({ ...editForm, seat: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">First Payment (₹)</label>
                <Input
                  type="number"
                  value={editForm.first}
                  onChange={(e) =>
                    setEditForm({ ...editForm, first: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Installments</label>
                <Input
                  type="number"
                  value={editForm.count}
                  onChange={(e) =>
                    setEditForm({ ...editForm, count: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
                placeholder="Optional notes…"
              />
            </div>
            <Button
              className="w-full"
              onClick={saveEdit}
              disabled={editMut.isPending}
            >
              {editMut.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund + receipt */}
      <RefundDialog
        fee={refundTarget}
        onOpenChange={(o) => !o && setRefundTarget(null)}
      />
      <FeeReceiptDialog
        receipt={receipt}
        onOpenChange={(o) => !o && setReceipt(null)}
      />
    </div>
  );
};

export default FeeManagement;
