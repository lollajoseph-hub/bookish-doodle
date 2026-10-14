-- CREATE OR REPLACE with a new parameter list creates an overload rather than replacing the
-- function (parameter types are part of a Postgres function's identity), so the OLD 3-arg
-- version (still hardcoding rejected_by='client', no rejection_count/notification safety net
-- change needed there since it already had that logic -- but it lacks the staff-aware v_by
-- fix) was still live and would keep being resolved for any 3-arg call. Drop it so there is
-- exactly one version and every caller -- 3-arg (Candidate Pool) or 4-arg (Dashboard) -- goes
-- through the corrected function.
drop function if exists public.reject_candidate_match(uuid, public.rejection_reason, text);
