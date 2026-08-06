// ──────────────────────────────────────────────────────────────────────────────
// IMPERSONATION DIALOG
//
// The ONLY route from the control plane to a tenant's actual data.
//
// ┌── WHAT ACTUALLY HAPPENS WHEN YOU PRESS START ──────────────────────────┐
// │ 1. The edge function verifies the caller is an MFA-enrolled platform   │
// │    user holding the `impersonate` capability.                          │
// │ 2. It confirms the target is an ACTIVE member of that organization and │
// │    is NOT itself a platform user (no support → owner escalation).      │
// │ 3. It writes a grant row: who, as whom, which tenant, why, until when. │
// │ 4. It mints a magic-link token for the target user.                    │
// │ 5. THIS DIALOG hands that token to a NEW TAB, which exchanges it for a │
// │    session there.                                                      │
// │                                                                        │
// │ The platform admin gains no rights at any point. They become an        │
// │ existing tenant user, and every RLS policy applies to that user        │
// │ exactly as it always does. There is no bypass to misconfigure.         │
// └────────────────────────────────────────────────────────────────────────┘
//
// WHY A SEPARATE TAB, NOT THIS ONE: supabase-js keeps one session per storage
// key per origin. Exchanging the token here would REPLACE the platform session
// with the tenant user's — logging the operator out of the control plane and,
// worse, leaving no platform identity to end the grant with.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { ShieldAlert, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { platformService } from "../services/platform.service";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  organizationName: string;
}

export const ImpersonationDialog: React.FC<Props> = ({
  open, onOpenChange, organizationId, organizationName,
}) => {
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ grantId: string; expiresAt: string } | null>(null);

  const start = async () => {
    if (!targetUserId.trim() || !reason.trim()) return;
    setBusy(true);
    try {
      const res = await platformService.startImpersonation({
        organizationId,
        targetUserId: targetUserId.trim(),
        reason: reason.trim(),
        ticketRef: ticketRef.trim() || undefined,
        minutes: Number(minutes),
        customerConsent: consent,
      });

      // Hand the token to a NEW tab. `verifyOtp` runs there, so the tenant
      // session never touches this tab's storage and the control-plane
      // identity survives — which is what lets us end the grant afterwards.
      const url = new URL(window.location.origin);
      url.pathname = "/impersonate";
      url.searchParams.set("token", res.tokenHash);
      url.searchParams.set("email", res.email);
      url.searchParams.set("grant", res.grantId);
      window.open(url.toString(), "_blank", "noopener");

      setActive({ grantId: res.grantId, expiresAt: res.expiresAt });
      toast.success("Impersonation session started", {
        description: `Expires ${new Date(res.expiresAt).toLocaleTimeString()}. Every action is attributed to you in the audit log.`,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await platformService.endImpersonation(active.grantId, "ended by operator");
      toast.success("Impersonation ended");
      setActive(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Impersonate a user in {organizationName}
          </DialogTitle>
          <DialogDescription>
            You will act AS an existing user of this organization. You gain no extra
            rights — their permissions apply exactly as normal — and every action is
            recorded against your platform account.
          </DialogDescription>
        </DialogHeader>

        {active ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <div className="font-medium">Session active</div>
              <p className="text-muted-foreground mt-1">
                Expires at {new Date(active.expiresAt).toLocaleTimeString()}. It also
                expires automatically — closing the tab is not enough to end the grant.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={end} disabled={busy}>
              End impersonation now
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="target">Target user ID</Label>
              <Input
                id="target" value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="auth.users UUID"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                The tenant supplies this (or support reads it from the ticket). The
                control plane deliberately cannot list a customer's users — that
                would put their staff names and emails on a platform screen.
              </p>
            </div>

            <div>
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea
                id="reason" value={reason} rows={2}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Investigating fee receipt not generating — ticket #482"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ticket">Ticket reference</Label>
                <Input
                  id="ticket" value={ticketRef}
                  onChange={(e) => setTicketRef(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={minutes} onValueChange={setMinutes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">60 minutes (max)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(Boolean(v))}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                The customer has consented to this access. Recorded on the grant.
              </span>
            </label>
          </div>
        )}

        {!active && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={start} disabled={busy || !targetUserId.trim() || !reason.trim()}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {busy ? "Starting…" : "Start in new tab"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
