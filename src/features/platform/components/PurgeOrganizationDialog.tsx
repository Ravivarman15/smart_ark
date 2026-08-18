import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePurgeOrganization, usePurgePreview } from "../hooks/usePlatform";

// ──────────────────────────────────────────────────────────────────────────────
// PERMANENT ERASURE
//
// The only irreversible action in the platform console, so it is the only one
// that shows you the damage before it asks you to confirm.
//
// The preview runs as soon as the dialog opens: a per-table row count from the
// SAME function that will do the deleting, so the number on screen cannot
// disagree with what happens. The slug field stays disabled until it has
// arrived — you should not be able to type your way past a screen you have not
// been shown.
// ──────────────────────────────────────────────────────────────────────────────

export const PurgeOrganizationDialog = ({
  open,
  onOpenChange,
  organizationId,
  organizationSlug,
  organizationName,
  requestId,
  onPurged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  requestId: string;
  onPurged: () => void;
}) => {
  const preview = usePurgePreview();
  const purge = usePurgeOrganization();
  const [confirm, setConfirm] = useState("");

  const { mutate: runPreview, reset: resetPreview } = preview;

  useEffect(() => {
    if (!open) return;
    setConfirm("");
    resetPreview();
    runPreview({ organizationId, requestId });
  }, [open, organizationId, requestId, runPreview, resetPreview]);

  const report = preview.data;
  const tables = useMemo(
    () =>
      Object.entries(report?.tables ?? {}).sort(
        ([, a], [, b]) => Number(b) - Number(a),
      ),
    [report],
  );

  const ready = !!report && !preview.isPending;
  const matches = confirm.trim() === organizationSlug;

  return (
    <Dialog open={open} onOpenChange={(v) => !purge.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Erase {organizationName || organizationSlug} permanently
          </DialogTitle>
          <DialogDescription>
            This cannot be undone, and there is no backup restore behind it. The
            organization's records are removed from the database and its files
            from storage.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Counting what would be erased…
          </div>
        )}

        {preview.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(preview.error as Error).message}
          </p>
        )}

        {ready && (
          <>
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3">
              <div className="text-sm font-medium text-red-600 dark:text-red-400">
                {report.total_rows.toLocaleString("en-IN")} rows across {tables.length} tables
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Students, staff, fees, payroll, attendance, exams and messages —
                everything this organization has recorded.
              </p>
            </div>

            <ScrollArea className="h-48 rounded-md border">
              <table className="w-full text-xs">
                <tbody>
                  {tables.map(([table, count]) => (
                    <tr key={table} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-1.5 font-mono text-[11px]">{table}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {Number(count).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                  {tables.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-muted-foreground">
                        This organization holds no records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>

            <div className="space-y-1.5">
              <Label htmlFor="purge-confirm" className="text-xs">
                Type <code className="font-semibold">{organizationSlug}</code> to confirm
              </Label>
              <Input
                id="purge-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={organizationSlug}
                autoComplete="off"
                disabled={purge.isPending}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={purge.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ready || !matches || purge.isPending}
            onClick={() =>
              purge.mutate(
                { organizationId, requestId, confirmSlug: confirm.trim() },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    onPurged();
                  },
                },
              )
            }
          >
            {purge.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Erase permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
