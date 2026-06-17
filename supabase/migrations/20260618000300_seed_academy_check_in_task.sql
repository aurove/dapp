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
    'pointsAwarded', 2,
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
