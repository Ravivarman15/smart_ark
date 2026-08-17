import { BaseService, AppError } from "@/shared/services";
import type { MessageDirection, StudentMessage } from "../types/student.types";

type MessageRow = {
  id: string;
  student_id: string;
  sender_profile_id: string | null;
  direction: string;
  channel: string;
  body: string;
  read_at: string | null;
  created_at: string | null;
};

const toDomain = (r: MessageRow): StudentMessage => ({
  id: r.id,
  studentId: r.student_id,
  senderProfileId: r.sender_profile_id ?? undefined,
  direction: (r.direction as MessageDirection) ?? "out",
  channel: r.channel ?? "app",
  body: r.body,
  readAt: r.read_at ?? undefined,
  createdAt: r.created_at ?? undefined,
});

const tableMissing = (err: { message?: string } | null | undefined) => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
};

const SELECT =
  "id, student_id, sender_profile_id, direction, channel, body, read_at, created_at";

/** One student's thread, as the staff inbox lists it. */
export interface ChatConversation {
  studentId: string;
  studentName: string;
  lastMessage: string;
  lastAt?: string;
  /** Inbound messages nobody on staff has opened yet. */
  unread: number;
}

type ConversationRow = MessageRow & {
  students?: { name?: string | null } | null;
};

/**
 * Student communication log / chat. `channel` ("app" today) is the seam for
 * future WhatsApp / push delivery — adding a channel needs no schema change,
 * an outbound dispatcher just reads rows where channel != 'app'.
 *
 * ONE service for both sides of the conversation. The parent portal imports
 * this rather than owning a second copy: two modules writing the same table
 * through two different shapes is how `direction` ends up meaning opposite
 * things at each end.
 *
 * Who may do what is enforced by RLS, not here — see
 * `20261008_student_chat_two_way.sql`. A parent calling `send()` is refused by
 * the database, which is the only refusal that counts.
 */
class CommunicationService extends BaseService {
  async list(studentId: string): Promise<StudentMessage[]> {
    const res = await this.db
      .from("student_messages" as never)
      .select(SELECT)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true });
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_messages");
    }
    return ((res.data ?? []) as unknown as MessageRow[]).map(toDomain);
  }

  /** Send an outbound message (staff → student / parent). */
  async send(
    studentId: string,
    body: string,
    senderProfileId?: string,
    channel = "app"
  ): Promise<void> {
    const row = {
      student_id: studentId,
      sender_profile_id: senderProfileId ?? null,
      direction: "out",
      channel,
      body,
    };
    const { error } = await this.db.from("student_messages" as never).insert(row as never);
    if (error) throw AppError.fromSupabase(error, "student_messages.send");
  }

  /**
   * Reply from the parent portal (family → staff).
   *
   * `sender_profile_id` is deliberately omitted rather than set to anything: a
   * parent has no `profiles` row, and the RLS policy requires the column to be
   * null so a reply can never be attributed to a member of staff. `channel`
   * stays 'app' for the same reason it is pinned in the policy — a row with
   * channel 'whatsapp' is something an outbound dispatcher would pick up and
   * SEND.
   */
  async reply(studentId: string, body: string): Promise<void> {
    const row = {
      student_id: studentId,
      sender_profile_id: null,
      direction: "in",
      channel: "app",
      body,
    };
    const { error } = await this.db.from("student_messages" as never).insert(row as never);
    if (error) throw AppError.fromSupabase(error, "student_messages.reply");
  }

  /**
   * Mark the other side's messages as read.
   *
   * `.select("id")` because an RLS-filtered UPDATE returns 204 with
   * `error: null` — a silent no-op that looks exactly like success. The count
   * is returned so a caller can tell the difference; nothing depends on it
   * today, but a read receipt that quietly never applies is the kind of bug
   * that is only ever found by someone counting rows by hand.
   */
  async markRead(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.db
      .from("student_messages" as never)
      .update({ read_at: new Date().toISOString() } as never)
      .in("id", ids)
      .is("read_at", null)
      .select("id");
    if (res.error) {
      if (tableMissing(res.error)) return 0;
      throw AppError.fromSupabase(res.error, "student_messages.markRead");
    }
    return (res.data ?? []).length;
  }

  /**
   * Staff inbox: one entry per student who has a conversation, newest first.
   *
   * Without this the staff page is a dropdown of every active student with no
   * indication that anyone has replied — a parent's message lands in a table
   * nobody is told about. That is precisely why the parent portal used to
   * carry a "replies are not received here" notice.
   *
   * Grouped in TypeScript rather than SQL: PostgREST has no DISTINCT ON, and
   * the alternative is a database view — a migration, for a list that is
   * naturally small (one row per family with an open conversation) and is
   * already bounded by the fetch limit below.
   */
  async conversations(limit = 400): Promise<ChatConversation[]> {
    const res = await this.db
      .from("student_messages" as never)
      .select(`${SELECT}, students!inner(name)`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (tableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_messages.conversations");
    }

    const byStudent = new Map<string, ChatConversation>();
    for (const row of (res.data ?? []) as unknown as ConversationRow[]) {
      // Rows arrive newest-first, so the first sighting of a student is their
      // latest message and must not be overwritten by older ones.
      const existing = byStudent.get(row.student_id);
      if (!existing) {
        byStudent.set(row.student_id, {
          studentId: row.student_id,
          studentName: row.students?.name ?? "Unknown student",
          lastMessage: row.body,
          lastAt: row.created_at ?? undefined,
          unread: row.direction === "in" && !row.read_at ? 1 : 0,
        });
        continue;
      }
      if (row.direction === "in" && !row.read_at) existing.unread += 1;
    }
    return [...byStudent.values()];
  }
}

export const communicationService = new CommunicationService();
