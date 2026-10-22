-- 0019_rejection_reason_and_sourcing.sql
--
-- Four of the nine advanced features COMPETITIVE-2026-08.md recommended
-- beyond the top three (already shipped: transparency export, blind
-- screening, Saudization indicator). This migration carries the schema for:
--
--   #8  a neutral, human-picked rejection reason sent with the "rejected"
--       email, separate from the free-text internal note.
--   #12 where an applicant came from, so hiring-source quality can be
--       aggregated per organization.
--   #7  evaluation history. Re-running analysis today REPLACES the row via
--       upsert — the previous score, justification and questions are gone
--       with no trace, which is a real gap against D24 ("every decision is
--       recorded"), not a hypothetical one: a status change made against an
--       evaluation that a later re-run overwrote becomes unexplainable. This
--       keeps every superseded evaluation, which is also what a future
--       PROMPT_VERSION bump needs to show score drift on real cases — no
--       separate "reference case" machinery required, just re-run the same
--       applications and read this history.
--
-- #4 (score calibration against actual decisions) and #12's aggregation need
-- no new storage — they read fit_score and source that already exist here —
-- so both land as an extended org_stats() below instead of a fifth concern.

-- ============================================================
-- #8 — rejection reason
-- ============================================================
-- A fixed, neutral vocabulary by design: this is the exact text class the
-- product promises never to expose (§10.4, D24) — no AI reasoning, ever, in
-- what the applicant reads. Keeping it an enum-like check instead of free
-- text means even a direct SQL write cannot slip in anything else.
alter table status_history add column public_reason text
  check (public_reason is null or public_reason in (
    'more_suitable_candidate', 'requirements_mismatch',
    'position_filled', 'position_cancelled', 'other'
  ));

comment on column status_history.public_reason is
  'Optional, human-picked, neutral reason category sent in the "rejected" applicant email (#8). Never AI-generated text — separate from the free-text note, which stays internal.';

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history (org_id, application_id, from_status, to_status, changed_by, note)
    values (new.org_id, new.id, null, new.status, auth.uid(), null);
  elsif new.status is distinct from old.status then
    insert into status_history (org_id, application_id, from_status, to_status, changed_by, note, public_reason)
    values (
      new.org_id,
      new.id,
      old.status,
      new.status,
      auth.uid(),
      nullif(current_setting('srp.status_change_note', true), ''),
      nullif(current_setting('srp.status_change_reason', true), '')
    );
  end if;
  return new;
end;
$$;

-- CREATE OR REPLACE cannot add a parameter — a different argument list is a
-- different signature in Postgres, so it would leave the old 3-argument
-- version callable alongside this one (and, since Postgres grants EXECUTE
-- to PUBLIC by default on a newly created function, callable by anon too
-- until explicitly revoked below). Drop it outright instead of overloading.
drop function if exists public.change_application_status(uuid, app_status, text);

create function public.change_application_status(
  p_application_id uuid,
  p_new_status app_status,
  p_note text default null,
  p_public_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current app_status;
  v_org uuid;
begin
  select status, org_id into v_current, v_org
  from applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  if not public.is_org_member(
       v_org, array['owner','admin','hr']::member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_current = p_new_status then
    return; -- no-op; nothing recorded
  end if;

  -- Validated again here (defense in depth, same posture as everywhere
  -- else): the column check is the authority, this just fails earlier with
  -- a clearer error than a generic constraint violation.
  if p_public_reason is not null and p_public_reason not in (
       'more_suitable_candidate', 'requirements_mismatch',
       'position_filled', 'position_cancelled', 'other') then
    raise exception 'invalid public_reason' using errcode = '22023';
  end if;

  perform set_config('srp.status_change_note', coalesce(p_note, ''), true);
  perform set_config('srp.status_change_reason', coalesce(p_public_reason, ''), true);
  update applications set status = p_new_status where id = p_application_id;
  perform set_config('srp.status_change_note', '', true);
  perform set_config('srp.status_change_reason', '', true);
end;
$$;

revoke execute on function public.change_application_status(uuid, app_status, text, text) from public;
grant execute on function public.change_application_status(uuid, app_status, text, text) to authenticated;

-- ============================================================
-- #12 — hiring-source attribution
-- ============================================================
-- Captured once, at submission, from an optional ?src= on the apply link.
-- submit-application sanitizes it to this exact shape before it ever reaches
-- SQL (lowercase slug, 40 chars), so no constraint is needed here beyond
-- documenting the contract.
alter table applications add column source text;

comment on column applications.source is
  'Where the applicant came from (#12), e.g. "linkedin", "bayt", "referral" — from an optional ?src= on the public apply link. Sanitized to [a-z0-9_-]{1,40} by submit-application; null means direct/unspecified. Never used in scoring.';

-- ============================================================
-- #7 — evaluation history
-- ============================================================
-- Mirrors ai_evaluations. No org-scoped RLS write path exists or is needed —
-- only the BEFORE UPDATE trigger below ever inserts into it, running as the
-- table owner, same trust boundary as every other history/audit table here.
create table ai_evaluation_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  blind boolean not null default false,
  fit_score int not null,
  score_breakdown jsonb not null,
  justification jsonb not null,
  evaluated_at timestamptz not null,
  superseded_at timestamptz not null default now()
);

create index ai_evaluation_history_app_idx on ai_evaluation_history(application_id, superseded_at);

alter table ai_evaluation_history enable row level security;

-- Read-only mirror of the ai_evaluations select policy: same roles, same
-- org scoping. Nothing ever writes here except the trigger (security
-- definer, bypasses RLS), so there is no insert/update/delete policy at all.
create policy ai_evaluation_history_select on ai_evaluation_history
  for select
  using (org_id in (select unnest(public.current_org_ids())));

create or replace function public.archive_superseded_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_evaluation_history (
    org_id, application_id, model, prompt_version, blind,
    fit_score, score_breakdown, justification, evaluated_at
  )
  values (
    old.org_id, old.application_id, old.model, old.prompt_version, old.blind,
    old.fit_score, old.score_breakdown, old.justification, old.created_at
  );
  return new;
end;
$$;

-- The WHEN clause matters: hr can update ai_evaluations.interview_notes
-- (0002's column grant) through an ordinary UPDATE, which would otherwise
-- fire this trigger too and archive a "superseded" evaluation that was
-- never actually replaced. Only a real re-run — which always rewrites the
-- score together with what produced it — changes fit_score.
create trigger ai_evaluations_archive_before_update
before update on ai_evaluations
for each row
when (old.fit_score is distinct from new.fit_score)
execute function public.archive_superseded_evaluation();

-- A query pattern this migration newly introduces: scanning every
-- evaluation an organization owns (the candidate bank, #6), rather than one
-- application's single row. Nothing served that access pattern before.
create index ai_evaluations_org_idx on ai_evaluations(org_id);

-- ============================================================
-- #4 / #12 — extend org_stats() with calibration + source quality
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
      select jsonb_agg(jsonb_build_object('status', st, 'count', coalesce(c.count, 0)))
      from unnest(enum_range(null::app_status)) st
      left join (
        select status, count(*) as count
        from applications where org_id = p_org
        group by status
      ) c on c.status = st
    ), '[]'::jsonb),
    'over_time', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(c.count, 0)) order by d.day)
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d(day)
      left join (
        select created_at::date as day, count(*) as count
        from applications
        where org_id = p_org
          and created_at >= current_date - interval '29 days'
        group by 1
      ) c on c.day = d.day::date
    ), '[]'::jsonb),
    -- #4: does the AI score actually track who gets hired? A model that
    -- scores rejected candidates as high as accepted ones is not doing its
    -- job, however confident its justifications read. Limited to decided
    -- applications with a score; new/under_review/interview are still open.
    'calibration', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', status, 'count', count, 'avg_fit_score', avg_fit_score
      ) order by status)
      from (
        select status,
               count(*) as count,
               round(avg(fit_score))::int as avg_fit_score
        from applications
        where org_id = p_org
          and status in ('accepted', 'rejected')
          and fit_score is not null
        group by status
      ) t
    ), '[]'::jsonb),
    -- #12: which channel brings applicants worth interviewing, not just
    -- applicants. Top 10 by volume is enough for a channel-spend decision;
    -- this is not a general-purpose report.
    'source_quality', coalesce((
      select jsonb_agg(t order by t.count desc)
      from (
        select coalesce(source, 'direct') as source,
               count(*) as count,
               round(avg(fit_score))::int as avg_fit_score,
               count(*) filter (where status = 'accepted') as accepted_count
        from applications
        where org_id = p_org
        group by coalesce(source, 'direct')
        order by count(*) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ============================================================
-- #8 / #7 — surface both in the D24 transparency export too
-- ============================================================
create or replace function public.application_transparency_report(p_application uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org uuid;
  v_result jsonb;
begin
  select org_id into v_org from applications where id = p_application;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'application', jsonb_build_object(
      'reference', a.ref_code,
      'applicant_name', a.full_name,
      'submitted_at', a.created_at,
      'current_status', a.status,
      'job_title', j.title
    ),
    'advisory_notice', 'درجة الملاءمة استشارية أنتجها نموذج ذكاء اصطناعي، وليست قراراً. كل قرار في هذا السجل اتخذه إنسان.',
    'evaluation', case when e.id is null then null else jsonb_build_object(
      'fit_score', e.fit_score,
      'score_breakdown', e.score_breakdown,
      'justification', e.justification,
      'interview_questions', e.interview_questions,
      'model', e.model,
      'prompt_version', e.prompt_version,
      'evaluated_at', e.created_at,
      'blind_screening', e.blind
    ) end,
    -- #7: prior evaluations this re-run replaced, so the record stays
    -- honest about what was live when an earlier decision was made.
    'superseded_evaluations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fit_score', h.fit_score,
        'model', h.model,
        'prompt_version', h.prompt_version,
        'evaluated_at', h.evaluated_at,
        'superseded_at', h.superseded_at
      ) order by h.superseded_at)
      from ai_evaluation_history h
      where h.application_id = p_application
    ), '[]'::jsonb),
    'decision_trail', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_status', h.from_status,
        'to_status', h.to_status,
        'changed_at', h.created_at,
        'changed_by', case when h.changed_by is null then null else p.full_name end,
        'decided_by_human', h.changed_by is not null,
        'note', h.note,
        'public_reason', h.public_reason
      ) order by h.created_at)
      from status_history h
      left join profiles p on p.id = h.changed_by
      where h.application_id = p_application
    ), '[]'::jsonb)
  ) into v_result
  from applications a
  join jobs j on j.id = a.job_id
  left join ai_evaluations e on e.application_id = a.id
  where a.id = p_application;

  return v_result;
end;
$$;
