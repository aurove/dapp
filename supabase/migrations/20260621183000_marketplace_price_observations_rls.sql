alter table public.marketplace_price_observations enable row level security;

drop policy if exists marketplace_price_observations_deny_all on public.marketplace_price_observations;
create policy marketplace_price_observations_deny_all on public.marketplace_price_observations
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert, update, delete on table public.marketplace_price_observations to service_role;
