export type EarnAssetKey = "BTC" | "MEZO";
export type EarnAssetVariant = "veBTC" | "veMEZO";

export type EarnAssetDefinition = {
  key: EarnAssetKey;
  variant: EarnAssetVariant;
  slug: "btc" | "mezo";
  productSymbol: "avBTCm" | "avMEZOm";
  depositAsset: "BTC" | "MEZO";
  title: string;
  description: string;
  marks: readonly string[];
};

export const EARN_ASSETS: readonly EarnAssetDefinition[] = [
  {
    key: "BTC",
    variant: "veBTC",
    slug: "btc",
    productSymbol: "avBTCm",
    depositAsset: "BTC",
    title: "avBTCm",
    description: "Deposit BTC or an existing veBTC position.",
    marks: ["BTC", "Aurove"],
  },
  {
    key: "MEZO",
    variant: "veMEZO",
    slug: "mezo",
    productSymbol: "avMEZOm",
    depositAsset: "MEZO",
    title: "avMEZOm",
    description: "Deposit MEZO or an existing veMEZO position.",
    marks: ["MEZO", "Aurove"],
  },
];

const ASSETS_BY_KEY = Object.fromEntries(EARN_ASSETS.map((asset) => [asset.key, asset])) as Record<
  EarnAssetKey,
  EarnAssetDefinition
>;

export function resolveEarnAssetKey(asset: string): EarnAssetKey | null {
  const key = asset.toUpperCase();
  if (key === "BTC" || key === "MEZO") return key;
  return null;
}

export type CreatePositionMode = "erc20" | "venft";

export function earnStakePath(asset: EarnAssetKey, mode: CreatePositionMode = "venft"): string {
  const path = `/earn/stake/${asset.toLowerCase()}`;
  return mode === "erc20" ? `${path}?mode=lock` : path;
}

export function resolveCreatePositionMode(mode: string | null | undefined): CreatePositionMode {
  return mode === "lock" || mode === "erc20" ? "erc20" : "venft";
}

export function earnVariantFromAsset(asset: EarnAssetKey): EarnAssetVariant {
  return ASSETS_BY_KEY[asset].variant;
}

export function earnAssetFromVariant(variant: EarnAssetVariant): EarnAssetKey {
  return variant === "veBTC" ? "BTC" : "MEZO";
}

export function earnAssetDefinition(asset: EarnAssetKey): EarnAssetDefinition {
  return ASSETS_BY_KEY[asset];
}

export function selectEarnUserPositions<
  T extends { userBalanceRaw: bigint; id20BalanceRaw: bigint },
>(products: readonly T[]): T[] {
  return products.filter((product) => product.userBalanceRaw > 0n || product.id20BalanceRaw > 0n);
}
