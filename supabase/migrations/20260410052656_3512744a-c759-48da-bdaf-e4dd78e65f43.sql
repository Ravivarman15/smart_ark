
-- Create tasks table for task management persistence
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  assigned_to UUID[] DEFAULT '{}',
  status_by_user JSONB DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin_Coord_Mgmt manage tasks"
  ON public.tasks FOR ALL
  TO authenticated
  USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'coordinator'::app_role, 'management'::app_role]));

CREATE POLICY "Teachers read assigned tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    (SELECT id FROM public.profiles WHERE user_id = auth.uid()) = ANY(assigned_to)
    OR get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'coordinator'::app_role, 'management'::app_role])
  );

-- Create daily_checklists table to replace localStorage persistence
CREATE TABLE public.daily_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  checked_items JSONB DEFAULT '{}',
  sign_name TEXT,
  signed_off BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, user_id)
);

ALTER TABLE public.daily_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily checklist"
  ON public.daily_checklists FOR ALL
  TO authenticated
  USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Management view all checklists"
  ON public.daily_checklists FOR SELECT
  TO authenticated
  USING (get_user_role(auth.uid()) = 'management'::app_role);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_checklists;
