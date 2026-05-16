
-- Fix overly permissive INSERT policy on profiles
-- Replace WITH CHECK (true) with proper check for auto-created profiles
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());
