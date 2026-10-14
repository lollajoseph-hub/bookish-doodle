
-- The app's UI (CandidateForm, dashboard stats, candidate pool filters) has always assumed
-- status values new/screening/shortlisted/placed/archived, but the deployed enum only had
-- available/placed/inactive — meaning every "Add candidate" submit with the default status
-- ('new') was rejected by Postgres. Add the missing values (existing ones are left in place,
-- harmless if unused).
alter type candidate_status add value if not exists 'new';
alter type candidate_status add value if not exists 'screening';
alter type candidate_status add value if not exists 'shortlisted';
alter type candidate_status add value if not exists 'archived';

-- Mirror VetPod's availability_status enum (available / open_to_offers / not_available)
-- so we can surface a real "open to offers" signal on candidates, same as VetPod.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'availability_status') then
    create type availability_status as enum ('available', 'open_to_offers', 'not_available');
  end if;
end $$;

alter table public.candidates
  add column if not exists availability availability_status not null default 'available';
