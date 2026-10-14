
-- Revert the free-text must-have column: skills need to stay structured (skill IDs)
-- so they keep feeding rank_and_match(). The actual fix for "we can't enumerate every
-- skill in a dropdown" is a creatable tag input backed by this resolve-or-create RPC,
-- not free text.
alter table public.client_requests drop column if exists must_have_skills_text;

create or replace function public.resolve_or_create_skills(p_names text[])
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_cleaned text[];
begin
  select array_agg(distinct trim(n)) into v_cleaned
  from unnest(p_names) as n
  where trim(n) <> '';

  if v_cleaned is null then
    return v_ids;
  end if;

  foreach v_name in array v_cleaned loop
    -- Reuse an existing skill regardless of category (so a client typing "QuickBooks"
    -- reconnects to the same skill candidates already have tagged from resume
    -- extraction, instead of forking a duplicate under a new category).
    select id into v_id from public.skills where lower(name) = lower(v_name) limit 1;
    if v_id is null then
      insert into public.skills (name, category) values (v_name, 'Other') returning id into v_id;
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$$;

comment on function public.resolve_or_create_skills(text[]) is
  'Given free-typed skill names, returns their skill IDs - reusing an existing catalog entry (any category, case-insensitive) or creating a new one under category=Other. Lets clients type must-have skills freely while keeping matching structured/ID-based.';

grant execute on function public.resolve_or_create_skills(text[]) to anon, authenticated;
