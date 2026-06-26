// ──────────────────────────────────────────────────────────────────────────────
// Deployment status + production-readiness — PURE (no React / no Supabase).
// Single source of the Deployment Manager's classification + scoring so the UI
// renders results without computing them. Unit-tested in deploymentStatus.test.ts.
// ──────────────────────────────────────────────────────────────────────────────

import type { TemplateDeployMeta } from "../constants/deploymentRegistry";

export type DeployStatus =
  | "live" // wired + seeded + at least one successful send
  | "production_ready" // wired + seeded + tested, no recent failures
  | "configured" // seeded in comms_templates
  | "needs_approval" // wired whatsapp template never sent (provider approval unproven)
  | "not_tested" // seeded but never sent
  | "missing" // not seeded into comms_templates
  | "deprecated";

export interface TemplateUsageFacts {
  inDb: boolean;
  sent: number;
  failed: number;
}

export interface TemplateStatusResult {
  status: DeployStatus;
  label: string;
  tone: "positive" | "warning" | "negative" | "default" | "info";
}

const STATUS_LABEL: Record<DeployStatus, string> = {
  live: "Live",
  production_ready: "Production Ready",
  configured: "Configured",
  needs_approval: "Needs Approval",
  not_tested: "Not Tested",
  missing: "Missing",
  deprecated: "Deprecated",
};

const STATUS_TONE: Record<DeployStatus, TemplateStatusResult["tone"]> = {
  live: "positive",
  production_ready: "positive",
  configured: "info",
  needs_approval: "warning",
  not_tested: "warning",
  missing: "negative",
  deprecated: "default",
};

/** Classify one template from its registry metadata + observed usage facts. */
export const computeTemplateStatus = (
  meta: TemplateDeployMeta,
  facts: TemplateUsageFacts,
): TemplateStatusResult => {
  let status: DeployStatus;
  if (meta.deprecated) status = "deprecated";
  else if (!facts.inDb) status = "missing";
  else if (facts.sent > 0) status = meta.wired && facts.failed === 0 ? "live" : "production_ready";
  else if (meta.wired && meta.channel === "whatsapp") status = "needs_approval";
  else status = facts.inDb ? "not_tested" : "configured";
  return { status, label: STATUS_LABEL[status], tone: STATUS_TONE[status] };
};

// ── Production readiness score ────────────────────────────────────────────────
export interface ReadinessInput {
  queueReachable: boolean;
  aliasesAvailable: boolean;
  totalTemplates: number;
  seededTemplates: number;
  wiredTemplates: number;
  testedTemplates: number; // wired templates with ≥1 successful send
  // Live signals from the health probes. `undefined` ⇒ not checked yet.
  edgeOk?: boolean;
  secretsOk?: boolean;
  cronOk?: boolean;
  providersOk?: boolean;
}

export interface ReadinessCategory {
  name: string;
  /** null = not yet checked (needs a live probe). */
  pct: number | null;
}

export interface ReadinessScore {
  categories: ReadinessCategory[];
  /** Average of measurable categories, 0–100. */
  overall: number;
  blockers: string[];
}

const ratio = (n: number, d: number): number => (d <= 0 ? 0 : Math.round((n / d) * 100));
const livePct = (v: boolean | undefined): number | null => (v === undefined ? null : v ? 100 : 0);

export const computeReadiness = (input: ReadinessInput): ReadinessScore => {
  const infra = input.queueReachable ? (input.aliasesAvailable ? 100 : 80) : 0;
  const templates = ratio(input.seededTemplates, input.totalTemplates);
  const tests = ratio(input.testedTemplates, input.wiredTemplates);

  const categories: ReadinessCategory[] = [
    { name: "Infrastructure", pct: infra },
    { name: "Templates", pct: templates },
    { name: "Edge Functions", pct: livePct(input.edgeOk) },
    { name: "Secrets", pct: livePct(input.secretsOk) },
    { name: "Cron", pct: livePct(input.cronOk) },
    { name: "Providers", pct: livePct(input.providersOk) },
    { name: "Communication Tests", pct: tests },
  ];

  const measurable = categories.filter((c) => c.pct !== null) as Array<ReadinessCategory & { pct: number }>;
  const overall =
    measurable.length === 0 ? 0 : Math.round(measurable.reduce((a, c) => a + c.pct, 0) / measurable.length);

  const blockers: string[] = [];
  if (!input.queueReachable) blockers.push("Apply communication migrations — message_queue unreachable.");
  if (!input.aliasesAvailable) blockers.push("Apply 20260627 aliases migration (communication_* views).");
  if (templates < 100) blockers.push(`Seed templates — ${input.seededTemplates}/${input.totalTemplates} in comms_templates.`);
  if (tests < 100) blockers.push(`Test sends — ${input.testedTemplates}/${input.wiredTemplates} wired templates have a successful send.`);
  for (const c of categories) {
    if (c.pct === null) blockers.push(`${c.name}: run the live test on the Health page.`);
    else if (c.pct < 100 && !["Templates", "Communication Tests", "Infrastructure"].includes(c.name)) {
      blockers.push(`${c.name}: failing.`);
    }
  }

  return { categories, overall, blockers };
};
