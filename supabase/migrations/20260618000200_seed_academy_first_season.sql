insert into public.points_programs (
  slug,
  name,
  description,
  kind,
  status,
  starts_at,
  ends_at,
  archived_at,
  metadata
)
values (
  'academy',
  'Road to Mainnet',
  'The inaugural Aurove Academy season.',
  'season',
  'active',
  timestamp with time zone '2026-05-30T19:39:02Z',
  timestamp with time zone '2026-09-11T23:59:59.999Z',
  null,
  '{}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  kind = excluded.kind,
  status = excluded.status,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  archived_at = excluded.archived_at,
  metadata = excluded.metadata;
