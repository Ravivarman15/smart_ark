// ──────────────────────────────────────────────────────────────────────────────
// MESSAGING USAGE SERVICE  (the "SMS Plan" settings page)
//
// ┌── WHY THIS NO LONGER READS sms_transactions ───────────────────────────┐
// │ It queried `sms_transactions`, a table that does not exist and never   │
// │ did. Every read errored, was swallowed, and the page rendered          │
// │ balance 0 / usage 0 / "No SMS activity recorded yet" — against a       │
// │ database holding 342 real messages. Worse, it showed a LOW BALANCE     │
// │ warning permanently, because 0 ≤ 100 is always true.                   │
// │                                                                        │
// │ The product has no prepaid credit ledger. It has PLAN ALLOWANCES       │
// │ (plans.whatsapp_credits / email_credits) consumed by real sends        │
// │ recorded in message_queue. So that is what this reports: entitlement   │
// │ against actual consumption, per channel, for the current calendar      │
// │ month — which is the window allowances reset on.                       │
// └────────────────────────────────────────────────────────────────────────┘
//
// Counts use head:true + count:"exact", so the database returns a number and
// never ships 342 rows to the browser to be counted there. The activity list
// is the only query that transfers rows, and it is capped at 25.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import type { MessagingUsageSummary, MessagingChannelUsage } from "../types/settings.types";

/** Channels the queue can carry. `sms` has no traffic yet; it is still shown. */
const CHANNELS = ["whatsapp", "sms", "email"] as const;
type Channel = (typeof CHANNELS)[number];

/** Statuses that mean "this consumed allowance". A cancelled message did not. */
const BILLABLE = ["sent", "delivered", "read"];

interface QueueRow {
  id: string;
  channel: string;
  status: string;
  template_key: string | null;
  context_type: string | null;
  recipient_name: string | null;
  created_at: string;
  sent_at: string | null;
  last_error: string | null;
}

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

class MessagingUsageService extends BaseService {
  private async countWhere(
    channel: Channel,
    statuses: string[] | null,
    since?: string,
  ): Promise<number> {
    // `as never` on the table name, matching the rest of this feature: the
    // generated Database type makes a conditionally-built filter chain blow the
    // instantiation depth limit (TS2589), and the row shape is asserted at the
    // consumption site instead.
    let q = this.db
      .from("message_queue" as never)
      .select("id", { count: "exact", head: true })
      .eq("channel", channel);
    if (statuses) q = q.in("status", statuses);
    if (since) q = q.gte("created_at", since);
    const { count, error } = await q;
    // A blocked or failed count must not be reported as zero usage — that is
    // how the previous version came to claim an empty balance. Surfacing -1
    // would be worse; the caller treats a throw as "unavailable".
    if (error) throw error;
    return count ?? 0;
  }

  async summary(): Promise<MessagingUsageSummary> {
    const since = startOfMonth();

    // Plan allowances. RLS scopes the subscription to this organization.
    const subRes = await this.db
      .from("subscriptions" as never)
      .select("plans(name, whatsapp_credits, email_credits)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const planEmbed = subRes.error
      ? null
      : (subRes.data as unknown as {
          plans: { name: string; whatsapp_credits: number | null; email_credits: number | null }
            | { name: string; whatsapp_credits: number | null; email_credits: number | null }[]
            | null;
        } | null)?.plans ?? null;
    const plan = Array.isArray(planEmbed) ? planEmbed[0] ?? null : planEmbed;

    const allowanceFor = (c: Channel): number | undefined => {
      if (!plan) return undefined;
      // NULL = unlimited, which the UI renders as no cap rather than as zero.
      if (c === "email") return plan.email_credits ?? undefined;
      // WhatsApp and SMS both draw on the messaging allowance; the plans table
      // has one figure for outbound messaging, not one per transport.
      return plan.whatsapp_credits ?? undefined;
    };

    const channels: MessagingChannelUsage[] = [];
    for (const c of CHANNELS) {
      const [thisMonth, lifetime, failed] = await Promise.all([
        this.countWhere(c, BILLABLE, since),
        this.countWhere(c, BILLABLE),
        this.countWhere(c, ["failed"], since),
      ]);
      channels.push({
        channel: c,
        sentThisMonth: thisMonth,
        sentLifetime: lifetime,
        failedThisMonth: failed,
        allowance: allowanceFor(c),
      });
    }

    const pending = await this.countWhere("whatsapp", ["pending", "queued"])
      .catch(() => 0);

    const recent = await this.db
      .from("message_queue" as never)
      .select(
        "id, channel, status, template_key, context_type, recipient_name, created_at, sent_at, last_error",
      )
      .order("created_at", { ascending: false })
      .limit(25);

    const history = recent.error
      ? []
      : ((recent.data ?? []) as unknown as QueueRow[]).map((r) => ({
          id: r.id,
          channel: r.channel,
          status: r.status,
          label: r.template_key ?? r.context_type ?? "Message",
          recipient: r.recipient_name ?? undefined,
          occurredAt: r.sent_at ?? r.created_at,
          error: r.last_error ?? undefined,
        }));

    return {
      planName: plan?.name,
      periodStart: since,
      channels,
      queued: pending,
      history,
    };
  }
}

export const messagingUsageService = new MessagingUsageService();
/** Kept so existing imports keep resolving. */
export const smsPlanService = messagingUsageService;
