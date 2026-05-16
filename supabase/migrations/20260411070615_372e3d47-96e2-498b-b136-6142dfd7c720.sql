
-- academic_years
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read academic_years" ON public.academic_years FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage academic_years" ON public.academic_years FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- course_types
CREATE TABLE IF NOT EXISTS public.course_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.course_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read course_types" ON public.course_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage course_types" ON public.course_types FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- standards
CREATE TABLE IF NOT EXISTS public.standards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read standards" ON public.standards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage standards" ON public.standards FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- taxes
CREATE TABLE IF NOT EXISTS public.taxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  percentage NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read taxes" ON public.taxes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage taxes" ON public.taxes FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- expense_categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read expense_categories" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage expense_categories" ON public.expense_categories FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- staff_rights (module-level permissions)
CREATE TABLE IF NOT EXISTS public.staff_rights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, module_name)
);
ALTER TABLE public.staff_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own staff_rights" ON public.staff_rights FOR SELECT TO authenticated USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()) OR get_user_role(auth.uid()) = 'management');
CREATE POLICY "Mgmt manage staff_rights" ON public.staff_rights FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- staff_action_rights (granular action permissions)
CREATE TABLE IF NOT EXISTS public.staff_action_rights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, action_key)
);
ALTER TABLE public.staff_action_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own staff_action_rights" ON public.staff_action_rights FOR SELECT TO authenticated USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()) OR get_user_role(auth.uid()) = 'management');
CREATE POLICY "Mgmt manage staff_action_rights" ON public.staff_action_rights FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');

-- Drop the duplicate fee_structures if it was recreated; keep the original
-- The new fee_structures table from a recent migration conflicts with the original one
-- We need to handle this carefully - let's add columns to match the new schema if needed
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS course_type_id UUID;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS standard_id UUID;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS tax_id UUID;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS academic_year_id UUID;
