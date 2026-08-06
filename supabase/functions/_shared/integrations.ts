// ──────────────────────────────────────────────────────────────────────────────
// PROVIDER CREDENTIAL RESOLUTION
//
// ┌── THE RULE ────────────────────────────────────────────────────────────┐
// │ Every organization uses the PLATFORM's credentials by default.         │
// │ Custom credentials are optional, per channel, and are honoured ONLY    │
// │ once verified.                                                         │
// │                                                                        │
// │ Concretely, resolve() falls back to the platform when:                 │
// │   • no integration row exists            (every existing tenant)       │
// │   • mode = 'platform'                    (the seeded default)          │
// │   • the integration is inactive                                        │
// │   • mode = 'custom' but verified_at IS NULL                            │
// │   • mode = 'custom' but the secret is missing                          │
// │                                                                        │
// │ That last pair matters most. A half-configured SMTP server must never  │
// │ silently swallow a school's absence alerts — an unverified or          │
// │ incomplete custom sender falls back to ours and keeps working.         │
// └────────────────────────────────────────────────────────────────────────┘
//
// This module is the ONLY thing that reads organization_secrets, which has RLS
// enabled and zero policies — deny-all to every authenticated role, readable
// by the service role alone.
// ──────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Db = any;

export type Channel = "whatsapp" | "email" | "sms";

export interface EmailCredentials {
  mode: "platform" | "custom";
  provider: string;
  apiKey?: string;
  senderEmail: string;
  senderName: string;
  /** SMTP-only. */
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  secure?: boolean;
  reason?: string;
}

export interface WhatsappCredentials {
  mode: "platform" | "custom";
  provider: string;
  apiKey: string;
  defaultCampaign: string;
  senderName?: string;
  reason?: string;
}

/** Read one secret. Service role only — see the header. */
async function secret(db: Db, org: string, key: string): Promise<string | null> {
  const { data, error } = await db
    .from("organization_secrets")
    .select("value")
    .eq("organization_id", org)
    .eq("key", key)
    .maybeSingle();
  if (error || !data?.value) return null;
  return data.value as string;
}

interface IntegrationRow {
  provider: string;
  mode: string;
  config: Record<string, unknown>;
  is_active: boolean;
  verified_at: string | null;
}

async function loadIntegration(
  db: Db, org: string | null, channel: Channel,
): Promise<IntegrationRow | null> {
  if (!org) return null;
  const { data } = await db
    .from("organization_integrations")
    .select("provider, mode, config, is_active, verified_at")
    .eq("organization_id", org)
    .eq("channel", channel)
    .maybeSingle();
  return (data as IntegrationRow) ?? null;
}

/** True when the row represents a usable CUSTOM integration. */
function usesCustom(i: IntegrationRow | null): boolean {
  return !!i && i.mode === "custom" && i.is_active && !!i.verified_at;
}

// ── Email ───────────────────────────────────────────────────────────────────

export async function resolveEmailCredentials(
  db: Db, org: string | null,
): Promise<EmailCredentials> {
  const platform: EmailCredentials = {
    mode: "platform",
    provider: "brevo",
    apiKey: Deno.env.get("BREVO_API_KEY") ?? undefined,
    senderEmail: Deno.env.get("SENDER_EMAIL") ?? "",
    senderName: Deno.env.get("SENDER_NAME") ?? "Smart ARK",
  };

  const i = await loadIntegration(db, org, "email");
  if (!usesCustom(i)) {
    return { ...platform, reason: i ? `mode=${i.mode}` : "no integration configured" };
  }

  const cfg = i!.config ?? {};
  const senderEmail = String(cfg.sender_email ?? "");
  const senderName = String(cfg.sender_name ?? platform.senderName);

  // A verified custom integration with no sender address is misconfigured.
  // Fall back rather than attempt a send that will bounce.
  if (!senderEmail) {
    return { ...platform, reason: "custom integration has no sender address" };
  }

  if (i!.provider === "smtp" || i!.provider === "google" || i!.provider === "microsoft") {
    const password = await secret(db, org!, "smtp_password");
    if (!password) return { ...platform, reason: "custom SMTP password missing" };
    return {
      mode: "custom", provider: i!.provider, senderEmail, senderName,
      host: String(cfg.host ?? ""), port: Number(cfg.port ?? 587),
      username: String(cfg.username ?? senderEmail),
      password, secure: Boolean(cfg.secure ?? true),
    };
  }

  // API-key providers: brevo, sendgrid, mailgun, ses.
  const apiKey = await secret(db, org!, `${i!.provider}_api_key`);
  if (!apiKey) return { ...platform, reason: `custom ${i!.provider} key missing` };
  return { mode: "custom", provider: i!.provider, apiKey, senderEmail, senderName };
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

export async function resolveWhatsappCredentials(
  db: Db, org: string | null,
): Promise<WhatsappCredentials> {
  const platform: WhatsappCredentials = {
    mode: "platform",
    provider: "aisensy",
    apiKey: (Deno.env.get("AISENSY_API_KEY") ?? "").trim(),
    defaultCampaign: Deno.env.get("AISENSY_DEFAULT_CAMPAIGN") ?? "ark_broadcast_alert",
  };

  const i = await loadIntegration(db, org, "whatsapp");
  if (!usesCustom(i)) {
    return { ...platform, reason: i ? `mode=${i.mode}` : "no integration configured" };
  }

  const apiKey = await secret(db, org!, "aisensy_api_key");
  if (!apiKey) return { ...platform, reason: "custom AiSensy key missing" };

  const cfg = i!.config ?? {};
  return {
    mode: "custom",
    provider: i!.provider,
    apiKey: apiKey.trim(),
    defaultCampaign: String(cfg.default_campaign ?? platform.defaultCampaign),
    senderName: cfg.sender_name ? String(cfg.sender_name) : undefined,
  };
}

/**
 * Record the outcome of a send against the integration.
 *
 * Only meaningful for custom integrations — a platform-credential failure is
 * ours to fix and belongs in our logs, not on the customer's settings page
 * where they can do nothing about it.
 */
export async function recordIntegrationUse(
  db: Db, org: string | null, channel: Channel, ok: boolean, error?: string,
): Promise<void> {
  if (!org) return;
  try {
    await db.from("organization_integrations").update({
      last_used_at: new Date().toISOString(),
      last_error: ok ? null : (error ?? "send failed"),
    }).eq("organization_id", org).eq("channel", channel).eq("mode", "custom");
  } catch {
    // Telemetry must never fail a send.
  }
}

/**
 * The organization behind a queued message.
 *
 * message_queue is tenant-scoped (Phase 1B), so the row carries its own
 * organization — the sender does not have to be told which tenant it is
 * sending for, and cannot be told the wrong one.
 */
export async function orgForMessage(db: Db, messageId: string): Promise<string | null> {
  const { data } = await db
    .from("message_queue").select("organization_id").eq("id", messageId).maybeSingle();
  return (data?.organization_id as string) ?? null;
}
