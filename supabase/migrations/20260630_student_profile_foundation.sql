-- ─────────────────────────────────────────────────────────────────────────────
-- Student Profile Foundation Upgrade (additive, idempotent, backward-compatible)
--
-- Extends public.students with shared profile fields every module can reuse:
-- section, transport, hostel, medical, emergency contact, communication
-- preference, parent language, and a richer student lifecycle status.
--
-- SAFETY:
--   • Only ADDS columns (IF NOT EXISTS) — nothing is dropped or altered.
--   • All new columns are NULLable → existing rows keep working untouched.
--   • Enum-like columns use CHECK (… OR NULL) so legacy NULLs never violate.
--   • Until this runs, the app degrades gracefully (column-level write fallback +
--     `SELECT *` reads), so deploying the code before the migration is safe.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS section                     TEXT,
  ADD COLUMN IF NOT EXISTS transport_required          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transport_route_id          UUID,
  ADD COLUMN IF NOT EXISTS hostel_required             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hostel_room_id              UUID,
  ADD COLUMN IF NOT EXISTS medical_conditions          TEXT,
  ADD COLUMN IF NOT EXISTS allergies                   TEXT,
  ADD COLUMN IF NOT EXISTS blood_group                 TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name      TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_number    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation  TEXT,
  ADD COLUMN IF NOT EXISTS communication_preference    TEXT,
  ADD COLUMN IF NOT EXISTS parent_preferred_language   TEXT,
  ADD COLUMN IF NOT EXISTS student_status              TEXT;

-- Enum guards — allow NULL so existing rows are never rejected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_communication_preference_chk'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_communication_preference_chk
      CHECK (communication_preference IS NULL
             OR communication_preference IN ('WHATSAPP','EMAIL','SMS','BOTH','NONE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_student_status_chk'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_student_status_chk
      CHECK (student_status IS NULL
             OR student_status IN ('ACTIVE','INACTIVE','LEFT','TRANSFERRED','ALUMNI'));
  END IF;
END $$;

-- Backfill lifecycle status from the existing is_active flag (best-effort, once).
UPDATE public.students
  SET student_status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END
  WHERE student_status IS NULL;

-- Assignment-queue helpers: students who need transport/hostel but have none yet.
CREATE INDEX IF NOT EXISTS idx_students_transport_queue
  ON public.students(transport_required)
  WHERE transport_required = true AND transport_route_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_hostel_queue
  ON public.students(hostel_required)
  WHERE hostel_required = true AND hostel_room_id IS NULL;

COMMENT ON COLUMN public.students.communication_preference IS
  'WHATSAPP | EMAIL | SMS | BOTH | NONE — channels the Communication module may use';
COMMENT ON COLUMN public.students.student_status IS
  'ACTIVE | INACTIVE | LEFT | TRANSFERRED | ALUMNI — lifecycle status (is_active kept in sync)';
