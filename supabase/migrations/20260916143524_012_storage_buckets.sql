insert into storage.buckets (id, name, public)
values
  ('candidate-resumes', 'candidate-resumes', false),
  ('candidate-photos', 'candidate-photos', false),
  ('intro-videos', 'intro-videos', false)
on conflict (id) do nothing;

create policy candidate_resumes_staff_all on storage.objects for all
  using (bucket_id = 'candidate-resumes' and public.is_staff())
  with check (bucket_id = 'candidate-resumes' and public.is_staff());

create policy candidate_photos_staff_all on storage.objects for all
  using (bucket_id = 'candidate-photos' and public.is_staff())
  with check (bucket_id = 'candidate-photos' and public.is_staff());
create policy candidate_photos_client_select on storage.objects for select
  using (
    bucket_id = 'candidate-photos'
    and exists (
      select 1 from public.candidate_files f
      where f.storage_path = storage.objects.name
        and f.file_type = 'profile_photo'
        and public.client_can_view_candidate(f.candidate_id)
    )
  );

create policy intro_videos_staff_all on storage.objects for all
  using (bucket_id = 'intro-videos' and public.is_staff())
  with check (bucket_id = 'intro-videos' and public.is_staff());
create policy intro_videos_client_select on storage.objects for select
  using (
    bucket_id = 'intro-videos'
    and exists (
      select 1 from public.candidate_files f
      where f.storage_path = storage.objects.name
        and f.file_type = 'intro_video'
        and public.client_can_view_candidate(f.candidate_id)
    )
  );
