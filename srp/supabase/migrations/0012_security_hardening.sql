-- 0012_security_hardening.sql
--
-- Three fixes from the August 2026 audit that live in the database.

-- ============================================================
-- 1. Re-schedule housekeeping from settings (audit S4)
--
-- 0004 shipped the project URL and the invoking key as literals. That file is
-- now corrected for fresh installs, but a database that already ran it still
-- carries a cron job pointing at whatever those literals said. Rebuild the
-- job from settings so existing environments stop depending on them too.
-- ============================================================
do $$
declare
  v_url text := nullif(current_setting('app.housekeeping_url', true), '');
  v_key text := nullif(current_setting('app.housekeeping_key', true), '');
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable — nothing to re-schedule (local harness)';
  elsif v_url is null or v_key is null then
    -- Deliberately loud: on the hosted project this means the daily retention
    -- and retry job is NOT running, which is a D8 obligation.
    raise warning 'app.housekeeping_url / app.housekeeping_key not set — daily housekeeping is NOT scheduled';
    if exists (select 1 from cron.job where jobname = 'srp-daily-housekeeping') then
      perform cron.unschedule('srp-daily-housekeeping');
    end if;
  else
    if exists (select 1 from cron.job where jobname = 'srp-daily-housekeeping') then
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
            'Authorization', %L
          ),
          body := '{}'::jsonb
        )$job$,
        v_url,
        'Bearer ' || v_key
      )
    );
  end if;
end $$;

-- ============================================================
-- 2. Stop accepting SVG as organisation branding (audit S6)
--
-- org-assets is a PUBLIC bucket. An SVG is a document that can carry script,
-- so a tenant admin uploading one gets it served, as themselves, from a URL
-- we published. Raster formats carry no such payload. Existing rows are left
-- alone — none are expected, and silently deleting a tenant's logo is worse
-- than the narrow risk of one already stored.
-- ============================================================
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'org-assets';

-- ============================================================
-- 3. Claim an application for analysis atomically (audit R2)
--
-- analyze-application read analysis_status and then wrote 'processing' as two
-- statements. Two concurrent invocations both saw 'pending', both proceeded,
-- and both paid for a model call. This turns the claim into one statement:
-- the row moves out of 'pending' in the same breath as it is read, so exactly
-- one caller can win.
--
-- Returns true when the caller claimed it. A re-run (already done/failed) is
-- authorised separately by the function and passes p_force.
-- ============================================================
create or replace function public.claim_application_for_analysis(
  p_application_id uuid,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  update applications
  set analysis_status = 'processing',
      analysis_attempts = analysis_attempts + 1,
      analysis_error = null
  where id = p_application_id
    and (
      analysis_status = 'pending'
      or (p_force and analysis_status in ('failed', 'done', 'processing'))
    )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke execute on function public.claim_application_for_analysis(uuid, boolean)
  from public, anon, authenticated;

comment on function public.claim_application_for_analysis(uuid, boolean) is
  'Atomically moves an application into analysis. Service role only: the Edge Function authorises the caller before invoking it.';
