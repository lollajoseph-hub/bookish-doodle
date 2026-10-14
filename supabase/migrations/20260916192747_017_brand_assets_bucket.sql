insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

-- temporary: allow this one upload via anon key; tightened right after
create policy brand_assets_temp_anon_insert on storage.objects for insert
  with check (bucket_id = 'brand-assets');
