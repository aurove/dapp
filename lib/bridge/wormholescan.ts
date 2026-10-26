import type { Address, Hex } from "viem";

const HISTORY_PREFIX = "aurove:horizon:bridge-history:v1:";
const TESTNET_API = "https://api.testnet.wormholescan.io/api/v1";

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
};

export type WormholeOperation = {
  vaa?: {
    raw?: string;
    guardianSetIndex?: number;
    isDuplicated?: boolean;
  };
  sourceChain?: { transaction?: { txHash?: string }; status?: string; chainId?: number };
  targetChain?: { transaction?: { txHash?: string }; status?: string; chainId?: number };
};

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
      Boolean(entry && typeof entry === "object" &&
        typeof entry.id === "string" && typeof entry.account === "string" &&
        typeof entry.sourceTxHash === "string" && typeof entry.sourceTransceiver === "string" &&
        typeof entry.sourceChainId === "number" && typeof entry.destinationChainId === "number" &&
        typeof entry.sourceName === "string" && typeof entry.destinationName === "string" &&
        typeof entry.symbol === "string" && typeof entry.amount === "string" &&
        typeof entry.submittedAt === "number")
    );
  } catch {
    return [];
  }
}

export function saveBridgeHistoryEntry(entry: BridgeHistoryEntry): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const entries = readBridgeHistory(entry.account);
  const next = [entry, ...entries.filter((item) => item.sourceTxHash.toLowerCase() !== entry.sourceTxHash.toLowerCase())].slice(0, 50);
  try {
    window.localStorage.setItem(storageKey(entry.account), JSON.stringify(next));
  } catch {
    return entries;
  }
  return next;
}

export async function fetchWormholeOperations(transceivers: Address[]): Promise<WormholeOperation[]> {
  const unique = [...new Set(transceivers.map((address) => address.toLowerCase()))];
  const responses = await Promise.all(unique.map(async (address) => {
    const url = new URL(`${TESTNET_API}/operations`);
    url.searchParams.set("address", address);
    url.searchParams.set("pageSize", "50");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Wormholescan returned ${response.status}.`);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !Array.isArray((result as { operations?: unknown }).operations)) return [];
    return (result as { operations: WormholeOperation[] }).operations;
  }));
  return responses.flat();
}

export function findWormholeOperation(operations: WormholeOperation[] | undefined, sourceTxHash: Hex) {
  const expected = sourceTxHash.toLowerCase();
  return operations?.find((operation) => operation.sourceChain?.transaction?.txHash?.toLowerCase() === expected);
}

export function getWormholeOperationStatus(operation: WormholeOperation | undefined) {
  if (!operation?.sourceChain) return "Waiting for Wormholescan";
  if (operation.targetChain?.transaction?.txHash || operation.targetChain) return "Completed";
  if (getWormholeOperationVaaBase64(operation) || operation.vaa) {
    return "VAA published · delivery pending";
  }
  return "In progress · awaiting VAA";
}

/** True when the VAA is ready but destination delivery has not been recorded. */
export function isWormholeDeliveryPending(operation: WormholeOperation | undefined) {
  if (!operation?.sourceChain) return false;
  if (operation.targetChain?.transaction?.txHash) return false;
  return Boolean(getWormholeOperationVaaBase64(operation) || operation.vaa);
}

export function getWormholeTxUrl(hash: string) {
  return `https://wormholescan.io/#/tx/${hash}?network=Testnet&view=advanced`;
}

export function getChainTxUrl(chainId: number, hash: string) {
  return chainId === 84532
    ? `https://sepolia.basescan.org/tx/${hash}`
    : `https://explorer.test.mezo.org/tx/${hash}`;
}
