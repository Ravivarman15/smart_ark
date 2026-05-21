import { BaseService } from "@/shared/services";
import type {
  OnboardingEvent,
  OnboardingEventType,
} from "../types/staff.types";

// ── Onboarding lifecycle service ─────────────────────────────────────────────
//
// READ + WRITE for the staff onboarding audit trail (`staff_onboarding_events`)
// and the lifecycle columns on `profiles`.
//
// The `invite-staff` edge function writes the invite/email events server-side
// (service-role). This service covers the events that originate in the app:
//   • first login          — recorded from AuthContext on password sign-in
//   • role / module / permission changes — recorded from the access editor
//   • activate / deactivate / suspend    — recorded from Manage Staff
//
// GRACEFUL DEGRADATION: every method is best-effort. If the migration has not
// been applied (table / columns absent) reads return [] and writes no-op — the
// surrounding staff workflow is never blocked by audit logging.
// ─────────────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  profile_id: string;
  event_type: string;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  actor_profile_id: string | null;
  actor_name: string | null;
  created_at: string;
};

const toDomain = (r: EventRow): OnboardingEvent => ({
  id: r.id,
  profileId: r.profile_id,
  eventType: r.event_type,
  detail: r.detail ?? undefined,
  metadata: r.metadata ?? undefined,
  actorProfileId: r.actor_profile_id ?? undefined,
  actorName: r.actor_name ?? undefined,
  createdAt: r.created_at,
});

export interface ActorRef {
  profileId?: string;
  name?: string;
}

export interface LogEventArgs {
  profileId: string;
  eventType: OnboardingEventType | string;
  detail?: string;
  metadata?: Record<string, unknown>;
  actor?: ActorRef;
}

class OnboardingService extends BaseService {
  /** Read the onboarding audit timeline for a staff member (newest first). */
  async listEvents(profileId: string): Promise<OnboardingEvent[]> {
    try {
      const res = await this.db
        .from("staff_onboarding_events")
        .select(
          "id, profile_id, event_type, detail, metadata, actor_profile_id, actor_name, created_at",
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
      if (res.error) return [];
      return (res.data as unknown as EventRow[]).map(toDomain);
    } catch {
      return [];
    }
  }

  /** Append one audit event. Best-effort — never throws. */
  async logEvent(args: LogEventArgs): Promise<void> {
    try {
      await this.db.from("staff_onboarding_events").insert({
        profile_id: args.profileId,
        event_type: args.eventType,
        detail: args.detail ?? null,
        metadata: args.metadata ?? {},
        actor_profile_id: args.actor?.profileId ?? null,
        actor_name: args.actor?.name ?? null,
      } as never);
    } catch {
      /* audit is best-effort */
    }
  }

  /**
   * Record a successful password sign-in. Updates `last_login_at` and, on the
   * very first login, flips onboarding to `completed`. Looks the profile up by
   * the auth user id so AuthContext can call it with the data it already has.
   */
  async recordLogin(userId: string): Promise<void> {
    try {
      const { data } = await this.db
        .from("profiles")
        .select("id, onboarding_status")
        .eq("user_id", userId)
        .maybeSingle();
      const profile = data as
        | { id: string; onboarding_status?: string | null }
        | null;
      if (!profile) return;

      const nowIso = new Date().toISOString();
      const firstLogin = profile.onboarding_status !== "completed";

      const patch: Record<string, unknown> = { last_login_at: nowIso };
      if (firstLogin) {
        patch.onboarding_status = "completed";
        patch.onboarding_completed_at = nowIso;
      }
      const upd = await this.db
        .from("profiles")
        .update(patch as never)
        .eq("id", profile.id);
      // If the onboarding columns don't exist yet, stop quietly.
      if (upd.error) return;

      if (firstLogin) {
        await this.logEvent({
          profileId: profile.id,
          eventType: "first_login",
          detail: "Staff signed in for the first time — onboarding completed",
        });
      }
    } catch {
      /* best-effort */
    }
  }

  /** Audit a role reassignment. */
  async recordRoleChange(
    profileId: string,
    fromRole: string,
    toRole: string,
    actor?: ActorRef,
  ): Promise<void> {
    await this.logEvent({
      profileId,
      eventType: "role_changed",
      detail: `Role changed from "${fromRole}" to "${toRole}"`,
      metadata: { fromRole, toRole },
      actor,
    });
  }

  /** Audit a module-visibility update. */
  async recordModulesUpdated(
    profileId: string,
    actor?: ActorRef,
  ): Promise<void> {
    await this.logEvent({
      profileId,
      eventType: "modules_updated",
      detail: "Module access updated",
      actor,
    });
  }

  /** Audit a permission update. */
  async recordPermissionsUpdated(
    profileId: string,
    actor?: ActorRef,
  ): Promise<void> {
    await this.logEvent({
      profileId,
      eventType: "permissions_updated",
      detail: "Action permissions updated",
      actor,
    });
  }

  /** Audit an activate / deactivate / suspend lifecycle change. */
  async recordLifecycle(
    profileId: string,
    action: "activated" | "deactivated" | "suspended",
    actor?: ActorRef,
  ): Promise<void> {
    await this.logEvent({
      profileId,
      eventType: action,
      detail: `Account ${action}`,
      actor,
    });
  }
}

export const onboardingService = new OnboardingService();
