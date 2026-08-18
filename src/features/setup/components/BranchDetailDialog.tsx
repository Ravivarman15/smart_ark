import { ReactNode } from "react";
import {
  Building2, Star, MapPin, GraduationCap, Users, Layers, ExternalLink,
  CheckCircle2, XCircle, Hash, CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { branchIsDeletable } from "../services/branches.service";
import type { Branch } from "../types/setup.types";

// ──────────────────────────────────────────────────────────────────────────────
// BRANCH DETAIL — read-only.
//
// Separate from the edit sheet on purpose. Opening a form to answer "how many
// students are at North Campus?" invites an accidental edit, and the counts are
// the most-asked question about a branch — they are also exactly what decides
// whether it can be deleted, so this view explains that instead of leaving the
// user to discover a missing Delete button.
// ──────────────────────────────────────────────────────────────────────────────

const Stat = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) => (
  <div className="rounded-md border border-border/60 p-3 text-center">
    <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
      {icon}
    </div>
    <div className="text-lg font-semibold text-foreground">{value}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-border/40 py-2 last:border-0">
    <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
    <span className="text-right text-sm text-foreground">{children}</span>
  </div>
);

const formatDate = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const BranchDetailDialog = ({
  branch,
  open,
  onOpenChange,
  onEdit,
}: {
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted when the viewer has no edit rights — the button then hides. */
  onEdit?: (branch: Branch) => void;
}) => {
  if (!branch) return null;

  const hasCoords = branch.geoLat != null && branch.geoLng != null;
  const deletable = branchIsDeletable(branch);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-accent" />
            <span className="truncate">{branch.name}</span>
            {branch.isPrimary && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                <Star className="h-3 w-3" /> Primary
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {branch.isActive
              ? "Active — available for new students, staff and classes."
              : "Inactive — hidden from new assignments. Existing records are unchanged."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            icon={<GraduationCap className="h-4 w-4" />}
            label="Students"
            value={branch.studentCount}
          />
          <Stat icon={<Users className="h-4 w-4" />} label="Staff" value={branch.staffCount} />
          <Stat
            icon={<Layers className="h-4 w-4" />}
            label="Classes"
            value={branch.batchCount}
          />
        </div>

        <div className="mt-1">
          <Row label="Short code">
            {branch.code ? (
              <span className="inline-flex items-center gap-1 font-medium">
                <Hash className="h-3 w-3 text-muted-foreground" />
                {branch.code}
              </span>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Address">{branch.address || "—"}</Row>
          <Row label="Coordinates">
            {hasCoords ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                {branch.geoLat!.toFixed(5)}, {branch.geoLng!.toFixed(5)}
              </span>
            ) : (
              "Not set"
            )}
          </Row>
          <Row label="Geofenced check-in">
            {branch.isCheckinLocation ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Enabled
                {branch.geoRadiusMeters ? ` · ${branch.geoRadiusMeters}m` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <XCircle className="h-3.5 w-3.5" />
                Off
              </span>
            )}
          </Row>
          <Row label="Created">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-muted-foreground" />
              {formatDate(branch.createdAt)}
            </span>
          </Row>
        </div>

        {/* Says out loud what the missing Delete button means. */}
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {deletable
            ? "Nothing is assigned to this branch, so it can be deleted — which frees a branch slot on your plan."
            : "This branch cannot be deleted while records are assigned to it. Move them to another branch, or deactivate this one instead. Deactivating does not free a plan slot."}
        </p>

        {branch.mapsUrl && (
          <a
            href={branch.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline underline-offset-4"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Maps
          </a>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit(branch);
              }}
            >
              Edit branch
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
