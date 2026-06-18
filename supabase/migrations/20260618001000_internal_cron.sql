CREATE TABLE "cron_handler_states" (
	"handler_key" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cron_handler_states_handler_key_not_empty" CHECK (btrim("handler_key") <> '')
);
--> statement-breakpoint
CREATE INDEX "cron_handler_states_locked_until_idx" ON "cron_handler_states" USING btree ("locked_until");
--> statement-breakpoint
CREATE INDEX "cron_handler_states_last_started_at_idx" ON "cron_handler_states" USING btree ("last_started_at");
--> statement-breakpoint
ALTER TABLE "cron_handler_states" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
drop trigger if exists cron_handler_states_touch_updated_at on public.cron_handler_states;
--> statement-breakpoint
create trigger cron_handler_states_touch_updated_at
before update on public.cron_handler_states
for each row
execute function public.touch_updated_at();
--> statement-breakpoint
drop policy if exists cron_handler_states_deny_all on public.cron_handler_states;
--> statement-breakpoint
create policy cron_handler_states_deny_all on public.cron_handler_states
  for all
  to public
  using (false)
  with check (false);
--> statement-breakpoint
grant select, insert, update, delete on table public.cron_handler_states to service_role;
