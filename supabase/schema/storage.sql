-- Storage buckets and storage.objects policies, captured 2026-10-14.
-- 5 buckets, 7 policies on storage.objects (all PERMISSIVE, to public).
-- Object counts at capture time: brand-assets = 3 objects; all other buckets EMPTY (0 objects)
-- (test data was wiped on 2026-10-06). File CONTENTS are NOT included in this backup.
-- Function names are unqualified (public); run with search_path = public.

-- ---------------------------------------------------------------------------
-- Buckets (file_size_limit and allowed_mime_types are NULL = no limit for all buckets)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('brand-assets',        'brand-assets',        true,  null, null),  -- created 2026-09-16 19:27 UTC; public read (logo used in emails)
  ('candidate-documents', 'candidate-documents', false, null, null),  -- created 2026-09-17 15:51 UTC; staff-only
  ('candidate-photos',    'candidate-photos',    false, null, null),  -- created 2026-09-16 14:35 UTC
  ('candidate-resumes',   'candidate-resumes',   false, null, null),  -- created 2026-09-16 14:35 UTC; staff-only
  ('intro-videos',        'intro-videos',        false, null, null)   -- created 2026-09-16 14:35 UTC
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------------
create policy brand_assets_staff_write on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'brand-assets'::text) AND is_staff()))
  with check (((bucket_id = 'brand-assets'::text) AND is_staff()));
create policy candidate_documents_staff_all on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'candidate-documents'::text) AND is_staff()))
  with check (((bucket_id = 'candidate-documents'::text) AND is_staff()));
create policy candidate_photos_client_select on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'candidate-photos'::text) AND (EXISTS ( SELECT 1
   FROM candidate_files f
  WHERE ((f.storage_path = objects.name) AND (f.file_type = 'profile_photo'::candidate_file_type) AND client_can_view_candidate(f.candidate_id))))));
create policy candidate_photos_staff_all on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'candidate-photos'::text) AND is_staff()))
  with check (((bucket_id = 'candidate-photos'::text) AND is_staff()));
create policy candidate_resumes_staff_all on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'candidate-resumes'::text) AND is_staff()))
  with check (((bucket_id = 'candidate-resumes'::text) AND is_staff()));
create policy intro_videos_client_select on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'intro-videos'::text) AND (EXISTS ( SELECT 1
   FROM candidate_files f
  WHERE ((f.storage_path = objects.name) AND (f.file_type = 'intro_video'::candidate_file_type) AND client_can_view_candidate(f.candidate_id))))));
create policy intro_videos_staff_all on storage.objects as PERMISSIVE for ALL to public
  using (((bucket_id = 'intro-videos'::text) AND is_staff()))
  with check (((bucket_id = 'intro-videos'::text) AND is_staff()));
