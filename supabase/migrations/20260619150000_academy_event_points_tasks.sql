insert into public.points_activity_definitions (
  program_id,
  code,
  name,
  description,
  source_kind,
  is_active,
  metadata
)
select
  p.id,
  'check_in',
  'Check in',
  'Earn Academy points once every 4 hours by checking in while authenticated.',
  'system',
  true,
  jsonb_build_object(
    'cooldownHours', 4,
    'pointsAwarded', 0.2,
    'taskType', 'academy_check_in'
  )
from public.points_programs p
where p.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

insert into public.points_activity_definitions (
  program_id,
  code,
  name,
  description,
  source_kind,
  is_active,
  metadata
)
select
  p.id,
  'marketplace_order_matched_maker',
  'Marketplace order matched (maker)',
  'Earn Academy points when a MUSD marketplace match settles as the maker side.',
  'contract_event',
  true,
  jsonb_build_object(
    'domain', 'onchain',
    'mechanic', 'manual',
    'awardKind', 'static',
    'sourceKey', 'marketplace_orders_matched',
    'taskType', 'academy_marketplace_orders_matched',
    'role', 'maker'
  )
from public.points_programs p
where p.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

insert into public.points_activity_definitions (
  program_id,
  code,
  name,
  description,
  source_kind,
  is_active,
  metadata
)
select
  p.id,
  'marketplace_order_matched_taker',
  'Marketplace order matched (taker)',
  'Earn Academy points when a MUSD marketplace match settles as the taker side.',
  'contract_event',
  true,
  jsonb_build_object(
    'domain', 'onchain',
    'mechanic', 'manual',
    'awardKind', 'static',
    'sourceKey', 'marketplace_orders_matched',
    'taskType', 'academy_marketplace_orders_matched',
    'role', 'taker'
  )
from public.points_programs p
where p.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

insert into public.points_activity_definitions (
  program_id,
  code,
  name,
  description,
  source_kind,
  is_active,
  metadata
)
select
  p.id,
  'asset_fraction_rewards_claimed',
  'Asset fraction rewards claimed',
  'Earn Academy points when BTC or MEZO fraction rewards are claimed and valued in MUSD.',
  'contract_event',
  true,
  jsonb_build_object(
    'domain', 'onchain',
    'mechanic', 'manual',
    'awardKind', 'static',
    'sourceKey', 'asset_fraction_rewards_claimed',
    'taskType', 'academy_asset_fraction_rewards_claimed'
  )
from public.points_programs p
where p.slug = 'academy'
on conflict (program_id, code) do update set
  name = excluded.name,
  description = excluded.description,
  source_kind = excluded.source_kind,
  is_active = excluded.is_active,
  metadata = excluded.metadata;
