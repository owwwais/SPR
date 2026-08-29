-- 0018_talent_review_error.sql
--
-- talent_review_profile() did not return analysis_error, so a failed
-- extraction showed the owner a generic message with nothing to act on or
-- report. analyze-application (the recruitment side) already surfaces
-- analysis_error to HR on the applicant detail page; this brings the talent
-- side to parity. talent-analyze now prefixes the stored message with a
-- trace id ([abcdef1234] ...), so what the owner sees here is the same
-- string a trace search in the function logs finds.
create or replace function public.talent_review_profile(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public, talent
as $$
  select jsonb_build_object(
    'status', p.status,
    'analysis_status', p.analysis_status,
    'analysis_error', p.analysis_error,
    'full_name', p.full_name,
    'headline', p.headline,
    'city', p.city,
    'years_experience', p.years_experience,
    'about', p.about,
    'strengths', p.strengths,
    'focus_areas', p.focus_areas,
    'hidden_skills', p.hidden_skills,
    'noindex', p.noindex,
    'consent_public', p.consent_public_at is not null,
    'consent_offers', p.consent_offers_at is not null,
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label_ar))
      from talent.profile_skills ps
      join talent.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), '[]'::jsonb),
    'experiences', coalesce(p.extracted -> 'experiences', '[]'::jsonb),
    'education', coalesce(p.extracted -> 'education', '[]'::jsonb),
    'languages', coalesce(p.extracted -> 'languages', '[]'::jsonb)
  )
  from talent.profiles p
  where p.public_token = p_token
    and p.email_verified_at is not null;
$$;

revoke execute on function public.talent_review_profile(text) from public;
grant execute on function public.talent_review_profile(text) to anon, authenticated;
