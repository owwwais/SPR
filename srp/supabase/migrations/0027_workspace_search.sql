-- 0027: workspace search behind the command palette (P4g,
-- PRODUCT-READINESS-PROPOSAL §5.3).
--
-- Applicants by name, email or tracking code, and jobs by title, inside ONE
-- organization. SECURITY INVOKER, like workspace_today (0026): every branch
-- filters org_id = p_org in SQL and RLS still applies to both tables — the
-- two layers of the isolation invariant. No model call (§8).
--
-- The term is matched literally: LIKE's own wildcards in it are escaped, so
-- "%" finds a percent sign instead of everyone.

create or replace function public.search_workspace(p_org uuid, p_q text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_like text;
begin
  if p_org is null or p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then
    return jsonb_build_object('applicants', '[]'::jsonb, 'jobs', '[]'::jsonb);
  end if;
  v_q := left(v_q, 80);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return jsonb_build_object(
    'applicants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'full_name', a.full_name, 'ref_code', a.ref_code,
               'status', a.status, 'job_title', a.title) order by a.rank, a.created_at desc)
      from (
        select a.id, a.full_name, a.ref_code, a.status, a.created_at, j.title,
               -- an exact tracking code first, then names, then emails
               case when upper(a.ref_code) = upper(v_q) then 0
                    when a.full_name ilike v_like then 1
                    else 2 end as rank
        from applications a
        join jobs j on j.id = a.job_id and j.org_id = p_org
        where a.org_id = p_org
          and (a.full_name ilike v_like or a.email ilike v_like or a.ref_code ilike v_like)
        order by rank, a.created_at desc
        limit 8
      ) a
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'status', j.status)
                       order by j.created_at desc)
      from (
        select id, title, status, created_at from jobs
        where org_id = p_org and deleted_at is null and title ilike v_like
        order by created_at desc
        limit 5
      ) j
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.search_workspace(uuid, text) from public, anon;
grant execute on function public.search_workspace(uuid, text) to authenticated;
