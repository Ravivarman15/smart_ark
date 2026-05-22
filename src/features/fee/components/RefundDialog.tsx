import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refundSchema, type RefundFormValues } from "../schemas/fee.schema";
import { useIssueRefund } from "../hooks";
import { formatINR } from "../utils";
import { PAYMENT_METHODS, type StudentFee } from "../types/fee.types";

interface Props {
  fee: StudentFee | null;
  onOpenChange: (open: boolean) => void;
  onIssued?: () => void;
}

/**
 * Issue a refund against a student fee. The hook decides whether the refund
 * settles immediately or is recorded pending approval (RBAC: fee.refund.approve)
 * — the dialog just reports which happened.
 */
export const RefundDialog = ({ fee, onOpenChange, onIssued }: Props) => {
  const issue = useIssueRefund();
  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { amount: 0, reason: "", method: "Bank Transfer" },
  });

  // Reset the form whenever a different fee is selected.
  useEffect(() => {
    if (fee) form.reset({ amount: 0, reason: "", method: "Bank Transfer" });
  }, [fee, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!fee) return;
    try {
      const refund = await issue.mutateAsync({
        studentFeeId: fee.id,
        studentId: fee.studentId,
        studentName: fee.studentName,
        amount: values.amount,
        reason: values.reason,
        method: values.method,
      });
      toast.success(
        refund.status === "pending_approval"
          ? `Refund of ${formatINR(refund.amount)} submitted for approval`
          : `Refund of ${formatINR(refund.amount)} issued`,
      );
      onIssued?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to issue refund",
      );
    }
  });

  return (
    <Dialog open={!!fee} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Refund — {fee?.studentName ?? "Student"}</DialogTitle>
        </DialogHeader>
        {fee && (
          <form onSubmit={onSubmit} className="space-y-4 py-1">
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount received</span>
                <span className="font-medium text-green-600">
                  {formatINR(fee.amountReceived)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance pending</span>
                <span className="font-medium">
                  {formatINR(fee.amountPending)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Refund amount (₹) *</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  {...form.register("amount")}
                />
                {form.formState.errors.amount && (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Method</label>
                <select
                  {...form.register("method")}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason *</label>
              <Input
                placeholder="e.g. Withdrawal — partial fee return"
                {...form.register("reason")}
              />
              {form.formState.errors.reason && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.reason.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={issue.isPending}>
              {issue.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Undo2 className="w-4 h-4 mr-2" />
              )}
              {issue.isPending ? "Processing…" : "Issue Refund"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
