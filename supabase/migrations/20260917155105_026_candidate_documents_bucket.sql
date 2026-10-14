
-- Bucket for candidate_files.file_type in ('id_document','reference','other') — staff-only, no client visibility
insert into storage.buckets (id, name, public)
values ('candidate-documents', 'candidate-documents', false)
on conflict (id) do nothing;

create policy "candidate_documents_staff_all"
on storage.objects
for all
using (bucket_id = 'candidate-documents' and is_staff())
with check (bucket_id = 'candidate-documents' and is_staff());
