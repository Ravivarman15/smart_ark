import { BaseService, AppError } from "@/shared/services";
import type {
  ReferralEvent,
  ReferralSummary,
} from "../types/settings.types";

// Referral service — per-user referral code + history.
//
// Code generation is client-suggested and DB-enforced unique. Each profile
// gets one code; `ensureForProfile` is idempotent (it just inserts if
// missing). The shape matches what the My Referral page expects.

type SummaryRow = {
  id: string;
  profile_id: string;
  referral_code: string;
  total_referrals: number;
  total_rewards: number;
  created_at: string;
};

type EventRow = {
  id: string;
  referrer_profile_id: string;
  referred_profile_id: string | null;
  reward_amount: number;
  status: "pending" | "credited" | "reversed";
  notes: string | null;
  created_at: string;
};

const toSummary = (r: SummaryRow): ReferralSummary => ({
  profileId: r.profile_id,
  referralCode: r.referral_code,
  totalReferrals: Number(r.total_referrals) || 0,
  totalRewards: Number(r.total_rewards) || 0,
  createdAt: r.created_at,
});

const toEvent = (r: EventRow): ReferralEvent => ({
  id: r.id,
  referrerProfileId: r.referrer_profile_id,
  referredProfileId: r.referred_profile_id ?? undefined,
  rewardAmount: Number(r.reward_amount) || 0,
  status: r.status,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

const isTableMissing = (err: { message?: string } | null | undefined) => {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
};

// 8-char alphanumeric code (uppercase). Excludes ambiguous chars.
const generateCode = (seed?: string): string => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const base = (seed ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (base) out.push(base);
  while (out.join("").length < 8) {
    out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return out.join("").slice(0, 8);
};

class ReferralService extends BaseService {
  /** Look up the user's referral row; if missing, create one. */
  async ensureForProfile(profileId: string, nameSeed?: string): Promise<ReferralSummary | null> {
    const existing = await this.db
      .from("settings_referrals" as never)
      .select("id, profile_id, referral_code, total_referrals, total_rewards, created_at")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (existing.error) {
      if (isTableMissing(existing.error)) return null;
      throw AppError.fromSupabase(existing.error, "settings_referrals");
    }
    if (existing.data) {
      const row = toSummary(existing.data as unknown as SummaryRow);
      return { ...row, ...(await this.derivedTotals(profileId)) };
    }

    // No row yet — create one with a fresh code. Retry once on collision.
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = generateCode(nameSeed);
      const ins = await this.db
        .from("settings_referrals" as never)
        .insert({ profile_id: profileId, referral_code: code } as never)
        .select("id, profile_id, referral_code, total_referrals, total_rewards, created_at")
        .single();
      if (!ins.error && ins.data) return toSummary(ins.data as unknown as SummaryRow);
      if (ins.error?.code !== "23505") {
        if (isTableMissing(ins.error)) return null;
        throw AppError.fromSupabase(ins.error, "settings_referrals.insert");
      }
    }
    throw AppError.validation("Could not allocate a unique referral code");
  }

  /**
   * Totals derived from the events themselves.
   *
   * `settings_referrals.total_referrals` and `.total_rewards` are stored
   * columns with NO trigger maintaining them — verified against the live
   * database. They are 0 today only because there are no events yet; the first
   * real referral would leave the page showing a stored 0 beside a populated
   * history, which is the same class of bug as a hardcoded figure.
   *
   * Deriving is cheap here (one indexed read the page already performs) and
   * cannot drift. Reversed events are excluded from both counts, and only
   * CREDITED rewards are summed — a pending reward has not been paid, and
   * showing it as earned would overstate what the user is owed.
   */
  async derivedTotals(
    profileId: string,
  ): Promise<{ totalReferrals: number; totalRewards: number }> {
    const res = await this.db
      .from("settings_referral_events" as never)
      .select("reward_amount, status")
      .eq("referrer_profile_id", profileId);
    if (res.error) {
      if (isTableMissing(res.error)) return { totalReferrals: 0, totalRewards: 0 };
      throw AppError.fromSupabase(res.error, "settings_referral_events.totals");
    }
    const rows = (res.data ?? []) as unknown as { reward_amount: number; status: string }[];
    return {
      totalReferrals: rows.filter((r) => r.status !== "reversed").length,
      totalRewards: rows
        .filter((r) => r.status === "credited")
        .reduce((sum, r) => sum + (Number(r.reward_amount) || 0), 0),
    };
  }

  async listEvents(profileId: string, limit = 25): Promise<ReferralEvent[]> {
    const res = await this.db
      .from("settings_referral_events" as never)
      .select(
        "id, referrer_profile_id, referred_profile_id, reward_amount, status, notes, created_at"
      )
      .eq("referrer_profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (res.error) {
      if (isTableMissing(res.error)) return [];
      throw AppError.fromSupabase(res.error, "settings_referral_events");
    }
    return ((res.data ?? []) as unknown as EventRow[]).map(toEvent);
  }
}

export const referralService = new ReferralService();
