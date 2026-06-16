alter table public.users enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.auth_sessions enable row level security;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row
execute function public.touch_updated_at();

drop trigger if exists auth_sessions_touch_updated_at on public.auth_sessions;
create trigger auth_sessions_touch_updated_at
before update on public.auth_sessions
for each row
execute function public.touch_updated_at();

drop policy if exists users_deny_all on public.users;
create policy users_deny_all on public.users
  for all
  to public
  using (false)
  with check (false);

drop policy if exists auth_challenges_deny_all on public.auth_challenges;
create policy auth_challenges_deny_all on public.auth_challenges
  for all
  to public
  using (false)
  with check (false);

drop policy if exists auth_sessions_deny_all on public.auth_sessions;
create policy auth_sessions_deny_all on public.auth_sessions
  for all
  to public
  using (false)
  with check (false);

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.users to service_role;
grant select, insert, update, delete on table public.auth_challenges to service_role;
grant select, insert, update, delete on table public.auth_sessions to service_role;
