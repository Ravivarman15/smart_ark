
-- ================================================================
-- smart-ark: Full Feature Extension Migration
-- Run ONCE in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS everywhere
-- ================================================================

-- ─── PART 1: EXTEND EXISTING TABLES ─────────────────────────────

-- batches: link each batch to a standard (for cascading dropdown in student form)
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS standard_id UUID REFERENCES public.standards(id) ON DELETE SET NULL;

-- fee_structures: installment payment schedule columns
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS seat_confirmation_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_payment_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_count       INTEGER       NOT NULL DEFAULT 2;

-- students: link to standard, course type, fee structure; second parent contact
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS standard_id      UUID REFERENCES public.standards(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_type_id   UUID REFERENCES public.course_types(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_contact2  TEXT;

-- admission_calls: enquiry enrichment (priority, assignment, follow-up, interests)
ALTER TABLE public.admission_calls
  ADD COLUMN IF NOT EXISTS priority           TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS assigned_to        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_date     DATE,
  ADD COLUMN IF NOT EXISTS interested_standard TEXT,
  ADD COLUMN IF NOT EXISTS interested_course   TEXT;

-- expense_transactions: income vs expense type + payment mode
ALTER TABLE public.expense_transactions
  ADD COLUMN IF NOT EXISTS type         TEXT NOT NULL DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS payment_mode TEXT;

-- ─── PART 2: NEW TABLES ──────────────────────────────────────────

-- student_fees: one row per student — master fee tracking record
CREATE TABLE IF NOT EXISTS public.student_fees (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_structure_id         UUID        REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  -- denormalised for display speed
  student_name             TEXT,
  batch_name               TEXT,
  -- fee amounts
  total_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_received          NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_pending           NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- payment schedule (copied from fee_structure at enrolment time)
  seat_confirmation_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  first_payment_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  installment_count        INTEGER       NOT NULL DEFAULT 2,
  -- status
  due_date                 DATE,
  status                   TEXT NOT NULL DEFAULT 'pending',  -- pending | partial | paid
  created_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id)   -- one fee record per student (update on re-enrolment)
);

ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All read student_fees"       ON public.student_fees;
DROP POLICY IF EXISTS "Admin_Mgmt manage student_fees" ON public.student_fees;

CREATE POLICY "All read student_fees"
  ON public.student_fees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin_Mgmt manage student_fees"
  ON public.student_fees FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- updated_at auto-maintain
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_student_fees_updated_at'
  ) THEN
    CREATE TRIGGER update_student_fees_updated_at
      BEFORE UPDATE ON public.student_fees
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;


-- fee_installments: individual payment transactions against a student_fees record
CREATE TABLE IF NOT EXISTS public.fee_installments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id   UUID        NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method   TEXT          NOT NULL DEFAULT 'Cash',
  receipt_no       TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All read fee_installments"       ON public.fee_installments;
DROP POLICY IF EXISTS "Admin_Mgmt manage fee_installments" ON public.fee_installments;

CREATE POLICY "All read fee_installments"
  ON public.fee_installments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin_Mgmt manage fee_installments"
  ON public.fee_installments FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));


-- notifications: walk-in alerts, fee reminders, system events
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT        NOT NULL DEFAULT 'info',  -- walk_in | fee_due | info | alert
  message      TEXT        NOT NULL,
  reference_id UUID,                                 -- loosely references any row
  is_read      BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin_Mgmt read notifications"    ON public.notifications;
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admin_Mgmt update notifications"  ON public.notifications;
DROP POLICY IF EXISTS "Admin_Mgmt delete notifications"  ON public.notifications;

-- Management & admin can read all notifications
CREATE POLICY "Admin_Mgmt read notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator'));

-- Any authenticated user can create a notification (walk-in registration)
CREATE POLICY "Authenticated insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only management/admin can mark as read or delete
CREATE POLICY "Admin_Mgmt update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

CREATE POLICY "Admin_Mgmt delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'management'));


-- ─── PART 3: FIX RLS — ALLOW ADMIN WRITE ON SETUP TABLES ────────
-- The original policies were management-only.
-- Admin role needs write access for the ExpenseCategories page and fee management.

-- expense_categories (fix: was management-only, admin in same office needs access)
DROP POLICY IF EXISTS "Mgmt manage expense_categories"       ON public.expense_categories;
DROP POLICY IF EXISTS "Admin_Mgmt manage expense_categories" ON public.expense_categories;
CREATE POLICY "Admin_Mgmt manage expense_categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- fee_structures (ensure admin can also manage fee structure records)
DROP POLICY IF EXISTS "Mgmt manage fee_structures"      ON public.fee_structures;
DROP POLICY IF EXISTS "Admin_Mgmt manage fee_structures" ON public.fee_structures;
DROP POLICY IF EXISTS "All read fee_structures"          ON public.fee_structures;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read fee_structures"
  ON public.fee_structures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin_Mgmt manage fee_structures"
  ON public.fee_structures FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- course_types (admin needs read — already has "All read" — but also write for completeness)
DROP POLICY IF EXISTS "Mgmt manage course_types"       ON public.course_types;
DROP POLICY IF EXISTS "Admin_Mgmt manage course_types" ON public.course_types;
CREATE POLICY "Admin_Mgmt manage course_types"
  ON public.course_types FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- standards (same pattern)
DROP POLICY IF EXISTS "Mgmt manage standards"       ON public.standards;
DROP POLICY IF EXISTS "Admin_Mgmt manage standards" ON public.standards;
CREATE POLICY "Admin_Mgmt manage standards"
  ON public.standards FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- taxes (same pattern)
DROP POLICY IF EXISTS "Mgmt manage taxes"       ON public.taxes;
DROP POLICY IF EXISTS "Admin_Mgmt manage taxes" ON public.taxes;
CREATE POLICY "Admin_Mgmt manage taxes"
  ON public.taxes FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- academic_years (same pattern)
DROP POLICY IF EXISTS "Mgmt manage academic_years"       ON public.academic_years;
DROP POLICY IF EXISTS "Admin_Mgmt manage academic_years" ON public.academic_years;
CREATE POLICY "Admin_Mgmt manage academic_years"
  ON public.academic_years FOR ALL TO authenticated
  USING    (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

-- ─── PART 4: HELPFUL INDEXES ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_student_fees_student_id    ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_status        ON public.student_fees(status);
CREATE INDEX IF NOT EXISTS idx_fee_installments_sf_id     ON public.fee_installments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_batches_standard_id        ON public.batches(standard_id);
CREATE INDEX IF NOT EXISTS idx_students_standard_id       ON public.students(standard_id);
CREATE INDEX IF NOT EXISTS idx_students_fee_structure_id  ON public.students(fee_structure_id);
CREATE INDEX IF NOT EXISTS idx_admission_calls_is_walkin  ON public.admission_calls(is_walkin);
CREATE INDEX IF NOT EXISTS idx_admission_calls_date       ON public.admission_calls(date DESC);

-- ================================================================
-- Done. All new tables + columns added, RLS fixed.
-- ================================================================
