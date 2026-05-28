import { erc20Abi, type Abi, type Address } from "viem";

export type TokenMetadataInfo = {
  address: Address;
  symbol: string;
  decimals: number;
};

export type TokenMetadataPreset = Pick<TokenMetadataInfo, "symbol" | "decimals">;

type TokenMetadataRead = {
  result?: unknown;
};

export function buildErc20MetadataContracts({
  chainId,
  tokens,
  skipToken,
}: {
  chainId: number;
  tokens: readonly Address[];
  skipToken?: (token: Address) => boolean;
}): Array<{
  address: Address;
  abi: Abi;
  functionName: "symbol" | "decimals";
  chainId: number;
}> {
  const skip = skipToken ?? (() => false);

  return tokens.flatMap((token) => {
    if (skip(token)) return [];

    return [
      {
        address: token,
        abi: erc20Abi,
        functionName: "symbol",
        chainId,
      },
      {
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
        chainId,
      },
    ];
  });
}

export function parseErc20MetadataReads({
  tokens,
  reads,
  presetByToken,
  fallbackDecimals = 18,
  fallbackSymbol,
}: {
  tokens: readonly Address[];
  reads: readonly TokenMetadataRead[] | undefined;
  presetByToken?: Partial<Record<string, TokenMetadataPreset>>;
  fallbackDecimals?: number;
  fallbackSymbol?: (token: Address) => string;
}): TokenMetadataInfo[] {
  const presets = presetByToken ?? {};
  const resolveFallbackSymbol =
    fallbackSymbol ?? ((token: Address) => `${token.slice(0, 6)}...${token.slice(-4)}`);

  const items: TokenMetadataInfo[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const preset = presets[token.toLowerCase()];
    if (preset) {
      items.push({
        address: token,
        symbol: preset.symbol,
        decimals: preset.decimals,
      });
      continue;
    }

    const symbolResult = reads?.[cursor]?.result;
    const decimalsResult = reads?.[cursor + 1]?.result;
    cursor += 2;

    items.push({
      address: token,
      symbol:
        typeof symbolResult === "string" && symbolResult.trim().length > 0
          ? symbolResult.trim()
          : resolveFallbackSymbol(token),
      decimals:
        typeof decimalsResult === "number"
          ? decimalsResult
          : typeof decimalsResult === "bigint"
            ? Number(decimalsResult)
            : fallbackDecimals,
    });
  }

  return items;
}
