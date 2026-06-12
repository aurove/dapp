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
  amountRaw: bigint;
  listedAmount: number;
  listedAmountRaw: bigint;
  sellerBalanceRaw: bigint | null;
  isInventoryStale: boolean;
  price: number;
  priceRaw: bigint;
  expiry: number;
};

export type TradeMarketBidPreview = {
  bidId: bigint;
  bidder: `0x${string}`;
  amount: number;
  amountRaw: bigint;
  requestedAmount: number;
  requestedAmountRaw: bigint;
  bidderPaymentBalanceRaw: bigint | null;
  bidderPaymentAllowanceRaw: bigint | null;
  isFundingStale: boolean;
  price: number;
  priceRaw: bigint;
  expiry: number;
};

export type TradeMarket = {
  id: string;
  pair: string;
  fractionName: string;
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
  quoteDemand: number;
  floorPrice: number | null;
  bestBidPrice: number | null;
  bestPrice: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  activeListings: number;
  expiredListings: number;
  activeBids: number;
  expiredBids: number;
  recentActivity: number;
  lastActivityAt: number | null;
  chainTimestamp: number | null;
  userPosition: number;
  hasUserPosition: boolean;
  topListings: TradeMarketListingPreview[];
  topBids: TradeMarketBidPreview[];
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
  unitPrice: string;
  expiryMode: "timed" | "none";
  expiryDays: number;
  requiresVeNftApproval?: boolean;
  requiresFractionTransferApproval?: boolean;
};

export type CreateFractionTradeListingInput = {
  trancheId: bigint;
  listAmount: string;
  paymentToken: `0x${string}`;
  paymentTokenDecimals: number;
  unitPrice: string;
  expiryMode: "timed" | "none";
  expiryDays: number;
  requiresFractionTransferApproval?: boolean;
};

export type CreateTradeBidInput = {
  collection: `0x${string}`;
  tokenId: bigint;
  bidAmountRaw: bigint;
  bidAmount: string;
  paymentToken: `0x${string}`;
  paymentTokenSymbol: string;
  paymentTokenDecimals: number;
  bidPriceRaw: bigint;
  unitPrice: string;
  requiredPaymentRaw: bigint;
  expiryMode: "timed" | "none";
  expiryDays: number;
  requiresPaymentApproval?: boolean;
};
