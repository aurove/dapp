import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const academyAssetFractionMetadata = pgTable(
  "academy_asset_fraction_metadata",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chainId: integer("chain_id").notNull(),
    fractionAddress: text("fraction_address").notNull(),
    trancheId: numeric("tranche_id", { precision: 78, scale: 0, mode: "string" }).notNull(),
    trancheNumber: integer("tranche_number").notNull(),
    assetVariant: text("asset_variant").notNull(),
    fractionName: text("fraction_name"),
    fractionSymbol: text("fraction_symbol"),
    veNft: text("ve_nft"),
    rewardAsset: text("reward_asset"),
    trancheDuration: numeric("tranche_duration", { precision: 78, scale: 0, mode: "string" }),
    source: text("source").notNull(),
    deploymentBlock: integer("deployment_block"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("academy_asset_fraction_metadata_fraction_address_lowercase", sql`${table.fractionAddress} = lower(${table.fractionAddress})`),
    check("academy_asset_fraction_metadata_asset_variant_valid", sql`${table.assetVariant} in ('veBTC', 'veMEZO')`),
    check(
      "academy_asset_fraction_metadata_tranche_number_valid",
      sql`${table.trancheNumber} between 1 and 208`,
    ),
    check(
      "academy_asset_fraction_metadata_source_valid",
      sql`${table.source} in ('deployment_event', 'database', 'derived_symbol', 'derived_ledger', 'runtime_registry', 'static_registry', 'onchain')`,
    ),
    uniqueIndex("academy_asset_fraction_metadata_chain_fraction_idx").on(
      table.chainId,
      table.fractionAddress,
    ),
    uniqueIndex("academy_asset_fraction_metadata_chain_tranche_idx").on(table.chainId, table.trancheId),
    index("academy_asset_fraction_metadata_chain_idx").on(table.chainId),
    index("academy_asset_fraction_metadata_chain_variant_idx").on(table.chainId, table.assetVariant),
    index("academy_asset_fraction_metadata_chain_deployment_idx").on(
      table.chainId,
      table.deploymentBlock,
    ),
  ],
);

export type AcademyAssetFractionMetadata = typeof academyAssetFractionMetadata.$inferSelect;
