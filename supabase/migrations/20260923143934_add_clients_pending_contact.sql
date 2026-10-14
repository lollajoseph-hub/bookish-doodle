alter table public.clients
  add column pending_contact jsonb;

comment on column public.clients.pending_contact is 'Primary contact details {first_name,last_name,email,position} awaiting invite — set when a new client''s standard request came back with zero matched candidates, so the invite is deferred until staff fixes that up. Cleared once admin-send-pending-client-invite runs.';
