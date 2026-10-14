-- Append-only Interview Prep Notes log: each entry keeps its author and timestamp,
-- replacing the old single-blob, last-write-wins thread_scratchpad.
create table public.thread_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index thread_notes_thread_id_created_at_idx on public.thread_notes(thread_id, created_at);
alter table public.thread_notes enable row level security;

create policy thread_notes_select on public.thread_notes
for select
using (
  exists (
    select 1 from public.threads t
    where t.id = thread_notes.thread_id
      and (public.is_staff() or t.client_id in (select public.client_ids_for_profile(auth.uid())))
  )
);

create or replace function public.add_thread_note(p_thread_id uuid, p_body text)
returns public.thread_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.thread_notes;
  v_kind text;
  v_client_id uuid;
begin
  select kind, client_id into v_kind, v_client_id from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;
  if v_kind <> 'candidate' then
    raise exception 'Interview Prep Notes are only available on candidate threads';
  end if;
  if trim(coalesce(p_body, '')) = '' then
    raise exception 'Note cannot be empty';
  end if;
  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_notes (thread_id, author_id, body)
  values (p_thread_id, auth.uid(), p_body)
  returning * into v_result;
  return v_result;
end;
$$;

grant execute on function public.add_thread_note(uuid, text) to authenticated;

create or replace function public.get_thread_note_authors(p_thread_id uuid)
returns table(id uuid, full_name text, role text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role
  from profiles p
  where p.id in (
    select distinct tn.author_id from thread_notes tn where tn.thread_id = p_thread_id
  )
  and (
    is_staff()
    or exists (
      select 1 from threads t
      where t.id = p_thread_id
        and t.client_id in (select client_ids_for_profile(auth.uid()))
    )
  );
$$;

grant execute on function public.get_thread_note_authors(uuid) to authenticated;
