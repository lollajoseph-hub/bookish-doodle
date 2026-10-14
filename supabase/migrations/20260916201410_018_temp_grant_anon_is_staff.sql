-- Temporary: allow anon role to execute is_staff() so the brand-assets bootstrap
-- upload's RLS check can evaluate without erroring on other ALL-command bucket
-- policies that also reference is_staff() (AND short-circuit order is not
-- guaranteed by Postgres). This will be reverted immediately after the
-- one-time logo upload completes.
grant execute on function public.is_staff() to anon;
