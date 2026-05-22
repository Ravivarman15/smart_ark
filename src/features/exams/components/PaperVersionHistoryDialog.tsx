import { History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMcqPaperVersions } from "../hooks";

interface Props {
  paperId: string | null;
  onOpenChange: (open: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paper version history — every question-set save snapshots a version row.
// This dialog lists them newest-first as an audit-friendly trail.
// ─────────────────────────────────────────────────────────────────────────────
export const PaperVersionHistoryDialog = ({ paperId, onOpenChange }: Props) => {
  const { data: versions = [], isLoading } = useMcqPaperVersions(paperId);

  return (
    <Dialog open={!!paperId} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" /> Version History
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading history…
          </p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No saved versions yet. Each time the question set is saved a version
            is recorded here.
          </p>
        ) : (
          <ol className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-border/60 bg-card/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Version {v.version}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
                {v.summary && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.summary}
                  </p>
                )}
                {v.changedByName && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    by {v.changedByName}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
};
