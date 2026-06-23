// Pure pipeline-stage helpers — no React, no supabase.

import { LEAD_PIPELINE, type LeadStatus } from "../types/lead.types";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New Lead",
  contacted: "Contacted",
  followup: "Follow-up",
  demo_scheduled: "Demo Scheduled",
  demo_attended: "Demo Attended",
  admission: "Admission",
  closed: "Closed",
};

export const statusLabel = (s: LeadStatus): string => STATUS_LABELS[s] ?? s;

export const stageIndex = (s: LeadStatus): number => LEAD_PIPELINE.indexOf(s);

/**
 * Transitions are permissive forward + one step back (the spec uses drag-drop),
 * plus jump-to-closed from anywhere. Prevents nonsensical leaps (e.g. new →
 * admission without a demo) while keeping the board fluid.
 */
export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return false;
  if (to === "closed") return true;
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  if (fi < 0 || ti < 0) return false;
  return ti === fi + 1 || ti === fi - 1 || ti === fi + 2;
}

/** Next forward stage, or null at the end of the pipeline. */
export function nextStage(s: LeadStatus): LeadStatus | null {
  const i = stageIndex(s);
  return i >= 0 && i < LEAD_PIPELINE.length - 1 ? LEAD_PIPELINE[i + 1] : null;
}

/** Stages a lead can be moved to from `from` (drives the mobile quick-move menu). */
export function transitionTargets(from: LeadStatus): LeadStatus[] {
  return LEAD_PIPELINE.filter((s) => canTransition(from, s));
}
