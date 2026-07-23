-- Remove Academy awards produced by two avBTCm swaps that were valued through
-- the drained MUSD/avBTCm pool at its minimum tick. Match the economic event's
-- base source reference so user, direct-referral, and grand-referral splits are
-- all repaired together.
delete from public.points_ledger_entries
where source_details ->> 'sourceReference' in (
  '31611:0x981796f73be6e578ba005447bdc93270b39d3a20b3799d70c412ff463d7db7d0:swap',
  '31611:0x1e05a81d49ae9ad117011b9584d1a26e388248c3e374f42063dd155ba472a7eb:swap'
);

-- The ledger trigger rolls balances forward on insert only. Rebuild every
-- materialized balance from the surviving ledger entries so current points,
-- lifetime totals, counts, timestamps, and leaderboard ranks agree.
with rollup as (
  select
    program_id,
    user_id,
    sum(points_delta)::numeric(78,18) as current_points,
    sum(greatest(points_delta, 0::numeric(78,18)))::numeric(78,18) as lifetime_earned_points,
    sum(greatest(-points_delta, 0::numeric(78,18)))::numeric(78,18) as lifetime_spent_points,
    count(*)::bigint as entry_count,
    min(occurred_at) as first_activity_at,
    max(occurred_at) as last_activity_at
  from public.points_ledger_entries
  group by program_id, user_id
)
update public.points_user_balances as balance
set
  current_points = rollup.current_points,
  lifetime_earned_points = rollup.lifetime_earned_points,
  lifetime_spent_points = rollup.lifetime_spent_points,
  entry_count = rollup.entry_count,
  first_activity_at = rollup.first_activity_at,
  last_activity_at = rollup.last_activity_at,
  updated_at = now()
from rollup
where balance.program_id = rollup.program_id
  and balance.user_id = rollup.user_id;

delete from public.points_user_balances as balance
where not exists (
  select 1
  from public.points_ledger_entries as entry
  where entry.program_id = balance.program_id
    and entry.user_id = balance.user_id
);

insert into public.points_user_balances (
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
select
  entry.program_id,
  entry.user_id,
  sum(entry.points_delta)::numeric(78,18),
  sum(greatest(entry.points_delta, 0::numeric(78,18)))::numeric(78,18),
  sum(greatest(-entry.points_delta, 0::numeric(78,18)))::numeric(78,18),
  count(*)::bigint,
  min(entry.occurred_at),
  max(entry.occurred_at),
  now(),
  now()
from public.points_ledger_entries as entry
where not exists (
  select 1
  from public.points_user_balances as balance
  where balance.program_id = entry.program_id
    and balance.user_id = entry.user_id
)
group by entry.program_id, entry.user_id;
