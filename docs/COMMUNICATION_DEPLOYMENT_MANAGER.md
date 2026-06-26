# Communication Deployment Manager — Build Report

Management-only deployment verification & operational console for the centralized
communication engine. **Reuses** `message_queue`, `comms_templates`, `comms_audit`,
`send-aisensy`, `send-email` and the Health service. **No new queue tables, no data
migration, no duplicate communication logic.**

Route: `/{admin|management}/communication/deployment-manager`
Menu: WhatsApp SMS → **Deployment Manager** (admin + management).

---

## Sections delivered

| # | Section | How it works |
|---|---|---|
| 1 | **Communication Inventory** | Table of every registered template: Module, Key, Channel, Trigger, Variables, Used In, Status, Last Used, Last Tested — from `DEPLOYMENT_REGISTRY` + `comms_templates` + live `message_queue` usage. |
| 2 | **Deployment Status** | Per-template badge — Live / Production Ready / Configured / Needs Approval / Not Tested / Missing / Deprecated (pure `computeTemplateStatus`). |
| 3 | **Dependency Map** | Per template: Module · Service · Queue · Edge Fn · Provider · Retry · Webhook · Audit — the full module→provider path. |
| 4 | **Production Checklist** | Migrations / templates / aliases / edge fns / retry / cron / webhook / AiSensy / Brevo / secrets → PASS / FAIL / CHECK (live where measurable). |
| 5 | **Template Verification** | In registry · Seeded · Rendered OK · Vars match · Last success · Last failure + reason (real `renderMessage`). |
| 6 | **Template Test Console** | Select template → rendered preview + variables → recipient → **real test send** via `send-aisensy` debug (no queue write) / `send-email` → provider response. |
| 7 | **Bulk Verification** | Every template scored (Referenced · Seeded · Rendered · Vars · Result) in one table. |
| 8 | **Production Readiness Score** | Category bars (Infrastructure / Templates / Edge / Secrets / Cron / Providers / Tests) + overall % + blocker list (pure `computeReadiness`). |

> Live-only categories (Edge / Secrets / Cron / Providers) show `—` until you run
> the matching test on the Health page — the score is **honest**: it never claims
> a dependency passes without a real probe.

---

## PASS / FAIL (this change set)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ PASS |
| `eslint` (changed files) | ✅ PASS |
| `vitest` | ✅ PASS — 46/46 (incl. 10 new deployment tests) |
| `vite build` | ✅ PASS (23.6s) |
| Reuses existing engine only (no dup tables/services) | ✅ PASS |
| No data migration | ✅ PASS |
| Lead CRM untouched | ✅ PASS |
| RBAC registered (catalog + menu + routes) | ✅ PASS |

---

## Modified files
- `src/core/navigation/menu.config.ts` — Deployment Manager menu item.
- `src/features/rbac/constants/catalog.ts` — `whatsapp.deployment_manager` submodule.
- `src/App.tsx` — lazy import + route (admin + management layouts).
- `src/core/constants/queryKeys.ts` — `systemHealth` key (prior phase).
- `src/features/communication/services/commsHealth.service.ts` — added `templateUsage()` + `TemplateUsageRow`.
- `src/features/communication/services/index.ts`, `hooks/index.ts` — exports.
- `src/features/communication/hooks/useCommsHealth.ts` — added `useTemplateUsage`.

## New components / pages
- `src/features/communication/pages/CommunicationDeploymentPage.tsx` — the 8-section manager.

## New services / logic (no duplicate engine)
- `src/features/communication/constants/deploymentRegistry.ts` — descriptive template→deployment metadata.
- `src/features/communication/utils/deploymentStatus.ts` — pure status + readiness scoring.
- `src/features/communication/testing/deploymentStatus.test.ts` — 10 unit tests.
- `commsHealthService.templateUsage()` — per-template usage facts (reads `message_queue`).

---

## Final Production Readiness Report (template)

Open the page; the score computes from live data. With an un-provisioned backend
it reads, honestly, ~low (queue unreachable → Infrastructure 0, Templates 0,
Tests 0; live categories show `—`). After the deployment checklist in
`docs/COMMUNICATION_VERIFICATION.md` is completed:

1. Apply migrations + `seedBuiltins()` → Infrastructure & Templates → 100%.
2. Run **Test Queue / WhatsApp / Email / Retry** on Health → Edge / Providers / Secrets resolve.
3. Send one real test per wired module → **Communication Tests** climbs to 100%.
4. **Overall** reaches production threshold; the blocker list empties.

**Remaining blockers are infrastructure only** (migrations, function deploys,
secrets, cron, AiSensy webhook) — enumerated live in the Production Checklist and
Readiness panels, and in `docs/COMMUNICATION_VERIFICATION.md`.
