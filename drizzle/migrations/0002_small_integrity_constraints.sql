-- ============ FlowMate AI small integrity constraints ============
-- Applies to: after 0001_plan_limits_and_usage_integrity.sql
--
-- Audit finding: app-valued-enum text columns had no database backstop. The
-- lowest-risk fix is a check constraint (not a type conversion) so existing
-- rows cannot fail to apply and rollback is a single drop statement.
--
-- default_test_mode is treated as the union "simulation" | "live" by every
-- caller (profile view, onboarding select, test panel). NOT VALID skips
-- validating pre-existing rows; run the VALIDATE statement once any legacy
-- garbage values are cleaned up.

alter table public.profiles
  add constraint profiles_default_test_mode_valid
  check (default_test_mode in ('simulation', 'live'));

-- Optional second step after data cleanup (kept commented until the table is
-- known clean):
-- validate constraint profiles_default_test_mode_valid;

-- Rollback:
-- alter table public.profiles drop constraint profiles_default_test_mode_valid;
