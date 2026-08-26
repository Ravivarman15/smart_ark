// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ANNOUNCEMENTS — Domain Types
// ──────────────────────────────────────────────────────────────────────────────

export type AnnouncementCategory =
  | "general"
  | "academic"
  | "exam"
  | "event"
  | "holiday"
  | "urgent"
  | "fee"
  | "transport"
  | "sports"
  | "circular"
  | "other";

export type AnnouncementPriority = "normal" | "important" | "urgent";

export type AnnouncementStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "expired"
  | "archived"
  | "cancelled";

export type TargetScope =
  | "all"
  | "roles"
  | "standards"
  | "batches"
  | "students"
  | "parents"
  | "staff"
  | "custom";

export type AudienceTargetType =
  | "all"
  | "role"
  | "standard"
  | "batch"
  | "student"
  | "parent"
  | "staff";

export type DeliveryChannel = "in_app" | "email" | "whatsapp";

export interface AnnouncementAttachment {
  id?: string;
  organization_id?: string;
  announcement_id?: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  created_at?: string;
}

export interface AnnouncementAudience {
  id?: string;
  organization_id?: string;
  announcement_id?: string;
  target_type: AudienceTargetType;
  target_id?: string | null;
  target_name?: string | null;
  created_at?: string;
}

export interface AnnouncementRead {
  id?: string;
  organization_id: string;
  announcement_id: string;
  user_id: string;
  user_type: "staff" | "parent" | "student";
  student_id?: string | null;
  read_at: string;
  acknowledged: boolean;
  acknowledged_at?: string | null;
}

export interface Announcement {
  id: string;
  organization_id: string;
  title: string;
  summary?: string | null;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  publish_at?: string | null;
  expires_at?: string | null;
  timezone: string;
  target_scope: TargetScope;
  channels: DeliveryChannel[];
  requires_acknowledgement: boolean;
  acknowledgement_prompt?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  // Embedded / joined relations
  audiences?: AnnouncementAudience[];
  attachments?: AnnouncementAttachment[];
  reads?: AnnouncementRead[];
  // Derived / computed client state
  is_read?: boolean;
  is_acknowledged?: boolean;
  read_count?: number;
  acknowledged_count?: number;
  target_count?: number;
}

export interface CreateAnnouncementInput {
  title: string;
  summary?: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  publish_now?: boolean;
  publish_at?: string;
  expires_at?: string;
  timezone?: string;
  target_scope: TargetScope;
  audiences: Omit<AnnouncementAudience, "id" | "organization_id" | "announcement_id" | "created_at">[];
  attachments: Omit<AnnouncementAttachment, "id" | "organization_id" | "announcement_id" | "created_at">[];
  channels?: DeliveryChannel[];
  requires_acknowledgement?: boolean;
  acknowledgement_prompt?: string;
  save_as_draft?: boolean;
}

export interface UpdateAnnouncementInput extends Partial<CreateAnnouncementInput> {
  id: string;
  status?: AnnouncementStatus;
}

export interface AnnouncementAnalytics {
  announcement_id: string;
  total_targeted: number;
  total_read: number;
  total_unread: number;
  total_acknowledged: number;
  read_rate: number;
  acknowledgement_rate: number;
}

export interface AnnouncementFilter {
  status?: AnnouncementStatus | "all";
  category?: AnnouncementCategory | "all";
  priority?: AnnouncementPriority | "all";
  search?: string;
  onlyUnread?: boolean;
}
