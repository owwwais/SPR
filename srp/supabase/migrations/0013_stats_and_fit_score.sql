-- 0013_stats_and_fit_score.sql
--
-- Two findings from the August 2026 performance measurement.

-- ============================================================
-- 1. applications.fit_score (PERF option A)
--
-- Ranking applicants ordered by a column on the JOINED ai_evaluations table,
-- which forced Postgres to read every application for the job, join every
-- evaluation, sort the lot, and then return twenty — on every page, first or
-- last. Measured at 2.95 ms for 250 applicants and 10-12 ms for 3,250, and
-- the shape is linear, so a popular posting only gets worse.
--
-- A covering index was tried first and changed nothing: the planner needs all
-- the evaluation rows for the join regardless. The fix is to put the score on
-- the row being sorted, maintained by trigger so there is one writer and no
-- chance of the two drifting.
-- ============================================================
alter table applications add column if not exists fit_score int
  check (fit_score between 0 and 100);

comment on column applications.fit_score is
  'Denormalised copy of ai_evaluations.fit_score, maintained by trigger. Exists so the ranked list can be served from an index; ai_evaluations remains the source of truth.';

create or replace function public.sync_application_fit_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update applications set fit_score = null where id = old.application_id;
    return old;
  end if;

  update applications set fit_score = new.fit_score where id = new.application_id;
  return new;
end;
$$;

drop trigger if exists ai_evaluations_sync_fit_score on ai_evaluations;
create trigger ai_evaluations_sync_fit_score
  after insert or update of fit_score or delete on ai_evaluations
  for each row execute function public.sync_application_fit_score();

-- Backfill whatever already exists.
update applications a
set fit_score = e.fit_score
from ai_evaluations e
where e.application_id = a.id
  and a.fit_score is distinct from e.fit_score;

-- The ranked-list index. Column order matches the query: filter on org and
-- job, then read in score order, so the twenty rows come straight off the
-- index without sorting the job's whole applicant set.
--
-- NOTE: plain CREATE INDEX, not CONCURRENTLY, because migrations run inside a
-- transaction and CONCURRENTLY cannot. Current volumes make the brief lock a
-- non-issue; against a large live table, build it manually with
-- CREATE INDEX CONCURRENTLY first and this statement becomes a no-op.
create index if not exists applications_ranked_idx
  on applications (org_id, job_id, fit_score desc nulls last, created_at);

-- ============================================================
-- 2. org_stats (PERF option B)
--
-- The dashboard fetched up to 5,000 application rows and aggregated them in
-- JavaScript. Two problems, and the smaller one is the speed: an organisation
-- with more than 5,000 applications had the rest silently dropped, so every
-- figure on the page — totals, averages, the funnel — was computed on a
-- truncated set and presented as fact with no warning.
--
-- Returns one JSON document so the page makes a single call. security definer
-- with an explicit membership check: the caller may only ever read an
-- organisation current_org_ids() already grants them.
-- ============================================================
create or replace function public.org_stats(p_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Same form the policies use: current_org_ids() returns uuid[], so it is
  -- expanded with unnest rather than compared against directly.
  if p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'applications', count(*),
        'avg_fit_score', round(avg(fit_score))::int,
        'awaiting_analysis', count(*) filter (where analysis_status in ('pending','processing')),
        'failed_analyses', count(*) filter (where analysis_status = 'failed')
      )
      from applications where org_id = p_org
    ),
    'published_jobs', (
      select count(*) from jobs
      where org_id = p_org and status = 'published' and deleted_at is null
    ),
    'per_job', coalesce((
      select jsonb_agg(t order by t.count desc)
      from (
        select j.title as name,
               count(a.id) as count,
               round(avg(a.fit_score))::int as avg
        from jobs j
        left join applications a on a.job_id = j.id and a.org_id = p_org
        where j.org_id = p_org and j.deleted_at is null
        group by j.id, j.title
      ) t
    ), '[]'::jsonb),
    'funnel', coalesce((
      -- One grouped pass, then the enum is left-joined onto it so statuses
      -- with no applications still appear as zero. Counting each status with
      -- its own subquery instead cost a full scan per status.
      select jsonb_agg(jsonb_build_object('status', st, 'count', coalesce(c.count, 0)))
      from unnest(enum_range(null::app_status)) st
      left join (
        select status, count(*) as count
        from applications where org_id = p_org
        group by status
      ) c on c.status = st
    ), '[]'::jsonb),
    'over_time', coalesce((
      -- Likewise: one grouped pass over the window rather than a scan per day.
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(c.count, 0)) order by d.day)
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d(day)
      left join (
        select created_at::date as day, count(*) as count
        from applications
        where org_id = p_org
          and created_at >= current_date - interval '29 days'
        group by 1
      ) c on c.day = d.day::date
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.org_stats(uuid) from public, anon;
grant execute on function public.org_stats(uuid) to authenticated;

comment on function public.org_stats(uuid) is
  'Dashboard aggregates for one organization, computed in the database. Replaces a 5,000-row fetch that silently truncated and reported wrong totals.';
