-- 0026: the workspace "Today" page (P4b, PRODUCT-READINESS-PROPOSAL §5.3).
--
-- One read answers "what needs me now?": unreviewed applicants per job with
-- the top three by advisory score, failed analyses (UI-B2: the old home page
-- did not show them at all), interviews this week, recent virtual-interview
-- reports, question banks awaiting the mandatory HR review (D30), and jobs
-- that are closing or have drawn nobody. No model call (§8).
--
-- SECURITY INVOKER on purpose: every subquery filters org_id = p_org in SQL,
-- and RLS still constrains every table it reads — the two layers of the
-- isolation invariant, not one of them twice.

create or replace function public.workspace_today(p_org uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if p_org is null or p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'new', (select count(*) from applications
              where org_id = p_org and status = 'new'),
      'this_week', (select count(*) from applications
                    where org_id = p_org and created_at >= now() - interval '7 days'),
      'analyzing', (select count(*) from applications
                    where org_id = p_org and analysis_status in ('pending', 'processing')),
      'published_jobs', (select count(*) from jobs
                         where org_id = p_org and status = 'published' and deleted_at is null)
    ),

    'new_by_job', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job_id', g.job_id, 'title', g.title, 'new_count', g.new_count,
               'top', g.top) order by g.new_count desc, g.title)
      from (
        select j.id as job_id, j.title, count(*) as new_count,
               (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', t.id, 'full_name', t.full_name, 'fit_score', t.fit_score)
                       order by t.fit_score desc nulls last, t.created_at), '[]'::jsonb)
                from (select a2.id, a2.full_name, a2.fit_score, a2.created_at
                      from applications a2
                      where a2.org_id = p_org and a2.job_id = j.id and a2.status = 'new'
                      order by a2.fit_score desc nulls last, a2.created_at
                      limit 3) t) as top
        from jobs j
        join applications a on a.job_id = j.id and a.org_id = p_org and a.status = 'new'
        where j.org_id = p_org and j.deleted_at is null
        group by j.id, j.title
        order by count(*) desc, j.title
        limit 6
      ) g
    ), '[]'::jsonb),

    'failed', jsonb_build_object(
      'count', (select count(*) from applications
                where org_id = p_org and analysis_status = 'failed'),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', f.id, 'full_name', f.full_name, 'job_title', f.title,
                 'attempts', f.analysis_attempts) order by f.created_at desc)
        from (select a.id, a.full_name, a.analysis_attempts, a.created_at, j.title
              from applications a join jobs j on j.id = a.job_id and j.org_id = p_org
              where a.org_id = p_org and a.analysis_status = 'failed'
              order by a.created_at desc
              limit 5) f
      ), '[]'::jsonb)
    ),

    'interviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'full_name', i.full_name, 'job_title', i.title,
               'interview_at', i.interview_at) order by i.interview_at)
      from (select a.id, a.full_name, a.interview_at, j.title
            from applications a join jobs j on j.id = a.job_id and j.org_id = p_org
            where a.org_id = p_org
              and a.interview_at >= now() - interval '2 hours'
              and a.interview_at < (v_today + 7)::timestamp at time zone 'Asia/Riyadh'
            order by a.interview_at
            limit 8) i
    ), '[]'::jsonb),

    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'application_id', r.application_id, 'full_name', r.full_name,
               'job_title', r.title, 'received_at', r.received_at) order by r.received_at desc)
      from (select a.id as application_id, a.full_name, j.title, rep.received_at
            from interview_reports rep
            join interview_assignments ia on ia.id = rep.assignment_id and ia.org_id = p_org
            join applications a on a.id = ia.application_id and a.org_id = p_org
            join jobs j on j.id = a.job_id and j.org_id = p_org
            where rep.org_id = p_org and rep.received_at >= now() - interval '7 days'
            order by rep.received_at desc
            limit 5) r
    ), '[]'::jsonb),

    'banks_to_review', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job_id', b.job_id, 'title', b.title, 'question_count', b.question_count)
             order by b.updated_at desc)
      from (select bank.job_id, j.title, bank.question_count, bank.updated_at
            from interview_job_banks bank
            join jobs j on j.id = bank.job_id and j.org_id = p_org and j.deleted_at is null
            where bank.org_id = p_org and bank.status = 'awaiting_review'
            order by bank.updated_at desc
            limit 5) b
    ), '[]'::jsonb),

    'closing_soon', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job_id', c.id, 'title', c.title, 'closes_at', c.closes_at) order by c.closes_at)
      from (select j.id, j.title, j.closes_at from jobs j
            where j.org_id = p_org and j.status = 'published' and j.deleted_at is null
              and j.closes_at between v_today and v_today + 7
            order by j.closes_at
            limit 5) c
    ), '[]'::jsonb),

    'quiet_jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job_id', q.id, 'title', q.title, 'created_at', q.created_at) order by q.created_at)
      from (select j.id, j.title, j.created_at from jobs j
            where j.org_id = p_org and j.status = 'published' and j.deleted_at is null
              and j.created_at < now() - interval '7 days'
              and not exists (select 1 from applications a
                              where a.org_id = p_org and a.job_id = j.id)
            order by j.created_at
            limit 5) q
    ), '[]'::jsonb),

    -- First steps for a new company (proposal §2.15): each a plain fact.
    'first_steps', jsonb_build_object(
      'published_job', exists (select 1 from jobs where org_id = p_org
                               and status = 'published' and deleted_at is null),
      'branding', exists (select 1 from organizations where id = p_org
                          and (logo_path is not null or about is not null)),
      'team', (select count(*) from memberships where org_id = p_org) > 1,
      'first_application', exists (select 1 from applications where org_id = p_org)
    )
  );
end;
$$;

revoke execute on function public.workspace_today(uuid) from public, anon;
grant execute on function public.workspace_today(uuid) to authenticated;
