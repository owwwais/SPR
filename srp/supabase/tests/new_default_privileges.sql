-- new_default_privileges.sql — the Data API defaults Supabase applies from
-- 2026-10-30 (config.toml, auto_expose_new_tables): a table, view, sequence
-- or function created in `public` after that date reaches anon,
-- authenticated and service_role only through an explicit GRANT.
--
-- harness.sql reproduces the legacy defaults, under which every migration up
-- to 0022 was applied in production. run.sh switches to this file right
-- after 0022, so every later migration is tested the way a fresh project or
-- a late deploy applies it: a migration that forgets a GRANT fails the
-- suites instead of failing in production. Functions also lose the PUBLIC
-- EXECUTE Postgres grants by default (only a global default can withhold
-- it, so run.sh restores it before the suites run): stricter than Supabase
-- may be, so a function that works here works under either default.

alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on routines from anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on routines from public;
alter default privileges
  revoke execute on routines from public;
