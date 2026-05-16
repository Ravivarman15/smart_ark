# SQL Migration Scripts (Part 2)

Run these in the Supabase SQL Editor to support the new features.

## Attendance Check-out Overrides
```sql
ALTER TABLE public.teacher_attendance 
ADD COLUMN IF NOT EXISTS override_check_out_time TIMESTAMPTZ;
```
