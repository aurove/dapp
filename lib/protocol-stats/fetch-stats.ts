import "server-only";

import {
  erc20Abi,
  getAddress,
  type Abi,
  type Address,
  type PublicClient,
  parseAbiItem,
} from "viem";

import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getContractConfig, getContractsByChainId } from "@/contracts/shared";
import { deriveTrancheId } from "@/components/features/earn/utils/tranche";
import { getKnownMezoTokenConfig } from "@/components/shared/known-mezo-tokens";
import { getAuroveSupportedPools } from "@/lib/config/supported-liquidity-pools";
import { getKnownMusdConfig } from "@/lib/config/musd";
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

function applyErc20Transfer(
  balances: Map<string, bigint>,
  from: string,
  to: string,
  value: bigint,
) {
  if (from !== ZERO) {
    balances.set(from, (balances.get(from) ?? 0n) - value);
  }
  if (to !== ZERO) {
    balances.set(to, (balances.get(to) ?? 0n) + value);
  }
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

type OnChainAudience = {
  /** Distinct EOAs/contracts that touched Aurove ledger or id20 transfers (excl. protocol). */
  uniqueWallets: number;
  /** Distinct non-protocol owners with any positive ledger ERC-1155 balance. */
  ledgerHolders: number;
  /** Distinct non-protocol owners with any positive avBTCm / avMEZOm balance. */
  id20Holders: number;
};

/**
 * Single on-chain pass over Ledger + managed id20 Transfer logs.
 *
 * Invariants enforced:
 * - uniqueWallets = |all user addresses seen on transfers| (historical interactors)
 * - ledgerHolders / id20Holders = current positive balances among users
 * - holders ⊆ interactors ⇒ holders ≤ uniqueWallets
 */
async function scanOnChainAudience(
  client: StatsClient,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<OnChainAudience | null> {
  const addresses = getEarnProtocolAddresses(chainId);
  const ledger = addresses.ledgerAddress;
  const id20s = [addresses.auroveId20Address, addresses.mezoAuroveId20Address].filter(
    (value): value is Address => Boolean(value),
  );

  if (!ledger && id20s.length === 0) return null;

  const protocol = collectProtocolAddresses(chainId);
  const interactors = new Set<string>();
  const ledgerBalances = new Map<string, bigint>(); // key owner:id
  const id20Balances = new Map<string, bigint>(); // key owner (aggregated across id20s)

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
            const from = typeof log.args?.from === "string" ? log.args.from : null;
            const to = typeof log.args?.to === "string" ? log.args.to : null;
            const id = log.args?.id;
            const value = log.args?.value;
            remember(from);
            remember(to);
            if (
              typeof from !== "string" ||
              typeof to !== "string" ||
              typeof id !== "bigint" ||
              typeof value !== "bigint"
            ) {
              continue;
            }
            const idKey = id.toString();
            const fromN = normalizeAddress(from) ?? from.toLowerCase();
            const toN = normalizeAddress(to) ?? to.toLowerCase();
            if (fromN !== ZERO) {
              const key = `${fromN}:${idKey}`;
              ledgerBalances.set(key, (ledgerBalances.get(key) ?? 0n) - value);
            }
            if (toN !== ZERO) {
              const key = `${toN}:${idKey}`;
              ledgerBalances.set(key, (ledgerBalances.get(key) ?? 0n) + value);
            }
          }

          for (const log of batches) {
            const from = typeof log.args?.from === "string" ? log.args.from : null;
            const to = typeof log.args?.to === "string" ? log.args.to : null;
            const ids = log.args?.ids;
            const values = log.args?.values;
            remember(from);
            remember(to);
            if (
              typeof from !== "string" ||
              typeof to !== "string" ||
              !Array.isArray(ids) ||
              !Array.isArray(values)
            ) {
              continue;
            }
            const fromN = normalizeAddress(from) ?? from.toLowerCase();
            const toN = normalizeAddress(to) ?? to.toLowerCase();
            for (let i = 0; i < ids.length; i += 1) {
              const id = ids[i];
              const value = values[i];
              if (typeof id !== "bigint" || typeof value !== "bigint") continue;
              const idKey = id.toString();
              if (fromN !== ZERO) {
                const key = `${fromN}:${idKey}`;
                ledgerBalances.set(key, (ledgerBalances.get(key) ?? 0n) - value);
              }
              if (toN !== ZERO) {
                const key = `${toN}:${idKey}`;
                ledgerBalances.set(key, (ledgerBalances.get(key) ?? 0n) + value);
              }
            }
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
            const from = typeof log.args?.from === "string" ? log.args.from : null;
            const to = typeof log.args?.to === "string" ? log.args.to : null;
            const value = log.args?.value;
            remember(from);
            remember(to);
            if (
              typeof from !== "string" ||
              typeof to !== "string" ||
              typeof value !== "bigint"
            ) {
              continue;
            }
            const fromN = normalizeAddress(from) ?? from.toLowerCase();
            const toN = normalizeAddress(to) ?? to.toLowerCase();
            applyErc20Transfer(id20Balances, fromN, toN, value);
          }
        })(),
      );
    }

    await Promise.all(jobs);

    // Current holders (user wallets only).
    const ledgerOwners = new Set<string>();
    for (const [key, value] of ledgerBalances) {
      if (value <= 0n) continue;
      const owner = key.split(":")[0]!;
      if (isUserWallet(owner, protocol)) {
        ledgerOwners.add(owner);
        // Holders are always interactors (transfers created the balance).
        interactors.add(owner);
      }
    }

    const id20Owners = new Set<string>();
    for (const [owner, value] of id20Balances) {
      if (value <= 0n) continue;
      if (isUserWallet(owner, protocol)) {
        id20Owners.add(owner);
        interactors.add(owner);
      }
    }

    const ledgerHolders = ledgerOwners.size;
    const id20Holders = id20Owners.size;
    // Unique wallets = all historical interactors; must be ≥ any current holder set.
    const uniqueWallets = Math.max(
      interactors.size,
      ledgerHolders,
      id20Holders,
      // union of current holders in case log scan missed an edge interactor entry
      new Set([...ledgerOwners, ...id20Owners]).size,
    );

    return {
      uniqueWallets,
      ledgerHolders,
      id20Holders,
    };
  } catch {
    return null;
  }
}

type AmountBucket =
  | { kind: "btc"; amount: bigint }
  | { kind: "mezo"; amount: bigint }
  | { kind: "musd"; amount: bigint };

function human18(amount: bigint): number {
  return Number(amount) / 1e18;
}

async function readTvlUsd(client: StatsClient, chainId: number): Promise<number | null> {
  const addresses = getEarnProtocolAddresses(chainId);
  const musd = getKnownMusdConfig(chainId);
  const btc = getKnownMezoTokenConfig(chainId, "BTC");
  const mezo = getKnownMezoTokenConfig(chainId, "MEZO");
  const pools = getAuroveSupportedPools(chainId);
  const ledger = getContractConfig(chainId, "Ledger");

  type Call = {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    map: (value: bigint) => AmountBucket | null;
  };

  const calls: Call[] = [];

  if (addresses.auroveId20Address) {
    calls.push({
      address: addresses.auroveId20Address,
      abi: erc20Abi,
      functionName: "totalSupply",
      map: (amount) => ({ kind: "btc", amount }),
    });
  }
  if (addresses.mezoAuroveId20Address) {
    calls.push({
      address: addresses.mezoAuroveId20Address,
      abi: erc20Abi,
      functionName: "totalSupply",
      map: (amount) => ({ kind: "mezo", amount }),
    });
  }

  // Ledger managed supplies only if id20 wrappers are missing (id20 is 1:1 backed by ledger).
  if (
    ledger?.address &&
    ledger.abi &&
    !addresses.auroveId20Address &&
    !addresses.mezoAuroveId20Address
  ) {
    const managed = [
      { id: deriveTrancheId("veBTC", 4), kind: "btc" as const },
      { id: deriveTrancheId("veMEZO", 208), kind: "mezo" as const },
    ];
    for (const item of managed) {
      calls.push({
        address: ledger.address,
        abi: ledger.abi as Abi,
        functionName: "totalSupply",
        args: [item.id],
        map: (amount) => ({ kind: item.kind, amount }),
      });
    }
  }

  // Pool balances of base assets (not id20 wrappers) — avoids double-counting
  // wrappers that already appear in totalSupply.
  for (const pool of pools) {
    const tokenSpecs: Array<{ address: Address; kind: AmountBucket["kind"] }> = [];
    if (musd) tokenSpecs.push({ address: musd.address, kind: "musd" });
    if (btc) tokenSpecs.push({ address: btc.address, kind: "btc" });
    if (mezo) tokenSpecs.push({ address: mezo.address, kind: "mezo" });
    for (const token of tokenSpecs) {
      calls.push({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [pool.address],
        map: (amount) => ({ kind: token.kind, amount }),
      });
    }
  }

  if (calls.length === 0) return null;

  try {
    const results = await client.multicall({
      allowFailure: true,
      contracts: calls.map((call) => ({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
      })),
    });

    const prices = await fetchHermesLatestPrices().catch(() => []);
    const btcUsd = prices.find((p) => p.feed === "BTC_USD")?.priceUsd ?? null;
    const mezoUsd = prices.find((p) => p.feed === "MEZO_USD")?.priceUsd ?? null;
    const musdUsd = prices.find((p) => p.feed === "MUSD_USD")?.priceUsd ?? 1;

    let btcAmt = 0;
    let mezoAmt = 0;
    let musdAmt = 0;
    let saw = false;
    for (let i = 0; i < calls.length; i += 1) {
      const result = results[i];
      if (!result || result.status !== "success" || typeof result.result !== "bigint") continue;
      if (result.result <= 0n) continue;
      const mapped = calls[i]!.map(result.result);
      if (!mapped) continue;
      const value = human18(mapped.amount);
      if (!Number.isFinite(value) || value <= 0) continue;
      saw = true;
      if (mapped.kind === "btc") btcAmt += value;
      else if (mapped.kind === "mezo") mezoAmt += value;
      else musdAmt += value;
    }

    if (!saw) return null;

    let tvl = 0;
    if (btcUsd) tvl += btcAmt * btcUsd;
    if (mezoUsd) tvl += mezoAmt * mezoUsd;
    if (musdUsd) tvl += musdAmt * musdUsd;

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
 * Audience metrics (unique wallets / holders) come from a single on-chain transfer
 * scan over Ledger + managed id20s. Unique wallets are historical interactors;
 * holders are current positive balances. Protocol contracts are excluded so
 * holders ≤ unique wallets always holds.
 *
 * TVL from multicall supplies/balances × Pyth. Cached ~10 min in-process + HTTP.
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
      uniqueWallets: null,
      ledgerHolders: null,
      id20Holders: null,
      notes: ["RPC unavailable for active chain"],
      healthy: false,
    };
  }

  const latestBlock = await client.getBlockNumber();
  const fromBlock = earliestDeploymentBlock(chainId);
  const toBlock = latestBlock;

  const [tvlUsd, audience] = await Promise.all([
    readTvlUsd(client, chainId),
    scanOnChainAudience(client, chainId, fromBlock, toBlock),
  ]);

  const uniqueWallets = audience?.uniqueWallets ?? null;
  const ledgerHolders = audience?.ledgerHolders ?? null;
  const id20Holders = audience?.id20Holders ?? null;

  if (audience == null) notes.push("Audience scan incomplete (ledger/id20 transfers).");
  if (tvlUsd == null) notes.push("TVL unavailable.");

  // Defensive invariant for any partial scan edge cases.
  const safeUnique =
    uniqueWallets == null
      ? null
      : Math.max(uniqueWallets, ledgerHolders ?? 0, id20Holders ?? 0);
  const safeLedger =
    ledgerHolders == null
      ? null
      : safeUnique == null
        ? ledgerHolders
        : Math.min(ledgerHolders, safeUnique);
  const safeId20 =
    id20Holders == null
      ? null
      : safeUnique == null
        ? id20Holders
        : Math.min(id20Holders, safeUnique);

  const snapshot: ProtocolStatsSnapshot = {
    chainId,
    fetchedAt: Date.now(),
    tvlUsd,
    uniqueWallets: safeUnique,
    ledgerHolders: safeLedger,
    id20Holders: safeId20,
    notes: notes.length ? notes : undefined,
    healthy: [tvlUsd, safeUnique, safeLedger, safeId20].some((v) => v != null),
  };

  cache.set(chainId, {
    expiresAt: Date.now() + PROTOCOL_STATS_REVALIDATE_SECONDS * 1000,
    value: snapshot,
  });

  return snapshot;
}
