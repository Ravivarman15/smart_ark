-- Fix teacher_attendance RLS update policy to allow staff to update their own attendance rows (e.g. for self check-out)
DROP POLICY IF EXISTS "Admin manage attendance" ON public.teacher_attendance;

CREATE POLICY "Admin manage attendance" ON public.teacher_attendance 
FOR UPDATE TO authenticated 
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

DROP POLICY IF EXISTS "Teachers update own attendance" ON public.teacher_attendance;

CREATE POLICY "Teachers update own attendance" ON public.teacher_attendance 
FOR UPDATE TO authenticated 
USING (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
