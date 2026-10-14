create or replace function public.admin_staff_signin_status()
returns table (user_id uuid, confirmed boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Forbidden: admin only';
  end if;

  return query
    select p.id as user_id, (u.email_confirmed_at is not null) as confirmed
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role in ('admin', 'recruiter');
end;
$$;

revoke all on function public.admin_staff_signin_status() from public;
grant execute on function public.admin_staff_signin_status() to authenticated;
