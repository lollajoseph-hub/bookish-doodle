-- Replace the temporary public/anon-writable policy from migration 017 with
-- a proper staff-only write policy, matching every other bucket in this
-- project. The bucket itself stays public for read (logo needs to be
-- embeddable in emails), but writes now require is_staff() like everywhere else.
drop policy if exists brand_assets_temp_anon_insert on storage.objects;

create policy brand_assets_staff_write
on storage.objects
for all
to public
using (bucket_id = 'brand-assets' and is_staff())
with check (bucket_id = 'brand-assets' and is_staff());
