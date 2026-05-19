import { BaseService } from "@/shared/services";
import type { PlanSummary } from "../types/settings.types";

// Plan service. No subscription table exists yet, so this returns a
// synthetic "Pro" plan derived from live counts (students/staff). When the
// real subscription table lands, swap the body of `summary()` — the shape
// returned is stable.

class PlanService extends BaseService {
  async summary(): Promise<PlanSummary> {
    const [studentsRes, staffRes] = await Promise.all([
      this.db.from("students").select("id", { count: "exact", head: true }),
      this.db.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const staffUsed = staffRes.count ?? 0;
    const studentUsed = studentsRes.count ?? 0;

    return {
      planName: "ARK Pro",
      status: "active",
      // Synthetic 1-year window starting Jan 1 of current year.
      startsAt: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      expiresAt: new Date(new Date().getFullYear() + 1, 0, 1).toISOString(),
      features: [
        "Unlimited students",
        "Multi-campus support",
        "Role-based access control",
        "WhatsApp + SMS automations",
        "Daily reports",
      ],
      staffLimit: 50,
      staffUsed,
      studentLimit: 2000,
      studentUsed,
      storageLimitMb: 5000,
      storageUsedMb: undefined, // Storage usage requires a separate audit pass.
      smsLimit: 5000,
      smsUsed: undefined,
    };
  }
}

export const planService = new PlanService();
