
-- ============================================
-- ARK AIAIS - Complete Database Schema
-- ============================================

-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('teacher', 'admin', 'management', 'coordinator');
CREATE TYPE public.checkin_status AS ENUM ('on_time', 'late', 'absent');
CREATE TYPE public.student_risk AS ENUM ('safe', 'watch', 'high_risk', 'critical');
CREATE TYPE public.retest_status AS ENUM ('pending', 'allocated', 'completed', 'delayed');
CREATE TYPE public.sla_status AS ENUM ('within', 'breached');
CREATE TYPE public.violation_type AS ENUM ('marks_sla', 'retest_delay', 'late_checkin', 'checklist_miss', 'fee_target', 'attendance_gap', 'walk_in_miss');
CREATE TYPE public.override_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.alert_severity AS ENUM ('critical', 'warning', 'info');
CREATE TYPE public.plan_status AS ENUM ('pending', 'completed', 'delayed');
CREATE TYPE public.call_status AS ENUM ('interested', 'follow_up', 'converted', 'not_interested');
CREATE TYPE public.escalation_status AS ENUM ('open', 'resolved');
CREATE TYPE public.report_status AS ENUM ('pending', 'completed', 'overdue');
CREATE TYPE public.batch_health AS ENUM ('strong', 'moderate', 'risk');

-- 2. Campuses
CREATE TABLE public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'teacher',
  campus_id UUID REFERENCES public.campuses(id),
  phone TEXT,
  subject TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. User roles table for RLS
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 5. Batches
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id),
  timing_start TIME,
  timing_end TIME,
  coordinator_id UUID REFERENCES public.profiles(id),
  avg_marks NUMERIC DEFAULT 0,
  portion_complete NUMERIC DEFAULT 0,
  retest_rate NUMERIC DEFAULT 0,
  health batch_health DEFAULT 'moderate',
  weak_chapters TEXT[] DEFAULT '{}',
  teacher_responsible TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number TEXT,
  name TEXT NOT NULL,
  batch_id UUID REFERENCES public.batches(id),
  campus_id UUID REFERENCES public.campuses(id),
  admission_date DATE,
  parent_contact TEXT,
  spi NUMERIC DEFAULT 0,
  risk_level student_risk DEFAULT 'safe',
  last_test_date DATE,
  retest_status retest_status DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Teacher Attendance
CREATE TABLE public.teacher_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,
  geo_valid BOOLEAN DEFAULT false,
  status checkin_status DEFAULT 'absent',
  override_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, date)
);

-- 8. Student Attendance
CREATE TABLE public.student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  batch_id UUID REFERENCES public.batches(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
  marked_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);

-- 9. Weekly Plans
CREATE TABLE public.weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  batch_id UUID REFERENCES public.batches(id),
  week_start DATE,
  portion_planned TEXT,
  test_date DATE,
  material_due_date DATE,
  status plan_status DEFAULT 'pending',
  portion_completed TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Class Logs
CREATE TABLE public.class_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id),
  batch_id UUID REFERENCES public.batches(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  conducted BOOLEAN DEFAULT false,
  portion_completed_pct NUMERIC DEFAULT 0,
  attendance_marked BOOLEAN DEFAULT false,
  unreported BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Test Results
CREATE TABLE public.test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  batch_id UUID REFERENCES public.batches(id),
  teacher_id UUID REFERENCES public.profiles(id),
  test_date DATE,
  marks NUMERIC,
  total_marks NUMERIC DEFAULT 100,
  marks_pct NUMERIC,
  spi NUMERIC,
  risk_level student_risk,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id),
  sla_status sla_status DEFAULT 'within',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Retests
CREATE TABLE public.retests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id),
  original_test_id UUID REFERENCES public.test_results(id),
  teacher_id UUID REFERENCES public.profiles(id),
  allocated_by UUID REFERENCES public.profiles(id),
  allocated_at TIMESTAMPTZ,
  retest_date DATE,
  completed_at TIMESTAMPTZ,
  retest_marks NUMERIC,
  improvement_pct NUMERIC,
  status retest_status DEFAULT 'pending',
  subject TEXT,
  batch_name TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Fee Transactions (role-restricted)
CREATE TABLE public.fee_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id),
  student_name TEXT,
  batch_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  mode TEXT,
  entered_by UUID REFERENCES public.profiles(id),
  campus_id UUID REFERENCES public.campuses(id),
  due_date DATE,
  due_since TEXT,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Expense Transactions
CREATE TABLE public.expense_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  date DATE DEFAULT CURRENT_DATE,
  entered_by UUID REFERENCES public.profiles(id),
  campus_id UUID REFERENCES public.campuses(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Admission Calls
CREATE TABLE public.admission_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id),
  date DATE DEFAULT CURRENT_DATE,
  prospect_name TEXT NOT NULL,
  phone TEXT,
  status call_status DEFAULT 'interested',
  notes TEXT,
  is_walkin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. Admin Checklist
CREATE TABLE public.admin_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id),
  date DATE DEFAULT CURRENT_DATE,
  item_name TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id, date, item_name)
);

-- 17. Violations
CREATE TABLE public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT,
  type violation_type NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  description TEXT,
  resolved BOOLEAN DEFAULT false,
  override_id UUID,
  auto_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. Override Log
CREATE TABLE public.override_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id UUID REFERENCES public.violations(id),
  requested_by UUID REFERENCES public.profiles(id),
  requested_by_name TEXT,
  approved_by UUID REFERENCES public.profiles(id),
  approved_by_name TEXT,
  reason TEXT NOT NULL,
  comment TEXT,
  override_type TEXT,
  user_name TEXT,
  status override_status DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. Escalation Log
CREATE TABLE public.escalation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type TEXT NOT NULL,
  description TEXT,
  escalated_to UUID REFERENCES public.profiles(id),
  raised_by UUID REFERENCES public.profiles(id),
  date DATE DEFAULT CURRENT_DATE,
  status escalation_status DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. KPI Snapshots
CREATE TABLE public.kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  role app_role,
  month INTEGER,
  year INTEGER,
  attendance_score NUMERIC DEFAULT 0,
  academic_execution_score NUMERIC DEFAULT 0,
  marks_sla_score NUMERIC DEFAULT 0,
  portion_score NUMERIC DEFAULT 0,
  student_improvement_score NUMERIC DEFAULT 0,
  retest_score NUMERIC DEFAULT 0,
  checklist_score NUMERIC DEFAULT 0,
  fee_score NUMERIC DEFAULT 0,
  admission_score NUMERIC DEFAULT 0,
  student_care_score NUMERIC DEFAULT 0,
  final_kpi NUMERIC DEFAULT 0,
  ihi_score NUMERIC DEFAULT 0,
  campus_id UUID REFERENCES public.campuses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT DEFAULT 'info',
  severity alert_severity DEFAULT 'info',
  message TEXT NOT NULL,
  campus_id UUID REFERENCES public.campuses(id),
  related_user_id UUID REFERENCES public.profiles(id),
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. Reports / MoM
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  date DATE DEFAULT CURRENT_DATE,
  assigned_to TEXT,
  due_date DATE,
  linked_alert_id UUID REFERENCES public.alerts(id),
  status report_status DEFAULT 'pending',
  created_by UUID REFERENCES public.profiles(id),
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 23. System Settings (strict mode etc)
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT 'false',
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. IHI Trend (weekly snapshots)
CREATE TABLE public.ihi_trend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week TEXT NOT NULL,
  ihi NUMERIC DEFAULT 0,
  annotation TEXT DEFAULT '',
  campus_id UUID REFERENCES public.campuses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 25. Fee Trend (monthly)
CREATE TABLE public.fee_trend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  collected NUMERIC DEFAULT 0,
  target NUMERIC DEFAULT 90,
  campus_id UUID REFERENCES public.campuses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_financial_summary(p_campus_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  user_role app_role;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE user_id = auth.uid();
  IF user_role != 'management' THEN
    RAISE EXCEPTION 'Access denied: 403 Forbidden';
  END IF;
  SELECT json_build_object(
    'total_collected', COALESCE(SUM(CASE WHEN paid THEN amount ELSE 0 END), 0),
    'total_pending', COALESCE(SUM(CASE WHEN NOT paid THEN amount ELSE 0 END), 0),
    'total_fees', COALESCE(SUM(amount), 0),
    'paid_count', COUNT(*) FILTER (WHERE paid),
    'total_count', COUNT(*),
    'collection_pct', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE paid)::NUMERIC / COUNT(*)::NUMERIC) * 100, 1) ELSE 0 END
  ) INTO result
  FROM public.fee_transactions
  WHERE (p_campus_id IS NULL OR campus_id = p_campus_id);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'teacher')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.override_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ihi_trend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_trend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read campuses" ON public.campuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Management can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Anyone can read batches" ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin_Mgmt can manage batches" ON public.batches FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "All can read students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin_Mgmt can manage students" ON public.students FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "Teachers read own attendance" ON public.teacher_attendance FOR SELECT TO authenticated USING (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Teachers insert own attendance" ON public.teacher_attendance FOR INSERT TO authenticated WITH CHECK (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Admin manage attendance" ON public.teacher_attendance FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "All read student attendance" ON public.student_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers_Admin manage student att" ON public.student_attendance FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('teacher', 'admin', 'management', 'coordinator')
);

CREATE POLICY "All read weekly plans" ON public.weekly_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers_Admin manage plans" ON public.weekly_plans FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('teacher', 'admin', 'management', 'coordinator')
);

CREATE POLICY "All read class logs" ON public.class_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers insert own logs" ON public.class_logs FOR INSERT TO authenticated WITH CHECK (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "All read test results" ON public.test_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers insert test results" ON public.test_results FOR INSERT TO authenticated WITH CHECK (
  teacher_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "All read retests" ON public.retests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage retests" ON public.retests FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "Admin insert fees" ON public.fee_transactions FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);
CREATE POLICY "Admin read individual fees" ON public.fee_transactions FOR SELECT TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Admin update fees" ON public.fee_transactions FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Admin_Mgmt manage expenses" ON public.expense_transactions FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Admin_Mgmt manage calls" ON public.admission_calls FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "Admin manage checklist" ON public.admin_checklist FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Read violations" ON public.violations FOR SELECT TO authenticated USING (
  user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Admin_Mgmt manage violations" ON public.violations FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Read overrides" ON public.override_log FOR SELECT TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Admin_Mgmt manage overrides" ON public.override_log FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Admin_Mgmt manage escalations" ON public.escalation_log FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "Read own KPI" ON public.kpi_snapshots FOR SELECT TO authenticated USING (
  user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Mgmt manage KPI" ON public.kpi_snapshots FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) = 'management'
);

CREATE POLICY "Admin_Mgmt read alerts" ON public.alerts FOR SELECT TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);
CREATE POLICY "Admin_Mgmt manage alerts" ON public.alerts FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management')
);

CREATE POLICY "Admin_Mgmt manage reports" ON public.reports FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin', 'management', 'coordinator')
);

CREATE POLICY "Mgmt manage settings" ON public.system_settings FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) = 'management'
);
CREATE POLICY "All read settings" ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "All read IHI trend" ON public.ihi_trend FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage IHI trend" ON public.ihi_trend FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) = 'management'
);

CREATE POLICY "All read fee trend" ON public.fee_trend FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mgmt manage fee trend" ON public.fee_trend FOR ALL TO authenticated USING (
  public.get_user_role(auth.uid()) = 'management'
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_campus ON public.profiles(campus_id);
CREATE INDEX idx_students_batch ON public.students(batch_id);
CREATE INDEX idx_students_campus ON public.students(campus_id);
CREATE INDEX idx_teacher_att_date ON public.teacher_attendance(teacher_id, date);
CREATE INDEX idx_student_att_date ON public.student_attendance(student_id, date);
CREATE INDEX idx_test_results_student ON public.test_results(student_id);
CREATE INDEX idx_test_results_teacher ON public.test_results(teacher_id);
CREATE INDEX idx_retests_status ON public.retests(status);
CREATE INDEX idx_fee_campus ON public.fee_transactions(campus_id);
CREATE INDEX idx_fee_paid ON public.fee_transactions(paid);
CREATE INDEX idx_violations_user ON public.violations(user_id);
CREATE INDEX idx_violations_resolved ON public.violations(resolved);
CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_reviewed ON public.alerts(reviewed);
CREATE INDEX idx_kpi_user ON public.kpi_snapshots(user_id, month, year);

-- Enable Realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.violations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.retests;

-- Fix overly permissive INSERT policy on profiles
-- Replace WITH CHECK (true) with proper check for auto-created profiles
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;-- Table to track daily report delivery status
CREATE TABLE public.daily_report_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  trigger_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'sent',
  report_data jsonb,
  UNIQUE(date)
);

ALTER TABLE public.daily_report_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin_Mgmt manage report log"
  ON public.daily_report_log
  FOR ALL
  TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'management'))
  WITH CHECK (get_user_role(auth.uid()) IN ('admin', 'management'));

CREATE POLICY "All read report log"
  ON public.daily_report_log
  FOR SELECT
  TO authenticated
  USING (true);-- Enable pg_cron and pg_net for scheduled function calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
ALTER TABLE public.teacher_attendance 
ADD COLUMN IF NOT EXISTS check_out_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS checkout_geo_valid boolean DEFAULT false;

COMMENT ON COLUMN public.teacher_attendance.check_out_status IS 'pending, approved, rejected';
COMMENT ON COLUMN public.teacher_attendance.checkout_geo_valid IS 'Whether checkout location is within campus geofence';

ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS parent_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS parent_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS date_of_birth date DEFAULT NULL;

COMMENT ON COLUMN public.students.parent_name IS 'Parent/guardian full name for WhatsApp communication';
COMMENT ON COLUMN public.students.parent_email IS 'Parent Gmail/email ID';
COMMENT ON COLUMN public.students.date_of_birth IS 'Student date of birth';
COMMENT ON COLUMN public.students.parent_contact IS 'Parent phone number for WhatsApp';
COMMENT ON COLUMN public.students.admission_date IS 'Date of joining the institution';

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
