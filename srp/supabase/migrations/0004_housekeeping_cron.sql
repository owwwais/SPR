-- 0004_housekeeping_cron.sql — §4.2.4 / D8: daily housekeeping.
-- The work itself (analysis retries + retention deletion of applications AND
-- their CV files) lives in the `housekeeping` Edge Function, because physical
-- file deletion needs the Storage API and the retries need the service role.
-- pg_cron only triggers it daily through pg_net.
--
-- The target URL and the invoking key are read from database settings rather
-- than written here. They used to be literals, which bound every environment
-- that ran this migration to the production project — a `db reset` on a
-- laptop would schedule a daily job against live data — and published the
-- project ref to anyone reading the repository.
--
-- An operator sets them once per database:
--   alter database postgres set app.housekeeping_url = 'https://<ref>.supabase.co/functions/v1/housekeeping';
--   alter database postgres set app.housekeeping_key = '<anon key>';
-- Without them the schedule is skipped with a notice instead of guessing.
--
-- Guarded so the migration also runs on vanilla Postgres (local test
-- harness) where pg_cron/pg_net do not exist.

do $$
declare
  v_url text := nullif(current_setting('app.housekeeping_url', true), '');
  v_anon_key text := nullif(current_setting('app.housekeeping_key', true), '');
begin
  if v_url is null or v_anon_key is null then
    raise notice 'app.housekeeping_url / app.housekeeping_key not set — housekeeping schedule skipped';
  elsif exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    if exists (select 1 from cron.job where jobname = 'srp-daily-housekeeping') then
      perform cron.unschedule('srp-daily-housekeeping');
    end if;

    perform cron.schedule(
      'srp-daily-housekeeping',
      '0 3 * * *', -- daily, 03:00 UTC
      format(
        $job$select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', %L
          ),
          body := '{}'::jsonb
        )$job$,
        v_url,
        'Bearer ' || v_anon_key
      )
    );
  else
    raise notice 'pg_cron/pg_net unavailable — housekeeping schedule skipped (exists on hosted Supabase)';
  end if;
end $$;
