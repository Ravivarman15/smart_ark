import { useState } from "react";
import { EntityFormModal } from "@/shared/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIssueRefund } from "../hooks";
import { refundSchema } from "../schemas/fee.schema";
import { formatINR } from "../utils/format";
import { toast } from "sonner";
import type { FeeRecord } from "../types/fee.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fee: FeeRecord;
  /** Override the lookup id used by the service (defaults to fee.studentId ?? fee.id). */
  feeRefId?: string;
  onSuccess?: () => void;
}

/**
 * Standard refund dialog. Calls the service via useIssueRefund — never
 * touches supabase directly. Validates amount/reason via the shared schema.
 */
export const RefundDialog = ({ open, onOpenChange, fee, feeRefId, onSuccess }: Props) => {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const issueRefund = useIssueRefund();

  const close = () => {
    setAmount("");
    setReason("");
    onOpenChange(false);
  };

  const submit = async () => {
    const parsed = refundSchema.safeParse({ amount, reason });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await issueRefund.mutateAsync({
        feeRefId: feeRefId ?? fee.studentId ?? fee.id,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
      });
      toast.success(`Refund of ${formatINR(parsed.data.amount)} issued`);
      onSuccess?.();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    }
  };

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Refund — ${fee.student}`}
      description={`Received so far: ${formatINR(fee.received ?? 0)}`}
      submitLabel="Issue refund"
      isSubmitting={issueRefund.isPending}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor="refund-amount">Refund amount (₹)</Label>
        <Input
          id="refund-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="refund-reason">Reason</Label>
        <Textarea
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Cancellation of admission"
          rows={3}
        />
      </div>
    </EntityFormModal>
  );
};
