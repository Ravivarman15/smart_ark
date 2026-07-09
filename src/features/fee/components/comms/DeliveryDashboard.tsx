import React, { useState } from "react";
import { AlertTriangle, Clock, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatTile, PanelHeading } from "./shared";
import { formatDuration, type DeliveryStats } from "../../utils/feeCommsCalc";
import { useFeeRecentFailures } from "../../hooks/useFeeComms";
import { commsHealthService, type HealthTestResult } from "@/features/communication/services";

// ── Live pipeline diagnostics — runs the REAL Brevo + AiSensy + queue probes via
// the shared commsHealthService (reuses the send-email / send-aisensy edge
// functions in test mode). Lets an admin prove delivery in one click and see the
// exact provider response — no new engine, no messages to real parents. ────────
const DiagnosticsCard: React.FC = () => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<HealthTestResult[]>([]);

  const run = async () => {
    setRunning(true);
    try {
      const out = await Promise.all([
        commsHealthService.testQueue(),
        email.trim() ? commsHealthService.testEmail(email.trim()) : Promise.resolve<HealthTestResult>({ kind: "email", pass: false, summary: "Enter a test email to probe Brevo." }),
        phone.trim() ? commsHealthService.testWhatsApp(phone.trim()) : Promise.resolve<HealthTestResult>({ kind: "whatsapp", pass: false, summary: "Enter a test WhatsApp number to probe AiSensy." }),
      ]);
      setResults(out);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Stethoscope className="w-4 h-4 text-accent" /> Delivery Diagnostics
      </p>
      <p className="text-xs text-muted-foreground">
        Sends a real test through the same Email (Brevo) + WhatsApp (AiSensy) engines the receipts use. Use your own
        address/number — this does not touch parent records.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input placeholder="Test email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
        <Input placeholder="Test WhatsApp number" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
        <Button size="sm" onClick={run} disabled={running}>
          {running ? "Running…" : "Run Diagnostics"}
        </Button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {results.map((r, i) => (
            <div key={i} className="text-sm flex items-start gap-2">
              <span className={r.pass ? "text-green-600" : "text-red-600"}>{r.pass ? "✓" : "✗"}</span>
              <div className="min-w-0">
                <span className="font-medium capitalize">{r.kind}</span>: {r.summary}
                {r.detail && <p className="text-[11px] text-muted-foreground break-words">{r.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Delivery Dashboard — the live queue lifecycle for fee messages. Reads the same
// message_queue the Communication Center drainer writes; FeesRealtimeProvider
// busts the query on any fee-context queue change, so this updates in realtime.
// ─────────────────────────────────────────────────────────────────────────────

export const DeliveryDashboard: React.FC<{ delivery: DeliveryStats }> = ({ delivery }) => {
  const { data: failures = [] } = useFeeRecentFailures();

  return (
    <div className="space-y-4">
      <PanelHeading
        title="Delivery Dashboard"
        desc="Live receipt delivery pipeline across Email + WhatsApp."
        right={
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> live
          </span>
        }
      />

      <DiagnosticsCard />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile label="Queued" value={delivery.queued} tone={delivery.queued ? "warn" : "default"} />
        <StatTile label="Sending" value={delivery.processing} tone={delivery.processing ? "warn" : "default"} />
        <StatTile label="Sent" value={delivery.sent} />
        <StatTile label="Delivered" value={delivery.delivered} tone="good" />
        <StatTile label="Read" value={delivery.read} tone="good" />
        <StatTile label="Failed" value={delivery.failed} tone={delivery.failed ? "bad" : "good"} />
        <StatTile label="Retrying" value={delivery.retrying} tone={delivery.retrying ? "warn" : "default"} />
        <StatTile label="Bounced" value={delivery.bounced} tone={delivery.bounced ? "bad" : "good"} />
        <StatTile label="Pending" value={delivery.pending} tone={delivery.pending ? "warn" : "default"} />
        <StatTile
          label="Avg Delivery"
          value={
            <span className="inline-flex items-center gap-1">
              <Clock className="w-4 h-4" /> {formatDuration(delivery.avgDeliveryMs)}
            </span>
          }
        />
      </div>

      <div className="glass-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-500" /> Recent Failures & Retry Queue
        </p>
        {failures.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No recent failures 🎉</p>
        ) : (
          <div className="space-y-2">
            {failures.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm border-b border-border/30 pb-2 last:border-0">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{f.recipientName ?? "—"}</span>
                  <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{f.channel}</span>
                  <p className="text-xs text-red-600 truncate">{f.error ?? "Unknown error"}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{f.createdAt.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
