-- 1. Ensure "AY 2025–2026" Academic Year exists
INSERT INTO public.academic_years (id, name, start_date, end_date, is_active)
SELECT gen_random_uuid(), 'AY 2025–2026', '2025-04-01', '2026-03-31', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.academic_years WHERE name ILIKE '%2025%2026%'
);

-- 2. Insert the 3 requested Fee Structures for "Class 10 – Complete Academic Program"
DO $$ 
DECLARE
  ay_id UUID;
  std_id UUID;
BEGIN
  -- Get default IDs
  SELECT id INTO ay_id FROM public.academic_years WHERE name ILIKE '%2025%2026%' LIMIT 1;
  SELECT id INTO std_id FROM public.standards WHERE name ILIKE '%10%' LIMIT 1;

  -- Option A (2 Installments)
  IF NOT EXISTS (SELECT 1 FROM public.fee_structures WHERE name = 'Class 10 – Complete Academic Program (Option A - 2 Installments)') THEN
    INSERT INTO public.fee_structures (name, academic_year_id, standard_id, total_amount, seat_confirmation_amount, first_payment_amount, installment_count)
    VALUES ('Class 10 – Complete Academic Program (Option A - 2 Installments)', ay_id, std_id, 60000, 5000, 16500, 2);
  END IF;

  -- Option B (3 Installments)
  IF NOT EXISTS (SELECT 1 FROM public.fee_structures WHERE name = 'Class 10 – Complete Academic Program (Option B - 3 Installments)') THEN
    INSERT INTO public.fee_structures (name, academic_year_id, standard_id, total_amount, seat_confirmation_amount, first_payment_amount, installment_count)
    VALUES ('Class 10 – Complete Academic Program (Option B - 3 Installments)', ay_id, std_id, 60000, 5000, 16500, 3);
  END IF;

  -- Option C (4 Installments)
  IF NOT EXISTS (SELECT 1 FROM public.fee_structures WHERE name = 'Class 10 – Complete Academic Program (Option C - 4 Installments)') THEN
    INSERT INTO public.fee_structures (name, academic_year_id, standard_id, total_amount, seat_confirmation_amount, first_payment_amount, installment_count)
    VALUES ('Class 10 – Complete Academic Program (Option C - 4 Installments)', ay_id, std_id, 60000, 5000, 16500, 4);
  END IF;

END $$;

-- 3. Migrate any legacy students into the student_fees table automatically
INSERT INTO public.student_fees (student_id, fee_structure_id, student_name, batch_name, total_amount, seat_confirmation_amount, first_payment_amount, installment_count, amount_pending, status)
SELECT 
    s.id as student_id,
    s.fee_structure_id,
    s.name as student_name,
    NULL as batch_name, -- Not strictly required for migration
    COALESCE(fs.total_amount, 0),
    COALESCE(fs.seat_confirmation_amount, 0),
    COALESCE(fs.first_payment_amount, 0),
    COALESCE(fs.installment_count, 2),
    COALESCE(fs.total_amount, 0),
    CASE WHEN COALESCE(fs.total_amount, 0) > 0 THEN 'pending' ELSE 'paid' END
FROM public.students s
LEFT JOIN public.fee_structures fs ON fs.id = s.fee_structure_id
WHERE s.id NOT IN (SELECT student_id FROM public.student_fees);
