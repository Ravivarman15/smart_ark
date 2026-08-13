import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { automationHealthService, type AutomationHealth } from "../services/automationHealth.service";

/**
 * Real delivery history per event. Absent keys mean "no history", which the
 * UI must render as an em dash rather than zero.
 */
export const useAutomationHealth = (days = 30) =>
  useQuery<Record<string, AutomationHealth>>({
    queryKey: ["communication", "automationHealth", days],
    queryFn: () => automationHealthService.byEvent(days),
    staleTime: 60_000,
  });

export interface DryTestEvent {
  candidates?: number;
  eligible?: number;
  preferenceSkipped?: number;
  missingPhone?: number;
  quietHoursDeferred?: number;
  duplicates?: number;
  missingVariableSkipped?: number;
  missingDataReasons?: Record<string, number>;
  wouldQueue?: number;
  templateKey?: string;
  templateStatus?: string;
  sampleMessage?: string | null;
  scheduledAt?: string | null;
  error?: string;
  failureKind?: string;
}

export interface DryTestResult {
  ok: boolean;
  organization?: string;
  date?: string;
  timezone?: string;
  events: Record<string, DryTestEvent>;
}

/**
 * RUN DRY TEST — resolve and render against live data, write nothing.
 *
 * ── WHY NO organizationId IS SENT ─────────────────────────────────────────
 * The function derives the tenant from the caller's verified JWT and refuses
 * a body id that disagrees with it. Passing one from the browser would be
 * theatre: the server would not believe it, and a UI that looks like it
 * chooses the tenant invites someone to try. It also refuses a live run from
 * a user token entirely — only the scheduled job may send.
 */
export const useDryTest = () =>
  useMutation<DryTestResult, Error, { eventKey: string; date?: string }>({
    mutationFn: async ({ eventKey, date }) => {
      const { data, error } = await supabase.functions.invoke("comms-scheduler", {
        body: { dryRun: true, events: [eventKey], ...(date ? { date } : {}) },
      });
      if (error) throw new Error(error.message);

      const result = (data as { results?: Array<Record<string, unknown>> })?.results?.[0];
      if (!result) throw new Error("The dry run returned no organization — check your session's organization.");
      if (result.error) throw new Error(String(result.error));

      return {
        ok: Boolean((data as { ok?: boolean }).ok),
        organization: result.organization as string | undefined,
        date: result.date as string | undefined,
        timezone: result.timezone as string | undefined,
        events: (result.events ?? {}) as Record<string, DryTestEvent>,
      };
    },
    onError: (e) => toast.error(e.message),
  });
