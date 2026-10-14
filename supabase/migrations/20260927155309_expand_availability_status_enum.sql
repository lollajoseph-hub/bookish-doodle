-- Block 3 / #4: live availability. candidates.availability (availability_status enum) already
-- exists with 3 values (available, open_to_offers, not_available) -- this is the right column
-- to extend rather than a new one. Rename the two generic labels to clearer client-facing
-- language and add the richer states Lola asked for.
alter type public.availability_status rename value 'available' to 'available_now';
alter type public.availability_status rename value 'not_available' to 'off_market';
alter type public.availability_status add value 'available_from';
alter type public.availability_status add value 'interviewing';
alter type public.availability_status add value 'closing_next_week';
alter type public.availability_status add value 'exploring';
