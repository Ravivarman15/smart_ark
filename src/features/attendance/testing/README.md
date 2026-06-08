# Attendance Module — QA & Verification

This folder is the **executable** half of the attendance QA pass. It runs the
module's real engines against seed-equivalent figures and hand-verifies every
derived number. Nothing here is mocked into "success" — if an engine drifts, the
suite fails.

## What runs automatically

`attendanceSeed.test.ts` (30 assertions, run with `npm run test` or
`npx vitest run src/features/attendance/testing`):

| Area | What is asserted against a hand calculation |
|------|---------------------------------------------|
| Work-hours engine | normal / late / overtime / early-exit / half-day / leave / missing-checkout → worked, expected, remaining, OT, late, early-exit, pct |
| Weekly aggregate | present days, worked/expected totals, OT, late & leave counts, capped % |
| Risk engine | student & staff composite 0–100 scores; level thresholds 75/50/25 |
| Alert builders | defaulter bands (50/60/75), streak bands (3/5/7/10), staff low/late/early; **dedupe-key stability** (repeat scans converge → no duplicate alerts) |
| WhatsApp templates | each alert kind → correct template; full variable substitution, no gaps |
| Governance windows | day/week/month lock windows; non-leap February; `coversDate` scope + range rules |
| Date helpers | `addDays`/`previousDay`/`dateRange`/`monthStart`/`monthEnd` incl. month, year & leap boundaries |

These figures mirror exactly what `supabase/seed/attendance_seed.sql` writes, so a
green suite means the calculations the seeded UI will display are correct.

> **Bug found & fixed during this pass:** `utils/dates.ts` `addDays` formatted via
> `toISOString()` (UTC). In a positive-offset timezone (IST +5:30) a local-midnight
> date round-tripped through UTC landed on the **previous** calendar day, so
> `addDays(d, +1)` returned `d` unchanged — silently breaking Copy-Yesterday,
> backdated ranges, registers, heatmaps and **week locks** in India. Fixed to format
> from local components; covered by the date-helper assertions above.

## Seed data (run against a real database)

1. Apply the migrations (Supabase SQL editor), in order:
   `20260612_attendance_module.sql`, then `20260613_attendance_governance.sql`.
2. Run `supabase/seed/attendance_seed.sql` — creates 1 campus, 2 academic years,
   1 course type, 5 standards, 10 batches, **100 students**, and **90 days** of
   student attendance (realistic mix + ~11 chronic defaulters and streak cases) plus
   90 days of staff attendance for up to **15 existing active staff**.
   (Staff can't be fabricated from SQL — `profiles.user_id` requires `auth.users` —
   so staff attendance attaches to real staff already in the DB.)
3. Tear down with `supabase/seed/attendance_seed_teardown.sql` (only touches tagged
   rows: `notes`/`remarks = 'ATT_QA_SEED'`, names `LIKE '%[ATT_QA]%'`).

## Manual / live-environment checks (NOT asserted here)

These need a running app + applied migrations + seed, and a human or browser to
observe. They are **not** claimed as passing by the test suite — verify them in the
UI after seeding:

- **Lock / closing enforcement** — lock a day/week/month, then try to mark → blocked
  by `lockGuardService.assertWritable`; close a month → read-only; reopen workflow.
- **Approval queue** — raise correction/backdated/import/reopen/unlock → approve /
  reject / return; confirm side-effects (approved reopen reopens the month, approved
  unlock clears the lock) and audit entries.
- **Automation Center** — run each scan; confirm alerts appear, repeat scan creates
  no duplicates, resolved/dismissed alerts stay closed.
- **Notifications** — confirm WhatsApp enqueues via AiSensy (server-side keys) and
  in-app alert records.
- **Realtime** — open the dashboard/analytics and confirm rows update on change.
- **RBAC** — sign in as each role; confirm menu visibility and action gating
  (`attendance.*` actions in Manage Staff Role).
- **Exports** — CSV / Excel / PDF / print contain the filtered data.
- **Performance & Mobile (APK)** — marking/analytics/report speed at scale, and
  responsive layout on device.

## System / Attendance Health

`governance/services/attendanceHealth.service.ts` (Attendance Health page) and the
RBAC System Health "Attendance" probes check tables, locks, approvals, alerts,
automation runs, realtime and settings live — use them as the runtime smoke test
once the migrations + seed are applied.
