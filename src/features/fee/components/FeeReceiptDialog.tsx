import { Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatINR, printReceipt } from "../utils";
import type { ReceiptData } from "../types/fee.types";

interface Props {
  receipt: ReceiptData | null;
  onOpenChange: (open: boolean) => void;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground">{value}</span>
  </div>
);

/**
 * Receipt preview — renders the canonical ReceiptData and prints via the
 * standalone HTML document built in utils/receipt, so the print output never
 * depends on the surrounding app styling.
 */
export const FeeReceiptDialog = ({ receipt, onOpenChange }: Props) => (
  <Dialog open={!!receipt} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Payment Receipt</DialogTitle>
      </DialogHeader>
      {receipt && (
        <div className="space-y-3 py-1 text-sm">
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex justify-between font-bold">
              <span>ARK School</span>
              <span>{receipt.receiptNo}</span>
            </div>
            <hr className="border-border" />
            <Row label="Student" value={receipt.studentName ?? "—"} />
            <Row label="Batch" value={receipt.batchName ?? "—"} />
            <Row label="Date" value={receipt.date} />
            <Row label="Method" value={receipt.paymentMethod} />
            {receipt.notes && <Row label="Notes" value={receipt.notes} />}
            <hr className="border-border" />
            <div className="flex justify-between font-bold text-lg">
              <span>Amount Paid</span>
              <span>{formatINR(receipt.amount)}</span>
            </div>
            {receipt.amountPending !== undefined && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Balance pending</span>
                <span>{formatINR(receipt.amountPending)}</span>
              </div>
            )}
          </div>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => printReceipt(receipt)}
          >
            <Receipt className="w-4 h-4 mr-2" /> Print Receipt
          </Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
