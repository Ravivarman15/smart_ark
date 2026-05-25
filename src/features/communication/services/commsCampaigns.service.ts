// ──────────────────────────────────────────────────────────────────────────────
// Campaigns service — draft / approve / schedule / launch lifecycle over
// `comms_campaigns` + `comms_campaign_recipients`. Launching a campaign
// calls aisensyService.enqueueBulk to write a `message_queue` row per
// recipient; the edge function then drains the queue.
//
// Pre-migration safe: every method returns empty / no-op when the tables are
// missing so the UI still renders.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError } from "@/shared/services";
import { aisensyService } from "./aisensy.service";
import { commsTemplatesService } from "./commsTemplates.service";
import { commsAuditService } from "./commsAudit.service";
import { renderMessage } from "../utils/whatsappTemplates";
import { safeInsert, safeInsertBatch, isForeignKeyError } from "../utils/safeInsert";

// FK columns on `comms_campaigns` and `comms_campaign_recipients`.
const CAMPAIGN_FK_FIELDS = ["created_by", "approved_by", "template_id"] as const;
const RECIPIENT_FK_FIELDS = ["recipient_id"] as const;
import type {
  AudienceFilter,
  CampaignAudience,
  CampaignRecipient,
  CampaignRecipientInput,
  CampaignStatus,
  CommsCampaign,
  CommsCampaignInput,
} from "../types/communication.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbCampaign = {
  id: string;
  name: string;
  description: string | null;
  audience_kind: string;
  audience_filter: unknown;
  template_id: string | null;
  template_key: string | null;
  variable_defaults: unknown;
  status: string;
  reject_reason: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_read: number;
  total_failed: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

type DbRecipient = {
  id: string;
  campaign_id: string;
  recipient_kind: string;
  recipient_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  variables: unknown;
  message_queue_id: string | null;
  status: string;
  last_error: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

const toDomain = (r: DbCampaign): CommsCampaign => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  audienceKind: (r.audience_kind as CampaignAudience) ?? "custom",
  audienceFilter:
    typeof r.audience_filter === "object" && r.audience_filter !== null
      ? (r.audience_filter as AudienceFilter)
      : {},
  templateId: r.template_id ?? undefined,
  templateKey: r.template_key ?? undefined,
  variableDefaults:
    typeof r.variable_defaults === "object" && r.variable_defaults !== null
      ? (r.variable_defaults as Record<string, string>)
      : {},
  status: (r.status as CampaignStatus) ?? "draft",
  rejectReason: r.reject_reason ?? undefined,
  scheduledAt: r.scheduled_at ?? undefined,
  startedAt: r.started_at ?? undefined,
  completedAt: r.completed_at ?? undefined,
  totalRecipients: Number(r.total_recipients ?? 0),
  totalSent: Number(r.total_sent ?? 0),
  totalDelivered: Number(r.total_delivered ?? 0),
  totalRead: Number(r.total_read ?? 0),
  totalFailed: Number(r.total_failed ?? 0),
  createdBy: r.created_by ?? undefined,
  approvedBy: r.approved_by ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRecipient = (r: DbRecipient): CampaignRecipient => ({
  id: r.id,
  campaignId: r.campaign_id,
  recipientKind: (r.recipient_kind as CampaignRecipient["recipientKind"]) ?? "student",
  recipientId: r.recipient_id ?? undefined,
  recipientName: r.recipient_name ?? undefined,
  recipientPhone: r.recipient_phone ?? undefined,
  variables:
    typeof r.variables === "object" && r.variables !== null
      ? (r.variables as Record<string, string>)
      : {},
  messageQueueId: r.message_queue_id ?? undefined,
  status: (r.status as CampaignRecipient["status"]) ?? "pending",
  lastError: r.last_error ?? undefined,
  queuedAt: r.queued_at ?? undefined,
  sentAt: r.sent_at ?? undefined,
  deliveredAt: r.delivered_at ?? undefined,
  readAt: r.read_at ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

class CommsCampaignsService extends BaseService {
  async list(filter: { status?: CampaignStatus | "all"; audience?: CampaignAudience | "all"; limit?: number } = {}): Promise<
    CommsCampaign[]
  > {
    let q = this.db
      .from("comms_campaigns" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 100);
    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.audience && filter.audience !== "all") q = q.eq("audience_kind", filter.audience);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "comms_campaigns.list");
    }
    return ((res.data as unknown as DbCampaign[]) ?? []).map(toDomain);
  }

  async get(id: string): Promise<CommsCampaign | null> {
    const res = await this.db.from("comms_campaigns" as never).select("*").eq("id", id).maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "comms_campaigns.get");
    }
    return res.data ? toDomain(res.data as unknown as DbCampaign) : null;
  }

  async create(input: CommsCampaignInput, createdBy?: string): Promise<CommsCampaign | null> {
    const payload = {
      name: input.name,
      description: input.description ?? null,
      audience_kind: input.audienceKind,
      audience_filter: input.audienceFilter ?? {},
      template_id: input.templateId ?? null,
      template_key: input.templateKey ?? null,
      variable_defaults: input.variableDefaults ?? {},
      scheduled_at: input.scheduledAt ?? null,
      status: "draft" as CampaignStatus,
      created_by: createdBy ?? null,
    };
    const res = await safeInsert<DbCampaign>(
      this.db,
      "comms_campaigns",
      payload,
      [...CAMPAIGN_FK_FIELDS],
      "*"
    );
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "comms_campaigns.create");
    }
    const c = res.data ? toDomain(res.data) : null;
    if (c) {
      await commsAuditService.log({
        entityType: "campaign",
        entityId: c.id,
        action: "create",
        actorId: createdBy,
        payload: { name: c.name, audienceKind: c.audienceKind },
      });
    }
    return c;
  }

  async update(id: string, patch: Partial<CommsCampaignInput>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.audienceKind !== undefined) payload.audience_kind = patch.audienceKind;
    if (patch.audienceFilter !== undefined) payload.audience_filter = patch.audienceFilter;
    if (patch.templateId !== undefined) payload.template_id = patch.templateId;
    if (patch.templateKey !== undefined) payload.template_key = patch.templateKey;
    if (patch.variableDefaults !== undefined) payload.variable_defaults = patch.variableDefaults;
    if (patch.scheduledAt !== undefined) payload.scheduled_at = patch.scheduledAt;
    const res = await this.db.from("comms_campaigns" as never).update(payload as never).eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "comms_campaigns.update");
    }
  }

  async setStatus(
    id: string,
    status: CampaignStatus,
    extras: { rejectReason?: string; approvedBy?: string; actorId?: string } = {}
  ): Promise<void> {
    const payload: Record<string, unknown> = { status };
    if (extras.rejectReason !== undefined) payload.reject_reason = extras.rejectReason;
    if (extras.approvedBy !== undefined) payload.approved_by = extras.approvedBy;
    if (status === "running") payload.started_at = new Date().toISOString();
    if (status === "completed") payload.completed_at = new Date().toISOString();
    let res = await this.db
      .from("comms_campaigns" as never)
      .update(payload as never)
      .eq("id", id);
    // If approved_by fails the FK (caller passed an auth uid instead of a
    // profile id), retry without it so the status change still goes through.
    if (res.error && isForeignKeyError(res.error) && payload.approved_by) {
      const { approved_by: _drop, ...rest } = payload;
      void _drop;
      res = await this.db.from("comms_campaigns" as never).update(rest as never).eq("id", id);
    }
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "comms_campaigns.setStatus");
    }
    await commsAuditService.log({
      entityType: "campaign",
      entityId: id,
      action:
        status === "approved"
          ? "approve"
          : status === "rejected"
            ? "reject"
            : status === "running"
              ? "launch"
              : status === "scheduled"
                ? "schedule"
                : "update",
      actorId: extras.actorId,
      payload: { status, rejectReason: extras.rejectReason },
    });
  }

  /** Add recipients to a campaign. Idempotent on (campaignId, phone+name). */
  async addRecipients(
    campaignId: string,
    recipients: CampaignRecipientInput[]
  ): Promise<{ inserted: number; skipped: boolean }> {
    if (recipients.length === 0) return { inserted: 0, skipped: false };
    const rows = recipients.map((r) => ({
      campaign_id: campaignId,
      recipient_kind: r.recipientKind,
      recipient_id: r.recipientId ?? null,
      recipient_name: r.recipientName ?? null,
      recipient_phone: r.recipientPhone ?? null,
      variables: r.variables ?? {},
      status: "pending",
    }));
    // recipient_id is nullable + has no FK (per migration) — but kept in the
    // fallback list for forward-compat if a future migration adds an FK.
    const res = await safeInsertBatch<{ id: string }>(
      this.db,
      "comms_campaign_recipients",
      rows,
      [...RECIPIENT_FK_FIELDS],
      "id"
    );
    if (res.error) {
      if (isMissingTable(res.error)) return { inserted: 0, skipped: true };
      throw AppError.fromSupabase(res.error, "comms_campaign_recipients.insert");
    }
    const inserted = (res.data ?? []).length;
    if (inserted > 0) {
      await this.db
        .from("comms_campaigns" as never)
        .update({ total_recipients: rows.length } as never)
        .eq("id", campaignId);
    }
    return { inserted, skipped: false };
  }

  async listRecipients(campaignId: string): Promise<CampaignRecipient[]> {
    const res = await this.db
      .from("comms_campaign_recipients" as never)
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "comms_campaign_recipients.list");
    }
    return ((res.data as unknown as DbRecipient[]) ?? []).map(toRecipient);
  }

  /**
   * Launch a campaign — render the template per recipient and enqueue every
   * row via aisensyService.enqueueBulk. Marks the campaign as running and
   * tries to nudge the edge function.
   */
  async launch(
    campaignId: string,
    opts: { actorId?: string; nowOverride?: string } = {}
  ): Promise<{ queued: number; skipped: number }> {
    const campaign = await this.get(campaignId);
    if (!campaign) throw AppError.notFound("campaign");
    if (!campaign.templateKey) {
      throw AppError.validation("Campaign has no template selected");
    }
    const template = await commsTemplatesService.getByKey(campaign.templateKey);
    if (!template) {
      throw AppError.validation(`Template "${campaign.templateKey}" not found`);
    }
    const recipients = await this.listRecipients(campaignId);
    if (recipients.length === 0) {
      throw AppError.validation("Campaign has no recipients");
    }
    const enqueueInputs = recipients.map((r) => {
      const rendered = renderMessage(template, {
        ...campaign.variableDefaults,
        ...r.variables,
        student_name: r.recipientName ?? r.variables.student_name ?? "",
        recipient_name: r.recipientName ?? "",
      });
      return {
        rendered,
        campaignId,
        templateId: template.id.startsWith("builtin:") ? undefined : template.id,
        contextType: `campaign:${campaign.audienceKind}`,
        contextId: campaignId,
        recipient: {
          kind: r.recipientKind,
          name: r.recipientName,
          phone: r.recipientPhone,
          studentId: r.recipientKind === "student" ? r.recipientId : undefined,
        },
        scheduledAt: opts.nowOverride ?? campaign.scheduledAt,
        createdBy: opts.actorId,
      };
    });
    const result = await aisensyService.enqueueBulk(enqueueInputs);
    await this.setStatus(campaignId, "running", { actorId: opts.actorId });
    await aisensyService.dispatchViaEdge({ campaignId });
    return { queued: result.queued, skipped: result.skipped };
  }
}

export const commsCampaignsService = new CommsCampaignsService();
