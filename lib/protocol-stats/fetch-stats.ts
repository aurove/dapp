import "server-only";

import {
  getAddress,
  type Abi,
  type Address,
  type PublicClient,
  parseAbiItem,
} from "viem";
import { sql } from "drizzle-orm";

import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getContractConfig, getContractsByChainId } from "@/contracts/shared";
import {
  deriveTrancheId,
  MAX_EPOCHS_BY_VARIANT,
  type CanonicalAssetVariant,
} from "@/components/features/earn/utils/tranche";
import { getAuroveSupportedPools } from "@/lib/config/supported-liquidity-pools";
import { getMarketChainId } from "@/lib/market/config";
import { fetchHermesLatestPrices } from "@/lib/market/pyth";
import { getServerPublicClient } from "@/lib/web3/server-chain-time";

import {
  PROTOCOL_STATS_REVALIDATE_SECONDS,
  STATS_LOG_CHUNK_BLOCKS,
  STATS_LOG_MAX_CHUNKS,
} from "./config";
import type { ProtocolStatsSnapshot } from "./types";

/** Minimal read surface we need — avoids account-type friction with createPublicClient. */
type StatsClient = Pick<PublicClient, "getBlockNumber" | "getLogs" | "multicall" | "readContract">;

type DecodedLog = {
  args?: Record<string, unknown>;
};

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const transferSingleEvent = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
);
const transferBatchEvent = parseAbiItem(
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
);

const ZERO = "0x0000000000000000000000000000000000000000";

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

function normalizeAddress(value: string): string | null {
  try {
    return getAddress(value).toLowerCase();
  } catch {
    return null;
  }
}

/** Protocol/system addresses must never count as “wallets” or external holders. */
function collectProtocolAddresses(chainId: number): Set<string> {
  const excluded = new Set<string>([ZERO]);
  const contracts = getContractsByChainId(chainId);
  if (contracts) {
    for (const entry of Object.values(contracts)) {
      const address = (entry as { address?: string } | undefined)?.address;
      if (typeof address === "string") {
        const normalized = normalizeAddress(address);
        if (normalized) excluded.add(normalized);
      }
    }
  }
  for (const pool of getAuroveSupportedPools(chainId)) {
    excluded.add(pool.address.toLowerCase());
  }
  return excluded;
}

function isUserWallet(address: string, protocol: Set<string>): boolean {
  return address !== ZERO && !protocol.has(address);
}

async function scanLogsInChunks(
  client: StatsClient,
  params: {
    address: Address | Address[];
    event: typeof transferEvent | typeof transferSingleEvent | typeof transferBatchEvent;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<DecodedLog[]> {
  const logs: DecodedLog[] = [];
  let from = params.fromBlock;
  let chunks = 0;
  while (from <= params.toBlock && chunks < STATS_LOG_MAX_CHUNKS) {
    const to =
      from + STATS_LOG_CHUNK_BLOCKS - 1n > params.toBlock
        ? params.toBlock
        : from + STATS_LOG_CHUNK_BLOCKS - 1n;
    try {
      const batch = (await client.getLogs({
        address: params.address,
        event: params.event,
        fromBlock: from,
        toBlock: to,
      })) as DecodedLog[];
      logs.push(...batch);
    } catch {
      const mid = from + (to - from) / 2n;
      if (mid <= from) {
        from = to + 1n;
        chunks += 1;
        continue;
      }
      try {
        const left = (await client.getLogs({
          address: params.address,
          event: params.event,
          fromBlock: from,
          toBlock: mid,
        })) as DecodedLog[];
        const right = (await client.getLogs({
          address: params.address,
          event: params.event,
          fromBlock: mid + 1n,
          toBlock: to,
        })) as DecodedLog[];
        logs.push(...left, ...right);
      } catch {
        // Skip this window rather than failing the whole stats payload.
      }
    }
    from = to + 1n;
    chunks += 1;
  }
  return logs;
}

/**
 * Distinct user addresses that touched Aurove ledger or id20 transfers
 * (historical interactors; protocol contracts excluded).
 */
async function scanUniqueWallets(
  client: StatsClient,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<number | null> {
  const addresses = getEarnProtocolAddresses(chainId);
  const ledger = addresses.ledgerAddress;
  const id20s = [addresses.auroveId20Address, addresses.mezoAuroveId20Address].filter(
    (value): value is Address => Boolean(value),
  );

  if (!ledger && id20s.length === 0) return null;

  const protocol = collectProtocolAddresses(chainId);
  const interactors = new Set<string>();

  const remember = (raw: string | undefined | null) => {
    if (typeof raw !== "string") return;
    const address = normalizeAddress(raw);
    if (!address || !isUserWallet(address, protocol)) return;
    interactors.add(address);
  };

  try {
    const jobs: Array<Promise<void>> = [];

    if (ledger) {
      jobs.push(
        (async () => {
          const [singles, batches] = await Promise.all([
            scanLogsInChunks(client, {
              address: ledger,
              event: transferSingleEvent,
              fromBlock,
              toBlock,
            }),
            scanLogsInChunks(client, {
              address: ledger,
              event: transferBatchEvent,
              fromBlock,
              toBlock,
            }),
          ]);

          for (const log of singles) {
            remember(typeof log.args?.from === "string" ? log.args.from : null);
            remember(typeof log.args?.to === "string" ? log.args.to : null);
          }

          for (const log of batches) {
            remember(typeof log.args?.from === "string" ? log.args.from : null);
            remember(typeof log.args?.to === "string" ? log.args.to : null);
          }
        })(),
      );
    }

    if (id20s.length > 0) {
      jobs.push(
        (async () => {
          const logs = await scanLogsInChunks(client, {
            address: id20s,
            event: transferEvent,
            fromBlock,
            toBlock,
          });
          for (const log of logs) {
            remember(typeof log.args?.from === "string" ? log.args.from : null);
            remember(typeof log.args?.to === "string" ? log.args.to : null);
          }
        })(),
      );
    }

    await Promise.all(jobs);
    return interactors.size;
  } catch {
    return null;
  }
}

/**
 * Total Academy points events = count of `points_ledger_entries` rows.
 * Each row is one scored activity (swap, fees, referral, etc.).
 */
async function countAcademyPointsEvents(): Promise<number | null> {
  try {
    // Lazy import so RPC-only / misconfigured DB paths don't fail module load.
    const { db } = await import("@/lib/db");
    const rows = await db.execute<{ total: string | number | bigint }>(sql`
      select count(*)::bigint as total
      from public.points_ledger_entries
    `);
    const raw = rows[0]?.total;
    if (typeof raw === "bigint") return Number(raw);
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

type TrancheAssetKind = "btc" | "mezo";

function human18(amount: bigint): number {
  return Number(amount) / 1e18;
}

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
 * TVL = Σ (ledger.totalSupply(trancheId) × underlying USD price).
 * veBTC tranches priced as BTC; veMEZO as MEZO. No pool or id20 supply mixing.
 */
async function readTvlUsd(client: StatsClient, chainId: number): Promise<number | null> {
  const ledger = getContractConfig(chainId, "Ledger");
  if (!ledger?.address || !ledger.abi) return null;

  const specs = allLedgerTrancheSpecs();
  if (specs.length === 0) return null;

  try {
    const results = await client.multicall({
      allowFailure: true,
      contracts: specs.map((spec) => ({
        address: ledger.address as Address,
        abi: ledger.abi as Abi,
        functionName: "totalSupply",
        args: [spec.trancheId],
      })),
    });

    const prices = await fetchHermesLatestPrices(["BTC_USD", "MEZO_USD"]).catch(() => []);
    const btcUsd = prices.find((p) => p.feed === "BTC_USD")?.priceUsd ?? null;
    const mezoUsd = prices.find((p) => p.feed === "MEZO_USD")?.priceUsd ?? null;

    let btcAmt = 0;
    let mezoAmt = 0;
    let saw = false;
    for (let i = 0; i < specs.length; i += 1) {
      const result = results[i];
      if (!result || result.status !== "success" || typeof result.result !== "bigint") continue;
      if (result.result <= 0n) continue;
      const value = human18(result.result);
      if (!Number.isFinite(value) || value <= 0) continue;
      saw = true;
      if (specs[i]!.kind === "btc") btcAmt += value;
      else mezoAmt += value;
    }

    if (!saw) return null;

    let tvl = 0;
    if (btcUsd) tvl += btcAmt * btcUsd;
    if (mezoUsd) tvl += mezoAmt * mezoUsd;

    return tvl > 0 ? tvl : null;
  } catch {
    return null;
  }
}

function earliestDeploymentBlock(chainId: number): bigint {
  const names = [
    "Ledger",
    "avBTCmId20",
    "avMEZOmId20",
    "MUSD-avBTCm",
    "avBTCm-avMEZOm",
    "AuroveZapRouter",
  ] as const;
  let min: number | null = null;
  for (const name of names) {
    const block = getContractConfig(chainId, name)?.deploymentBlock;
    if (typeof block === "number" && Number.isFinite(block)) {
      min = min == null ? block : Math.min(min, block);
    }
  }
  return BigInt(min ?? 0);
}

/**
 * Aggregate protocol stats for the homepage.
 *
 * - Unique wallets: on-chain transfer interactors (Ledger + managed id20s).
 * - Transaction count: total Academy points ledger entries (scored events).
 * - TVL: sum of ledger tranche totalSupply × BTC/MEZO Pyth prices.
 *
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
    const transactionCount = await countAcademyPointsEvents();
    return {
      chainId,
      fetchedAt: Date.now(),
      tvlUsd: null,
      uniqueWallets: null,
      transactionCount,
      notes: [
        "RPC unavailable for active chain",
        ...(transactionCount == null ? ["Academy transaction count unavailable."] : []),
      ],
      healthy: transactionCount != null,
    };
  }

  const latestBlock = await client.getBlockNumber();
  const fromBlock = earliestDeploymentBlock(chainId);
  const toBlock = latestBlock;

  const [tvlUsd, uniqueWallets, transactionCount] = await Promise.all([
    readTvlUsd(client, chainId),
    scanUniqueWallets(client, chainId, fromBlock, toBlock),
    countAcademyPointsEvents(),
  ]);

  if (uniqueWallets == null) notes.push("Unique wallets scan incomplete (ledger/id20 transfers).");
  if (transactionCount == null) notes.push("Academy transaction count unavailable.");
  if (tvlUsd == null) notes.push("TVL unavailable.");

  const snapshot: ProtocolStatsSnapshot = {
    chainId,
    fetchedAt: Date.now(),
    tvlUsd,
    uniqueWallets,
    transactionCount,
    notes: notes.length ? notes : undefined,
    healthy: [tvlUsd, uniqueWallets, transactionCount].some((v) => v != null),
  };

  cache.set(chainId, {
    expiresAt: Date.now() + PROTOCOL_STATS_REVALIDATE_SECONDS * 1000,
    value: snapshot,
  });

  return snapshot;
}
