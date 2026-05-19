import { useState } from "react";
import { EntityFormModal } from "@/shared/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useApproveAdmission } from "../hooks";
import type { Enquiry } from "../types/enquiry.types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enquiry: Enquiry;
  /** Available batches the operator can pick. Caller supplies. */
  batches?: string[];
  /** Default campus if the enquiry has none. */
  defaultCampus?: string;
  onSuccess?: (result: { studentId: string; feeId?: string }) => void;
}

/**
 * Conversion = approve admission. Creates the student (always) and
 * optionally an initial fee record. Orchestration lives in
 * admissionsService; this dialog is purely the form.
 */
export const ConversionDialog = ({
  open,
  onOpenChange,
  enquiry,
  batches = [],
  defaultCampus,
  onSuccess,
}: Props) => {
  const [batch, setBatch] = useState(batches[0] ?? "Pending Allocation");
  const [campus, setCampus] = useState(enquiry.campus ?? defaultCampus ?? "");
  const [createFee, setCreateFee] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [feeDueSince, setFeeDueSince] = useState("");

  const approve = useApproveAdmission();

  const submit = async () => {
    try {
      const result = await approve.mutateAsync({
        enquiryId: enquiry.id,
        studentName: enquiry.name,
        batch,
        campus: campus || undefined,
        initialFee: createFee
          ? { amount: Number(feeAmount) || 0, dueSince: feeDueSince || undefined }
          : undefined,
      });
      toast.success(`Admission approved for ${enquiry.name}`);
      onSuccess?.(result);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    }
  };

  return (
    <EntityFormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Approve admission — ${enquiry.name}`}
      description="Creates a student record and (optionally) an initial fee entry."
      submitLabel="Approve & convert"
      isSubmitting={approve.isPending}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor="conv-batch">Batch</Label>
        <Input
          id="conv-batch"
          list="conv-batch-list"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          placeholder="Pending Allocation"
        />
        {batches.length > 0 && (
          <datalist id="conv-batch-list">
            {batches.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="conv-campus">Campus</Label>
        <Input
          id="conv-campus"
          value={campus}
          onChange={(e) => setCampus(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Create initial fee record</p>
          <p className="text-xs text-muted-foreground">
            Otherwise the fee can be added later from Fees Management.
          </p>
        </div>
        <Switch checked={createFee} onCheckedChange={setCreateFee} />
      </div>

      {createFee && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="conv-fee-amount">Amount (₹)</Label>
            <Input
              id="conv-fee-amount"
              inputMode="decimal"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="conv-fee-due">Due since</Label>
            <Input
              id="conv-fee-due"
              type="date"
              value={feeDueSince}
              onChange={(e) => setFeeDueSince(e.target.value)}
            />
          </div>
        </div>
      )}
    </EntityFormModal>
  );
};
