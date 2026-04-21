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
  listingId?: bigint;
  paymentToken?: `0x${string}`;
  paymentTokenSymbol?: string;
  amountRemaining?: number;
  expiry?: number;
  seller?: `0x${string}`;
};

export type TradeMarketState = "active" | "illiquid" | "expired";

export type TradeMarketBase = "veBTC" | "veMEZO" | "veAsset";

export type TradeMarketListingPreview = {
  listingId: bigint;
  seller: `0x${string}`;
  amount: number;
  price: number;
  expiry: number;
};

export type TradeMarket = {
  id: string;
  pair: string;
  fractionSymbol: string;
  fractionAddress: `0x${string}`;
  trancheId: bigint;
  fractionBase: TradeMarketBase;
  paymentToken: `0x${string}`;
  paymentTokenSymbol: string;
  paymentTokenDecimals: number;
  state: TradeMarketState;
  totalListedSupply: number;
  quoteLiquidity: number;
  floorPrice: number | null;
  bestPrice: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  activeListings: number;
  expiredListings: number;
  recentActivity: number;
  lastActivityAt: number | null;
  userPosition: number;
  hasUserPosition: boolean;
  topListings: TradeMarketListingPreview[];
};

export type TradeMarketSortOption =
  | "liquidity_desc"
  | "liquidity_asc"
  | "price_asc"
  | "price_desc"
  | "activity_desc"
  | "activity_asc";

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
