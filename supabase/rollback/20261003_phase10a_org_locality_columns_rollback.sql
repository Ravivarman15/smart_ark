-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — Phase 10A organization locality columns
--
-- Dropping these discards any city/pincode an operator has since entered, which
-- is why they are dropped only when every row is still NULL. If somebody has
-- filled them in, the columns stay and the rollback reports why: an unused
-- nullable column costs nothing, and silently deleting tenant-entered data to
-- undo a schema change is never an acceptable trade.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.organizations
   WHERE city IS NOT NULL OR pincode IS NOT NULL;

  IF _n > 0 THEN
    RAISE NOTICE 'Keeping organizations.city / .pincode — % organization(s) have values.', _n;
  ELSE
    ALTER TABLE public.organizations DROP COLUMN IF EXISTS city;
    ALTER TABLE public.organizations DROP COLUMN IF EXISTS pincode;
    RAISE NOTICE 'Dropped organizations.city / .pincode (all values were NULL).';
  END IF;
END $$;
