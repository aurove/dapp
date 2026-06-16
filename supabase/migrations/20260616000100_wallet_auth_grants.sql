grant usage on schema public to service_role;

grant select, insert, update, delete on table public.users to service_role;
grant select, insert, update, delete on table public.auth_challenges to service_role;
grant select, insert, update, delete on table public.auth_sessions to service_role;
