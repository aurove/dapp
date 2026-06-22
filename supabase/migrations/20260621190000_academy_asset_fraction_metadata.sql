create table public.academy_asset_fraction_metadata (
  id uuid primary key default gen_random_uuid() not null,
  chain_id integer not null,
  fraction_address text not null,
  tranche_id numeric(78, 0) not null,
  tranche_number integer not null,
  asset_variant text not null,
  fraction_name text,
  fraction_symbol text,
  ve_nft text,
  reward_asset text,
  tranche_duration numeric(78, 0),
  source text not null,
  deployment_block integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_asset_fraction_metadata_fraction_address_lowercase check (fraction_address = lower(fraction_address)),
  constraint academy_asset_fraction_metadata_ve_nft_lowercase check (ve_nft is null or ve_nft = lower(ve_nft)),
  constraint academy_asset_fraction_metadata_reward_asset_lowercase check (reward_asset is null or reward_asset = lower(reward_asset)),
  constraint academy_asset_fraction_metadata_asset_variant_valid check (asset_variant in ('veBTC', 'veMEZO')),
  constraint academy_asset_fraction_metadata_tranche_number_valid check (tranche_number between 1 and 208),
  constraint academy_asset_fraction_metadata_source_valid check (source in ('deployment_event', 'database', 'derived_symbol', 'derived_ledger', 'runtime_registry', 'static_registry', 'onchain'))
);
--> statement-breakpoint
create unique index academy_asset_fraction_metadata_chain_fraction_idx
  on public.academy_asset_fraction_metadata using btree (chain_id, fraction_address);
--> statement-breakpoint
create unique index academy_asset_fraction_metadata_chain_tranche_idx
  on public.academy_asset_fraction_metadata using btree (chain_id, tranche_id);
--> statement-breakpoint
create index academy_asset_fraction_metadata_chain_idx
  on public.academy_asset_fraction_metadata using btree (chain_id);
--> statement-breakpoint
create index academy_asset_fraction_metadata_chain_variant_idx
  on public.academy_asset_fraction_metadata using btree (chain_id, asset_variant);
--> statement-breakpoint
create index academy_asset_fraction_metadata_chain_deployment_idx
  on public.academy_asset_fraction_metadata using btree (chain_id, deployment_block);
