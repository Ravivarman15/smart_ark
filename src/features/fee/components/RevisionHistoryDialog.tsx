import { History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeeStructureRevisions } from "../hooks";
import { formatINR } from "../utils";

interface Props {
  structureId: string | null;
  structureName?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read a numeric field out of a JSONB revision snapshot, defensively. */
const num = (snap: Record<string, unknown>, key: string): number =>
  Number(snap[key] ?? 0);

/**
 * Read-only audit trail of every edit made to a fee structure. Each row is a
 * snapshot of the structure as it was BEFORE that edit.
 */
export const RevisionHistoryDialog = ({
  structureId,
  structureName,
  onOpenChange,
}: Props) => {
  const { data: revisions = [], isLoading } =
    useFeeStructureRevisions(structureId);

  return (
    <Dialog open={!!structureId} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            Revision History{structureName ? ` — ${structureName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="py-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Loading history…
            </p>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No edits recorded yet. Each change to this structure will be
              snapshotted here.
            </p>
          ) : (
            <ol className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {revisions.map((rev) => (
                <li
                  key={rev.id}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {String(rev.snapshot.name ?? "Fee structure")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(rev.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      Total: {formatINR(num(rev.snapshot, "total_amount"))}
                    </span>
                    <span>
                      Seat: {formatINR(num(rev.snapshot, "seat_confirmation_amount"))}
                    </span>
                    <span>
                      1st: {formatINR(num(rev.snapshot, "first_payment_amount"))}
                    </span>
                    <span>
                      Installments: {num(rev.snapshot, "installment_count")}
                    </span>
                  </div>
                  {rev.note && (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      {rev.note}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
