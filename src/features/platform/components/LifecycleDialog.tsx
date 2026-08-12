// ──────────────────────────────────────────────────────────────────────────────
// ORGANIZATION LIFECYCLE DIALOG
//
// One dialog for hold / suspend / archive / restore, because they share the
// same shape — reason, consequences, confirmation — and four near-identical
// dialogs is four places for the consequences text to drift out of sync with
// what the code actually does.
//
// Every state below says PLAINLY what happens to the customer's data, and the
// answer is always "nothing". That is not reassurance copy; it is the literal
// behaviour of platform_set_organization_status(), which only ever writes a
// status and a timestamp.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSetLifecycle } from "../hooks/usePlatform";

export type LifecycleAction = "hold" | "suspended" | "archived" | "active";

interface Consequence {
  title: string;
  verb: string;
  tone: "warn" | "danger" | "safe";
  description: string;
  effects: string[];
}

const CONSEQUENCES: Record<LifecycleAction, Consequence> = {
  hold: {
    title: "Place organization on hold",
    verb: "Place on hold",
    tone: "warn",
    description:
      "A reversible commercial pause. The customer keeps their logins and can still settle what they owe.",
    effects: [
      "Teaching, admissions, exams and communication modules become unavailable",
      "Sign-in, settings, fees and reports stay open, so the customer can pay and export",
      "New provisioning stops",
      "No record is deleted, archived or altered",
    ],
  },
  suspended: {
    title: "Suspend organization",
    verb: "Suspend",
    tone: "danger",
    description:
      "Closes the product down to the minimum needed to sign in, understand why, and pay.",
    effects: [
      "All modules except sign-in, settings and fees become unavailable",
      "Users keep their accounts and passwords",
      "Billing and invoices remain reachable",
      "No record is deleted, archived or altered",
    ],
  },
  archived: {
    title: "Archive organization",
    verb: "Archive",
    tone: "danger",
    description:
      "The end of the relationship without destroying anything. This is the terminal state this platform supports.",
    effects: [
      "Every module becomes unavailable",
      "Every student, fee, payroll, exam and attendance record is retained in full",
      "Billing history and the audit trail are retained",
      "Reversible — restoring returns the organization to active",
    ],
  },
  active: {
    title: "Restore organization",
    verb: "Restore",
    tone: "safe",
    description: "Returns the organization to normal operation.",
    effects: [
      "Modules return to whatever the plan and any overrides allow",
      "Hold, suspension and archival timestamps are cleared",
      "Data is unchanged — it never left",
    ],
  },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: LifecycleAction;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentStatus: string;
  /** Reason recorded when this organization was last paused, if any. */
  currentReason?: string | null;
  /** True when the tenant carries an organization_protections row. */
  isProtected?: boolean;
  protectionReason?: string | null;
}

export const LifecycleDialog: React.FC<Props> = ({
  open, onOpenChange, action, organizationId, organizationName, organizationSlug,
  currentStatus, currentReason, isProtected, protectionReason,
}) => {
  const c = CONSEQUENCES[action];
  const setLifecycle = useSetLifecycle();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");

  const destructive = action !== "active";
  // The protected-tenant acknowledgement is a SECOND gate on top of the reason,
  // and only for the production reference tenant. The database enforces it too
  // (guard_protected_organization), so a client that skipped this input would
  // still be refused — this input exists to make the operator read the sentence.
  const needsAck = Boolean(isProtected) && destructive;
  const ackPhrase = organizationSlug;
  const ackOk = !needsAck || typed.trim() === ackPhrase;
  const reasonOk = !destructive || reason.trim().length >= 5;

  const submit = () => {
    setLifecycle.mutate(
      {
        organizationId,
        status: action,
        reason: reason.trim() || (action === "active" ? "Restored by Super Admin" : ""),
        acknowledgeProtected: needsAck,
      },
      { onSuccess: () => { onOpenChange(false); setReason(""); setTyped(""); } },
    );
  };

  const toneClass =
    c.tone === "danger" ? "text-red-600 dark:text-red-400"
    : c.tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className={`h-4 w-4 ${toneClass}`} />}
            {c.title}
          </DialogTitle>
          <DialogDescription>
            {organizationName} · currently {currentStatus.replace("_", " ")}. {c.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {c.effects.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>

          {action === "active" && currentReason && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="text-xs text-muted-foreground">Recorded reason for the current state</div>
              <div className="mt-0.5">{currentReason}</div>
            </div>
          )}

          {destructive && (
            <div className="space-y-1.5">
              <Label htmlFor="lifecycle-reason">Reason (required, recorded in the audit log)</Label>
              <Textarea
                id="lifecycle-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Invoice INV-2044 unpaid for 62 days; account manager notified 2026-09-28."
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">
                Whoever restores this organization will read this first.
              </p>
            </div>
          )}

          {needsAck && (
            <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="text-sm">
                  <div className="font-medium">This is a protected production organization</div>
                  <p className="mt-0.5 text-muted-foreground">
                    {protectionReason ??
                      "This tenant is marked as a protected reference organization."}{" "}
                    It is excluded from every bulk operation, and this change affects a live
                    institution's day-to-day operations.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lifecycle-ack">
                  Type <code className="rounded bg-muted px-1">{ackPhrase}</code> to confirm you
                  understand
                </Label>
                <Input
                  id="lifecycle-ack"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={c.tone === "danger" ? "destructive" : "default"}
            onClick={submit}
            disabled={setLifecycle.isPending || !reasonOk || !ackOk}
          >
            {setLifecycle.isPending ? "Working…" : c.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
