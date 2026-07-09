import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle } from "lucide-react";
import { commsTimelineService } from "@/features/communication/services";
import { StatusChip } from "./comms/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication History — a Student-360 card. READ-ONLY reuse of
// commsTimelineService (which reads message_queue by recipient), filtered to the
// fee contexts. No new query surface, no new table.
// ─────────────────────────────────────────────────────────────────────────────

const FEE_CTX = new Set(["fee_receipt", "fee_due", "fee_overdue", "fee_installment"]);

export const StudentFeeCommsCard: React.FC<{ studentId: string; phone?: string }> = ({
  studentId,
  phone,
}) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["fee-comms", "timeline", studentId, phone ?? ""],
    queryFn: () => commsTimelineService.forRecipient({ studentId, phone }, 60),
    enabled: !!studentId,
  });

  const entries = data.filter((e) => FEE_CTX.has(e.context ?? ""));

  return (
    <div className="glass-card p-4">
      <p className="text-sm font-semibold text-foreground mb-3">Fee Communication History</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fee receipts or reminders sent yet.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 text-sm border-b border-border/30 pb-2 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {e.channel === "email" ? (
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                  )}
                  <span className="font-medium text-foreground capitalize">
                    {(e.context ?? "").replace("fee_", "").replace("_", " ") || "receipt"}
                  </span>
                  <StatusChip status={e.status} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {e.recipientName ?? e.recipientPhone ?? "—"}
                  {e.lastError ? ` · ${e.lastError}` : ""}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {String(e.sentAt ?? e.createdAt).slice(0, 16).replace("T", " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
