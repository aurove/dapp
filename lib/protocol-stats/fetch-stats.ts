import "server-only";

import { type Abi, type Address, type PublicClient } from "viem";

import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getContractConfig } from "@/contracts/shared";
import {
  deriveTrancheId,
  MAX_EPOCHS_BY_VARIANT,
  type CanonicalAssetVariant,
} from "@/components/features/earn/utils/tranche";
import { getKnownMusdConfig } from "@/lib/config/musd";
import { getMarketChainId } from "@/lib/market/config";
import { estimateRawAmountValueMusd, fetchMezoSpotPrices } from "@/lib/market/mezo-prices";
import { getServerPublicClient } from "@/lib/web3/server-chain-time";

import { PROTOCOL_STATS_REVALIDATE_SECONDS } from "./config";
import type { ProtocolStatsSnapshot } from "./types";

/** Minimal read surface we need — avoids account-type friction with createPublicClient. */
type StatsClient = Pick<PublicClient, "multicall" | "readContract">;

type CacheEntry = { expiresAt: number; value: ProtocolStatsSnapshot };
const globalStatsCache = globalThis as typeof globalThis & {
  __auroveProtocolStatsCache?: Map<number, CacheEntry>;
};

function getCache(): Map<number, CacheEntry> {
  if (!globalStatsCache.__auroveProtocolStatsCache) {
    globalStatsCache.__auroveProtocolStatsCache = new Map();
  }
  return globalStatsCache.__auroveProtocolStatsCache;
}

type TrancheAssetKind = "btc" | "mezo";

/** Every valid ledger tranche id (veBTC 1..4, veMEZO 1..208). */
function allLedgerTrancheSpecs(): Array<{ trancheId: bigint; kind: TrancheAssetKind }> {
  const specs: Array<{ trancheId: bigint; kind: TrancheAssetKind }> = [];
  const variants: Array<{ variant: CanonicalAssetVariant; kind: TrancheAssetKind }> = [
    { variant: "veBTC", kind: "btc" },
    { variant: "veMEZO", kind: "mezo" },
  ];
  for (const { variant, kind } of variants) {
    const max = MAX_EPOCHS_BY_VARIANT[variant];
    for (let epochs = 1; epochs <= max; epochs += 1) {
      specs.push({ trancheId: deriveTrancheId(variant, epochs), kind });
    }
  }
  return specs;
}

/**
 * TVL =
 *   Σ(veBTC tranche totalSupply × avBTCm Mezo price)
 * + Σ(veMEZO tranche totalSupply × avMEZOm Mezo price)
 * + MUSD reserve in MUSD/avBTCm (from Mezo pools API).
 */
async function readTvlUsd(client: StatsClient, chainId: number): Promise<number | null> {
  const ledger = getContractConfig(chainId, "Ledger");
  if (!ledger?.address || !ledger.abi) return null;

  const specs = allLedgerTrancheSpecs();
  if (specs.length === 0) return null;

  const earn = getEarnProtocolAddresses(chainId);
  const musd = getKnownMusdConfig(chainId);
  const musdAvBtcmPool = getContractConfig(chainId, "MUSD-avBTCm");

  try {
    const [results, spots] = await Promise.all([
      client.multicall({
        allowFailure: true,
        contracts: specs.map((spec) => ({
          address: ledger.address as Address,
          abi: ledger.abi as Abi,
          functionName: "totalSupply",
          args: [spec.trancheId],
        })),
      }),
      fetchMezoSpotPrices({
        musdAddress: musd?.address ?? null,
        musdAvBtcmPoolAddress: musdAvBtcmPool?.address ?? null,
        avBTCmAddress: earn.auroveId20Address ?? null,
        avMEZOmAddress: earn.mezoAuroveId20Address ?? null,
      }),
    ]);

    let btcAmtRaw = 0n;
    let mezoAmtRaw = 0n;
    let saw = false;
    for (let i = 0; i < specs.length; i += 1) {
      const result = results[i];
      if (!result || result.status !== "success" || typeof result.result !== "bigint") continue;
      if (result.result <= 0n) continue;
      saw = true;
      if (specs[i]!.kind === "btc") btcAmtRaw += result.result;
      else mezoAmtRaw += result.result;
    }

    let tvl = 0;
    const btcValue = estimateRawAmountValueMusd(btcAmtRaw, 18, spots.avBTCmMusd);
    const mezoValue = estimateRawAmountValueMusd(mezoAmtRaw, 18, spots.avMEZOmMusd);
    if (btcValue != null) tvl += btcValue;
    if (mezoValue != null) tvl += mezoValue;

    // MUSD in the avBTCm-MUSD pool contributes 1:1 in mUSD terms via Mezo's reported reserve.
    if (spots.musdAvBtcmReserveMusd != null && spots.musdAvBtcmReserveMusd > 0) {
      const musdPrice = spots.musdMusd != null && spots.musdMusd > 0 ? spots.musdMusd : 1;
      tvl += spots.musdAvBtcmReserveMusd * musdPrice;
      saw = true;
    }

    if (!saw && tvl <= 0) return null;
    return tvl > 0 ? tvl : null;
  } catch {
    return null;
  }
}

/**
 * Homepage protocol stats — TVL only.
 * Cached ~10 min in-process + HTTP.
 */
export async function fetchProtocolStatsSnapshot(): Promise<ProtocolStatsSnapshot> {
  const chainId = getMarketChainId();
  const cache = getCache();
  const cached = cache.get(chainId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const notes: string[] = [];
  const client = getServerPublicClient(chainId) as StatsClient | null;
  if (!client) {
    return {
      chainId,
      fetchedAt: Date.now(),
      tvlUsd: null,
      notes: ["RPC unavailable for active chain"],
      healthy: false,
    };
  }

  const tvlUsd = await readTvlUsd(client, chainId);
  if (tvlUsd == null) notes.push("TVL unavailable.");

  const snapshot: ProtocolStatsSnapshot = {
    chainId,
    fetchedAt: Date.now(),
    tvlUsd,
    notes: notes.length ? notes : undefined,
    healthy: tvlUsd != null,
  };

  cache.set(chainId, {
    expiresAt: Date.now() + PROTOCOL_STATS_REVALIDATE_SECONDS * 1000,
    value: snapshot,
  });

  return snapshot;
}
