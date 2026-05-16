
ALTER TABLE public.teacher_attendance 
ADD COLUMN IF NOT EXISTS check_out_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS checkout_geo_valid boolean DEFAULT false;

COMMENT ON COLUMN public.teacher_attendance.check_out_status IS 'pending, approved, rejected';
COMMENT ON COLUMN public.teacher_attendance.checkout_geo_valid IS 'Whether checkout location is within campus geofence';
