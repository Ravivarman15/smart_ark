
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  standard_id UUID REFERENCES public.standards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All read subjects" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage subjects" ON public.subjects FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'management') WITH CHECK (get_user_role(auth.uid()) = 'management');
