// ──────────────────────────────────────────────────────────────────────────────
// Feedback service — suggestions, bugs, praise, NPS scores + public voting
// board. Backed by `support_feedback` and `support_feedback_votes`.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService, AppError, safeInsert } from "@/shared/services";
import { helpAuditService } from "./helpAudit.service";
import type {
  FeedbackKind,
  FeedbackStatus,
  SupportFeedback,
  SupportFeedbackInput,
  SupportFeedbackStatusInput,
} from "../types/help.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

type DbRow = {
  id: string;
  kind: string;
  module: string | null;
  title: string | null;
  body: string | null;
  score: number | null;
  status: string;
  is_anonymous: boolean;
  is_public: boolean;
  requester_profile_id: string | null;
  requester_role: string | null;
  requester_name: string | null;
  votes_count: number | null;
  replied_at: string | null;
  planned_at: string | null;
  shipped_at: string | null;
  declined_at: string | null;
  manager_reply: string | null;
  created_at: string;
  updated_at: string | null;
};

const FEEDBACK_COLS =
  "id, kind, module, title, body, score, status, is_anonymous, is_public, " +
  "requester_profile_id, requester_role, requester_name, votes_count, " +
  "replied_at, planned_at, shipped_at, declined_at, manager_reply, " +
  "created_at, updated_at";

const toDomain = (r: DbRow): SupportFeedback => ({
  id: r.id,
  kind: r.kind as FeedbackKind,
  module: r.module ?? undefined,
  title: r.title ?? undefined,
  body: r.body ?? undefined,
  score: r.score ?? undefined,
  status: r.status as FeedbackStatus,
  isAnonymous: !!r.is_anonymous,
  isPublic: !!r.is_public,
  requesterProfileId: r.requester_profile_id ?? undefined,
  requesterRole: r.requester_role ?? undefined,
  requesterName: r.requester_name ?? undefined,
  votesCount: Number(r.votes_count ?? 0),
  repliedAt: r.replied_at ?? undefined,
  plannedAt: r.planned_at ?? undefined,
  shippedAt: r.shipped_at ?? undefined,
  declinedAt: r.declined_at ?? undefined,
  managerReply: r.manager_reply ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined,
});

export interface FeedbackFilter {
  kind?: FeedbackKind | "all";
  status?: FeedbackStatus | "all";
  module?: string;
  publicOnly?: boolean;
  requesterProfileId?: string;
  limit?: number;
}

export interface FeedbackRequester {
  profileId?: string;
  role?: string;
  name?: string;
}

class FeedbackService extends BaseService {
  async list(filter: FeedbackFilter = {}): Promise<SupportFeedback[]> {
    let q = this.db
      .from("support_feedback" as never)
      .select(FEEDBACK_COLS)
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.kind && filter.kind !== "all") q = q.eq("kind", filter.kind);
    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.module) q = q.eq("module", filter.module);
    if (filter.publicOnly) q = q.eq("is_public", true);
    if (filter.requesterProfileId) q = q.eq("requester_profile_id", filter.requesterProfileId);
    const res = await q;
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_feedback.list");
    }
    return ((res.data as unknown as DbRow[]) ?? []).map(toDomain);
  }

  async get(id: string): Promise<SupportFeedback | null> {
    const res = await this.db
      .from("support_feedback" as never)
      .select(FEEDBACK_COLS)
      .eq("id", id)
      .maybeSingle();
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "support_feedback.get");
    }
    return res.data ? toDomain(res.data as unknown as DbRow) : null;
  }

  async create(
    input: SupportFeedbackInput,
    requester: FeedbackRequester,
  ): Promise<SupportFeedback | null> {
    const isAnon = !!input.isAnonymous;
    const payload = {
      kind: input.kind,
      module: input.module ?? null,
      title: input.title ?? null,
      body: input.body ?? null,
      score: typeof input.score === "number" ? input.score : null,
      status: "received" as FeedbackStatus,
      is_anonymous: isAnon,
      is_public: input.isPublic ?? true,
      requester_profile_id: isAnon ? null : requester.profileId ?? null,
      requester_role: isAnon ? null : requester.role ?? null,
      requester_name: isAnon ? null : requester.name ?? null,
    };
    const res = await safeInsert<DbRow>(
      this.db,
      "support_feedback",
      payload,
      ["requester_profile_id"],
      FEEDBACK_COLS,
    );
    if (res.error) {
      if (isMissingTable(res.error)) return null;
      throw AppError.fromSupabase(res.error, "support_feedback.create");
    }
    const f = res.data ? toDomain(res.data) : null;
    if (f) {
      await helpAuditService.log({
        entityType: "feedback",
        entityId: f.id,
        action: "create",
        actorId: requester.profileId,
        actorName: requester.name,
        payload: { kind: f.kind, score: f.score, module: f.module },
      });
    }
    return f;
  }

  async update(
    id: string,
    patch: Partial<SupportFeedbackInput>,
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.kind !== undefined) payload.kind = patch.kind;
    if (patch.module !== undefined) payload.module = patch.module;
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.body !== undefined) payload.body = patch.body;
    if (patch.score !== undefined) payload.score = patch.score;
    if (patch.isPublic !== undefined) payload.is_public = patch.isPublic;
    if (patch.isAnonymous !== undefined) payload.is_anonymous = patch.isAnonymous;
    const res = await this.db
      .from("support_feedback" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_feedback.update");
    }
    await helpAuditService.log({
      entityType: "feedback",
      entityId: id,
      action: "update",
      actorId: actor?.id,
      actorName: actor?.name,
      payload,
    });
  }

  async setStatus(
    id: string,
    input: SupportFeedbackStatusInput,
    actor?: { id?: string; name?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { status: input.status };
    if (input.managerReply !== undefined) payload.manager_reply = input.managerReply;
    if (input.status === "planned") payload.planned_at = now;
    if (input.status === "shipped") payload.shipped_at = now;
    if (input.status === "declined") payload.declined_at = now;
    if (input.managerReply !== undefined) payload.replied_at = now;
    const res = await this.db
      .from("support_feedback" as never)
      .update(payload as never)
      .eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_feedback.setStatus");
    }
    await helpAuditService.log({
      entityType: "feedback",
      entityId: id,
      action: "status_change",
      actorId: actor?.id,
      actorName: actor?.name,
      payload: { status: input.status },
    });
  }

  async remove(id: string, actor?: { id?: string; name?: string }): Promise<void> {
    const res = await this.db.from("support_feedback" as never).delete().eq("id", id);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_feedback.delete");
    }
    await helpAuditService.log({
      entityType: "feedback",
      entityId: id,
      action: "delete",
      actorId: actor?.id,
      actorName: actor?.name,
    });
  }

  // ── Voting ───────────────────────────────────────────────────────────────
  async listUserVotes(profileId: string): Promise<string[]> {
    if (!profileId) return [];
    const res = await this.db
      .from("support_feedback_votes" as never)
      .select("feedback_id")
      .eq("profile_id", profileId);
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "support_feedback_votes.list");
    }
    return ((res.data as Array<{ feedback_id: string }> | null) ?? []).map(
      (r) => r.feedback_id,
    );
  }

  async vote(
    feedbackId: string,
    profileId: string,
    actorName?: string,
  ): Promise<void> {
    if (!profileId) {
      throw AppError.validation("Sign in to vote on feedback");
    }
    const ins = await safeInsert(
      this.db,
      "support_feedback_votes",
      { feedback_id: feedbackId, profile_id: profileId },
      ["profile_id"],
    );
    if (ins.error) {
      // Duplicate vote → unique violation 23505 → ignore quietly.
      const code = (ins.error as { code?: string }).code;
      if (code !== "23505" && !isMissingTable(ins.error)) {
        throw AppError.fromSupabase(ins.error, "support_feedback_votes.insert");
      }
      return;
    }
    await helpAuditService.log({
      entityType: "vote",
      entityId: feedbackId,
      action: "create",
      actorId: profileId,
      actorName,
      payload: { feedback_id: feedbackId },
    });
  }

  async unvote(
    feedbackId: string,
    profileId: string,
    actorName?: string,
  ): Promise<void> {
    if (!profileId) return;
    const res = await this.db
      .from("support_feedback_votes" as never)
      .delete()
      .eq("feedback_id", feedbackId)
      .eq("profile_id", profileId);
    if (res.error && !isMissingTable(res.error)) {
      throw AppError.fromSupabase(res.error, "support_feedback_votes.delete");
    }
    await helpAuditService.log({
      entityType: "vote",
      entityId: feedbackId,
      action: "delete",
      actorId: profileId,
      actorName,
      payload: { feedback_id: feedbackId },
    });
  }
}

export const feedbackService = new FeedbackService();
