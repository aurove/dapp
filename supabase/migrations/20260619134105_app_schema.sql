CREATE TABLE "marketplace_price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"chain_id" integer NOT NULL,
	"collection" text NOT NULL,
	"token_id" numeric(78, 0) NOT NULL,
	"tranche_id" numeric(78, 0),
	"payment_token" text NOT NULL,
	"asset_decimals" integer NOT NULL,
	"payment_token_decimals" integer NOT NULL,
	"amount_filled" numeric(78, 0) NOT NULL,
	"gross_trade_value" numeric(78, 0) NOT NULL,
	"asset_fee" numeric(78, 0) NOT NULL,
	"payment_fee" numeric(78, 0) NOT NULL,
	"price_per_unit" numeric(78, 0) NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" integer NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_price_observations_idempotency_key_idx" ON "marketplace_price_observations" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_price_observations_chain_tx_log_idx" ON "marketplace_price_observations" USING btree ("chain_id","tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX "marketplace_price_observations_market_ts_idx" ON "marketplace_price_observations" USING btree ("chain_id","collection","token_id","payment_token","block_timestamp");
--> statement-breakpoint
CREATE INDEX "marketplace_price_observations_market_block_idx" ON "marketplace_price_observations" USING btree ("chain_id","collection","token_id","payment_token","block_number");
