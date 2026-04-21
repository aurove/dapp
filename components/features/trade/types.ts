export type TradeAssetCategory = "locked" | "liquid" | "yield";

export type TradeAsset = {
  id: string;
  name: string;
  symbol: string;
  thumbnail: string;
  priceUsd: number;
  volume24hUsd?: number;
  change24hPct?: number;
  category: TradeAssetCategory;
};

export type TradeSortOption =
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc"
  | "change_desc"
  | "change_asc";

export type TradeChangeFilter = "all" | "gainers" | "losers";

export type TradeVeAssetType = "veBTC" | "veMEZO";

export type CreateVeTradeListingInput = {
  veAssetType: TradeVeAssetType;
  veNftAddress: `0x${string}`;
  veNftTokenId: bigint;
  listAmount: string;
  paymentToken: `0x${string}`;
  paymentTokenDecimals: number;
  unitPriceUsd: string;
  expiryDays: number;
  requiresVeNftApproval?: boolean;
  requiresListingOperatorApproval?: boolean;
  requiresFractionTransferApproval?: boolean;
};
