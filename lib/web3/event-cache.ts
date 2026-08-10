import type { Address, Hex } from "viem";

const CACHE_DB_NAME = "aurove_event_cache_v1";
const CACHE_DB_VERSION = 2;
const EVENTS_STORE = "event_logs";
const RANGES_STORE = "event_ranges";
const BIGINT_MARKER = "__aurove_bigint__";

type BlockRange = {
  from: number;
  to: number;
};

type EventRangeRecord = {
  queryId: string;
  chainId: number;
  contractAddress: string;
  eventName: string;
  argsKey: string;
  ranges: BlockRange[];
  /** Block hashes anchoring the scanned ranges so resets and reorgs can be detected. */
  anchors?: Record<string, Hex>;
  updatedAt: number;
};

type EventLogRecord = {
  key: string;
  queryId: string;
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  logIndex: number;
  transactionHash: Hex;
  address: Address;
  args: unknown;
};

export type CachedEventLog = {
  address: Address;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  args: Record<string, unknown>;
};

let databasePromise: Promise<IDBDatabase | null> | undefined;

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function normalizeAddress(address: Address | string) {
  return address.toLowerCase();
}

function toSafeBlockNumber(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function encodeForStorage(value: unknown): unknown {
  if (typeof value === "bigint") return { [BIGINT_MARKER]: value.toString() };
  if (Array.isArray(value)) return value.map(encodeForStorage);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        encodeForStorage(nested),
      ]),
    );
  }
  return value;
}

function decodeFromStorage(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeFromStorage);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length === 1 && typeof record[BIGINT_MARKER] === "string") {
      return BigInt(record[BIGINT_MARKER] as string);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [key, decodeFromStorage(nested)]),
    );
  }
  return value;
}

function normalizeForKey(value: unknown): unknown {
  if (typeof value === "bigint") return `${BIGINT_MARKER}:${value.toString()}`;
  if (Array.isArray(value)) return value.map(normalizeForKey);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeForKey(nested)]),
    );
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeForKey(value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildQueryId(params: {
  chainId: number;
  contractAddress: Address;
  eventName: string;
  argsKey: string;
}) {
  return `${params.chainId}:${normalizeAddress(params.contractAddress)}:${params.eventName}:${params.argsKey}`;
}

function normalizeRanges(ranges: BlockRange[]) {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((left, right) => left.from - right.from);
  const normalized: BlockRange[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = normalized[normalized.length - 1];

    if (current.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, current.to);
    } else {
      normalized.push({ ...current });
    }
  }

  return normalized;
}

function missingRanges(from: number, to: number, coveredRanges: BlockRange[]) {
  if (to < from) return [];

  const covered = normalizeRanges(coveredRanges);
  const missing: BlockRange[] = [];
  let cursor = from;

  for (const range of covered) {
    if (range.to < cursor) continue;
    if (range.from > to) break;

    if (range.from > cursor) missing.push({ from: cursor, to: Math.min(to, range.from - 1) });
    cursor = Math.max(cursor, range.to + 1);
    if (cursor > to) break;
  }

  if (cursor <= to) missing.push({ from: cursor, to });
  return missing;
}

function logDedupKey(log: CachedEventLog) {
  const argsKey = stableStringify(log.args);
  return `${log.transactionHash}:${log.blockNumber.toString()}:${log.logIndex}:${normalizeAddress(log.address)}:${hashString(argsKey)}`;
}

function dedupeLogs(logs: CachedEventLog[]) {
  const unique = new Map<string, CachedEventLog>();
  logs.forEach((log) => unique.set(logDedupKey(log), log));
  return [...unique.values()].sort((left, right) => {
    if (left.blockNumber === right.blockNumber) {
      if (left.logIndex !== right.logIndex) return left.logIndex - right.logIndex;
      return left.transactionHash.localeCompare(right.transactionHash);
    }
    return left.blockNumber > right.blockNumber ? 1 : -1;
  });
}

async function openCacheDatabase() {
  if (!hasIndexedDb()) return null;
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const eventsStore = db.createObjectStore(EVENTS_STORE, { keyPath: "key" });
        eventsStore.createIndex("byQueryBlock", ["queryId", "blockNumber"], { unique: false });
        eventsStore.createIndex("byChain", "chainId", { unique: false });
      }

      if (!db.objectStoreNames.contains(RANGES_STORE)) {
        const rangesStore = db.createObjectStore(RANGES_STORE, { keyPath: "queryId" });
        rangesStore.createIndex("byChain", "chainId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open event cache"));
  }).catch(() => null);

  return databasePromise;
}

async function readQueryRangeRecord(database: IDBDatabase, queryId: string) {
  const tx = database.transaction(RANGES_STORE, "readonly");
  const store = tx.objectStore(RANGES_STORE);
  const record = await requestToPromise(
    store.get(queryId) as IDBRequest<EventRangeRecord | undefined>,
  );
  await txDone(tx);
  return record
    ? { ...record, ranges: normalizeRanges(record.ranges), anchors: record.anchors ?? {} }
    : undefined;
}

async function clearQueryData(database: IDBDatabase, queryId: string) {
  const tx = database.transaction([RANGES_STORE, EVENTS_STORE], "readwrite");
  const rangesStore = tx.objectStore(RANGES_STORE);
  const eventsStore = tx.objectStore(EVENTS_STORE);
  const eventKeys = await requestToPromise(
    eventsStore
      .index("byQueryBlock")
      .getAllKeys(IDBKeyRange.bound([queryId, 0], [queryId, Number.MAX_SAFE_INTEGER])),
  );

  rangesStore.delete(queryId);
  eventKeys.forEach((key) => eventsStore.delete(key));
  await txDone(tx);
}

async function isRangeRecordCanonical(
  record: EventRangeRecord,
  getBlockHash: (blockNumber: bigint) => Promise<Hex | null>,
) {
  const anchors = Object.entries(record.anchors ?? {})
    .map(([blockNumber, blockHash]) => ({ blockNumber: BigInt(blockNumber), blockHash }))
    .sort((left, right) => (left.blockNumber < right.blockNumber ? 1 : -1));
  if (record.ranges.length > 0 && anchors.length === 0) return false;
  if (anchors.length === 0) return true;

  const latestAnchor = anchors[0];
  const canonicalHash = await getBlockHash(latestAnchor.blockNumber).catch(() => null);
  return canonicalHash?.toLowerCase() === latestAnchor.blockHash.toLowerCase();
}

async function readCachedLogs(database: IDBDatabase, queryId: string, from: number, to: number) {
  const tx = database.transaction(EVENTS_STORE, "readonly");
  const store = tx.objectStore(EVENTS_STORE);
  const index = store.index("byQueryBlock");
  const records = await requestToPromise(
    index.getAll(IDBKeyRange.bound([queryId, from], [queryId, to])) as IDBRequest<EventLogRecord[]>,
  );
  await txDone(tx);

  return records.map((record) => ({
    address: record.address,
    transactionHash: record.transactionHash,
    blockNumber: BigInt(record.blockNumber),
    logIndex: record.logIndex ?? 0,
    args: (decodeFromStorage(record.args) ?? {}) as Record<string, unknown>,
  }));
}

async function persistFetchedData(params: {
  database: IDBDatabase;
  queryId: string;
  chainId: number;
  contractAddress: Address;
  eventName: string;
  argsKey: string;
  scannedRanges: BlockRange[];
  scannedAnchors: Record<string, Hex>;
  fetchedLogs: CachedEventLog[];
}) {
  if (params.scannedRanges.length === 0 && params.fetchedLogs.length === 0) return;

  const tx = params.database.transaction([RANGES_STORE, EVENTS_STORE], "readwrite");
  const rangesStore = tx.objectStore(RANGES_STORE);
  const eventsStore = tx.objectStore(EVENTS_STORE);
  const existingRecord = await requestToPromise(
    rangesStore.get(params.queryId) as IDBRequest<EventRangeRecord | undefined>,
  );

  rangesStore.put({
    queryId: params.queryId,
    chainId: params.chainId,
    contractAddress: normalizeAddress(params.contractAddress),
    eventName: params.eventName,
    argsKey: params.argsKey,
    ranges: normalizeRanges([...(existingRecord?.ranges ?? []), ...params.scannedRanges]),
    anchors: { ...(existingRecord?.anchors ?? {}), ...params.scannedAnchors },
    updatedAt: Date.now(),
  } satisfies EventRangeRecord);

  for (const log of params.fetchedLogs) {
    const blockNumber = toSafeBlockNumber(log.blockNumber);
    if (blockNumber === null) continue;

    const argsKey = stableStringify(log.args);
    eventsStore.put({
      key: `${params.queryId}:${log.transactionHash}:${blockNumber}:${log.logIndex}:${normalizeAddress(log.address)}:${hashString(argsKey)}`,
      queryId: params.queryId,
      chainId: params.chainId,
      contractAddress: normalizeAddress(params.contractAddress),
      blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      address: log.address,
      args: encodeForStorage(log.args),
    } satisfies EventLogRecord);
  }

  await txDone(tx);
}

export async function getEventLogsFromCacheOrFetch(params: {
  chainId: number;
  contractAddress: Address;
  eventName: string;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  getBlockHash?: (blockNumber: bigint) => Promise<Hex | null>;
  fetchRange: (fromBlock: bigint, toBlock: bigint) => Promise<CachedEventLog[]>;
}) {
  if (params.toBlock < params.fromBlock) return [];

  const from = toSafeBlockNumber(params.fromBlock);
  const to = toSafeBlockNumber(params.toBlock);
  if (from === null || to === null) return params.fetchRange(params.fromBlock, params.toBlock);

  const database = await openCacheDatabase();
  if (!database) return params.fetchRange(params.fromBlock, params.toBlock);

  const argsKey = stableStringify(params.args ?? {});
  const queryId = buildQueryId({
    chainId: params.chainId,
    contractAddress: params.contractAddress,
    eventName: params.eventName,
    argsKey,
  });

  try {
    let rangeRecord = await readQueryRangeRecord(database, queryId);
    if (
      rangeRecord &&
      params.getBlockHash &&
      !(await isRangeRecordCanonical(rangeRecord, params.getBlockHash))
    ) {
      await clearQueryData(database, queryId);
      rangeRecord = undefined;
    }

    const ranges = rangeRecord?.ranges ?? [];
    const cachedLogs = await readCachedLogs(database, queryId, from, to);
    const uncoveredRanges = missingRanges(from, to, ranges);

    if (uncoveredRanges.length === 0) return dedupeLogs(cachedLogs);

    const fetchedLogs = (
      await Promise.all(
        uncoveredRanges.map((range) => params.fetchRange(BigInt(range.from), BigInt(range.to))),
      )
    ).flat();
    const scannedAnchors = params.getBlockHash
      ? Object.fromEntries(
          (
            await Promise.all(
              uncoveredRanges.map(async (range) => [
                String(range.to),
                await params.getBlockHash!(BigInt(range.to)),
              ] as const),
            )
          ).filter((entry): entry is readonly [string, Hex] => entry[1] !== null),
        )
      : {};

    await persistFetchedData({
      database,
      queryId,
      chainId: params.chainId,
      contractAddress: params.contractAddress,
      eventName: params.eventName,
      argsKey,
      scannedRanges: uncoveredRanges,
      scannedAnchors,
      fetchedLogs,
    });

    return dedupeLogs([...cachedLogs, ...fetchedLogs]);
  } catch {
    return params.fetchRange(params.fromBlock, params.toBlock);
  }
}

export async function scanEventLogsByChunks(params: {
  chainId: number;
  contractAddress: Address;
  eventName: string;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
  direction?: "forward" | "backward";
  getBlockHash?: (blockNumber: bigint) => Promise<Hex | null>;
  fetchRange: (fromBlock: bigint, toBlock: bigint) => Promise<CachedEventLog[]>;
}) {
  if (params.toBlock < params.fromBlock) return [];

  const logs: CachedEventLog[] = [];
  const chunkSize = params.chunkSize > 0n ? params.chunkSize : 10_000n;

  if (params.direction === "backward") {
    let toBlock = params.toBlock;

    while (toBlock >= params.fromBlock) {
      const chunkStart = toBlock >= chunkSize - 1n ? toBlock - chunkSize + 1n : 0n;
      const fromBlock = chunkStart < params.fromBlock ? params.fromBlock : chunkStart;

      logs.push(
        ...(await getEventLogsFromCacheOrFetch({
          chainId: params.chainId,
          contractAddress: params.contractAddress,
          eventName: params.eventName,
          args: params.args,
          fromBlock,
          toBlock,
          getBlockHash: params.getBlockHash,
          fetchRange: params.fetchRange,
        })),
      );

      if (fromBlock === params.fromBlock) break;
      toBlock = fromBlock - 1n;
    }

    return dedupeLogs(logs);
  }

  let fromBlock = params.fromBlock;

  while (fromBlock <= params.toBlock) {
    const chunkEnd = fromBlock + chunkSize - 1n;
    const toBlock = chunkEnd > params.toBlock ? params.toBlock : chunkEnd;

    logs.push(
      ...(await getEventLogsFromCacheOrFetch({
        chainId: params.chainId,
        contractAddress: params.contractAddress,
        eventName: params.eventName,
        args: params.args,
        fromBlock,
        toBlock,
        getBlockHash: params.getBlockHash,
        fetchRange: params.fetchRange,
      })),
    );

    fromBlock = toBlock + 1n;
  }

  return dedupeLogs(logs);
}

export async function findLatestEventLogByChunks(params: {
  chainId: number;
  contractAddress: Address;
  eventName: string;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
  getBlockHash?: (blockNumber: bigint) => Promise<Hex | null>;
  fetchRange: (fromBlock: bigint, toBlock: bigint) => Promise<CachedEventLog[]>;
}) {
  if (params.toBlock < params.fromBlock) return null;

  const chunkSize = params.chunkSize > 0n ? params.chunkSize : 10_000n;
  let toBlock = params.toBlock;

  while (toBlock >= params.fromBlock) {
    const chunkStart = toBlock >= chunkSize - 1n ? toBlock - chunkSize + 1n : 0n;
    const fromBlock = chunkStart < params.fromBlock ? params.fromBlock : chunkStart;
    const logs = await getEventLogsFromCacheOrFetch({
      chainId: params.chainId,
      contractAddress: params.contractAddress,
      eventName: params.eventName,
      args: params.args,
      fromBlock,
      toBlock,
      getBlockHash: params.getBlockHash,
      fetchRange: params.fetchRange,
    });
    const sortedLogs = dedupeLogs(logs);

    if (sortedLogs.length > 0) return sortedLogs[sortedLogs.length - 1];
    if (fromBlock === params.fromBlock) break;
    toBlock = fromBlock - 1n;
  }

  return null;
}
