delete from public.profiles where id = (select id from auth.users where lower(email) = 'gui@scalesource.com');
delete from auth.users where lower(email) = 'gui@scalesource.com';
