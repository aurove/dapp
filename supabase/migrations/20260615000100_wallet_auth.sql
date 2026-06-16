create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  wallet_address_normalized text not null unique,
  chain_id bigint,
  display_name text,
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_wallet_address_normalized_lowercase check (
    wallet_address_normalized = lower(wallet_address_normalized)
  )
);

create index if not exists users_wallet_address_normalized_idx
  on public.users (wallet_address_normalized);

create index if not exists users_chain_id_idx
  on public.users (chain_id);

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
before update on public.users
for each row
execute function public.touch_updated_at();

create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet_address_normalized text not null,
  chain_id bigint not null,
  nonce text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_challenges_wallet_address_normalized_lowercase check (
    wallet_address_normalized = lower(wallet_address_normalized)
  )
);

create index if not exists auth_challenges_wallet_address_normalized_idx
  on public.auth_challenges (wallet_address_normalized);

create index if not exists auth_challenges_wallet_nonce_idx
  on public.auth_challenges (wallet_address_normalized, nonce);

create index if not exists auth_challenges_expires_at_idx
  on public.auth_challenges (expires_at);

create index if not exists auth_challenges_used_at_idx
  on public.auth_challenges (used_at);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  wallet_address_normalized text not null,
  chain_id bigint not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_sessions_wallet_address_normalized_lowercase check (
    wallet_address_normalized = lower(wallet_address_normalized)
  )
);

create index if not exists auth_sessions_user_id_idx
  on public.auth_sessions (user_id);

create index if not exists auth_sessions_wallet_address_normalized_idx
  on public.auth_sessions (wallet_address_normalized);

create index if not exists auth_sessions_chain_id_idx
  on public.auth_sessions (chain_id);

create index if not exists auth_sessions_expires_at_idx
  on public.auth_sessions (expires_at);

create index if not exists auth_sessions_revoked_at_idx
  on public.auth_sessions (revoked_at);

drop trigger if exists auth_sessions_touch_updated_at on public.auth_sessions;
create trigger auth_sessions_touch_updated_at
before update on public.auth_sessions
for each row
execute function public.touch_updated_at();

alter table public.users enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.auth_sessions enable row level security;

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
