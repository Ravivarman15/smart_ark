// ──────────────────────────────────────────────────────────────────────────────
// SMART ARK ACADEMIC CALENDAR — Cross-Module Integrations Service
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { BaseService } from "@/shared/services";
import { requireOrganization, currentOrganizationId } from "@/core/tenant/tenant";

export interface IntegratedExamOption {
  id: string;
  title: string;
  exam_date: string;
  start_time?: string;
  end_time?: string;
  subject_name?: string;
  standard_name?: string;
  batch_name?: string;
  mode: string;
}

export class CalendarIntegrationsService extends BaseService {
  /**
   * Fetch scheduled exams that can be deep-linked into the calendar.
   */
  async getAvailableExams(): Promise<IntegratedExamOption[]> {
    const orgId = currentOrganizationId();
    if (!orgId) return [];

    try {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, exam_date, start_time, end_time, subject_name, standard_name, batch_name, mode")
        .eq("organization_id", orgId)
        .order("exam_date", { ascending: false })
        .limit(30);

      if (error || !data) return [];
      return data as IntegratedExamOption[];
    } catch {
      return [];
    }
  }

  /**
   * Fetch active announcements that can be linked.
   */
  async getAvailableAnnouncements(): Promise<Array<{ id: string; title: string; publish_at: string }>> {
    const orgId = currentOrganizationId();
    if (!orgId) return [];

    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, publish_at")
        .eq("organization_id", orgId)
        .order("publish_at", { ascending: false })
        .limit(20);

      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }
}

export const calendarIntegrationsService = new CalendarIntegrationsService();
