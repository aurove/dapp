export type SwapAssetKind = "venft" | "erc1155" | "erc20";

export type MockSwapAsset = {
  id: string;
  name: string;
  symbol: string;
  kind: SwapAssetKind;
  descriptor: string;
  balanceLabel: string;
  priceUsd: number;
  liquidityUsd: number;
  routeHint: string;
};

export const mockSwapAssets: MockSwapAsset[] = [
  {
    id: "venft-btc-1042",
    name: "Mezo Earn veBTC #1042",
    symbol: "veBTC-1042",
    kind: "venft",
    descriptor: "veNFT position",
    balanceLabel: "1 position",
    priceUsd: 72400,
    liquidityUsd: 1840000,
    routeHint: "Locked BTC exposure",
  },
  {
    id: "venft-mezo-219",
    name: "Mezo Earn veMEZO #219",
    symbol: "veMEZO-219",
    kind: "venft",
    descriptor: "veNFT position",
    balanceLabel: "1 position",
    priceUsd: 18150,
    liquidityUsd: 940000,
    routeHint: "Locked MEZO exposure",
  },
  {
    id: "erc1155-avbtc-w13",
    name: "Aurove BTC Week 13",
    symbol: "avBTCw13",
    kind: "erc1155",
    descriptor: "ERC1155 fraction",
    balanceLabel: "8.42 fractions",
    priceUsd: 7050,
    liquidityUsd: 1260000,
    routeHint: "Fractional Earn tranche",
  },
  {
    id: "erc1155-avmezo-w52",
    name: "Aurove MEZO Week 52",
    symbol: "avMEZOw52",
    kind: "erc1155",
    descriptor: "ERC1155 fraction",
    balanceLabel: "42.8 fractions",
    priceUsd: 420,
    liquidityUsd: 670000,
    routeHint: "Long-duration Earn tranche",
  },
  {
    id: "erc20-wvemezo",
    name: "Wrapped veMEZO Liquidity",
    symbol: "wveMEZO",
    kind: "erc20",
    descriptor: "ERC20 wrapper token",
    balanceLabel: "12,480 wveMEZO",
    priceUsd: 1.04,
    liquidityUsd: 2180000,
    routeHint: "Wrapped liquidity",
  },
  {
    id: "erc20-musd",
    name: "Mezo USD",
    symbol: "MUSD",
    kind: "erc20",
    descriptor: "ERC20 token",
    balanceLabel: "5,000 MUSD",
    priceUsd: 1,
    liquidityUsd: 3900000,
    routeHint: "Quote liquidity",
  },
];

const kindLabels: Record<SwapAssetKind, string> = {
  venft: "veNFT",
  erc1155: "ERC1155",
  erc20: "ERC20",
};

export function getMockSwapRoute(from: MockSwapAsset, to: MockSwapAsset): string[] {
  if (from.kind === to.kind) {
    return [kindLabels[from.kind], "ERC20", kindLabels[to.kind]];
  }

  if (from.kind === "venft" && to.kind === "erc1155") {
    return ["veNFT", "ERC20", "ERC1155"];
  }

  if (from.kind === "erc1155" && to.kind === "venft") {
    return ["ERC1155", "ERC20", "veNFT"];
  }

  if (from.kind === "venft") {
    return ["veNFT", "ERC1155", "ERC20"];
  }

  if (to.kind === "venft") {
    return ["ERC20", "ERC1155", "veNFT"];
  }

  if (from.kind === "erc1155") {
    return ["ERC1155", "ERC20"];
  }

  if (to.kind === "erc1155") {
    return ["ERC20", "ERC1155"];
  }

  return ["ERC20", "ERC20"];
}

export function getMockRouteEfficiency(route: string[]): number {
  return Math.max(0.955, 0.994 - (route.length - 2) * 0.012);
}

export function getAssetKindLabel(kind: SwapAssetKind): string {
  return kindLabels[kind];
}
