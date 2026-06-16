CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address_normalized" text NOT NULL,
	"chain_id" bigint NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_wallet_address_normalized_lowercase" CHECK ("auth_challenges"."wallet_address_normalized" = lower("auth_challenges"."wallet_address_normalized"))
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address_normalized" text NOT NULL,
	"chain_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_sessions_wallet_address_normalized_lowercase" CHECK ("auth_sessions"."wallet_address_normalized" = lower("auth_sessions"."wallet_address_normalized"))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"wallet_address_normalized" text NOT NULL,
	"chain_id" bigint,
	"display_name" text,
	"avatar_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_wallet_address_normalized_unique" UNIQUE("wallet_address_normalized"),
	CONSTRAINT "users_wallet_address_normalized_lowercase" CHECK ("users"."wallet_address_normalized" = lower("users"."wallet_address_normalized"))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_wallet_address_normalized_idx" ON "auth_challenges" USING btree ("wallet_address_normalized");--> statement-breakpoint
CREATE INDEX "auth_challenges_wallet_nonce_idx" ON "auth_challenges" USING btree ("wallet_address_normalized","nonce");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_used_at_idx" ON "auth_challenges" USING btree ("used_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_wallet_address_normalized_idx" ON "auth_sessions" USING btree ("wallet_address_normalized");--> statement-breakpoint
CREATE INDEX "auth_sessions_chain_id_idx" ON "auth_sessions" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "users_chain_id_idx" ON "users" USING btree ("chain_id");