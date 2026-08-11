-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8C — organization_branches.organization_id needs its default
--
-- ┌── FOUND BY RUNTIME TESTING, NOT BY READING ────────────────────────────┐
-- │ A real authenticated ABC session could not create a check-in location: │
-- │                                                                        │
-- │   42501: new row violates row-level security policy                    │
-- │          for table "organization_branches"                             │
-- │                                                                        │
-- │ The write policy's WITH CHECK is                                       │
-- │   organization_id = current_org_id() AND has_any_role(...)             │
-- │ and the client deliberately OMITS organization_id so that a browser    │
-- │ cannot choose which tenant a row lands in — the same rule Phase 7B     │
-- │ established for public leads.                                          │
-- │                                                                        │
-- │ That pattern works everywhere else because the column defaults to      │
-- │ current_org_id(). organization_branches is the ONE tenant table that   │
-- │ was created without that default, so the omitted value arrived NULL    │
-- │ and failed the check.                                                  │
-- │                                                                        │
-- │ Net effect: no organization could add a check-in location through the  │
-- │ application. Static review would not have caught it — the policy, the  │
-- │ service and the form are each individually correct.                    │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- Verified before writing this migration:
--   students, leads, attendance_settings → DEFAULT current_org_id()
--   organization_branches                → NULL
--
-- Setting a column DEFAULT is metadata only: no existing row is read or
-- rewritten, and the column stays NOT NULL as it already was.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_branches
  ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

COMMENT ON COLUMN public.organization_branches.organization_id IS
  'Defaults to current_org_id() so clients can OMIT it. Omitting is the point: '
  'a browser that supplies this column is a browser choosing its own tenant, '
  'and the RLS WITH CHECK exists to stop that. Matches every other '
  'tenant-scoped table.';

-- ── Verification ──────────────────────────────────────────────────────────

DO $$
DECLARE d text;
BEGIN
  SELECT column_default INTO d
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'organization_branches'
     AND column_name = 'organization_id';

  IF d IS NULL OR d NOT LIKE '%current_org_id()%' THEN
    RAISE EXCEPTION 'phase8c: default not applied, got %', COALESCE(d, '<null>');
  END IF;

  -- No tenant table should be left without this default.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'organization_id'
       AND c.is_nullable = 'NO'
       AND COALESCE(c.column_default, '') NOT LIKE '%current_org_id()%'
       AND c.table_name = 'organization_branches'
  ) THEN
    RAISE EXCEPTION 'phase8c: organization_branches still lacks the default';
  END IF;
END $$;
