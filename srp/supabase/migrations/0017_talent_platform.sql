-- 0017_talent_platform.sql — the talent platform MVP.
--
-- Its own schema, deliberately. The two products carry fundamentally
-- different consent: an applicant agreed that one company could read their CV
-- for one role, while a talent profile is published to the internet. Putting
-- them in one schema means a single mistaken policy could publish the first
-- as if it were the second. The schema boundary makes that a much harder
-- mistake to make, and lets the product be separated later with a dump of one
-- schema rather than an untangling.
--
-- THE RULE THAT KEEPS IT TRUE: nothing joins public.* to talent.* directly.
-- Crossing happens through defined functions only.
--
-- Deliberately NOT here (design doc §8): matching, invitations, company
-- search. All three need a density that does not exist on launch day.

create schema if not exists talent;
grant usage on schema talent to anon, authenticated, service_role;

-- ============================================================
-- Canonical skills — shared vocabulary
--
-- If each side extracted free text, "تسويق رقمي" here and "Digital Marketing"
-- there would never match. Seeded minimally and grown from what the extractor
-- actually fails to map, rather than modelled up front.
-- ============================================================
create table talent.skills (
  id text primary key,               -- stable canonical id, e.g. 'digital_marketing'
  label_ar text not null,
  label_en text not null,
  aliases text[] not null default '{}',
  parent_id text references talent.skills(id),
  created_at timestamptz not null default now()
);

-- Everything the extractor proposed and could not map. A queue, not a bin:
-- what recurs here is what the taxonomy is missing.
create table talent.unmapped_skills (
  id bigint generated always as identity primary key,
  raw_label text not null,
  occurrences int not null default 1,
  resolved_to text references talent.skills(id),
  created_at timestamptz not null default now(),
  unique (raw_label)
);

-- ============================================================
-- Profiles
-- ============================================================
create type talent.profile_status as enum ('draft', 'published', 'hidden');

create table talent.profiles (
  id uuid primary key default gen_random_uuid(),

  -- The public URL. Random and long: a sequential or guessable id would let
  -- anyone walk the entire CV database with a for loop, which is the worst
  -- outcome available to a product built on trust. 32 hex chars = 128 bits.
  public_token text not null unique
    check (public_token ~ '^[0-9a-f]{32}$'),

  email text not null unique,
  email_verified_at timestamptz,

  -- Facts the person owns, corrected by them on the review screen.
  full_name text,
  headline text,
  city text,
  years_experience numeric(4,1) check (years_experience is null or years_experience between 0 and 60),
  about text check (about is null or length(about) <= 300),

  -- What we extracted. Structure mirrors the recruitment extractor so one
  -- vocabulary serves both.
  extracted jsonb not null default '{}'::jsonb,
  -- Public strengths, in words. NEVER a numeric score: a standing "62 in
  -- marketing" beside a real person's name is both harmful and wrong, since
  -- the rubric is relative to a specific job. Fit is computed at match time.
  strengths jsonb not null default '[]'::jsonb,
  focus_areas jsonb not null default '[]'::jsonb,

  -- Elements the person hid on review. Removal is allowed, addition is not:
  -- taking something away only reduces our claims, while adding turns the
  -- page into self-declaration and removes the reason to trust it.
  hidden_skills text[] not null default '{}',

  status talent.profile_status not null default 'draft',

  -- Two consents, separately. Many people want a page to share and no mail
  -- from companies; PDPL wants a specific consent per purpose either way.
  consent_public_at timestamptz,
  consent_offers_at timestamptz,

  -- Contact details are never on the public page; companies go through the
  -- platform. Protection and business model agree here.
  phone text,

  noindex boolean not null default false,

  -- Proves the address before anything is spent. Rotated on every upload so
  -- an old link cannot be replayed.
  verify_token text unique,
  verify_sent_at timestamptz,

  cv_path text,
  cv_sha256 text,          -- same file twice costs no second analysis
  analysis_status analysis_status not null default 'pending',
  analysis_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on talent.profiles (status) where status = 'published';
create index on talent.profiles (email);
create index on talent.profiles (cv_sha256) where cv_sha256 is not null;

create table talent.profile_skills (
  profile_id uuid not null references talent.profiles(id) on delete cascade,
  skill_id text not null references talent.skills(id),
  primary key (profile_id, skill_id)
);

create index on talent.profile_skills (skill_id);

-- Abuse ledger. Every upload is a paid model call from someone we do not
-- know: ten thousand overnight is roughly $169.
create table talent.upload_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_hash text not null,
  created_at timestamptz not null default now()
);

create index on talent.upload_attempts (ip_hash, created_at desc);
create index on talent.upload_attempts (email_hash, created_at desc);
create index on talent.upload_attempts (created_at);

-- ============================================================
-- RLS
-- ============================================================
alter table talent.profiles enable row level security;
alter table talent.profile_skills enable row level security;
alter table talent.skills enable row level security;
alter table talent.unmapped_skills enable row level security;
alter table talent.upload_attempts enable row level security;

-- The public page is served by a security definer function that returns only
-- publishable columns, so anon needs no table grant at all. Nothing else
-- reaches these tables except the service role.
create policy skills_public_read on talent.skills
  for select to anon, authenticated using (true);

grant select on talent.skills to anon, authenticated;

-- ============================================================
-- talent.public_profile — everything the public page may show
--
-- The column list IS the privacy boundary: email, phone, cv_path and the raw
-- extraction are absent by construction rather than by remembering to omit
-- them at the call site.
-- ============================================================
create or replace function talent.public_profile(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = talent, public
as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'headline', p.headline,
    'city', p.city,
    'years_experience', p.years_experience,
    'about', p.about,
    'strengths', p.strengths,
    'focus_areas', p.focus_areas,
    'noindex', p.noindex,
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label_ar))
      from talent.profile_skills ps
      join talent.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
        and not (ps.skill_id = any (p.hidden_skills))
    ), '[]'::jsonb),
    'experiences', coalesce(p.extracted -> 'experiences', '[]'::jsonb),
    'education', coalesce(p.extracted -> 'education', '[]'::jsonb),
    'languages', coalesce(p.extracted -> 'languages', '[]'::jsonb),
    'updated_at', p.updated_at
  )
  from talent.profiles p
  where p.public_token = p_token
    and p.status = 'published'
    and p.consent_public_at is not null;
$$;

revoke execute on function talent.public_profile(text) from public;
grant execute on function talent.public_profile(text) to anon, authenticated;

-- ============================================================
-- talent.record_upload_attempt — checks and records in one statement.
-- ============================================================
create or replace function talent.record_upload_attempt(
  p_ip_hash text,
  p_email_hash text
)
returns text
language plpgsql
security definer
set search_path = talent, public
as $$
declare
  v_ip_day int;
  v_email_day int;
begin
  select count(*) into v_ip_day
  from talent.upload_attempts
  where ip_hash = p_ip_hash and created_at > now() - interval '1 day';
  if v_ip_day >= 10 then
    return 'rate_limited';
  end if;

  select count(*) into v_email_day
  from talent.upload_attempts
  where email_hash = p_email_hash and created_at > now() - interval '1 day';
  if v_email_day >= 3 then
    return 'rate_limited';
  end if;

  insert into talent.upload_attempts (ip_hash, email_hash)
  values (p_ip_hash, p_email_hash);
  return null;
end;
$$;

revoke execute on function talent.record_upload_attempt(text, text)
  from public, anon, authenticated;

-- ============================================================
-- Seed vocabulary. Small on purpose — grown from unmapped_skills.
-- ============================================================
insert into talent.skills (id, label_ar, label_en, aliases) values
  ('software_development','تطوير البرمجيات','Software Development','{"برمجة","تطوير","programming"}'),
  ('frontend','تطوير الواجهات الأمامية','Frontend Development','{"واجهات أمامية","front-end"}'),
  ('backend','تطوير الخلفيات','Backend Development','{"back-end"}'),
  ('mobile_development','تطوير تطبيقات الجوال','Mobile Development','{"تطبيقات جوال","ios","android"}'),
  ('data_analysis','تحليل البيانات','Data Analysis','{"تحليل بيانات","analytics"}'),
  ('data_engineering','هندسة البيانات','Data Engineering','{}'),
  ('machine_learning','تعلّم الآلة','Machine Learning','{"ذكاء اصطناعي","ai"}'),
  ('devops','عمليات التطوير','DevOps','{"سحابة","cloud"}'),
  ('cybersecurity','الأمن السيبراني','Cybersecurity','{"أمن المعلومات"}'),
  ('ui_ux','تصميم تجربة المستخدم','UI/UX Design','{"تصميم واجهات","ux"}'),
  ('graphic_design','التصميم الجرافيكي','Graphic Design','{"تصميم جرافيك"}'),
  ('digital_marketing','التسويق الرقمي','Digital Marketing','{"تسويق رقمي","ديجيتال ماركتنج","تسويق إلكتروني"}'),
  ('content_writing','كتابة المحتوى','Content Writing','{"كتابة محتوى","تحرير"}'),
  ('social_media','إدارة وسائل التواصل','Social Media Management','{"سوشيال ميديا"}'),
  ('seo','تحسين محركات البحث','SEO','{"سيو"}'),
  ('sales','المبيعات','Sales','{"مبيعات"}'),
  ('business_development','تطوير الأعمال','Business Development','{"تطوير أعمال"}'),
  ('customer_service','خدمة العملاء','Customer Service','{"دعم العملاء"}'),
  ('accounting','المحاسبة','Accounting','{"محاسبة"}'),
  ('finance','التمويل','Finance','{"مالية","تحليل مالي"}'),
  ('auditing','المراجعة الداخلية','Auditing','{"تدقيق"}'),
  ('human_resources','الموارد البشرية','Human Resources','{"موارد بشرية","hr"}'),
  ('recruitment','التوظيف','Recruitment','{"استقطاب"}'),
  ('project_management','إدارة المشاريع','Project Management','{"إدارة مشاريع","pmp"}'),
  ('product_management','إدارة المنتجات','Product Management','{"إدارة منتج"}'),
  ('operations','العمليات','Operations','{"تشغيل"}'),
  ('supply_chain','سلاسل الإمداد','Supply Chain','{"لوجستيات","logistics"}'),
  ('legal','الشؤون القانونية','Legal','{"قانون","محاماة"}'),
  ('teaching','التدريس','Teaching','{"تعليم","تدريب"}'),
  ('healthcare','الرعاية الصحية','Healthcare','{"تمريض","صحة"}'),
  ('civil_engineering','الهندسة المدنية','Civil Engineering','{"هندسة مدنية"}'),
  ('mechanical_engineering','الهندسة الميكانيكية','Mechanical Engineering','{"هندسة ميكانيكية"}'),
  ('electrical_engineering','الهندسة الكهربائية','Electrical Engineering','{"هندسة كهربائية"}'),
  ('architecture','العمارة','Architecture','{"هندسة معمارية"}'),
  ('translation','الترجمة','Translation','{"ترجمة"}'),
  ('video_production','إنتاج الفيديو','Video Production','{"مونتاج","تصوير"}')
on conflict (id) do nothing;

-- ============================================================
-- Crossing points
--
-- The talent schema is NOT exposed through the API — config.toml lists only
-- public — so nothing in it is directly reachable. These wrappers in public
-- are the entire surface, which is what makes "no direct joins between the
-- two products" enforceable rather than merely agreed.
-- ============================================================
create or replace function public.talent_public_profile(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public, talent
as $$
  select talent.public_profile(p_token);
$$;

revoke execute on function public.talent_public_profile(text) from public;
grant execute on function public.talent_public_profile(text) to anon, authenticated;

comment on function public.talent_public_profile(text) is
  'The only path from the API into the talent schema for public reads. Returns publishable columns only.';

create index on talent.profiles (verify_token) where verify_token is not null;

create or replace function public.talent_record_upload_attempt(
  p_ip_hash text,
  p_email_hash text
)
returns text
language sql
security definer
set search_path = public, talent
as $$
  select talent.record_upload_attempt(p_ip_hash, p_email_hash);
$$;

revoke execute on function public.talent_record_upload_attempt(text, text)
  from public, anon, authenticated;

-- Private bucket. A talent CV is the raw document behind a published page,
-- and the page deliberately shows less than the file does.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'talent-cvs',
  'talent-cvs',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- No policies: nothing but the service role touches this bucket. anon and
-- authenticated get no grant at all, which is the point.

-- Records a label the extractor could not map. Upserted so a recurring miss
-- rises up the queue instead of filling it with duplicates.
create or replace function public.talent_record_unmapped_skill(p_label text)
returns void
language sql
security definer
set search_path = public, talent
as $$
  insert into talent.unmapped_skills (raw_label)
  values (p_label)
  on conflict (raw_label)
    do update set occurrences = talent.unmapped_skills.occurrences + 1;
$$;

revoke execute on function public.talent_record_unmapped_skill(text)
  from public, anon, authenticated;

-- ============================================================
-- talent_publish_profile — the third step.
--
-- Consent is recorded here, per purpose, because this is the moment it is
-- given. Publishing without the public consent is impossible by construction:
-- the function refuses, and public_profile() checks the timestamp again.
-- ============================================================
create or replace function public.talent_publish_profile(
  p_token text,
  p_full_name text,
  p_headline text,
  p_city text,
  p_years numeric,
  p_about text,
  p_hidden_skills text[],
  p_consent_public boolean,
  p_consent_offers boolean,
  p_noindex boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
begin
  select id into v_id from talent.profiles
  where public_token = p_token and email_verified_at is not null;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Publication is a separate decision from receiving offers, and neither
  -- implies the other. Refusing here rather than defaulting to true is the
  -- whole point of asking.
  if not p_consent_public then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  update talent.profiles
  set full_name = p_full_name,
      headline = p_headline,
      city = p_city,
      years_experience = p_years,
      about = p_about,
      hidden_skills = coalesce(p_hidden_skills, '{}'),
      consent_public_at = coalesce(consent_public_at, now()),
      consent_offers_at = case
        when p_consent_offers then coalesce(consent_offers_at, now())
        else null
      end,
      noindex = p_noindex,
      status = 'published',
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_publish_profile(
  text, text, text, text, numeric, text, text[], boolean, boolean, boolean
) from public;
grant execute on function public.talent_publish_profile(
  text, text, text, text, numeric, text, text[], boolean, boolean, boolean
) to anon, authenticated;

-- ============================================================
-- talent_set_visibility / talent_delete_profile
--
-- Hiding is reversible and instant. Deletion is immediate and total: no soft
-- delete and no grace period, because a person withdrawing their published
-- CV is exercising a right, not making a request we get to queue.
-- ============================================================
create or replace function public.talent_set_visibility(
  p_token text,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
begin
  update talent.profiles
  -- Explicit cast: the CASE yields text, and the column is an enum.
  set status = (case when p_visible then 'published' else 'hidden' end)::talent.profile_status,
      updated_at = now()
  where public_token = p_token and email_verified_at is not null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_set_visibility(text, boolean) from public;
grant execute on function public.talent_set_visibility(text, boolean)
  to anon, authenticated;

create or replace function public.talent_delete_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_cv_path text;
begin
  delete from talent.profiles
  where public_token = p_token
  returning cv_path into v_cv_path;

  if v_cv_path is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- The row is gone; the caller removes the stored file, which needs the
  -- Storage API rather than SQL.
  return jsonb_build_object('ok', true, 'cv_path', v_cv_path);
end;
$$;

revoke execute on function public.talent_delete_profile(text) from public;
grant execute on function public.talent_delete_profile(text) to anon, authenticated;

-- ============================================================
-- talent_review_profile — what the owner sees before publishing.
--
-- Deliberately wider than public_profile(): it includes the skills the person
-- has hidden (so they can unhide them) and the current consent state. It
-- still excludes the CV path and the raw file — those are ours, not theirs to
-- re-download from a token.
-- ============================================================
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
