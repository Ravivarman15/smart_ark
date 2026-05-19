import { BaseService, AppError } from "@/shared/services";
import { toDbStatus } from "../utils/status";
import type { EnquiryStatus, FollowupEntry } from "../types/enquiry.types";

interface AddNoteArgs {
  enquiryId: string;
  note: string;
  newStatus?: EnquiryStatus;
  followUpDate?: string;
  /** Display name of the staff member adding the note (for history entry). */
  updatedByName?: string;
}

interface AddNoteResult {
  /** History entry created locally — the DB stores only the latest note. */
  entry: FollowupEntry;
  newStatus: EnquiryStatus;
}

class FollowupsService extends BaseService {
  /**
   * Add a follow-up note.
   *
   * IMPORTANT: the schema currently has no `enquiry_history` table —
   * `admission_calls.notes` is a single TEXT column. We overwrite that
   * (preserving existing AppDataContext.addEnquiryNote behaviour) and
   * build the local history entry that the UI appends to its in-memory list.
   *
   * When an enquiry_history table is added (recommended), this service is the
   * ONLY place that needs to change. The result shape stays identical.
   */
  async addNote(args: AddNoteArgs): Promise<AddNoteResult> {
    if (!args.note?.trim()) throw AppError.validation("Note cannot be empty");

    const patch: Record<string, unknown> = { notes: args.note };
    if (args.newStatus) patch.status = toDbStatus(args.newStatus);
    if (args.followUpDate) patch.follow_up_date = args.followUpDate;

    const { error } = await this.db
      .from("admission_calls")
      .update(patch as never)
      .eq("id", args.enquiryId);
    if (error) throw AppError.fromSupabase(error, "enquiry.addNote");

    const resolvedStatus: EnquiryStatus = args.newStatus ?? "interested";
    const entry: FollowupEntry = {
      date: new Date().toISOString(),
      status: resolvedStatus,
      notes: args.note,
      updatedBy: args.updatedByName ?? "System",
    };

    return { entry, newStatus: resolvedStatus };
  }

  /**
   * Read persisted follow-up history.
   * Returns [] today because there is no history table; the in-session
   * history lives in AppDataContext / query cache. When the table lands,
   * implement here without touching callers.
   */
  async listForEnquiry(_enquiryId: string): Promise<FollowupEntry[]> {
    return [];
  }
}

export const followupsService = new FollowupsService();
