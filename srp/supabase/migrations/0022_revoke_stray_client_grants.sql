-- 0022_revoke_stray_client_grants.sql
--
-- Supabase's default privileges hand anon and authenticated every privilege
-- on every new table in public, and each migration since 0006 revoked what
-- it knew about. An audit during P1 found what was left behind: anon still
-- held INSERT/UPDATE/DELETE on jobs, applications, status_history and
-- analysis_usage, and both client roles held TRUNCATE (which RLS does not
-- govern), REFERENCES and TRIGGER on most tables. RLS stopped every row and
-- PostgREST exposes no TRUNCATE, so nothing was reachable — but CLAUDE.md
-- §10.11 forbids the grants themselves, and a future function running with
-- the caller's rights would have inherited them.
--
-- anon writes nothing anywhere (D15): applying goes through
-- submit-application with the service role. authenticated keeps exactly the
-- write grants earlier migrations gave it on purpose; only the three
-- privileges no client ever needs are removed. Nothing anon can execute
-- writes with invoker rights (checked: only pgcrypto helpers qualify).

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon;
revoke truncate, references, trigger
  on all tables in schema public from authenticated;

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema talent from anon, authenticated;

-- And for tables created from now on, so the next migration cannot forget.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;
