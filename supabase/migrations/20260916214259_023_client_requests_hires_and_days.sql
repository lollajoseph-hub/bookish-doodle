alter table public.client_requests
  add column hires_needed integer not null default 1,
  add column days_of_week_needed text[];

comment on column public.client_requests.hires_needed is 'How many people the client is hiring for this role — distinct from candidates_wanted (the review-batch size).';
comment on column public.client_requests.days_of_week_needed is 'Days of the week the role needs coverage, e.g. {Mon,Tue,Wed,Thu,Fri}.';
