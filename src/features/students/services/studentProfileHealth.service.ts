import { BaseService } from "@/shared/services";

// ──────────────────────────────────────────────────────────────────────────────
// Student Profile Health — DB-wide completeness metrics for the new shared
// profile fields, plus the Transport / Hostel assignment queues.
//
// Reads active students with `SELECT *` (so it degrades gracefully before the
// 20260630 migration — absent columns simply read as undefined and every count
// is 0). Paginated so a large roll is never truncated. Pure aggregation; the
// dashboard widget + Data Health both consume this single source.
// ──────────────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  id: string;
  name: string;
}

export interface ProfileHealth {
  total: number;
  requiringTransport: number;
  transportUnassigned: number;
  requiringHostel: number;
  hostelUnassigned: number;
  missingEmergencyContact: number;
  missingBloodGroup: number;
  missingCommunicationPreference: number;
  missingSection: number;
  missingMedicalInfo: number;
  /** Percentage (0–100) of active students MISSING each field. */
  pct: {
    emergencyContact: number;
    bloodGroup: number;
    communicationPreference: number;
    section: number;
    medicalInfo: number;
  };
  /** Students who need transport/hostel but have no assignment yet. */
  transportQueue: QueueEntry[];
  hostelQueue: QueueEntry[];
}

type Row = {
  id: string;
  name: string | null;
  is_active: boolean | null;
  section?: string | null;
  transport_required?: boolean | null;
  transport_route_id?: string | null;
  hostel_required?: boolean | null;
  hostel_room_id?: string | null;
  blood_group?: string | null;
  medical_conditions?: string | null;
  allergies?: string | null;
  emergency_contact_number?: string | null;
  emergency_contact_name?: string | null;
  communication_preference?: string | null;
};

const empty = (): ProfileHealth => ({
  total: 0,
  requiringTransport: 0,
  transportUnassigned: 0,
  requiringHostel: 0,
  hostelUnassigned: 0,
  missingEmergencyContact: 0,
  missingBloodGroup: 0,
  missingCommunicationPreference: 0,
  missingSection: 0,
  missingMedicalInfo: 0,
  pct: { emergencyContact: 0, bloodGroup: 0, communicationPreference: 0, section: 0, medicalInfo: 0 },
  transportQueue: [],
  hostelQueue: [],
});

const blank = (v?: string | null) => !v || v.trim() === "";

class StudentProfileHealthService extends BaseService {
  async metrics(): Promise<ProfileHealth> {
    const PAGE = 1000;
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await this.db
        .from("students")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (res.error) return empty(); // table/columns unavailable → honest zeros
      const page = (res.data ?? []) as unknown as Row[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    const h = empty();
    h.total = rows.length;
    if (h.total === 0) return h;

    for (const r of rows) {
      if (r.transport_required) {
        h.requiringTransport += 1;
        if (blank(r.transport_route_id)) {
          h.transportUnassigned += 1;
          h.transportQueue.push({ id: r.id, name: r.name ?? "—" });
        }
      }
      if (r.hostel_required) {
        h.requiringHostel += 1;
        if (blank(r.hostel_room_id)) {
          h.hostelUnassigned += 1;
          h.hostelQueue.push({ id: r.id, name: r.name ?? "—" });
        }
      }
      if (blank(r.emergency_contact_number) && blank(r.emergency_contact_name))
        h.missingEmergencyContact += 1;
      if (blank(r.blood_group)) h.missingBloodGroup += 1;
      if (blank(r.communication_preference)) h.missingCommunicationPreference += 1;
      if (blank(r.section)) h.missingSection += 1;
      if (blank(r.blood_group) && blank(r.medical_conditions) && blank(r.allergies))
        h.missingMedicalInfo += 1;
    }

    const pc = (n: number) => Math.round((n / h.total) * 100);
    h.pct = {
      emergencyContact: pc(h.missingEmergencyContact),
      bloodGroup: pc(h.missingBloodGroup),
      communicationPreference: pc(h.missingCommunicationPreference),
      section: pc(h.missingSection),
      medicalInfo: pc(h.missingMedicalInfo),
    };
    return h;
  }
}

export const studentProfileHealthService = new StudentProfileHealthService();
