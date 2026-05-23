import { useState } from "react";
import { toast } from "sonner";
import { EntityFormModal } from "@/shared/components";
import { Textarea } from "@/components/ui/textarea";
import { FinanceFormField } from "./FinancePageShell";
import {
  useApproveTransaction,
  useRejectTransaction,
} from "../hooks/useFinanceTransactions";
import type { FinanceTransaction } from "../types/finance.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  txn: FinanceTransaction;
  mode: "approve" | "reject";
}

export const ApprovalDialog = ({ open, onOpenChange, txn, mode }: Props) => {
  const approve = useApproveTransaction();
  const reject = useRejectTransaction();
  const [reason, setReason] = useState("");

  const submit = async () => {
    try {
      if (mode === "approve") {
        await approve.mutateAsync(txn.id);
        toast.success("Transaction approved");
      } else {
        if (reason.trim().length < 3) {
          toast.error("Provide a short reason");
          return;
        }
        await reject.mutateAsync({ id: txn.id, reason: reason.trim() });
        toast.success("Transaction rejected");
      }
      setReason("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "approve" ? "Approve Transaction" : "Reject Transaction"}
      description={`${txn.title ?? txn.category} — ${txn.type}`}
      submitLabel={mode === "approve" ? "Approve" : "Reject"}
      isSubmitting={approve.isPending || reject.isPending}
      onSubmit={submit}
    >
      {mode === "reject" ? (
        <FinanceFormField label="Reason" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this is being rejected"
            autoFocus
          />
        </FinanceFormField>
      ) : (
        <p className="text-sm text-muted-foreground">
          Approving will mark this transaction as approved and lock its amount.
        </p>
      )}
    </EntityFormModal>
  );
};
