import { formatUnits, type Address, type Hex } from "viem";
import {
  HORIZON_TESTNET,
  type HorizonBridgeAsset,
  type HorizonNativeChainId,
} from "@/lib/bridge/horizon";

const HISTORY_PREFIX = "aurove:horizon:bridge-history:v1:";
const TESTNET_API = "https://api.testnet.wormholescan.io/api/v1";
const HISTORY_LIMIT = 50;

const WH_CHAIN_TO_NATIVE = {
  50: 31611,
  10004: 84532,
} as const satisfies Record<number, HorizonNativeChainId>;

type WormholeNativeChainId = keyof typeof WH_CHAIN_TO_NATIVE;

export type BridgeHistoryEntry = {
  id: string;
  account: Address;
  sourceTxHash: Hex;
  sourceTransceiver: Address;
  sourceChainId: 31611 | 84532;
  destinationChainId: 31611 | 84532;
  sourceName: string;
  destinationName: string;
  symbol: string;
  amount: string;
  submittedAt: number;
  /** Set after a successful local redeem or when Wormholescan records destination delivery. */
  completedAt?: number;
  destinationTxHash?: Hex;
};

export type WormholeOperation = {
  id?: string;
  emitterChain?: number;
  emitterAddress?: { hex?: string; native?: string };
  sequence?: string;
  vaa?: {
    raw?: string;
    guardianSetIndex?: number;
    isDuplicated?: boolean;
  };
  content?: {
    payload?: {
      nttManagerMessage?: { id?: string; sender?: string };
      nttMessage?: {
        sourceToken?: string;
        to?: string;
        toChain?: number;
        trimmedAmount?: { amount?: string; decimals?: number };
      };
      transceiverMessage?: unknown;
    };
    standarizedProperties?: WormholeStandardizedProperties;
    standardizedProperties?: WormholeStandardizedProperties;
  };
  sourceChain?: {
    chainId?: number;
    timestamp?: string;
    from?: string;
    status?: string;
    transaction?: { txHash?: string };
  };
  targetChain?: {
    chainId?: number;
    status?: string;
    transaction?: { txHash?: string };
  };
};

type WormholeStandardizedProperties = {
  appIds?: string[];
  fromChain?: number;
  fromAddress?: string;
  toChain?: number;
  toAddress?: string;
  tokenChain?: number;
  tokenAddress?: string;
  amount?: string;
  normalizedDecimals?: number;
};

type HorizonLookup = {
  tokenToAsset: Map<string, HorizonBridgeAsset>;
  transceiverToAsset: Map<string, HorizonBridgeAsset>;
};

function buildHorizonLookup(): HorizonLookup {
  const tokenToAsset = new Map<string, HorizonBridgeAsset>();
  const transceiverToAsset = new Map<string, HorizonBridgeAsset>();

  for (const chain of Object.values(HORIZON_TESTNET)) {
    for (const asset of Object.keys(chain.assets) as HorizonBridgeAsset[]) {
      const contracts = chain.assets[asset];
      tokenToAsset.set(contracts.token.toLowerCase(), asset);
      const transceiver = contracts.transceiver?.wormhole;
      if (transceiver) {
        transceiverToAsset.set(transceiver.toLowerCase() as Address, asset);
      }
    }
  }

  return { tokenToAsset, transceiverToAsset };
}

const HORIZON_LOOKUP = buildHorizonLookup();

function normalizeEvmAddress(value: string | undefined | null): Address | null {
  if (!value) return null;
  const hex = value.toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{40}$/.test(hex)) return `0x${hex}` as Address;
  if (/^[0-9a-f]{64}$/.test(hex) && hex.startsWith("000000000000000000000000")) {
    return `0x${hex.slice(24)}` as Address;
  }
  return null;
}

function getStandardizedProperties(operation: WormholeOperation): WormholeStandardizedProperties {
  return (
    operation.content?.standarizedProperties ??
    operation.content?.standardizedProperties ??
    {}
  );
}

function toNativeChainId(wormholeChainId: number | undefined): HorizonNativeChainId | null {
  if (wormholeChainId === 50 || wormholeChainId === 10004) {
    return WH_CHAIN_TO_NATIVE[wormholeChainId as WormholeNativeChainId];
  }
  return null;
}

function parseSubmittedAt(timestamp: string | undefined): number {
  if (!timestamp) return Date.now();
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : Date.now();
}

function formatTrimmedAmount(amount: string | undefined, decimals: number | undefined): string | null {
  if (!amount) return null;
  try {
    const value = BigInt(amount);
    const places = typeof decimals === "number" && decimals >= 0 ? decimals : 8;
    const formatted = formatUnits(value, places);
    if (formatted.includes(".")) {
      return formatted.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    }
    return formatted;
  } catch {
    return null;
  }
}

export function getWormholeOperationVaaBase64(operation: WormholeOperation | undefined): string | null {
  const raw = operation?.vaa?.raw;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function fetchWormholeOperationByTxHash(txHash: string): Promise<WormholeOperation | null> {
  const url = new URL(`${TESTNET_API}/operations`);
  url.searchParams.set("txHash", txHash);
  url.searchParams.set("pageSize", "10");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wormholescan returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !Array.isArray((result as { operations?: unknown }).operations)) {
    return null;
  }
  const operations = (result as { operations: WormholeOperation[] }).operations;
  const expected = txHash.toLowerCase();
  return (
    operations.find((operation) => operation.sourceChain?.transaction?.txHash?.toLowerCase() === expected) ??
    operations[0] ??
    null
  );
}

function storageKey(account: Address) {
  return `${HISTORY_PREFIX}${account.toLowerCase()}`;
}

export function readBridgeHistory(account: Address): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(account));
    if (!raw) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry): entry is BridgeHistoryEntry =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          typeof entry.id === "string" &&
          typeof entry.account === "string" &&
          typeof entry.sourceTxHash === "string" &&
          typeof entry.sourceTransceiver === "string" &&
          typeof entry.sourceChainId === "number" &&
          typeof entry.destinationChainId === "number" &&
          typeof entry.sourceName === "string" &&
          typeof entry.destinationName === "string" &&
          typeof entry.symbol === "string" &&
          typeof entry.amount === "string" &&
          typeof entry.submittedAt === "number",
      ),
    );
  } catch {
    return [];
  }
}

function writeBridgeHistory(account: Address, entries: BridgeHistoryEntry[]): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return entries;
  const next = entries
    .slice()
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, HISTORY_LIMIT);
  try {
    window.localStorage.setItem(storageKey(account), JSON.stringify(next));
  } catch {
    return readBridgeHistory(account);
  }
  return next;
}

export function saveBridgeHistoryEntry(entry: BridgeHistoryEntry): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const entries = readBridgeHistory(entry.account);
  const next = [
    entry,
    ...entries.filter((item) => item.sourceTxHash.toLowerCase() !== entry.sourceTxHash.toLowerCase()),
  ];
  return writeBridgeHistory(entry.account, next);
}

/** Persist local redeem completion so Complete hides before Wormholescan indexes delivery. */
export function markBridgeHistoryCompleted(
  account: Address,
  sourceTxHash: Hex,
  destinationTxHash?: Hex | null,
): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const expected = sourceTxHash.toLowerCase();
  const entries = readBridgeHistory(account).map((entry) => {
    if (entry.sourceTxHash.toLowerCase() !== expected) return entry;
    return {
      ...entry,
      completedAt: entry.completedAt ?? Date.now(),
      destinationTxHash: (destinationTxHash as Hex | undefined) ?? entry.destinationTxHash,
    };
  });
  return writeBridgeHistory(account, entries);
}

export function isBridgeHistoryEntryCompleted(
  entry: BridgeHistoryEntry,
  operation?: WormholeOperation,
): boolean {
  if (entry.completedAt || entry.destinationTxHash) return true;
  return Boolean(operation?.targetChain?.transaction?.txHash);
}

async function fetchWormholeOperationsByAddress(address: string): Promise<WormholeOperation[]> {
  const url = new URL(`${TESTNET_API}/operations`);
  url.searchParams.set("address", address);
  url.searchParams.set("pageSize", "50");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Wormholescan returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !Array.isArray((result as { operations?: unknown }).operations)) {
    return [];
  }
  return (result as { operations: WormholeOperation[] }).operations;
}

/** @deprecated Prefer fetchWormholeOperationsForHistory — transceiver address lookups often return empty on testnet. */
export async function fetchWormholeOperations(transceivers: Address[]): Promise<WormholeOperation[]> {
  const unique = [...new Set(transceivers.map((address) => address.toLowerCase()))];
  const responses = await Promise.all(unique.map((address) => fetchWormholeOperationsByAddress(address)));
  return responses.flat();
}

/** Fetch operations involving a wallet address (sender or recipient). */
export async function fetchWormholeOperationsByWallet(account: Address): Promise<WormholeOperation[]> {
  return fetchWormholeOperationsByAddress(account);
}

/**
 * Load Wormholescan ops for bridge history status / redeem.
 * Wallet-address queries work; transceiver-address queries often return [].
 * Any history tx missing from the wallet result is fetched by tx hash.
 */
export async function fetchWormholeOperationsForHistory(
  account: Address,
  entries: BridgeHistoryEntry[],
): Promise<WormholeOperation[]> {
  const byTx = new Map<string, WormholeOperation>();

  const walletOps = await fetchWormholeOperationsByWallet(account);
  for (const operation of walletOps) {
    const hash = operation.sourceChain?.transaction?.txHash?.toLowerCase();
    if (hash) byTx.set(hash, operation);
  }

  const missing = entries.filter((entry) => !byTx.has(entry.sourceTxHash.toLowerCase()));
  await Promise.all(
    missing.map(async (entry) => {
      try {
        const operation = await fetchWormholeOperationByTxHash(entry.sourceTxHash);
        if (operation) byTx.set(entry.sourceTxHash.toLowerCase(), operation);
      } catch {
        // Keep going; status stays "Waiting for Wormholescan" for this row.
      }
    }),
  );

  return [...byTx.values()];
}

export function isHorizonWormholeOperation(operation: WormholeOperation): boolean {
  const std = getStandardizedProperties(operation);
  const appIds = std.appIds ?? [];
  if (appIds.length > 0 && !appIds.includes("NATIVE_TOKEN_TRANSFER")) return false;

  const emitter = normalizeEvmAddress(operation.emitterAddress?.native ?? operation.emitterAddress?.hex);
  if (emitter && HORIZON_LOOKUP.transceiverToAsset.has(emitter)) return true;

  const token =
    normalizeEvmAddress(std.tokenAddress) ??
    normalizeEvmAddress(operation.content?.payload?.nttMessage?.sourceToken);
  if (token && HORIZON_LOOKUP.tokenToAsset.has(token)) return true;

  return false;
}

export function wormholeOperationToBridgeHistoryEntry(
  operation: WormholeOperation,
  account: Address,
): BridgeHistoryEntry | null {
  if (!isHorizonWormholeOperation(operation)) return null;

  const std = getStandardizedProperties(operation);
  const sourceWhChain = operation.sourceChain?.chainId ?? operation.emitterChain ?? std.fromChain;
  const destWhChain =
    operation.targetChain?.chainId ??
    std.toChain ??
    operation.content?.payload?.nttMessage?.toChain;
  const sourceChainId = toNativeChainId(sourceWhChain);
  const destinationChainId = toNativeChainId(destWhChain);
  if (!sourceChainId || !destinationChainId) return null;

  const sourceTxHash = operation.sourceChain?.transaction?.txHash;
  if (!sourceTxHash || !sourceTxHash.startsWith("0x")) return null;

  const emitterFromOp = normalizeEvmAddress(
    operation.emitterAddress?.native ?? operation.emitterAddress?.hex,
  );
  const token =
    normalizeEvmAddress(std.tokenAddress) ??
    normalizeEvmAddress(operation.content?.payload?.nttMessage?.sourceToken);
  const asset =
    (token ? HORIZON_LOOKUP.tokenToAsset.get(token) : undefined) ??
    (emitterFromOp ? HORIZON_LOOKUP.transceiverToAsset.get(emitterFromOp) : undefined);
  if (!asset) return null;

  const sourceTransceiver =
    emitterFromOp ??
    (HORIZON_TESTNET[sourceChainId].assets[asset].transceiver?.wormhole as Address | undefined);
  if (!sourceTransceiver) return null;

  const trimmed = operation.content?.payload?.nttMessage?.trimmedAmount;
  const amount =
    formatTrimmedAmount(trimmed?.amount, trimmed?.decimals) ??
    formatTrimmedAmount(std.amount, std.normalizedDecimals) ??
    "0";

  const destinationTxHash = operation.targetChain?.transaction?.txHash;
  const completed =
    typeof destinationTxHash === "string" && destinationTxHash.startsWith("0x")
      ? {
          completedAt: Date.now(),
          destinationTxHash: destinationTxHash as Hex,
        }
      : {};

  return {
    id: `${sourceChainId}:${sourceTxHash.toLowerCase()}`,
    account: account.toLowerCase() as Address,
    sourceTxHash: sourceTxHash as Hex,
    sourceTransceiver,
    sourceChainId,
    destinationChainId,
    sourceName: HORIZON_TESTNET[sourceChainId].name,
    destinationName: HORIZON_TESTNET[destinationChainId].name,
    symbol: asset,
    amount,
    submittedAt: parseSubmittedAt(operation.sourceChain?.timestamp),
    ...completed,
  };
}

export function mergeBridgeHistoryEntries(
  account: Address,
  remoteEntries: BridgeHistoryEntry[],
): BridgeHistoryEntry[] {
  const local = readBridgeHistory(account);
  const byTx = new Map<string, BridgeHistoryEntry>();

  for (const entry of local) {
    byTx.set(entry.sourceTxHash.toLowerCase(), entry);
  }
  for (const entry of remoteEntries) {
    const key = entry.sourceTxHash.toLowerCase();
    const remote = { ...entry, account: account.toLowerCase() as Address };
    const existing = byTx.get(key);
    if (!existing) {
      byTx.set(key, remote);
      continue;
    }
    // Keep local amount/metadata; absorb remote completion when Wormholescan catches up.
    byTx.set(key, {
      ...existing,
      completedAt: existing.completedAt ?? remote.completedAt,
      destinationTxHash: existing.destinationTxHash ?? remote.destinationTxHash,
    });
  }

  return writeBridgeHistory(account, [...byTx.values()]);
}

/** Pull Horizon NTT transfers for a wallet from Wormholescan and merge into local history. */
export async function seedBridgeHistoryFromWormholescan(account: Address): Promise<BridgeHistoryEntry[]> {
  const operations = await fetchWormholeOperationsByWallet(account);
  const remote = operations
    .map((operation) => wormholeOperationToBridgeHistoryEntry(operation, account))
    .filter((entry): entry is BridgeHistoryEntry => entry !== null);
  return mergeBridgeHistoryEntries(account, remote);
}

export function findWormholeOperation(operations: WormholeOperation[] | undefined, sourceTxHash: Hex) {
  const expected = sourceTxHash.toLowerCase();
  return operations?.find((operation) => operation.sourceChain?.transaction?.txHash?.toLowerCase() === expected);
}

export function getWormholeOperationStatus(operation: WormholeOperation | undefined) {
  if (!operation?.sourceChain) return "Waiting for Wormholescan";
  if (operation.targetChain?.transaction?.txHash) return "Completed";
  if (getWormholeOperationVaaBase64(operation) || operation.vaa) {
    return "VAA published · delivery pending";
  }
  return "In progress · awaiting VAA";
}

export function getBridgeHistoryStatus(
  entry: BridgeHistoryEntry,
  operation: WormholeOperation | undefined,
) {
  if (isBridgeHistoryEntryCompleted(entry, operation)) return "Completed";
  return getWormholeOperationStatus(operation);
}

/** True when the VAA is ready but destination delivery has not been recorded. */
export function isWormholeDeliveryPending(operation: WormholeOperation | undefined) {
  if (!operation?.sourceChain) return false;
  if (operation.targetChain?.transaction?.txHash) return false;
  return Boolean(getWormholeOperationVaaBase64(operation) || operation.vaa);
}

/** Show Complete only when delivery is still pending and not already finished locally. */
export function canManualRedeemBridgeTransfer(
  entry: BridgeHistoryEntry,
  operation: WormholeOperation | undefined,
) {
  if (isBridgeHistoryEntryCompleted(entry, operation)) return false;
  return isWormholeDeliveryPending(operation);
}

export function getWormholeTxUrl(hash: string) {
  return `https://wormholescan.io/#/tx/${hash}?network=Testnet&view=advanced`;
}

export function getChainTxUrl(chainId: number, hash: string) {
  return chainId === 84532
    ? `https://sepolia.basescan.org/tx/${hash}`
    : `https://explorer.test.mezo.org/tx/${hash}`;
}
