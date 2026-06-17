drop view if exists public.points_activity_feed;
drop view if exists public.points_program_leaderboard;

alter table public.points_ledger_entries
  alter column points_delta type numeric(18,4) using points_delta::numeric(18,4);

alter table public.points_ledger_entries
  alter column points_delta set default null;

alter table public.points_user_balances
  alter column current_points type numeric(18,4) using current_points::numeric(18,4),
  alter column lifetime_earned_points type numeric(18,4) using lifetime_earned_points::numeric(18,4),
  alter column lifetime_spent_points type numeric(18,4) using lifetime_spent_points::numeric(18,4);

alter table public.points_user_balances
  alter column current_points set default 0.0000,
  alter column lifetime_earned_points set default 0.0000,
  alter column lifetime_spent_points set default 0.0000;

create table if not exists public.academy_referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  chain_id bigint not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_referral_codes_ref_id_not_empty check (btrim(ref_id) <> ''),
  constraint academy_referral_codes_ref_id_length check (char_length(ref_id) = 8),
  constraint academy_referral_codes_ref_id_charset check (ref_id ~ '^[A-Za-z0-9_-]+$'),
  constraint academy_referral_codes_chain_positive check (chain_id > 0)
);

create unique index if not exists academy_referral_codes_user_chain_idx
  on public.academy_referral_codes using btree (user_id, chain_id);

create unique index if not exists academy_referral_codes_ref_id_idx
  on public.academy_referral_codes using btree (ref_id);

create index if not exists academy_referral_codes_chain_idx
  on public.academy_referral_codes using btree (chain_id);

create table if not exists public.academy_referral_relationships (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.users(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  chain_id bigint not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  constraint academy_referral_relationships_not_self_referral check (referred_user_id <> referrer_user_id),
  constraint academy_referral_relationships_ref_id_not_empty check (btrim(ref_id) <> ''),
  constraint academy_referral_relationships_ref_id_length check (char_length(ref_id) = 8),
  constraint academy_referral_relationships_chain_positive check (chain_id > 0)
);

create unique index if not exists academy_referral_relationships_referred_chain_idx
  on public.academy_referral_relationships using btree (referred_user_id, chain_id);

create index if not exists academy_referral_relationships_referrer_chain_idx
  on public.academy_referral_relationships using btree (referrer_user_id, chain_id);

create index if not exists academy_referral_relationships_chain_idx
  on public.academy_referral_relationships using btree (chain_id);

create index if not exists academy_referral_relationships_ref_id_idx
  on public.academy_referral_relationships using btree (ref_id);

alter table public.academy_referral_codes enable row level security;
alter table public.academy_referral_relationships enable row level security;

drop policy if exists academy_referral_codes_deny_all on public.academy_referral_codes;
create policy academy_referral_codes_deny_all on public.academy_referral_codes
  as restrictive
  for all
  to public
  using (false)
  with check (false);

drop policy if exists academy_referral_relationships_deny_all on public.academy_referral_relationships;
create policy academy_referral_relationships_deny_all on public.academy_referral_relationships
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert, update, delete on table public.academy_referral_codes to service_role;
grant select, insert, update, delete on table public.academy_referral_relationships to service_role;

create or replace function public.apply_points_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  earned_delta numeric(18,4);
  spent_delta numeric(18,4);
begin
  earned_delta := greatest(coalesce(new.points_delta, 0::numeric), 0::numeric);
  spent_delta := greatest(-coalesce(new.points_delta, 0::numeric), 0::numeric);

  insert into public.points_user_balances as target (
    program_id,
    user_id,
    current_points,
    lifetime_earned_points,
    lifetime_spent_points,
    entry_count,
    first_activity_at,
    last_activity_at,
    created_at,
    updated_at
  )
  values (
    new.program_id,
    new.user_id,
    new.points_delta,
    earned_delta,
    spent_delta,
    1,
    new.occurred_at,
    new.occurred_at,
    now(),
    now()
  )
  on conflict (program_id, user_id)
  do update set
    current_points = target.current_points + excluded.current_points,
    lifetime_earned_points = target.lifetime_earned_points + excluded.lifetime_earned_points,
    lifetime_spent_points = target.lifetime_spent_points + excluded.lifetime_spent_points,
    entry_count = target.entry_count + excluded.entry_count,
    first_activity_at = case
      when target.first_activity_at is null then excluded.first_activity_at
      when excluded.first_activity_at is null then target.first_activity_at
      when excluded.first_activity_at < target.first_activity_at then excluded.first_activity_at
      else target.first_activity_at
    end,
    last_activity_at = case
      when target.last_activity_at is null then excluded.last_activity_at
      when excluded.last_activity_at is null then target.last_activity_at
      when excluded.last_activity_at > target.last_activity_at then excluded.last_activity_at
      else target.last_activity_at
    end,
    updated_at = now();

  return new;
end;
$$;

create view public.points_program_leaderboard as
select
  b.program_id,
  p.slug as program_slug,
  p.name as program_name,
  p.kind as program_kind,
  p.status as program_status,
  b.user_id,
  u.wallet_address,
  u.wallet_address_normalized,
  b.current_points,
  b.lifetime_earned_points,
  b.lifetime_spent_points,
  b.entry_count,
  b.first_activity_at,
  b.last_activity_at,
  row_number() over (
    partition by b.program_id
    order by b.current_points desc, b.last_activity_at asc nulls last, b.user_id asc
  ) as leaderboard_rank
from public.points_user_balances b
join public.points_programs p on p.id = b.program_id
join public.users u on u.id = b.user_id;

create view public.points_activity_feed as
select
  l.id,
  l.program_id,
  p.slug as program_slug,
  p.name as program_name,
  l.activity_definition_id,
  a.code as activity_code,
  a.name as activity_name,
  l.user_id,
  u.wallet_address,
  u.wallet_address_normalized,
  l.source_kind,
  l.source_reference,
  l.source_details,
  l.points_delta,
  l.occurred_at,
  l.recorded_at
from public.points_ledger_entries l
join public.points_programs p on p.id = l.program_id
join public.points_activity_definitions a on a.id = l.activity_definition_id
join public.users u on u.id = l.user_id;
