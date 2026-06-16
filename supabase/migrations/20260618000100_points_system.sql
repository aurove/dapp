create type "points_program_kind" as enum ('season', 'campaign', 'evergreen');
--> statement-breakpoint
create type "points_program_status" as enum ('draft', 'scheduled', 'active', 'paused', 'ended', 'archived');
--> statement-breakpoint
create type "points_source_kind" as enum ('manual', 'contract_event', 'system', 'import', 'adjustment');
--> statement-breakpoint
CREATE TABLE "points_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "points_program_kind" DEFAULT 'season' NOT NULL,
	"status" "points_program_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_programs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "points_programs_slug_not_empty" CHECK (btrim("slug") <> ''),
	CONSTRAINT "points_programs_slug_lowercase" CHECK ("slug" = lower("slug")),
	CONSTRAINT "points_programs_name_not_empty" CHECK (btrim("name") <> ''),
	CONSTRAINT "points_programs_date_range_valid" CHECK ("ends_at" is null or "starts_at" is null or "ends_at" >= "starts_at"),
	CONSTRAINT "points_programs_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "points_activity_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_kind" "points_source_kind" DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_activity_definitions_code_not_empty" CHECK (btrim("code") <> ''),
	CONSTRAINT "points_activity_definitions_code_lowercase" CHECK ("code" = lower("code")),
	CONSTRAINT "points_activity_definitions_name_not_empty" CHECK (btrim("name") <> ''),
	CONSTRAINT "points_activity_definitions_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "points_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"activity_definition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_kind" "points_source_kind" NOT NULL,
	"source_reference" text,
	"source_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"points_delta" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_entries_idempotency_key_not_empty" CHECK (btrim("idempotency_key") <> ''),
	CONSTRAINT "points_ledger_entries_points_delta_nonzero" CHECK ("points_delta" <> 0),
	CONSTRAINT "points_ledger_entries_source_details_is_object" CHECK (jsonb_typeof("source_details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "points_user_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"current_points" bigint DEFAULT 0 NOT NULL,
	"lifetime_earned_points" bigint DEFAULT 0 NOT NULL,
	"lifetime_spent_points" bigint DEFAULT 0 NOT NULL,
	"entry_count" bigint DEFAULT 0 NOT NULL,
	"first_activity_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_user_balances_totals_non_negative" CHECK ("lifetime_earned_points" >= 0 and "lifetime_spent_points" >= 0 and "entry_count" >= 0),
	CONSTRAINT "points_user_balances_current_points_consistent" CHECK ("current_points" = "lifetime_earned_points" - "lifetime_spent_points")
);
--> statement-breakpoint
ALTER TABLE "points_activity_definitions" ADD CONSTRAINT "points_activity_definitions_program_id_points_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."points_programs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "points_ledger_entries" ADD CONSTRAINT "points_ledger_entries_program_id_points_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."points_programs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "points_ledger_entries" ADD CONSTRAINT "points_ledger_entries_activity_definition_id_points_activity_definitions_id_fk" FOREIGN KEY ("activity_definition_id") REFERENCES "public"."points_activity_definitions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "points_ledger_entries" ADD CONSTRAINT "points_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "points_user_balances" ADD CONSTRAINT "points_user_balances_program_id_points_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."points_programs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "points_user_balances" ADD CONSTRAINT "points_user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "points_activity_definitions_program_code_idx" ON "points_activity_definitions" USING btree ("program_id","code");
--> statement-breakpoint
CREATE INDEX "points_activity_definitions_program_active_idx" ON "points_activity_definitions" USING btree ("program_id","is_active");
--> statement-breakpoint
CREATE INDEX "points_activity_definitions_source_kind_idx" ON "points_activity_definitions" USING btree ("source_kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_entries_idempotency_key_idx" ON "points_ledger_entries" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "points_ledger_entries_program_user_occurred_idx" ON "points_ledger_entries" USING btree ("program_id","user_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX "points_ledger_entries_program_activity_occurred_idx" ON "points_ledger_entries" USING btree ("program_id","activity_definition_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX "points_ledger_entries_program_occurred_idx" ON "points_ledger_entries" USING btree ("program_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX "points_ledger_entries_source_lookup_idx" ON "points_ledger_entries" USING btree ("source_kind","source_reference");
--> statement-breakpoint
CREATE UNIQUE INDEX "points_user_balances_program_user_idx" ON "points_user_balances" USING btree ("program_id","user_id");
--> statement-breakpoint
CREATE INDEX "points_user_balances_program_points_rank_idx" ON "points_user_balances" USING btree ("program_id","current_points" DESC,"last_activity_at","user_id");
--> statement-breakpoint
CREATE INDEX "points_user_balances_user_program_idx" ON "points_user_balances" USING btree ("user_id","program_id");
--> statement-breakpoint
CREATE INDEX "points_user_balances_program_last_activity_idx" ON "points_user_balances" USING btree ("program_id","last_activity_at");
--> statement-breakpoint
CREATE INDEX "points_programs_status_idx" ON "points_programs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "points_programs_kind_idx" ON "points_programs" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX "points_programs_active_window_idx" ON "points_programs" USING btree ("starts_at","ends_at");
--> statement-breakpoint
ALTER TABLE "points_programs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "points_activity_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "points_ledger_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "points_user_balances" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
drop trigger if exists points_programs_touch_updated_at on public.points_programs;
--> statement-breakpoint
create trigger points_programs_touch_updated_at
before update on public.points_programs
for each row
execute function public.touch_updated_at();
--> statement-breakpoint
drop trigger if exists points_activity_definitions_touch_updated_at on public.points_activity_definitions;
--> statement-breakpoint
create trigger points_activity_definitions_touch_updated_at
before update on public.points_activity_definitions
for each row
execute function public.touch_updated_at();
--> statement-breakpoint
create or replace function public.apply_points_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  earned_delta bigint;
  spent_delta bigint;
begin
  earned_delta := greatest(coalesce(new.points_delta, 0), 0);
  spent_delta := greatest(-coalesce(new.points_delta, 0), 0);

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
--> statement-breakpoint
drop trigger if exists points_ledger_entries_apply_balance_rollup on public.points_ledger_entries;
--> statement-breakpoint
create trigger points_ledger_entries_apply_balance_rollup
after insert on public.points_ledger_entries
for each row
execute function public.apply_points_ledger_entry();
--> statement-breakpoint
drop policy if exists points_programs_deny_all on public.points_programs;
--> statement-breakpoint
create policy points_programs_deny_all on public.points_programs
  for all
  to public
  using (false)
  with check (false);
--> statement-breakpoint
drop policy if exists points_activity_definitions_deny_all on public.points_activity_definitions;
--> statement-breakpoint
create policy points_activity_definitions_deny_all on public.points_activity_definitions
  for all
  to public
  using (false)
  with check (false);
--> statement-breakpoint
drop policy if exists points_ledger_entries_deny_all on public.points_ledger_entries;
--> statement-breakpoint
create policy points_ledger_entries_deny_all on public.points_ledger_entries
  for all
  to public
  using (false)
  with check (false);
--> statement-breakpoint
drop policy if exists points_user_balances_deny_all on public.points_user_balances;
--> statement-breakpoint
create policy points_user_balances_deny_all on public.points_user_balances
  for all
  to public
  using (false)
  with check (false);
--> statement-breakpoint
drop view if exists public.points_program_leaderboard;
--> statement-breakpoint
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
  u.display_name,
  u.avatar_url,
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
--> statement-breakpoint
drop view if exists public.points_activity_feed;
--> statement-breakpoint
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
  u.display_name,
  u.avatar_url,
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
--> statement-breakpoint
grant usage on schema public to service_role;
--> statement-breakpoint
grant select, insert, update, delete on table public.points_programs to service_role;
--> statement-breakpoint
grant select, insert, update, delete on table public.points_activity_definitions to service_role;
--> statement-breakpoint
grant select, insert on table public.points_ledger_entries to service_role;
--> statement-breakpoint
grant select on table public.points_user_balances to service_role;
--> statement-breakpoint
grant select on table public.points_program_leaderboard to service_role;
--> statement-breakpoint
grant select on table public.points_activity_feed to service_role;
