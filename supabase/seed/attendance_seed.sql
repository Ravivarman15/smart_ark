-- ════════════════════════════════════════════════════════════════════════════
-- ATTENDANCE QA SEED  —  realistic, REMOVABLE test data for the Attendance module
-- (Phases 1-5: engine, imports, analytics, reports, governance & automation).
--
-- Prereq:  apply these migrations first, in order, in the Supabase SQL editor:
--            supabase/migrations/20260612_attendance_module.sql
--            supabase/migrations/20260613_attendance_governance.sql
--
-- What it seeds (every row is tagged for clean removal):
--   Academic structure
--     • 1 campus              name LIKE '%[ATT_QA]%'
--     • 2 academic years      name LIKE '%[ATT_QA]%'   (2025-2026, 2026-2027)
--     • 1 course type         name LIKE '%[ATT_QA]%'
--     • 5 standards           name LIKE '%[ATT_QA]%'   (Grade 6..10)
--     • 10 batches            name LIKE '%[ATT_QA]%'   (Div A & B per standard)
--   People
--     • 100 students          notes = 'ATT_QA_SEED'    (20 per standard, 10/batch)
--   History (90 days, weekends handled realistically)
--     • student_attendance    notes = 'ATT_QA_SEED'
--         realistic mix: ~80% present, 8% absent, 5% late, 3% medical,
--         2% excused, 2% half-day. ~11 chronic defaulters (<50%) and a subset
--         with recent consecutive-absence streaks so the Risk Engine, Defaulter
--         detection and Automation scans have REAL targets to find.
--     • staff_attendance      remarks = 'ATT_QA_SEED'
--         seeded for up to 15 EXISTING active staff (see note below) with built-in
--         variety: normal, half-day, late (+late mins), overtime, early-exit,
--         missing-checkout, leave — exercising the work-hours engine & staff alerts.
--
-- ⚠ STAFF NOTE:  profiles.user_id is NOT NULL → REFERENCES auth.users(id), so
--    staff cannot be fabricated from plain SQL without auth rows. Like the proven
--    payroll seed, this script attaches staff attendance to the 15 most-recent
--    ACTIVE profiles already in the database — real staff, real rows. If the DB
--    has no staff yet, the staff section simply inserts nothing (students still
--    seed fully). Create staff via the app first to populate staff attendance.
--
-- It DELIBERATELY does NOT insert locks / closings / approvals / alerts. Those
-- must be created by the real engine through the UI so the governance, approval
-- and automation workflows + their audit trails are genuinely exercised:
--     1. Automation Center → run each scan; confirm alerts appear (no dupes).
--     2. Governance → lock a day/week/month; confirm marking is blocked.
--     3. Close a month; confirm read-only; raise a Reopen request → approve it.
--     4. Approval Queue → approve/reject/return a correction.
--
-- Idempotent: re-running first removes the previous seed, then re-inserts.
-- Teardown:   run supabase/seed/attendance_seed_teardown.sql.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Clean any previous seed (dependency order) so this script is idempotent ───
DELETE FROM public.student_attendance_audit WHERE changed_by_name = 'ATT_QA_SEED';
DELETE FROM public.staff_attendance         WHERE remarks         = 'ATT_QA_SEED';
DELETE FROM public.student_attendance       WHERE notes           = 'ATT_QA_SEED';
DELETE FROM public.students                 WHERE notes           = 'ATT_QA_SEED';
DELETE FROM public.batches                  WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.standards                WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.course_types             WHERE name LIKE '%[ATT_QA]%';
DELETE FROM public.academic_years           WHERE name LIKE '%[ATT_QA]%';
-- campus is reused on re-runs (ON CONFLICT below); not deleted here.

-- ── Campus (UNIQUE name) ──────────────────────────────────────────────────────
INSERT INTO public.campuses (name, address)
VALUES ('ARK QA Campus [ATT_QA]', 'Attendance QA seed campus')
ON CONFLICT (name) DO NOTHING;

-- ── 2 Academic Years ──────────────────────────────────────────────────────────
INSERT INTO public.academic_years (name, start_date, end_date, is_active)
VALUES
  ('2025-2026 [ATT_QA]', DATE '2025-06-01', DATE '2026-03-31', false),
  ('2026-2027 [ATT_QA]', DATE '2026-06-01', DATE '2027-03-31', true);

-- ── 1 Course Type ─────────────────────────────────────────────────────────────
INSERT INTO public.course_types (name, description)
VALUES ('Regular [ATT_QA]', 'Attendance QA seed course type');

-- ── 5 Standards (Grade 6..10) ─────────────────────────────────────────────────
INSERT INTO public.standards (name, display_order)
VALUES
  ('Grade 6 [ATT_QA]',  6),
  ('Grade 7 [ATT_QA]',  7),
  ('Grade 8 [ATT_QA]',  8),
  ('Grade 9 [ATT_QA]',  9),
  ('Grade 10 [ATT_QA]', 10);

-- ── 10 Batches (Division A & B for each standard) ─────────────────────────────
INSERT INTO public.batches (name, campus_id, standard_id, timing_start, timing_end)
SELECT
  s.name || ' - Div ' || d.div || ' [ATT_QA]',
  c.id, s.id, TIME '17:00', TIME '19:00'
FROM public.standards s
CROSS JOIN (VALUES ('A'), ('B')) AS d(div)
CROSS JOIN (SELECT id FROM public.campuses WHERE name = 'ARK QA Campus [ATT_QA]') c
WHERE s.name LIKE '%[ATT_QA]%';

-- ── 100 Students (10 per batch → 20 per standard) ─────────────────────────────
WITH params AS (
  SELECT
    ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan',
          'Ananya','Diya','Aadhya','Saanvi','Aarohi','Anika','Navya','Myra','Sara','Ira'] AS firsts,
    ARRAY['Sharma','Verma','Patel','Reddy','Nair','Iyer','Gupta','Mehta','Rao','Joshi',
          'Kulkarni','Desai','Shah','Menon','Pillai'] AS lasts
),
ay  AS (SELECT id FROM public.academic_years WHERE name = '2026-2027 [ATT_QA]'),
ct  AS (SELECT id FROM public.course_types   WHERE name = 'Regular [ATT_QA]'),
cam AS (SELECT id FROM public.campuses       WHERE name = 'ARK QA Campus [ATT_QA]'),
batch_list AS (
  SELECT b.id AS batch_id, b.standard_id,
         row_number() OVER (ORDER BY b.name) AS b_idx
  FROM public.batches b
  WHERE b.name LIKE '%[ATT_QA]%'
),
gen AS (
  SELECT bl.batch_id, bl.standard_id,
         ((bl.b_idx - 1) * 10 + g.n) AS ordinal
  FROM batch_list bl
  CROSS JOIN generate_series(1, 10) AS g(n)
)
INSERT INTO public.students
  (name, roll_number, batch_id, campus_id, standard_id, course_type_id, academic_year_id,
   gender, admission_date, parent_contact, is_active, notes)
SELECT
  p.firsts[1 + (gen.ordinal % 20)] || ' ' || p.lasts[1 + (gen.ordinal % 15)],
  'ATTQA-' || lpad(gen.ordinal::text, 3, '0'),
  gen.batch_id, cam.id, gen.standard_id, ct.id, ay.id,
  CASE WHEN (gen.ordinal % 2) = 0 THEN 'female' ELSE 'male' END,
  DATE '2026-06-01',
  '+9198' || lpad((10000000 + gen.ordinal)::text, 8, '0'),
  true,
  'ATT_QA_SEED'
FROM gen
CROSS JOIN params p
CROSS JOIN ay
CROSS JOIN ct
CROSS JOIN cam;

-- ── 90 days of student attendance ─────────────────────────────────────────────
-- bucket = deterministic 0-99 pseudo-random per (student, day).
-- Normal population  : 80% present / 8% absent / 5% late / 3% medical / 2% excused / 2% half-day.
-- Chronic defaulters : ordinal % 9 = 0  → ~45% attendance (trips defaulter_50).
-- Streak defaulters  : ordinal % 18 = 0 → recent days forced absent (trips streak_*).
WITH qa_students AS (
  SELECT id AS student_id, batch_id,
         (regexp_replace(roll_number, '\D', '', 'g'))::int AS ord
  FROM public.students
  WHERE notes = 'ATT_QA_SEED'
),
days AS (
  SELECT (current_date - offs) AS d, offs
  FROM generate_series(0, 89) AS offs
),
grid AS (
  SELECT s.student_id, s.batch_id, s.ord, d.d, d.offs,
         ((s.ord * 31 + d.offs * 17) % 100) AS bucket
  FROM qa_students s
  CROSS JOIN days d
  WHERE extract(dow FROM d.d) <> 0          -- skip Sundays (centre closed)
)
INSERT INTO public.student_attendance
  (student_id, batch_id, date, attendance_date, status, method, notes, marked_at, marked_by_name)
SELECT
  g.student_id, g.batch_id, g.d, g.d,
  CASE
    WHEN g.ord % 9 = 0 THEN          -- chronic defaulter
      CASE
        WHEN (g.ord % 18 = 0 AND g.offs < 8) THEN 'absent'   -- recent consecutive streak
        WHEN g.bucket < 55 THEN 'absent'
        WHEN g.bucket < 70 THEN 'present'
        WHEN g.bucket < 80 THEN 'late'
        ELSE 'present'
      END
    ELSE                             -- normal population
      CASE
        WHEN g.bucket < 80 THEN 'present'
        WHEN g.bucket < 88 THEN 'absent'
        WHEN g.bucket < 93 THEN 'late'
        WHEN g.bucket < 96 THEN 'medical_leave'
        WHEN g.bucket < 98 THEN 'excused'
        ELSE 'half_day'
      END
  END,
  'bulk_import', 'ATT_QA_SEED', now(), 'ATT_QA_SEED'
FROM grid g
ON CONFLICT (student_id, date) DO UPDATE
  SET status          = EXCLUDED.status,
      attendance_date = EXCLUDED.attendance_date,
      method          = 'bulk_import',
      notes           = 'ATT_QA_SEED';

-- ── 90 days of staff attendance for up to 15 existing active staff ─────────────
-- Variety driven by (day-offset % 10) so every work-hours edge case appears:
--   0 → leave (0 worked) · 1 → half-day (240) · 2 → late (440, +30 late) ·
--   3 → overtime (600, +120 OT) · 4 → missing-checkout (in only) ·
--   5 → early exit (420, out 16:00) · else → normal (480).
WITH staff15 AS (
  SELECT id
  FROM public.profiles
  WHERE COALESCE(is_active, true) = true
  ORDER BY created_at DESC
  LIMIT 15
),
days AS (
  SELECT (current_date - offs) AS d, offs
  FROM generate_series(0, 89) AS offs
),
grid AS (
  SELECT s.id AS staff_id, d.d, (d.offs % 10) AS k
  FROM staff15 s
  CROSS JOIN days d
  WHERE extract(dow FROM d.d) NOT IN (0, 6)   -- skip Sat/Sun for staff
)
INSERT INTO public.staff_attendance
  (staff_id, date, attendance_date, status, in_time, out_time,
   worked_minutes, expected_minutes, overtime_minutes, late_minutes, source, remarks)
SELECT
  staff_id, d, d,
  CASE k WHEN 0 THEN 'leave' WHEN 1 THEN 'half_day' WHEN 2 THEN 'late' ELSE 'present' END,
  CASE
    WHEN k = 0 THEN NULL
    WHEN k = 2 THEN (d + TIME '09:40') AT TIME ZONE 'Asia/Kolkata'
    ELSE             (d + TIME '09:00') AT TIME ZONE 'Asia/Kolkata'
  END,
  CASE
    WHEN k IN (0, 4) THEN NULL
    WHEN k = 1 THEN (d + TIME '13:00') AT TIME ZONE 'Asia/Kolkata'
    WHEN k = 3 THEN (d + TIME '19:00') AT TIME ZONE 'Asia/Kolkata'
    WHEN k = 5 THEN (d + TIME '16:00') AT TIME ZONE 'Asia/Kolkata'
    ELSE            (d + TIME '17:00') AT TIME ZONE 'Asia/Kolkata'
  END,
  CASE k WHEN 0 THEN 0 WHEN 1 THEN 240 WHEN 2 THEN 440 WHEN 3 THEN 600 WHEN 4 THEN 0 WHEN 5 THEN 420 ELSE 480 END,
  CASE WHEN k = 0 THEN 0 WHEN k = 1 THEN 240 ELSE 480 END,
  CASE k WHEN 3 THEN 120 ELSE 0 END,
  CASE k WHEN 2 THEN 30 ELSE 0 END,
  'bulk_import', 'ATT_QA_SEED'
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
      remarks          = 'ATT_QA_SEED';

COMMIT;

-- ── Quick verification (run after COMMIT) ─────────────────────────────────────
-- SELECT count(*) AS students          FROM public.students            WHERE notes   = 'ATT_QA_SEED';                       -- 100
-- SELECT count(*) AS student_att_rows  FROM public.student_attendance  WHERE notes   = 'ATT_QA_SEED';
-- SELECT count(*) AS staff_att_rows    FROM public.staff_attendance    WHERE remarks = 'ATT_QA_SEED';
-- SELECT status, count(*) FROM public.student_attendance WHERE notes='ATT_QA_SEED' GROUP BY status ORDER BY 2 DESC;
-- -- Defaulters that the Risk Engine / Automation should flag (< 75% present):
-- SELECT s.name, round(100.0 * sum((sa.status='present')::int) / count(*)) AS present_pct
-- FROM public.students s
-- JOIN public.student_attendance sa ON sa.student_id = s.id
-- WHERE s.notes='ATT_QA_SEED'
-- GROUP BY s.id, s.name HAVING round(100.0 * sum((sa.status='present')::int) / count(*)) < 75
-- ORDER BY present_pct ASC;
