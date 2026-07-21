update public.points_activity_definitions as activity
set is_active = false, updated_at = now()
from public.points_programs as program
where activity.program_id = program.id
  and program.slug = 'academy'
  and activity.code in (
    'check_in',
    'marketplace_order_matched_maker',
    'marketplace_order_matched_taker',
    'asset_fraction_rewards_claimed'
  );

insert into public.points_activity_definitions (
  program_id, code, name, description, source_kind, is_active, metadata
)
select
  program.id,
  'concentrated_liquidity_swap',
  'Aurove pool swap',
  'Earn 0.12% of the MUSD value supplied to a swap involving an Aurove-supported concentrated-liquidity pool.',
  'contract_event',
  true,
  jsonb_build_object(
    'domain', 'onchain',
    'sourceKey', 'aurove_concentrated_liquidity_swap',
    'taskType', 'academy_concentrated_liquidity_swap',
    'accountingUnit', 'MUSD',
    'rateNumerator', 12,
    'rateDenominator', 10000
  )
from public.points_programs as program
where program.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.points_activity_definitions (
  program_id, code, name, description, source_kind, is_active, metadata
)
select
  program.id,
  'concentrated_liquidity_fees_collected',
  'Aurove liquidity fees collected',
  'Earn 3.6 points per MUSD of actual fees collected from an Aurove-supported concentrated-liquidity position.',
  'contract_event',
  true,
  jsonb_build_object(
    'domain', 'onchain',
    'sourceKey', 'aurove_concentrated_liquidity_fees_collected',
    'taskType', 'academy_concentrated_liquidity_fees_collected',
    'accountingUnit', 'MUSD',
    'multiplierNumerator', 36,
    'multiplierDenominator', 10
  )
from public.points_programs as program
where program.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata,
  updated_at = now();

drop table if exists public.marketplace_price_observations;
drop table if exists public.academy_asset_fraction_metadata;
