
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS parent_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS parent_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS date_of_birth date DEFAULT NULL;

COMMENT ON COLUMN public.students.parent_name IS 'Parent/guardian full name for WhatsApp communication';
COMMENT ON COLUMN public.students.parent_email IS 'Parent Gmail/email ID';
COMMENT ON COLUMN public.students.date_of_birth IS 'Student date of birth';
COMMENT ON COLUMN public.students.parent_contact IS 'Parent phone number for WhatsApp';
COMMENT ON COLUMN public.students.admission_date IS 'Date of joining the institution';
