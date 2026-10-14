
alter table public.client_requests
  add column priority text not null default 'normal'
  check (priority in ('normal', 'high', 'urgent'));
