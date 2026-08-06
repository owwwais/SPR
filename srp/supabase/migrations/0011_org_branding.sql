-- 0011_org_branding.sql — S3: a public bucket for tenant branding.
--
-- Logos and cover images are the opposite of CVs: they are meant to be seen
-- by anyone who opens a careers page, and they are served straight from the
-- CDN with no signed URL. They therefore get their own bucket rather than a
-- second policy layered onto `cvs`, where one mistaken `public` flag would
-- expose applicants' personal files.
--
-- Layout mirrors cvs: org-assets/{org_id}/{logo|cover}.{ext}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-assets',
  'org-assets',
  true,
  2097152, -- 2 MB: these are logos, not photography
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Anyone may read: that is the point of the bucket.
create policy org_assets_public_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'org-assets');

-- Writes are scoped to the caller's own organization folder and to the roles
-- that administer it. `hr` manages jobs, not the company's identity.
create policy org_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-assets'
    and public.is_org_member(
          public.storage_org_id(name),
          array['owner','admin']::member_role[])
  );

create policy org_assets_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'org-assets'
    and public.is_org_member(
          public.storage_org_id(name),
          array['owner','admin']::member_role[])
  )
  with check (
    bucket_id = 'org-assets'
    and public.is_org_member(
          public.storage_org_id(name),
          array['owner','admin']::member_role[])
  );

-- Replacing a logo means deleting the old object, so this one is allowed —
-- unlike `cvs`, where deletion belongs solely to the retention job (D9).
create policy org_assets_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-assets'
    and public.is_org_member(
          public.storage_org_id(name),
          array['owner','admin']::member_role[])
  );

-- is_org_member() returns false for a null org, so a malformed path matches
-- nothing; storage_org_id() already turns an unparseable folder into null
-- rather than raising inside a policy (0007).
