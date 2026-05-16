-- Add display_order and created_at columns to standards table
-- These were missing from the original schema but referenced in frontend code

ALTER TABLE standards
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();

-- Backfill display_order from existing order_index values
UPDATE standards
SET display_order = order_index
WHERE display_order IS NULL AND order_index IS NOT NULL;
