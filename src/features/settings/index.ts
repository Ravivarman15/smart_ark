// Public API of the Settings feature.

export type {
  SettingsProfile,
  ProfileUpdateInput,
  ChangePasswordInput,
  SmsAutomation,
  SmsAutomationUpsert,
  NotificationChannel,
  NotificationCategory,
  NotificationPreference,
  NotificationPreferenceUpsert,
  WhatsappConfig,
  WhatsappConfigUpsert,
  WhatsappTemplate,
  PlanSummary,
  MessagingUsageSummary,
  MessagingChannelUsage,
  MessagingHistoryEntry,
  ReferralSummary,
  ReferralEvent,
  SettingsAuditArea,
  SettingsAuditEntry,
} from "./types";

export {
  changePasswordSchema,
  profileUpdateSchema,
  smsAutomationSchema,
  notificationPrefSchema,
  whatsappConfigSchema,
  type ChangePasswordValues,
  type ProfileUpdateValues,
  type SmsAutomationValues,
  type NotificationPrefValues,
  type WhatsappConfigValues,
} from "./schemas/settings.schema";

export { estimatePassword, type PasswordScore, type PasswordStrength } from "./utils";

export {
  settingsProfileService,
  changePasswordService,
  smsSettingsService,
  notificationSettingsService,
  whatsappSettingsService,
  planService,
  smsPlanService,
  referralService,
  settingsAuditService,
  DEFAULT_SMS_AUTOMATIONS,
  DEFAULT_WHATSAPP_TEMPLATES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CATEGORIES,
} from "./services";

export {
  useProfile,
  useUpdateProfile,
  useUploadProfileAvatar,
  useChangePassword,
  useSmsSettings,
  useUpsertSmsAutomation,
  useNotificationSettings,
  useUpsertNotificationPref,
  useWhatsappSettings,
  useUpsertWhatsappConfig,
  usePlanDetails,
  useSmsPlan,
  useReferralData,
} from "./hooks";

export {
  SettingsCard,
  ToggleRow,
  TemplateEditor,
  UsageStatCard,
  SettingsSidebar,
  SettingsAccessGuard,
} from "./components";

export {
  useSettingsSections,
  settingsLanding,
  SETTINGS_GROUP_ORDER,
  SETTINGS_PRESENTATION,
  type SettingsSection,
  type SettingsGroup,
} from "./navigation/settingsNav";
