// ──────────────────────────────────────────────────────────────────────────────
// BulkSendDashboard — the "Smart Send" pre-flight + live delivery panel for
// automated sends. Pure presentation: it composes the AutomatedBatchSummary
// (from buildAutomatedBatch) with the live message_queue rows the panel already
// fetches. No new data sources.
// ──────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { CommsKpiRow, type CommsKpiTile } from "./CommsKpiRow";
import type { AutomatedBatchSummary } from "../utils/commsAutomation";
import type { QueueMessage } from "../types/communication.types";

interface Props {
  /** Pre-flight summary for the currently-selected recipients. */
  summary: AutomatedBatchSummary;
  /** Result of the last enqueue (after the Send button was pressed). */
  lastResult?: { queued: number; skipped: number; invalid: number } | null;
  /** Live queue rows for this template (used for delivery counts). */
  queue?: QueueMessage[];
  loading?: boolean;
}

const countBy = (queue: QueueMessage[]) => {
  const c = { queued: 0, processing: 0, sent: 0, delivered: 0, read: 0, failed: 0, retrying: 0 };
  for (const m of queue) {
    if (m.status === "queued") {
      if ((m.retryCount ?? 0) > 0) c.retrying += 1;
      else c.queued += 1;
    } else if (m.status in c) {
      (c as Record<string, number>)[m.status] += 1;
    }
  }
  return c;
};

export const BulkSendDashboard = ({ summary, lastResult, queue = [], loading }: Props) => {
  const delivery = useMemo(() => countBy(queue), [queue]);

  const preflight: CommsKpiTile[] = [
    { key: "total", label: "Recipients", value: summary.total, tone: "default" },
    { key: "valid", label: "Will send", value: summary.valid, tone: "positive", hint: "valid numbers" },
    { key: "nophone", label: "No / bad phone", value: summary.noPhone, tone: summary.noPhone ? "warning" : "default" },
    { key: "missing", label: "Missing data", value: summary.missingVars, tone: summary.missingVars ? "warning" : "default", hint: "unresolved variables" },
    { key: "skipped", label: "Skipped", value: summary.skipped, tone: summary.skipped ? "warning" : "default" },
  ];

  const deliveryTiles: CommsKpiTile[] = [
    {
      key: "queued",
      label: "Queued",
      value: lastResult ? lastResult.queued : delivery.queued,
      tone: "info",
      hint: delivery.processing ? `${delivery.processing} processing` : undefined,
    },
    { key: "sent", label: "Sent", value: delivery.sent, tone: "info" },
    { key: "delivered", label: "Delivered", value: delivery.delivered, tone: "positive" },
    { key: "read", label: "Read", value: delivery.read, tone: "positive" },
    { key: "retrying", label: "Retrying", value: delivery.retrying, tone: delivery.retrying ? "warning" : "default" },
    { key: "failed", label: "Failed", value: delivery.failed, tone: delivery.failed ? "negative" : "default" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
          Smart send — pre-flight
        </p>
        <CommsKpiRow tiles={preflight} cols={5} loading={loading} />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
          Delivery (this template)
        </p>
        <CommsKpiRow tiles={deliveryTiles} cols={6} />
      </div>
    </div>
  );
};
