import { z } from "zod";

export const ticketCategorySchema = z.enum([
  "general",
  "fee",
  "exam",
  "attendance",
  "student",
  "staff",
  "login",
  "app_bug",
  "feature_request",
  "other",
]);

export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const ticketStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
  "cancelled",
]);

export const supportTicketInputSchema = z.object({
  subject: z.string().min(3, "Subject must be at least 3 characters").max(200),
  description: z.string().max(8000).optional(),
  category: ticketCategorySchema.default("general"),
  priority: ticketPrioritySchema.default("medium"),
  requesterPhone: z.string().max(40).optional(),
  pagePath: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
});

export const supportTicketMessageInputSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1, "Message body required").max(8000),
  isInternal: z.boolean().default(false),
  attachmentsSummary: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        mime: z.string().optional(),
      })
    )
    .default([]),
});

export const feedbackKindSchema = z.enum([
  "suggestion",
  "bug",
  "praise",
  "complaint",
  "nps",
]);

export const feedbackStatusSchema = z.enum([
  "received",
  "reviewing",
  "planned",
  "in_progress",
  "shipped",
  "declined",
]);

export const supportFeedbackInputSchema = z.object({
  kind: feedbackKindSchema,
  module: z.string().max(40).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(4000).optional(),
  score: z.number().int().min(0).max(10).optional(),
  isAnonymous: z.boolean().default(false),
  isPublic: z.boolean().default(true),
});

export const supportFeedbackStatusInputSchema = z.object({
  status: feedbackStatusSchema,
  managerReply: z.string().max(2000).optional(),
});
