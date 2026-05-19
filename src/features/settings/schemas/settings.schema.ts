import { z } from "zod";

// Password rules:
//  - 8+ chars
//  - at least one lowercase, one uppercase, one digit, one symbol
//  - reject common weak patterns at the util layer (passwordStrength.ts)
const passwordRule = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a digit")
  .regex(/[^A-Za-z0-9]/, "Include a symbol");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: passwordRule,
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "New password must differ from current",
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

// Indian-style mobile (10 digits, optional +country prefix). Loose by design.
const phoneRule = z
  .string()
  .trim()
  .regex(/^[+]?[0-9 ()-]{7,20}$/i, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name too short").max(120),
  email: z.string().trim().email("Invalid email").transform((v) => v.toLowerCase()),
  mobile: phoneRule,
  address: z.string().trim().max(500).optional().or(z.literal("")),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  profilePictureUrl: z.string().url().optional().or(z.literal("")).nullable(),
});
export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;

// SMS automation row used by the editor.
export const smsAutomationSchema = z.object({
  automationKey: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  enabled: z.boolean(),
  template: z.string().max(2000),
});
export type SmsAutomationValues = z.infer<typeof smsAutomationSchema>;

export const notificationPrefSchema = z.object({
  profileId: z.string().uuid(),
  channel: z.enum(["email", "in_app", "push"]),
  category: z.enum(["reminder", "approval", "attendance", "exam", "system"]),
  enabled: z.boolean(),
});
export type NotificationPrefValues = z.infer<typeof notificationPrefSchema>;

export const whatsappTemplateSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  body: z.string().max(2000),
  enabled: z.boolean(),
});

export const whatsappConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().min(1).max(80).default("aisensy"),
  templates: z.array(whatsappTemplateSchema),
});
export type WhatsappConfigValues = z.infer<typeof whatsappConfigSchema>;
