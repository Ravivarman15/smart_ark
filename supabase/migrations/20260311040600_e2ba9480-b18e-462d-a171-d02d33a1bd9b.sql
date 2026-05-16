-- Table to track daily report delivery status
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
  USING (true);