-- schedule_housekeeping.sql — (re)schedule the daily housekeeping job.
--
-- Paste into Supabase → SQL Editor, fill in the two values marked ✏️ below,
-- and run. Needed once on a project where 0028 warned "daily housekeeping is
-- NOT scheduled" (D8 retention and the analysis retries do not run until it
-- is). Safe to re-run; it replaces the job.
--
-- Why not the settings 0004 asked for: current Supabase refuses
-- `alter database postgres set app.…` ("permission denied to set
-- parameter"), so those settings cannot be created there any more.
--
-- The anon key only gets the call past the gateway. What authorizes a run is
-- the single-use ticket each run mints (0028, SEC-04), so the job's command
-- holds nothing worth stealing. Never commit this file with values filled in:
-- it would bind every environment that runs it to one project.
--
-- Keep in step with 0028 section 7.

do $$
declare
  -- ✏️ Fill in both before running. Neither is a secret: the project URL and
  -- the anon key are what the site's own JavaScript already carries.
  v_url text := 'https://<ref>.supabase.co/functions/v1/housekeeping';
  v_auth text := 'Bearer ' || '<anon key>';
  v_command text;
begin
  -- Placeholders left as they are fall back to the database settings (if
  -- this project could set them) or to the job already scheduled.
  if v_url like '%<ref>%' then
    v_url := nullif(current_setting('app.housekeeping_url', true), '');
  end if;
  if v_auth like '%<anon key>%' then
    v_auth := 'Bearer ' || nullif(current_setting('app.housekeeping_key', true), '');
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      raise notice 'pg_cron unavailable — nothing to schedule (local harness)';
      return;
    end if;
    if v_url is null or v_auth is null then
      -- Deliberately loud, as in 0012: retention (D8) is not running.
      raise warning 'app.housekeeping_url / app.housekeeping_key not set — daily housekeeping is NOT scheduled';
      return;
    end if;
    create extension pg_cron;
  end if;

  select command into v_command from cron.job where jobname = 'srp-daily-housekeeping';
  if v_url is null then
    v_url := substring(v_command from $re$url := '([^']+)'$re$);
  end if;
  if v_auth is null then
    v_auth := substring(v_command from $re$'Authorization', '([^']+)'$re$);
  end if;

  if v_url is null or v_auth is null then
    -- Deliberately loud, as in 0012: retention (D8) is not running.
    raise warning 'app.housekeeping_url / app.housekeeping_key not set and no job to copy them from — daily housekeeping is NOT scheduled';
    return;
  end if;

  create extension if not exists pg_net;
  if v_command is not null then
    perform cron.unschedule('srp-daily-housekeeping');
  end if;
  perform cron.schedule(
    'srp-daily-housekeeping',
    '0 3 * * *',
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L,
          'x-housekeeping-ticket', public.issue_housekeeping_ticket()
        ),
        body := '{}'::jsonb
      )$job$,
      v_url,
      v_auth
    )
  );
end $$;
