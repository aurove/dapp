import { index, integer, pgTable, text, timestamp, uniqueIndex, numeric, uuid } from "drizzle-orm/pg-core";

export const marketplacePriceObservations = pgTable(
  "marketplace_price_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    chainId: integer("chain_id").notNull(),
    collection: text("collection").notNull(),
    tokenId: numeric("token_id", { precision: 78, scale: 0, mode: "string" }).notNull(),
    paymentToken: text("payment_token").notNull(),
    assetDecimals: integer("asset_decimals").notNull(),
    paymentTokenDecimals: integer("payment_token_decimals").notNull(),
    amountFilled: numeric("amount_filled", { precision: 78, scale: 0, mode: "string" }).notNull(),
    grossTradeValue: numeric("gross_trade_value", { precision: 78, scale: 0, mode: "string" }).notNull(),
    assetFee: numeric("asset_fee", { precision: 78, scale: 0, mode: "string" }).notNull(),
    paymentFee: numeric("payment_fee", { precision: 78, scale: 0, mode: "string" }).notNull(),
    pricePerUnit: numeric("price_per_unit", { precision: 78, scale: 0, mode: "string" }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("marketplace_price_observations_idempotency_key_idx").on(table.idempotencyKey),
    uniqueIndex("marketplace_price_observations_chain_tx_log_idx").on(
      table.chainId,
      table.txHash,
      table.logIndex,
    ),
    index("marketplace_price_observations_market_ts_idx").on(
      table.chainId,
      table.collection,
      table.tokenId,
      table.paymentToken,
      table.blockTimestamp,
    ),
    index("marketplace_price_observations_market_block_idx").on(
      table.chainId,
      table.collection,
      table.tokenId,
      table.paymentToken,
      table.blockNumber,
    ),
  ],
);

export type MarketplacePriceObservation = typeof marketplacePriceObservations.$inferSelect;
