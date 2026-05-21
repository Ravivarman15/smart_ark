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

/**
 * Student communication log / chat. `channel` ("app" today) is the seam for
 * future WhatsApp / push delivery — adding a channel needs no schema change,
 * an outbound dispatcher just reads rows where channel != 'app'.
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
}

export const communicationService = new CommunicationService();
