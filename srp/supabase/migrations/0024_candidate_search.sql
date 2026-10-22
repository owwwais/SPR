-- 0024_candidate_search.sql
--
-- Advanced feature #6: a candidate bank searchable by skill, across every
-- job in the organization. "The organization already paid to have these CVs
-- read once — reusing that is a clean profit for them and for us."
--
-- Why an RPC rather than a plain .from().select(): the match is "does this
-- application's extracted skill list contain something like X", which needs
-- jsonb_array_elements_text() over ai_evaluations.extracted -> 'skills' —
-- not expressible as a PostgREST filter. security definer with the same
-- current_org_ids() membership check every other aggregate here uses.
--
-- Scale note, deliberately not solved here: this is a sequential scan per
-- organization (ai_evaluations_org_idx from 0023 narrows it to the caller's
-- own rows first, nothing more). Fine at pre-launch volumes; a trigram index
-- (pg_trgm) is the next step if an organization's applicant count makes it
-- not fine, not a reason to add one before anyone has that problem.

create or replace function public.search_candidates(
  p_org uuid,
  p_skill text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_skill text;
  v_result jsonb;
begin
  if p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  v_skill := nullif(trim(coalesce(p_skill, '')), '');

  select jsonb_build_object(
    'total', (
      select count(*)
      from applications a
      join ai_evaluations e on e.application_id = a.id
      where a.org_id = p_org
        and (
          v_skill is null
          or exists (
            select 1 from jsonb_array_elements_text(e.extracted -> 'skills') s
            where s ilike '%' || v_skill || '%'
          )
        )
    ),
    'results', coalesce((
      select jsonb_agg(row)
      from (
        select jsonb_build_object(
          'application_id', a.id,
          'full_name', a.full_name,
          'job_title', j.title,
          'status', a.status,
          'fit_score', a.fit_score,
          'skills', e.extracted -> 'skills',
          'applied_at', a.created_at
        ) as row
        from applications a
        join ai_evaluations e on e.application_id = a.id
        join jobs j on j.id = a.job_id
        where a.org_id = p_org
          and (
            v_skill is null
            or exists (
              select 1 from jsonb_array_elements_text(e.extracted -> 'skills') s
              where s ilike '%' || v_skill || '%'
            )
          )
        order by a.fit_score desc nulls last, a.created_at desc
        limit greatest(0, least(p_limit, 50))
        offset greatest(0, p_offset)
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.search_candidates(uuid, text, int, int) from public, anon;
grant execute on function public.search_candidates(uuid, text, int, int) to authenticated;

comment on function public.search_candidates(uuid, text, int, int) is
  'Advanced feature #6: org-wide candidate search by extracted skill, across every job. Never used for scoring — read-only convenience over evaluations the organization already paid for.';
