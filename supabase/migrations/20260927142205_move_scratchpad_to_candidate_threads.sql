
-- Interview Prep Notes (formerly "Hiring Huddle Notes") now lives on candidate-level
-- threads instead of request-level threads, since interview prep is naturally scoped
-- to one specific candidate's interview, not the whole request.

drop policy thread_scratchpad_select on public.thread_scratchpad;
drop policy thread_scratchpad_upsert on public.thread_scratchpad;
drop policy thread_scratchpad_update on public.thread_scratchpad;

create policy thread_scratchpad_select on public.thread_scratchpad for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'candidate'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_scratchpad_upsert on public.thread_scratchpad for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'candidate'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_scratchpad_update on public.thread_scratchpad for update
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'candidate'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create or replace function public.update_thread_scratchpad(
  p_thread_id uuid,
  p_content text
) returns public.thread_scratchpad
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_result public.thread_scratchpad;
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
  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_scratchpad (thread_id, content, updated_by, updated_at)
    values (p_thread_id, p_content, auth.uid(), now())
  on conflict (thread_id) do update
    set content = excluded.content, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;
