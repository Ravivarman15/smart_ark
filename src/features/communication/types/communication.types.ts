// ──────────────────────────────────────────────────────────────────────────────
// Communication module — types
// ──────────────────────────────────────────────────────────────────────────────
// Domain types for the WhatsApp / AiSensy communication system. The DB shape
// lives in 20260527_communication_module.sql; this file mirrors what the UI
// hooks consume.
// ──────────────────────────────────────────────────────────────────────────────

import type { Role } from "@/core/constants/roles";

// ── Channel & provider ──────────────────────────────────────────────────────
export type CommsChannel = "whatsapp" | "sms" | "in_app";
export type CommsProvider = "aisensy" | "internal";

// ── Template ────────────────────────────────────────────────────────────────
export type TemplateCategory =
  | "fee"
  | "attendance"
  | "exam"
  | "inquiry"
  | "student"
  | "staff"
  | "credentials"
  | "birthday"
  | "announcement"
  | "general";

export interface TemplateButton {
  type: "url" | "phone" | "quick_reply";
  label: string;
  value?: string;
}

export interface TemplateMedia {
  type: "image" | "pdf" | "video";
  url?: string;
}

export interface CommsTemplate {
  id: string;
  templateKey: string;
  version: number;
  language: string;
  category: TemplateCategory;
  title: string;
  body: string;
  variables: string[];
  buttons: TemplateButton[];
  media?: TemplateMedia;
  providerName?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommsTemplateInput {
  templateKey: string;
  version?: number;
  language?: string;
  category: TemplateCategory;
  title: string;
  body: string;
  variables?: string[];
  buttons?: TemplateButton[];
  media?: TemplateMedia;
  providerName?: string;
  isActive?: boolean;
}

// ── Campaign ────────────────────────────────────────────────────────────────
export type CampaignAudience =
  | "inquiry"
  | "student"
  | "staff"
  | "credentials"
  | "exam"
  | "fee"
  | "attendance"
  | "birthday"
  | "announcement"
  | "custom";

export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled";

export interface AudienceFilter {
  batchIds?: string[];
  campusIds?: string[];
  standardIds?: string[];
  role?: Role | string;
  segment?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CommsCampaign {
  id: string;
  name: string;
  description?: string;
  audienceKind: CampaignAudience;
  audienceFilter: AudienceFilter;
  templateId?: string;
  templateKey?: string;
  variableDefaults: Record<string, string>;
  status: CampaignStatus;
  rejectReason?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  createdBy?: string;
  approvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommsCampaignInput {
  name: string;
  description?: string;
  audienceKind: CampaignAudience;
  audienceFilter?: AudienceFilter;
  templateId?: string;
  templateKey?: string;
  variableDefaults?: Record<string, string>;
  scheduledAt?: string;
}

// ── Recipient ───────────────────────────────────────────────────────────────
export type RecipientKind = "student" | "staff" | "inquiry" | "guardian" | "other";

export type RecipientStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "skipped";

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  recipientKind: RecipientKind;
  recipientId?: string;
  recipientName?: string;
  recipientPhone?: string;
  variables: Record<string, string>;
  messageQueueId?: string;
  status: RecipientStatus;
  lastError?: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignRecipientInput {
  recipientKind: RecipientKind;
  recipientId?: string;
  recipientName?: string;
  recipientPhone?: string;
  variables?: Record<string, string>;
}

// ── Queue ───────────────────────────────────────────────────────────────────
export type QueueStatus =
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

export interface QueueMessage {
  id: string;
  channel: CommsChannel;
  provider: CommsProvider;
  template: string;
  templateId?: string;
  templateKey?: string;
  language: string;
  recipientKind?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientStudentId?: string;
  campaignId?: string;
  payload: Record<string, unknown>;
  contextType?: string;
  contextId?: string;
  status: QueueStatus;
  attempts: number;
  retryCount: number;
  retryAt?: string;
  lastError?: string;
  providerMessageId?: string;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

// ── Audit ───────────────────────────────────────────────────────────────────
export type CommsAuditEntity = "template" | "campaign" | "recipient" | "queue" | "webhook";

export type CommsAuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "schedule"
  | "launch"
  | "send"
  | "deliver"
  | "read"
  | "fail"
  | "retry";

export interface CommsAuditEntry {
  id: string;
  entityType: CommsAuditEntity;
  entityId?: string;
  action: CommsAuditAction;
  actorId?: string;
  actorName?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ── Analytics ───────────────────────────────────────────────────────────────
export interface CommsAnalytics {
  total: number;
  queued: number;
  processing: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
  byTemplate: Array<{ templateKey: string; total: number; delivered: number; failed: number }>;
  byChannel: Array<{ channel: string; total: number }>;
  byDay: Array<{ date: string; total: number; delivered: number; failed: number }>;
}

// ── Recipient picker source ─────────────────────────────────────────────────
export interface RecipientCandidate {
  id: string;
  kind: RecipientKind;
  name: string;
  phone?: string;
  email?: string;
  meta?: Record<string, string | number | undefined>;
}
