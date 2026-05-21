// Domain types for the Live Class feature.
// App-facing — DB row shapes never leak out of services/.

export type LiveClassStatus = "scheduled" | "ongoing" | "completed" | "cancelled";
export type MeetingPlatform = "google_meet" | "zoom" | "ms_teams" | "other";
export type AssignType = "batch" | "multiple_batches" | "standard";
export type RepeatRule = "none" | "daily" | "weekly" | "monthly";
export type LiveAttendanceStatus = "present" | "absent" | "joined" | "not_joined";

/** A material / attachment shared with a live class. */
export interface ClassMaterial {
  name: string;
  url: string;
}

/** One scheduled (or recurring) online class. */
export interface LiveClass {
  id: string;
  title: string;
  description?: string;
  teacherId?: string;
  teacherName?: string;
  subjectId?: string;
  subjectName?: string;
  standardId?: string;
  standardName?: string;
  campusId?: string;
  assignType: AssignType;
  /** Batch ids the class is assigned to (empty when assignType = 'standard'). */
  batchIds: string[];
  batchNames: string[];
  startDate: string;       // yyyy-mm-dd
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  platform: MeetingPlatform;
  meetingLink?: string;
  meetingPassword?: string;
  repeatRule: RepeatRule;
  repeatUntil?: string;
  status: LiveClassStatus;
  recordingUrl?: string;
  classNotes?: string;
  materials: ClassMaterial[];
  cancelReason?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Form payload to create / update a live class. */
export interface LiveClassWriteInput {
  title: string;
  description?: string;
  teacherId?: string;
  subjectId?: string;
  standardId?: string;
  campusId?: string;
  assignType: AssignType;
  batchIds: string[];
  startDate: string;
  startTime: string;
  endTime: string;
  platform: MeetingPlatform;
  meetingLink?: string;
  meetingPassword?: string;
  repeatRule: RepeatRule;
  repeatUntil?: string;
  materials?: ClassMaterial[];
}

export type CreateLiveClassInput = LiveClassWriteInput;
export type UpdateLiveClassInput = Partial<LiveClassWriteInput> & {
  status?: LiveClassStatus;
  recordingUrl?: string;
  classNotes?: string;
  cancelReason?: string;
};

/** Filters accepted by the live-class list query. */
export interface LiveClassFilters {
  status?: LiveClassStatus | "all";
  teacherId?: string;
  standardId?: string;
  search?: string;
  /** "upcoming" = scheduled/ongoing with a future-or-today date. */
  window?: "upcoming" | "completed" | "all";
}

/** One student's attendance row against a live class. */
export interface LiveClassAttendanceRow {
  id?: string;
  liveClassId: string;
  studentId: string;
  studentName?: string;
  status: LiveAttendanceStatus;
  joinedAt?: string;
}

/** Aggregate counts for the Live Class dashboard tiles. */
export interface LiveClassStats {
  total: number;
  upcoming: number;
  ongoing: number;
  completed: number;
  cancelled: number;
}

/** A queued outbound message (WhatsApp / SMS / in-app). */
export interface QueuedMessage {
  id: string;
  channel: string;
  template: string;
  recipientName?: string;
  recipientPhone?: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "cancelled";
  attempts: number;
  lastError?: string;
  contextType?: string;
  contextId?: string;
  createdAt: string;
  sentAt?: string;
}

/** Generic { id, name } picker option. */
export interface LookupOption {
  id: string;
  name: string;
}
