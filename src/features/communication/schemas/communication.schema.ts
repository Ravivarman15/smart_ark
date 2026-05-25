import { z } from "zod";

// ── Template ────────────────────────────────────────────────────────────────
export const templateButtonSchema = z.object({
  type: z.enum(["url", "phone", "quick_reply"]),
  label: z.string().min(1, "Button label required"),
  value: z.string().optional(),
});

export const templateMediaSchema = z.object({
  type: z.enum(["image", "pdf", "video"]),
  url: z.string().url("Valid URL required").optional(),
});

export const commsTemplateInputSchema = z.object({
  templateKey: z
    .string()
    .min(2, "Template key required")
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers and underscores only"),
  version: z.number().int().min(1).optional(),
  language: z.string().min(2).default("en"),
  category: z.enum([
    "fee",
    "attendance",
    "exam",
    "inquiry",
    "student",
    "staff",
    "credentials",
    "birthday",
    "announcement",
    "general",
  ]),
  title: z.string().min(1, "Title required"),
  body: z.string().min(1, "Body required"),
  variables: z.array(z.string()).default([]),
  buttons: z.array(templateButtonSchema).default([]),
  media: templateMediaSchema.optional(),
  providerName: z.string().optional(),
  isActive: z.boolean().default(true),
});

// ── Campaign ────────────────────────────────────────────────────────────────
export const audienceFilterSchema = z
  .object({
    batchIds: z.array(z.string()).optional(),
    campusIds: z.array(z.string()).optional(),
    standardIds: z.array(z.string()).optional(),
    role: z.string().optional(),
    segment: z.string().optional(),
    search: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })
  .default({});

export const commsCampaignInputSchema = z.object({
  name: z.string().min(2, "Campaign name required"),
  description: z.string().optional(),
  audienceKind: z.enum([
    "inquiry",
    "student",
    "staff",
    "credentials",
    "exam",
    "fee",
    "attendance",
    "birthday",
    "announcement",
    "custom",
  ]),
  audienceFilter: audienceFilterSchema.optional(),
  templateId: z.string().uuid().optional(),
  templateKey: z.string().optional(),
  variableDefaults: z.record(z.string()).default({}),
  scheduledAt: z.string().optional(),
});

// ── Recipient ───────────────────────────────────────────────────────────────
export const campaignRecipientInputSchema = z.object({
  recipientKind: z.enum(["student", "staff", "inquiry", "guardian", "other"]),
  recipientId: z.string().optional(),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  variables: z.record(z.string()).default({}),
});

export const sendDirectMessageSchema = z.object({
  templateKey: z.string().min(1),
  language: z.string().default("en"),
  recipients: z.array(campaignRecipientInputSchema).min(1, "At least one recipient required"),
  variableDefaults: z.record(z.string()).default({}),
  campaignName: z.string().optional(),
  audienceKind: z.string().optional(),
  scheduledAt: z.string().optional(),
});

export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;
