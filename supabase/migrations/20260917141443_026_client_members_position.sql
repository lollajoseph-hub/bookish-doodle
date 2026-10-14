alter table public.client_members
  add column client_position text;

comment on column public.client_members.client_position is 'Free-text job title of this person at the client company (e.g. "Operations Manager") - the "rank" field confirmed 17 Sept, self-declared by the person, display-only, no permission implications. Named to match VetPod''s equivalent clinic_members.clinic_position.';
