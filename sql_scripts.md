# SQL Migration Scripts

Run these in the Supabase SQL Editor to support the new features.

## Attendance Comments & Overrides
```sql
ALTER TABLE teacher_attendance 
ADD COLUMN IF NOT EXISTS comments TEXT,
ADD COLUMN IF NOT EXISTS override_check_in_time TIMESTAMPTZ;
```

## Student Contact Fields
```sql
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS parent_contact_1 TEXT,
ADD COLUMN IF NOT EXISTS parent_contact_2 TEXT;
```

## Setup Data Types
```sql
-- Ensure dates are nullable if they aren't
ALTER TABLE academic_years 
ALTER COLUMN start_date DROP NOT NULL,
ALTER COLUMN end_date DROP NOT NULL;
```
