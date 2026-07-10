-- 0004_housekeeping_cron.sql — §4.2.4 / D8: daily housekeeping.
-- The work itself (analysis retries + retention deletion of applications AND
-- their CV files) lives in the `housekeeping` Edge Function, because physical
-- file deletion needs the Storage API and the retries need the service role.
-- pg_cron only triggers it daily through pg_net.
--
-- The anon key below is the public client key (already shipped to every
-- browser); the function performs no privileged action on behalf of the
-- caller and returns nothing sensitive — invoking it early is harmless.
--
-- Guarded so the migration also runs on vanilla Postgres (local test
-- harness) where pg_cron/pg_net do not exist.

do $$
declare
  v_url text := 'https://htwdasmuxfrdtfnrgkue.supabase.co/functions/v1/housekeeping';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2Rhc211eGZyZHRmbnJna3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1OTE0NTQsImV4cCI6MjA5OTE2NzQ1NH0.-8pzXKIJ9uDvLjyESYSrWKD82md7S_iGxyZd-4hLTzQ';
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
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
