// Feature-level types for the Settings module. Mirrors the DB shape only
// where the DB is authoritative; the rest are UI / input shapes consumed by
// hooks and forms.

import type { Role } from "@/core/constants/roles";

// ── Profile ──────────────────────────────────────────────────────────────────
export interface SettingsProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role | string;
  mobile?: string;
  address?: string;
  designation?: string;
  department?: string;
  profilePictureUrl?: string;
  campusId?: string;
  campusName?: string;
  updatedAt?: string;
}

export interface ProfileUpdateInput {
  name?: string;
  email?: string;
  mobile?: string;
  address?: string;
  designation?: string;
  department?: string;
  profilePictureUrl?: string | null;
}

// ── Change password ──────────────────────────────────────────────────────────
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ── SMS automations ──────────────────────────────────────────────────────────
export interface SmsAutomation {
  id: string;
  automationKey: string;
  label: string;
  enabled: boolean;
  template: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SmsAutomationUpsert {
  automationKey: string;
  label: string;
  enabled: boolean;
  template: string;
}

// ── Notification preferences ─────────────────────────────────────────────────
export type NotificationChannel = "email" | "in_app" | "push";
export type NotificationCategory =
  | "reminder"
  | "approval"
  | "attendance"
  | "exam"
  | "system";

export interface NotificationPreference {
  id: string;
  profileId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
  updatedAt?: string;
}

export interface NotificationPreferenceUpsert {
  profileId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}

// ── WhatsApp config ──────────────────────────────────────────────────────────
export interface WhatsappTemplate {
  /** Stable key — e.g. "fee_reminder", "enquiry_followup". */
  key: string;
  label: string;
  body: string;
  enabled: boolean;
}

export interface WhatsappConfig {
  id?: string;
  enabled: boolean;
  provider: string;
  /** Last 4 chars of the configured token (safe to display). */
  apiTokenHint?: string;
  webhookSecretHint?: string;
  templates: WhatsappTemplate[];
  updatedAt?: string;
}

export interface WhatsappConfigUpsert {
  enabled: boolean;
  provider?: string;
  templates: WhatsappTemplate[];
}

// ── Plan / subscription (synthetic — there's no plans table yet) ─────────────
export interface PlanSummary {
  planName: string;
  status: "active" | "trial" | "expired" | "unknown";
  startsAt?: string;
  expiresAt?: string;
  features: string[];
  staffLimit?: number;
  staffUsed?: number;
  studentLimit?: number;
  studentUsed?: number;
  storageLimitMb?: number;
  storageUsedMb?: number;
  smsLimit?: number;
  smsUsed?: number;
}

export interface MessagingChannelUsage {
  channel: string;
  sentThisMonth: number;
  sentLifetime: number;
  failedThisMonth: number;
  /** undefined = unlimited (plans model NULL as unlimited). */
  allowance?: number;
}

export interface MessagingHistoryEntry {
  id: string;
  channel: string;
  status: string;
  label: string;
  recipient?: string;
  occurredAt: string;
  error?: string;
}

/**
 * Replaces SmsPlanSummary, which modelled a prepaid credit ledger
 * (balance / recharge / lifetime) that this product does not have and that no
 * table ever backed. Messaging is plan-allowance based: an entitlement from
 * `plans`, consumed by real sends recorded in `message_queue`.
 */
export interface MessagingUsageSummary {
  planName?: string;
  /** ISO start of the current allowance window. */
  periodStart: string;
  channels: MessagingChannelUsage[];
  queued: number;
  history: MessagingHistoryEntry[];
}

// ── Referral ────────────────────────────────────────────────────────────────
export interface ReferralSummary {
  profileId: string;
  referralCode: string;
  totalReferrals: number;
  totalRewards: number;
  createdAt?: string;
}

export interface ReferralEvent {
  id: string;
  referrerProfileId: string;
  referredProfileId?: string;
  rewardAmount: number;
  status: "pending" | "credited" | "reversed";
  notes?: string;
  createdAt: string;
}

// ── Audit ───────────────────────────────────────────────────────────────────
export type SettingsAuditArea =
  | "sms_automation"
  | "notification_pref"
  | "whatsapp_config"
  | "profile"
  | "password";

export interface SettingsAuditEntry {
  area: SettingsAuditArea;
  changeKey?: string;
  prevValue?: unknown;
  newValue?: unknown;
}
