-- ════════════════════════════════════════════════════════════════════════════
-- PAYROLL QA SEED  —  realistic, REMOVABLE test data for the Payroll module.
--
-- Prereq:  run supabase/migrations/20260614_payroll_module.sql first (and the
--          attendance migration 20260612_attendance_module.sql).
--
-- What it seeds (every row is tagged for clean removal):
--   • 8 role rates                       (notes = 'PAYROLL_QA_SEED')
--   • staff overrides for up to 5 staff  (notes = 'PAYROLL_QA_SEED')
--   • 3 shifts (Morning / General / Evening)
--   • 4 payroll rules (punctuality bonus, lateness penalty, travel, 5% perf)
--   • 90 days of staff_attendance for up to 25 active staff, with built-in
--     variety: normal, overtime, late, half-day, leave, missing-checkout.
--     (source = 'bulk_import', remarks = 'PAYROLL_QA_SEED')
--
-- It DELIBERATELY does NOT insert payroll_runs/items. Runs must be created by
-- the real engine via the UI ("Generate Payroll") so the calculation, finance
-- sync, approval workflow and audit trail are all genuinely exercised:
--     1. Generate a run for each of the last 3 months.
--     2. Approve one, Pay one (→ Finance expense), Cancel one, leave one Pending.
--
-- Teardown: run supabase/seed/payroll_seed_teardown.sql.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Clean any previous seed so this script is idempotent ─────────────────────
DELETE FROM public.payroll_rules        WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.payroll_shifts       WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.payroll_staff_rates  WHERE notes   = 'PAYROLL_QA_SEED';
DELETE FROM public.staff_attendance     WHERE remarks = 'PAYROLL_QA_SEED';

-- ── Role rates (idempotent on UNIQUE(role)) ──────────────────────────────────
INSERT INTO public.payroll_role_rates (role, label, hourly_rate, monthly_salary, notes)
VALUES
  ('teacher',        'Teacher',        250, 0, 'PAYROLL_QA_SEED'),
  ('senior_teacher', 'Senior Teacher', 400, 0, 'PAYROLL_QA_SEED'),
  ('coordinator',    'Coordinator',    500, 0, 'PAYROLL_QA_SEED'),
  ('office_staff',   'Office Staff',   200, 0, 'PAYROLL_QA_SEED'),
  ('marketing',      'Marketing',      300, 0, 'PAYROLL_QA_SEED'),
  ('support_staff',  'Support Staff',  180, 0, 'PAYROLL_QA_SEED'),
  ('counsellor',     'Counsellor',     280, 0, 'PAYROLL_QA_SEED'),
  ('management',     'Management',     600, 0, 'PAYROLL_QA_SEED')
ON CONFLICT (role) DO UPDATE
  SET hourly_rate = EXCLUDED.hourly_rate,
      label       = EXCLUDED.label,
      notes       = 'PAYROLL_QA_SEED',
      is_active   = true;

-- ── Shifts (Morning / General / Evening) ─────────────────────────────────────
INSERT INTO public.payroll_shifts
  (scope, scope_ref, scope_label, start_time, end_time,
   expected_daily_minutes, expected_weekly_minutes, expected_monthly_minutes, working_days, notes)
VALUES
  ('role', 'teacher',      'Morning Shift', '08:00', '14:00', 360, 1800,  7920, 22, 'PAYROLL_QA_SEED'),
  ('role', 'office_staff', 'General Shift', '09:00', '18:00', 480, 2400, 10560, 22, 'PAYROLL_QA_SEED'),
  ('role', 'support_staff','Evening Shift', '14:00', '22:00', 480, 2400, 10560, 22, 'PAYROLL_QA_SEED');

-- ── Rules ────────────────────────────────────────────────────────────────────
-- R1 punctuality bonus: +₹2000 when attendance ≥ 95% AND zero late marks.
-- R2 lateness penalty : −₹500 when late ≥ 3 times in the period.
-- R3 travel allowance : +₹1000 for teachers.
-- R4 performance bonus: +5% of (basic + hourly + overtime).
INSERT INTO public.payroll_rules
  (rule_type, name, calc_method, value, applies_to, applies_ref, condition, sort_order, notes)
VALUES
  ('incentive', 'Punctuality Bonus', 'flat',    2000, 'all',  NULL,      '{"minAttendancePct":95,"maxLateCount":0}'::jsonb, 1, 'PAYROLL_QA_SEED'),
  ('penalty',   'Lateness Penalty',  'flat',     500, 'all',  NULL,      '{"minLateCount":3}'::jsonb,                        2, 'PAYROLL_QA_SEED'),
  ('allowance', 'Travel Allowance',  'flat',    1000, 'role', 'teacher', NULL,                                               3, 'PAYROLL_QA_SEED'),
  ('incentive', 'Performance Bonus', 'percent',    5, 'all',  NULL,      NULL,                                               4, 'PAYROLL_QA_SEED');

-- ── Staff overrides for the 5 most-recently-created active staff ─────────────
WITH picked AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM public.profiles
  WHERE COALESCE(is_active, true) = true
  LIMIT 5
)
INSERT INTO public.payroll_staff_rates (staff_id, hourly_rate, notes)
SELECT id,
       (ARRAY[350, 450, 300, 280, 520])[rn] AS hourly_rate,
       'PAYROLL_QA_SEED'
FROM picked
ON CONFLICT (staff_id) DO UPDATE
  SET hourly_rate = EXCLUDED.hourly_rate,
      notes       = 'PAYROLL_QA_SEED',
      is_active   = true;

-- ── 90 days of attendance for up to 25 active staff, weekends excluded ────────
-- Variety is driven by (day-offset % 10) so every payroll edge case appears:
--   0 → leave          (0 worked)
--   1 → half day       (240 worked)
--   2 → late           (470 worked, 30 late mins, status 'late')
--   3 → overtime       (600 worked, 120 overtime)
--   4 → missing checkout (in_time set, out_time NULL, 0 worked)
--   else → normal      (480 worked)
WITH staff25 AS (
  SELECT id
  FROM public.profiles
  WHERE COALESCE(is_active, true) = true
  ORDER BY created_at DESC
  LIMIT 25
),
days AS (
  SELECT (current_date - offs) AS d, offs
  FROM generate_series(0, 89) AS offs
),
grid AS (
  SELECT s.id AS staff_id, d.d AS date, (d.offs % 10) AS k
  FROM staff25 s
  CROSS JOIN days d
  WHERE extract(dow FROM d.d) NOT IN (0, 6)        -- skip Sat/Sun
)
INSERT INTO public.staff_attendance
  (staff_id, date, status, in_time, out_time,
   worked_minutes, expected_minutes, overtime_minutes, late_minutes, source, remarks)
SELECT
  staff_id,
  date,
  CASE k WHEN 0 THEN 'leave' WHEN 1 THEN 'half_day' WHEN 2 THEN 'late' ELSE 'present' END,
  CASE WHEN k = 0 THEN NULL ELSE (date + time '09:00') AT TIME ZONE 'Asia/Kolkata' END,
  CASE WHEN k IN (0, 4) THEN NULL ELSE (date + time '18:00') AT TIME ZONE 'Asia/Kolkata' END,
  CASE k WHEN 0 THEN 0 WHEN 1 THEN 240 WHEN 2 THEN 470 WHEN 3 THEN 600 WHEN 4 THEN 0 ELSE 480 END,
  CASE k WHEN 0 THEN 480 ELSE 480 END,
  CASE k WHEN 3 THEN 120 ELSE 0 END,
  CASE k WHEN 2 THEN 30 ELSE 0 END,
  'bulk_import',
  'PAYROLL_QA_SEED'
FROM grid
ON CONFLICT (staff_id, date) DO UPDATE
  SET status           = EXCLUDED.status,
      in_time          = EXCLUDED.in_time,
      out_time         = EXCLUDED.out_time,
      worked_minutes   = EXCLUDED.worked_minutes,
      expected_minutes = EXCLUDED.expected_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes,
      late_minutes     = EXCLUDED.late_minutes,
      source           = 'bulk_import',
      remarks          = 'PAYROLL_QA_SEED';

COMMIT;

-- ── Quick verification (run after COMMIT) ────────────────────────────────────
-- SELECT count(*) AS attendance_rows FROM public.staff_attendance WHERE remarks = 'PAYROLL_QA_SEED';
-- SELECT count(*) AS overrides       FROM public.payroll_staff_rates WHERE notes = 'PAYROLL_QA_SEED';
-- SELECT role, hourly_rate FROM public.payroll_role_rates WHERE notes = 'PAYROLL_QA_SEED' ORDER BY hourly_rate DESC;
