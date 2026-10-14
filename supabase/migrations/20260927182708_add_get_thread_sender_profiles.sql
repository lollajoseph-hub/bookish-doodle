create or replace function public.get_thread_sender_profiles(p_thread_id uuid)
returns table(id uuid, full_name text, role text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role
  from profiles p
  where p.id in (
    select distinct tm.sender_id
    from thread_messages tm
    where tm.thread_id = p_thread_id
      and tm.sender_role = 'staff'
      and tm.sender_id is not null
  )
  and (
    is_staff()
    or exists (
      select 1
      from threads t
      join client_members cm on cm.client_id = t.client_id
      where t.id = p_thread_id
        and cm.profile_id = auth.uid()
    )
  );
$$;

grant execute on function public.get_thread_sender_profiles(uuid) to authenticated;
