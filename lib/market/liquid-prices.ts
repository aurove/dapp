import "server-only";

import type { Abi, Address, PublicClient } from "viem";

import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getAuroveSupportedPools } from "@/lib/config/supported-liquidity-pools";
import { getKnownMusdConfig } from "@/lib/config/musd";
import { getServerPublicClient } from "@/lib/web3/server-chain-time";

const Q192 = 2n ** 192n;
const MIN_TRUSTED_TICK = -887_000;
const MAX_TRUSTED_TICK = 887_000;

type StatsClient = Pick<PublicClient, "multicall" | "readContract">;

type PoolSpot = {
  address: Address;
  token0: Address;
  token1: Address;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
};

type Fraction = { numerator: bigint; denominator: bigint };

export type LiquidId20MusdPrices = {
  /** avBTCm per mUSD (price of 1 avBTCm in mUSD). */
  avBTCmMusd: number | null;
  /** avMEZOm per mUSD (price of 1 avMEZOm in mUSD). */
  avMEZOmMusd: number | null;
  asOf: number;
  source: "pool-spot";
};

function multiplyFraction(value: Fraction, numerator: bigint, denominator: bigint): Fraction {
  return {
    numerator: value.numerator * numerator,
    denominator: value.denominator * denominator,
  };
}

function fractionToNumber(value: Fraction): number | null {
  if (value.denominator === 0n) return null;
  // Evaluate with float carefully for 18-decimal asset ratios.
  const n = Number(value.numerator);
  const d = Number(value.denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  const result = n / d;
  return Number.isFinite(result) && result > 0 ? result : null;
}

/**
 * Price `token` in mUSD using CL pool spots (same pathing as academy valuation).
 * amount is raw units (18 decimals for Aurove assets) — pass 1e18 for unit price.
 */
function valueTokenInMusd(input: {
  token: Address;
  amount: bigint;
  musd: Address;
  pools: PoolSpot[];
}): number | null {
  const target = input.musd.toLowerCase();
  const queue: Array<{ token: Address; value: Fraction; visited: Set<string> }> = [
    {
      token: input.token,
      value: { numerator: input.amount, denominator: 1n },
      visited: new Set(),
    },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.token.toLowerCase() === target) {
      // amount is 1e18 → scale down to human mUSD
      const raw = fractionToNumber(current.value);
      if (raw == null) return null;
      return raw / 1e18;
    }

    for (const pool of input.pools) {
      const poolKey = pool.address.toLowerCase();
      if (current.visited.has(poolKey)) continue;
      if (pool.liquidity <= 0n || pool.sqrtPriceX96 <= 0n) continue;

      const squaredPrice = pool.sqrtPriceX96 * pool.sqrtPriceX96;
      let nextToken: Address | null = null;
      let nextValue: Fraction | null = null;

      if (pool.token0.toLowerCase() === current.token.toLowerCase()) {
        // token0 → token1: multiply by price(token1/token0)
        nextToken = pool.token1;
        nextValue = multiplyFraction(current.value, squaredPrice, Q192);
      } else if (pool.token1.toLowerCase() === current.token.toLowerCase()) {
        // token1 → token0: multiply by price(token0/token1)
        nextToken = pool.token0;
        nextValue = multiplyFraction(current.value, Q192, squaredPrice);
      }

      if (nextToken && nextValue) {
        queue.push({
          token: nextToken,
          value: nextValue,
          visited: new Set([...current.visited, poolKey]),
        });
      }
    }
  }

  return null;
}

async function readPoolSpots(client: StatsClient, chainId: number): Promise<PoolSpot[]> {
  const pools = getAuroveSupportedPools(chainId);
  if (pools.length === 0) return [];

  const results = await client.multicall({
    allowFailure: true,
    contracts: pools.flatMap((pool) => [
      { address: pool.address, abi: pool.abi as Abi, functionName: "token0" },
      { address: pool.address, abi: pool.abi as Abi, functionName: "token1" },
      { address: pool.address, abi: pool.abi as Abi, functionName: "slot0" },
      { address: pool.address, abi: pool.abi as Abi, functionName: "liquidity" },
    ]),
  });

  const spots: PoolSpot[] = [];
  for (let i = 0; i < pools.length; i += 1) {
    const base = i * 4;
    const token0Result = results[base];
    const token1Result = results[base + 1];
    const slot0Result = results[base + 2];
    const liquidityResult = results[base + 3];

    if (
      !token0Result ||
      token0Result.status !== "success" ||
      typeof token0Result.result !== "string" ||
      !token1Result ||
      token1Result.status !== "success" ||
      typeof token1Result.result !== "string" ||
      !slot0Result ||
      slot0Result.status !== "success" ||
      !liquidityResult ||
      liquidityResult.status !== "success" ||
      typeof liquidityResult.result !== "bigint"
    ) {
      continue;
    }

    const slot0 = slot0Result.result as readonly unknown[];
    const sqrtPriceX96 = typeof slot0[0] === "bigint" ? slot0[0] : null;
    const tick = typeof slot0[1] === "number" ? slot0[1] : null;
    const liquidity = liquidityResult.result;

    if (
      sqrtPriceX96 == null ||
      sqrtPriceX96 <= 0n ||
      tick == null ||
      tick <= MIN_TRUSTED_TICK ||
      tick >= MAX_TRUSTED_TICK ||
      liquidity <= 0n
    ) {
      continue;
    }

    spots.push({
      address: pools[i]!.address,
      token0: token0Result.result as Address,
      token1: token1Result.result as Address,
      sqrtPriceX96,
      tick,
      liquidity,
    });
  }

  return spots;
}

/**
 * Spot-price avBTCm and avMEZOm in mUSD via Aurove CL pools.
 *
 * Paths (typical topology):
 * - avBTCm → MUSD via `MUSD-avBTCm`
 * - avMEZOm → avBTCm → MUSD via `avBTCm-avMEZOm` then `MUSD-avBTCm`
 *
 * veBTC / veMEZO ticker quotes use these liquid wrappers as their market price.
 */
export async function fetchLiquidId20MusdPrices(
  chainId: number,
): Promise<LiquidId20MusdPrices | null> {
  const client = getServerPublicClient(chainId) as StatsClient | null;
  if (!client) return null;

  const musd = getKnownMusdConfig(chainId);
  const addresses = getEarnProtocolAddresses(chainId);
  const avBTCm = addresses.auroveId20Address;
  const avMEZOm = addresses.mezoAuroveId20Address;

  if (!musd?.address || (!avBTCm && !avMEZOm)) return null;

  try {
    const pools = await readPoolSpots(client, chainId);
    if (pools.length === 0) return null;

    const unit = 10n ** 18n;
    const avBTCmMusd = avBTCm
      ? valueTokenInMusd({
          token: avBTCm,
          amount: unit,
          musd: musd.address,
          pools,
        })
      : null;
    const avMEZOmMusd = avMEZOm
      ? valueTokenInMusd({
          token: avMEZOm,
          amount: unit,
          musd: musd.address,
          pools,
        })
      : null;

    if (avBTCmMusd == null && avMEZOmMusd == null) return null;

    return {
      avBTCmMusd,
      avMEZOmMusd,
      asOf: Math.floor(Date.now() / 1000),
      source: "pool-spot",
    };
  } catch {
    return null;
  }
}
