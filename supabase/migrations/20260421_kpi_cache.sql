-- ================================================================
-- Migration: KPI Calculation & Caching
-- Filename:  20260421_kpi_cache.sql
--
-- PURPOSE
-- -------
-- Currently KPI scores (compliance, SLA, attendance, portion %)
-- are computed entirely in the frontend from raw data.
-- Problems:
--   - Score is different every time the page reloads (no persistence)
--   - Cannot trend over time or compare month-over-month
--   - Cannot be used in server-side alerts or management reports
--
-- This migration adds:
--   1. A  compute_teacher_kpi()  stored function that calculates all
--      KPI dimensions for a single teacher for a given month/year
--   2. An  upsert_kpi_snapshot()  helper that can be called from the
--      frontend (or a scheduled Edge Function) to cache the result
--   3. Indexes on kpi_snapshots to make monthly lookups fast
--
-- The existing kpi_snapshots table is already in the schema — we are
-- just adding the calculation logic on top of it.
-- ================================================================


-- ── STEP 1: Indexes for fast monthly KPI lookups ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_kpi_month_year   ON public.kpi_snapshots(month, year);
CREATE INDEX IF NOT EXISTS idx_kpi_user_month   ON public.kpi_snapshots(user_id, month, year);
CREATE INDEX IF NOT EXISTS idx_kpi_campus_month ON public.kpi_snapshots(campus_id, month, year);


-- ── STEP 2: compute_teacher_kpi — returns all KPI dimensions ────────────────

CREATE OR REPLACE FUNCTION public.compute_teacher_kpi(
  p_teacher_id UUID,
  p_month      INTEGER DEFAULT EXTRACT(MONTH FROM now())::INTEGER,
  p_year       INTEGER DEFAULT EXTRACT(YEAR  FROM now())::INTEGER
)
RETURNS TABLE (
  attendance_score           NUMERIC,
  marks_sla_score            NUMERIC,
  portion_score              NUMERIC,
  student_improvement_score  NUMERIC,
  retest_score               NUMERIC,
  checklist_score            NUMERIC,
  final_kpi                  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start  DATE := make_date(p_year, p_month, 1);
  v_month_end    DATE := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::DATE;

  -- raw counts
  v_total_days          INTEGER;
  v_present_days        INTEGER;
  v_total_tests         INTEGER;
  v_sla_breached        INTEGER;
  v_retests_due         INTEGER;
  v_retests_handled     INTEGER;
  v_plans_total         INTEGER;
  v_plans_completed     INTEGER;
  v_student_tests       INTEGER;
  v_improved_students   INTEGER;

  -- computed scores (0-100 each)
  v_att_score    NUMERIC := 0;
  v_sla_score    NUMERIC := 0;
  v_portion_score NUMERIC := 0;
  v_improvement  NUMERIC := 0;
  v_retest_score NUMERIC := 0;
  v_checklist    NUMERIC := 0;
  v_final        NUMERIC := 0;
BEGIN

  -- ── Attendance score ───────────────────────────────────────────────────────
  SELECT
    COUNT(*)                                                AS total_days,
    COUNT(*) FILTER (WHERE status IN ('on_time', 'late'))   AS present_days
  INTO v_total_days, v_present_days
  FROM public.teacher_attendance
  WHERE teacher_id = p_teacher_id
    AND date BETWEEN v_month_start AND v_month_end;

  IF v_total_days > 0 THEN
    v_att_score := ROUND((v_present_days::NUMERIC / v_total_days) * 100, 1);
  END IF;

  -- ── Marks SLA score ────────────────────────────────────────────────────────
  -- % of tests whose results were uploaded within 24 h of test_date
  SELECT
    COUNT(*)                                                                AS total,
    COUNT(*) FILTER (WHERE sla_status = 'within' OR sla_status IS NULL)    AS on_time
  INTO v_total_tests, v_sla_breached
  FROM public.test_results
  WHERE teacher_id = p_teacher_id
    AND test_date BETWEEN v_month_start AND v_month_end;

  IF v_total_tests > 0 THEN
    v_sla_score := ROUND((v_sla_breached::NUMERIC / v_total_tests) * 100, 1);
  ELSE
    v_sla_score := 100; -- no tests logged = no SLA breach
  END IF;

  -- ── Portion / plan completion ──────────────────────────────────────────────
  SELECT
    COUNT(*)                                            AS total,
    COUNT(*) FILTER (WHERE status = 'completed')        AS done
  INTO v_plans_total, v_plans_completed
  FROM public.weekly_plans
  WHERE teacher_id = p_teacher_id
    AND week_start BETWEEN v_month_start AND v_month_end;

  IF v_plans_total > 0 THEN
    v_portion_score := ROUND((v_plans_completed::NUMERIC / v_plans_total) * 100, 1);
  ELSE
    v_portion_score := 100;
  END IF;

  -- ── Student improvement ────────────────────────────────────────────────────
  -- % of students whose latest SPI in this period > previous period
  SELECT
    COUNT(DISTINCT student_id)                          AS total,
    COUNT(DISTINCT student_id) FILTER (
      WHERE improvement_pct > 0
    )                                                   AS improved
  INTO v_student_tests, v_improved_students
  FROM public.retests
  WHERE teacher_id = p_teacher_id
    AND retest_date BETWEEN v_month_start AND v_month_end
    AND status = 'completed';

  IF v_student_tests > 0 THEN
    v_improvement := ROUND((v_improved_students::NUMERIC / v_student_tests) * 100, 1);
  ELSE
    v_improvement := 75; -- default neutral when no retest data
  END IF;

  -- ── Retest handling ────────────────────────────────────────────────────────
  SELECT
    COUNT(*)                                             AS total,
    COUNT(*) FILTER (WHERE status IN ('completed', 'allocated')) AS handled
  INTO v_retests_due, v_retests_handled
  FROM public.retests
  WHERE teacher_id = p_teacher_id
    AND created_at::DATE BETWEEN v_month_start AND v_month_end;

  IF v_retests_due > 0 THEN
    v_retest_score := ROUND((v_retests_handled::NUMERIC / v_retests_due) * 100, 1);
  ELSE
    v_retest_score := 100;
  END IF;

  -- ── Checklist score ────────────────────────────────────────────────────────
  -- Use class_logs as proxy: % of expected days a class log was filed
  SELECT
    COUNT(*)                                        AS total,
    COUNT(*) FILTER (WHERE conducted = true)        AS conducted
  INTO v_total_days, v_present_days
  FROM public.class_logs
  WHERE teacher_id = p_teacher_id
    AND date BETWEEN v_month_start AND v_month_end;

  IF v_total_days > 0 THEN
    v_checklist := ROUND((v_present_days::NUMERIC / v_total_days) * 100, 1);
  ELSE
    v_checklist := 100;
  END IF;

  -- ── Weighted final KPI ─────────────────────────────────────────────────────
  -- Weights  (must sum to 1.0):
  --   Attendance         20%
  --   Marks SLA          20%
  --   Portion            20%
  --   Student Improvement 15%
  --   Retest handling    15%
  --   Checklist          10%
  v_final := ROUND(
    (v_att_score    * 0.20) +
    (v_sla_score    * 0.20) +
    (v_portion_score* 0.20) +
    (v_improvement  * 0.15) +
    (v_retest_score * 0.15) +
    (v_checklist    * 0.10),
    1
  );

  RETURN QUERY SELECT
    v_att_score,
    v_sla_score,
    v_portion_score,
    v_improvement,
    v_retest_score,
    v_checklist,
    v_final;
END;
$$;


-- ── STEP 3: upsert_kpi_snapshot — cache result into kpi_snapshots ───────────

CREATE OR REPLACE FUNCTION public.upsert_kpi_snapshot(
  p_teacher_id UUID,
  p_month      INTEGER DEFAULT EXTRACT(MONTH FROM now())::INTEGER,
  p_year       INTEGER DEFAULT EXTRACT(YEAR  FROM now())::INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus_id  UUID;
  v_kpi        RECORD;
  v_snap_id    UUID;
BEGIN
  -- Caller must be admin/management or the teacher themselves
  IF NOT (
    get_user_role(auth.uid()) IN ('admin', 'management')
    OR (SELECT id FROM public.profiles WHERE user_id = auth.uid()) = p_teacher_id
  ) THEN
    RAISE EXCEPTION 'Access denied: 403';
  END IF;

  SELECT campus_id INTO v_campus_id
  FROM   public.profiles WHERE id = p_teacher_id;

  SELECT * INTO v_kpi FROM public.compute_teacher_kpi(p_teacher_id, p_month, p_year);

  INSERT INTO public.kpi_snapshots (
    user_id, role, month, year, campus_id,
    attendance_score, marks_sla_score, portion_score,
    student_improvement_score, retest_score, checklist_score,
    final_kpi
  )
  VALUES (
    p_teacher_id, 'teacher', p_month, p_year, v_campus_id,
    v_kpi.attendance_score, v_kpi.marks_sla_score, v_kpi.portion_score,
    v_kpi.student_improvement_score, v_kpi.retest_score, v_kpi.checklist_score,
    v_kpi.final_kpi
  )
  ON CONFLICT (user_id, month, year)
    DO UPDATE SET
      attendance_score          = EXCLUDED.attendance_score,
      marks_sla_score           = EXCLUDED.marks_sla_score,
      portion_score             = EXCLUDED.portion_score,
      student_improvement_score = EXCLUDED.student_improvement_score,
      retest_score              = EXCLUDED.retest_score,
      checklist_score           = EXCLUDED.checklist_score,
      final_kpi                 = EXCLUDED.final_kpi,
      created_at                = now()
  RETURNING id INTO v_snap_id;

  RETURN v_snap_id;
END;
$$;

-- The ON CONFLICT above needs a unique constraint (month, year, user_id):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_kpi_user_month_year'
      AND conrelid = 'public.kpi_snapshots'::regclass
  ) THEN
    ALTER TABLE public.kpi_snapshots
      ADD CONSTRAINT uq_kpi_user_month_year UNIQUE (user_id, month, year);
  END IF;
END$$;


-- ── STEP 4: Grant RLS on kpi_snapshots to allow self-insert ─────────────────
-- The original policy only lets management write KPIs.
-- Teachers need to trigger snapshot writes on themselves via the
-- SECURITY DEFINER function above, which bypasses RLS —
-- so no additional policy change is needed.


-- ── Done ─────────────────────────────────────────────────────────────────────
-- How to use from the app:
--
--   // Recalculate & cache KPI for a teacher (call from admin or after marks upload)
--   const { data } = await supabase.rpc('upsert_kpi_snapshot', {
--     p_teacher_id: teacherProfileId,
--     p_month: new Date().getMonth() + 1,
--     p_year:  new Date().getFullYear(),
--   });
--
--   // Read cached KPI
--   const { data } = await supabase
--     .from('kpi_snapshots')
--     .select('*')
--     .eq('user_id', teacherProfileId)
--     .eq('month', currentMonth)
--     .eq('year', currentYear)
--     .single();
-- ================================================================
