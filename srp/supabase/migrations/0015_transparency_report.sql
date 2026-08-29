-- 0015_transparency_report.sql — the exportable transparency report D24
-- promises.
--
-- D24 makes two public commitments: no score without its justification, and
-- the decision is always human. The product honours both — the justification
-- is rendered beside every score, and status_history has recorded who changed
-- what since 0001 — but nothing could produce evidence of it.
--
-- That gap stopped being cosmetic in 2026. Annex III of the EU AI Act became
-- enforceable in August, a court has treated a screening vendor as an agent
-- of the employer, and a class action attacks a vendor for discarding
-- low-ranked candidates before any human saw them. An employer asked why a
-- candidate was rejected needs an answer with a date on it.
--
-- Everything here already exists in the schema. This assembles it.

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
    -- The advisory nature is stated inside the document, not only in the UI
    -- that renders it, so an exported copy cannot be read as a verdict.
    'advisory_notice', 'درجة الملاءمة استشارية أنتجها نموذج ذكاء اصطناعي، وليست قراراً. كل قرار في هذا السجل اتخذه إنسان.',
    'evaluation', case when e.id is null then null else jsonb_build_object(
      'fit_score', e.fit_score,
      'score_breakdown', e.score_breakdown,
      'justification', e.justification,
      'interview_questions', e.interview_questions,
      -- Which prompt and which model produced this, so a score can be
      -- reproduced or challenged later.
      'model', e.model,
      'prompt_version', e.prompt_version,
      'evaluated_at', e.created_at
    ) end,
    -- The human trail. changed_by null means the system recorded it (the
    -- initial 'new'), and that is stated rather than left to be guessed.
    'decision_trail', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_status', h.from_status,
        'to_status', h.to_status,
        'changed_at', h.created_at,
        'changed_by', case when h.changed_by is null then null else p.full_name end,
        'decided_by_human', h.changed_by is not null,
        'note', h.note
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

revoke execute on function public.application_transparency_report(uuid)
  from public, anon;
grant execute on function public.application_transparency_report(uuid) to authenticated;

comment on function public.application_transparency_report(uuid) is
  'D24 evidence for one application: score, justification, the prompt and model that produced it, and who changed each status when.';
