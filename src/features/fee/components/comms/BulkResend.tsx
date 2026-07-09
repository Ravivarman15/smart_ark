import React, { useMemo, useState } from "react";
import { Mail, MessageCircle, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelHeading, StatusChip } from "./shared";
import { formatINR } from "../../utils/feeCalc";
import { useFeeReceipts, useResendReceipts, type ResendTarget } from "../../hooks/useFeeComms";
import type { ReceiptRow } from "../../services";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Receipt Resend — pick receipts by rich filters and re-deliver Email /
// WhatsApp through the EXISTING feeReceiptDeliveryService (force bypasses the
// duplicate guard). Delivery status per channel is read from message_queue.
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ["", "Cash", "Cheque", "Bank Transfer", "UPI", "Card", "Other"];

export const BulkResend: React.FC<{ canResend: boolean }> = ({ canResend }) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [klass, setKlass] = useState("");
  const [section, setSection] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: receipts = [], isLoading } = useFeeReceipts({
    from: from || undefined,
    to: to || undefined,
    method: method || undefined,
  });
  const resend = useResendReceipts();

  const classes = useMemo(
    () => [...new Set(receipts.map((r) => r.className).filter(Boolean) as string[])].sort(),
    [receipts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (klass && r.className !== klass) return false;
      if (section && r.section !== section) return false;
      if (statusFilter) {
        const s = statusFilter;
        const hit =
          (r.emailStatus ?? "not sent") === s || (r.whatsappStatus ?? "not sent") === s;
        if (!hit) return false;
      }
      if (q) {
        return (
          (r.studentName ?? "").toLowerCase().includes(q) ||
          r.receiptNo.toLowerCase().includes(q) ||
          (r.parentName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [receipts, klass, section, statusFilter, search]);

  const selectedRows = filtered.filter((r) => selected.has(r.installmentId));
  const selectedAmount = selectedRows.reduce((s, r) => s + r.amount, 0);

  const toTarget = (r: ReceiptRow): ResendTarget => ({
    studentFeeId: r.studentFeeId,
    receiptNo: r.receiptNo,
    amount: r.amount,
    amountPending: r.amountPending,
    paymentMethod: r.method,
    date: r.date,
  });

  const run = async (rows: ReceiptRow[], force: boolean) => {
    if (rows.length === 0) {
      toast.info("No receipts selected.");
      return;
    }
    const results = await resend.mutateAsync({ targets: rows.map(toTarget), force });
    const queued = results.filter((r) => r.whatsapp === "queued" || r.whatsapp === "sent" || r.email === "sent").length;
    const dup = results.filter((r) => r.whatsapp === "duplicate" || r.email === "duplicate").length;
    const failed = results.filter((r) => r.whatsapp === "failed" || r.email === "failed").length;
    const sampleError = results.find((r) => r.error)?.error;
    const summary = `${queued} sent/queued · ${dup} already-sent · ${failed} failed`;
    if (failed > 0 || sampleError) {
      toast.warning(`${summary}${sampleError ? ` — e.g. ${sampleError}` : ""}`, { duration: 8000 });
    } else {
      toast.success(summary);
    }
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((r) => r.installmentId)));

  return (
    <div className="space-y-4">
      <PanelHeading
        title="Bulk Receipt Resend"
        desc="Re-send Email / WhatsApp receipts for any collected payment. Force bypasses the duplicate guard."
      />

      {/* Filters */}
      <div className="glass-card p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <label className="text-xs text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 mt-0.5" />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 mt-0.5" />
        </label>
        <label className="text-xs text-muted-foreground">
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-8 mt-0.5 bg-background border border-border rounded-md px-2 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m || "All methods"}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Class / Standard
          <select value={klass} onChange={(e) => setKlass(e.target.value)} className="w-full h-8 mt-0.5 bg-background border border-border rounded-md px-2 text-sm">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Section
          <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Any" className="h-8 mt-0.5" />
        </label>
        <label className="text-xs text-muted-foreground">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full h-8 mt-0.5 bg-background border border-border rounded-md px-2 text-sm">
            {["", "not sent", "queued", "sent", "delivered", "read", "failed"].map((s) => (
              <option key={s} value={s}>{s || "Any status"}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search student / receipt / parent…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 bg-background/50" />
        </div>
        <Button size="sm" variant="outline" onClick={selectAllFiltered}>Select Filtered ({filtered.length})</Button>
        <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear</Button>
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border/50">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2 text-left font-medium">Receipt</th>
                <th className="px-3 py-2 text-left font-medium">Student</th>
                <th className="px-3 py-2 text-left font-medium">Parent</th>
                <th className="px-3 py-2 text-left font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading receipts…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No receipts match these filters.</td></tr>
              )}
              {filtered.slice(0, 400).map((r) => (
                <tr key={r.installmentId} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(r.installmentId)} onChange={() => toggle(r.installmentId)} disabled={!canResend} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.receiptNo}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{r.studentName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{[r.className, r.section].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="text-muted-foreground">{r.parentName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.email ? "✉︎" : "no email"} · {r.mobile ? "☎︎" : "no mobile"}</div>
                  </td>
                  <td className="px-3 py-2 font-medium">{formatINR(r.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.date}</td>
                  <td className="px-3 py-2"><StatusChip status={r.emailStatus} /></td>
                  <td className="px-3 py-2"><StatusChip status={r.whatsappStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action bar */}
      <div className="glass-card p-3 flex items-center justify-between flex-wrap gap-3 sticky bottom-0">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selectedRows.length}</span> selected ·{" "}
          <span className="font-medium text-foreground">{formatINR(selectedAmount)}</span> ·{" "}
          est. {selectedRows.length * 2} messages
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canResend || selectedRows.length === 0 || resend.isPending} onClick={() => run(selectedRows, false)}>
            <Send className="w-3.5 h-3.5 mr-1" /> Send Selected
          </Button>
          <Button size="sm" variant="outline" disabled={!canResend || filtered.length === 0 || resend.isPending} onClick={() => run(filtered, false)}>
            <Mail className="w-3.5 h-3.5 mr-1" /> Send All Filtered
          </Button>
          <Button size="sm" disabled={!canResend || selectedRows.length === 0 || resend.isPending} onClick={() => run(selectedRows, true)} className="bg-amber-600 hover:bg-amber-700">
            <MessageCircle className="w-3.5 h-3.5 mr-1" /> Force Resend
          </Button>
        </div>
      </div>
      {resend.isPending && <p className="text-xs text-muted-foreground">Sending… this runs sequentially to protect the providers.</p>}
    </div>
  );
};
