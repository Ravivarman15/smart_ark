# Phase 8 — Production Baseline

Captured from the LIVE linked database before any Phase 8 change, and re-run
unchanged after deployment. Nothing was modified while collecting it.

## Organizations

| slug | id | display_name | created |
|---|---|---|---|
| `ark` | `126a6dd8-6f7e-4b81-9b82-58a9a3b77674` | ARK Learning Arena | 2026-08-06 |
| `abc-academi` | `12028704-0344-4900-af41-2f71b2372627` | ABC Academi | 2026-08-07 |

## Row counts by organization

| Table | ARK | ABC Academi |
|---|---|---|
| students | 134 | 0 |
| profiles | 24 | 1 |
| organization_users | 25 | 1 |
| parent_auth_accounts | 1 | 0 |
| student_attendance | 6,590 | 0 |
| staff_attendance | 8 | 0 |
| teacher_attendance | 30 | 0 |
| exams | 334 | 0 |
| exam_results | 1,479 | 0 |
| student_fees | 133 | 0 |
| fee_installments | 132 | 0 |
| payments | 0 | 0 |
| payroll_items | 18 | 0 |
| message_queue | 342 | 0 |
| student_documents | 0 | 0 |
| leads | 34 | 0 |
| campuses | 1 | 1 |
| organization_branches | 3 | 1 |
| batches | 81 | 0 |
| standards | 23 | 5 |

ABC holds only provisioning defaults and **zero** academic, financial or
attendance data. That is the evidence that provisioning created a tenant rather
than cloning ARK — no manual record copying was performed or needed.

## Tenancy surface

- **207** tables carry `organization_id`.
- RLS is enabled on **207 / 207**.
- **188** have policies scoped entirely by `current_org_id()`.
- **17** carry an additional platform-control-plane policy (`platform_can(…)`,
  `is_platform_admin()`) alongside the tenant policy — by design, for billing
  and audit staff.
- **2** have RLS enabled and no policies at all — deny-all:
  `organization_secrets` (deliberate; it holds tenant credentials) and
  `invoice_sequences`.

## Check-in surface, as found

- `teacher_attendance` — the check-in record: `check_in_time`, `check_out_time`,
  `geo_lat`, `geo_lng`, `geo_valid`, `checkout_geo_valid`. 30 ARK rows.
- `staff_attendance` — daily worked-minutes rollup, no geo. 8 ARK rows.
- `attendance_settings` — org-scoped singleton, one row per organization.
- `campuses` — org-scoped, has `geo_lat`/`geo_lng`. ARK's row: `13.0827, 80.2707`.
- `organization_branches` — org-scoped, has `geo_lat`/`geo_lng`/`is_active`/
  `is_primary`. ARK's "Senior Campus" row: `13.0827, 80.2707`.

**The geofence in force was in neither table.** It was two constants in
`src/contexts/AppDataContext.tsx` at `13.0059109, 80.1961798` and
`13.0059625, 80.1994691` — about **11.7 km** from the stored branch row. That
gap is why the new `is_checkin_location` flag defaults to `false`; see
`docs/CHECKIN_GEOFENCE_MIGRATION.md` §3.

## Post-deployment comparison (Part R)

Re-run after migration 8A: **every ARK count identical**. No decrease in any
table. No ARK row was created, altered or removed by this phase except the two
additive check-in location rows and the settings columns described in the
migration.
