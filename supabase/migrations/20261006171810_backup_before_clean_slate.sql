-- Private copy of all app data taken before the 2026-10-06 clean-slate wipe.
-- Not exposed to the API. Drop with: drop schema backup_20261006 cascade;
create schema backup_20261006;
revoke all on schema backup_20261006 from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create table backup_20261006.%I as table public.%I', r.tablename, r.tablename);
  end loop;
end $$;

-- Accounts (no password hashes) and uploaded-file records.
create table backup_20261006.auth_users as
  select id, email, created_at, last_sign_in_at, raw_user_meta_data from auth.users;
create table backup_20261006.storage_objects as
  select id, bucket_id, name, metadata, created_at from storage.objects;
