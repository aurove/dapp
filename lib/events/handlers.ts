import "server-only";

import { db } from "@/lib/db";
import { marketplacePriceObservations } from "@/lib/db/marketplace-schema";
import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";
import { getAddress, http, createPublicClient, type Address, type PublicClient } from "viem";

import { getContractEventNames } from "./contracts";
import type {
  AnyContractEventHandler,
  ContractEventHandlerContext,
  ContractEventHandlerDefinition,
  RegisteredContract,
} from "./types";
import type {
  ContractEventNameForContract,
  ContractName,
  DecodedContractEvent,
} from "@/contracts/event-types";

export { buildHandlerKeyTyped as buildHandlerKey };

const shouldLogInternalEvents = (() => {
  const value = process.env.LOG_EVENTS;
  return value == null || value.toLowerCase() === "true";
})();

function logEventHandler(event: string, details: Record<string, unknown>) {
  if (shouldLogInternalEvents) {
    console.info(JSON.stringify({ scope: "internal-events", event, ...details }));
  }
}

const DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
  },
] as const;

const PRICE_SCALE = 10n ** 18n;

let marketplaceObservationClient: PublicClient | null = null;
let marketplaceObservationRpcUrl: string | null = null;

function getMarketplaceObservationRpcUrl(): string {
  const configured =
    process.env.MARKETPLACE_PRICE_RPC_URL?.trim() ||
    process.env.EVENTS_RELAY_RPC_URL?.trim() ||
    process.env.RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim();

  return configured && configured.length > 0 ? configured : "http://127.0.0.1:8545";
}

function getMarketplaceObservationClient(): PublicClient {
  const rpcUrl = getMarketplaceObservationRpcUrl();
  if (!marketplaceObservationClient || marketplaceObservationRpcUrl !== rpcUrl) {
    marketplaceObservationClient = createPublicClient({
      transport: http(rpcUrl, { timeout: 15_000 }),
    });
    marketplaceObservationRpcUrl = rpcUrl;
  }

  return marketplaceObservationClient;
}

function toBigIntValue(value: unknown, fallback?: bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && value.trim().length > 0) return BigInt(value.trim());
  if (fallback !== undefined) return fallback;
  throw new Error(`Expected bigint-compatible value, received ${String(value)}.`);
}

function toAddressValue(value: unknown): Address {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected address-compatible value, received ${String(value)}.`);
  }

  return getAddress(value);
}

async function readDecimals(address: Address): Promise<number> {
  try {
    const result = await getMarketplaceObservationClient().readContract({
      address,
      abi: DECIMALS_ABI,
      functionName: "decimals",
    });

    return Number(result);
  } catch {
    return 18;
  }
}

function scalePricePerUnit(input: {
  amountFilled: bigint;
  grossTradeValue: bigint;
  assetDecimals: number;
  paymentTokenDecimals: number;
}): bigint {
  if (input.amountFilled === 0n) {
    return 0n;
  }

  const assetScale = 10n ** BigInt(input.assetDecimals);
  const paymentScale = 10n ** BigInt(input.paymentTokenDecimals);
  return (
    (input.grossTradeValue * assetScale * PRICE_SCALE) /
    input.amountFilled /
    paymentScale
  );
}

async function recordMarketplacePriceObservation(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"Marketplace", "OrdersMatched">,
) {
  const namedArgs = event.namedArgs;
  const collection = toAddressValue(namedArgs.collection);
  const paymentToken = toAddressValue(namedArgs.paymentToken);
  const tokenId = toBigIntValue(namedArgs.tokenId);
  const amountFilled = toBigIntValue(namedArgs.amountFilled);
  const grossTradeValue = toBigIntValue(namedArgs.grossTradeValue);
  const assetFee = toBigIntValue(namedArgs.assetFee, 0n);
  const paymentFee = toBigIntValue(namedArgs.paymentFee, 0n);
  const assetDecimals = await readDecimals(collection);
  const paymentTokenDecimals = await readDecimals(paymentToken);
  const pricePerUnit = scalePricePerUnit({
    amountFilled,
    grossTradeValue,
    assetDecimals,
    paymentTokenDecimals,
  });
  const idempotencyKey = `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`;
  const blockTimestamp = new Date(event.blockTimestamp * 1000).toISOString();

  const rows = await db
    .insert(marketplacePriceObservations)
    .values({
      idempotencyKey,
      chainId: event.chainId,
      collection,
      tokenId: tokenId.toString(),
      paymentToken,
      assetDecimals,
      paymentTokenDecimals,
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      assetFee: assetFee.toString(),
      paymentFee: paymentFee.toString(),
      pricePerUnit: pricePerUnit.toString(),
      txHash: event.txHash.toLowerCase(),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      blockTimestamp,
    })
    .onConflictDoNothing()
    .returning({
      id: marketplacePriceObservations.id,
    });

  if (rows.length === 0) {
    return {
      status: "skipped" as const,
      reason: "duplicate_price_observation",
      idempotencyKey,
      chainId: event.chainId,
      collection,
      paymentToken,
      tokenId: tokenId.toString(),
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      pricePerUnit: pricePerUnit.toString(),
    };
  }

  ctx.logger.info(
    JSON.stringify({
      scope: "internal-events",
      event: "marketplace.price_observation.recorded",
      chainId: event.chainId,
      collection,
      paymentToken,
      tokenId: tokenId.toString(),
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      pricePerUnit: pricePerUnit.toString(),
      txHash: event.txHash,
      logIndex: event.logIndex,
    }),
  );

  return {
    ok: true,
    inserted: true,
    idempotencyKey,
    observationId: rows[0]?.id ?? null,
    chainId: event.chainId,
    collection,
    paymentToken,
    tokenId: tokenId.toString(),
    amountFilled: amountFilled.toString(),
    grossTradeValue: grossTradeValue.toString(),
    pricePerUnit: pricePerUnit.toString(),
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockTimestamp,
  };
}

function createPlaceholderContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler {
  return {
    key: `${contractName}.${eventName}`,
    description: `Placeholder handler for ${contractName}.${eventName}.`,
    contractName,
    eventName,
    run(ctx, event) {
      logEventHandler("contract.event.received.placeholder", {
        contractName: ctx.contract.contractName,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        fingerprint: ctx.fingerprint,
        chainId: event.chainId,
        blockNumber: event.blockNumber,
        blockTimestamp: event.blockTimestamp,
        txHash: event.txHash,
        blockHash: event.blockHash,
        namedArgs: event.namedArgs,
      });

      // TODO: replace placeholder dispatch with contract-specific ingestion handlers.
      return {
        ok: true,
        message: "Placeholder contract event handler executed.",
        contractName: ctx.contract.contractName,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        namedArgs: event.namedArgs,
        blockTimestamp: event.blockTimestamp,
        txHash: event.txHash,
        blockHash: event.blockHash,
        fingerprint: ctx.fingerprint,
      };
    },
  };
}

const contractEventHandlers = new Map<string, AnyContractEventHandler>();

export function registerContractEventHandlersForContract(
  contract: Pick<RegisteredContract, "contractName" | "abi">,
) {
  for (const eventName of getContractEventNames(contract.abi)) {
    const key = `${contract.contractName}.${eventName}`;
    if (contractEventHandlers.has(key)) {
      continue;
    }

    contractEventHandlers.set(
      key,
      createPlaceholderContractEventHandler(contract.contractName, eventName),
    );
  }
}

registerContractEventHandler({
  key: buildHandlerKeyTyped("Marketplace", "OrdersMatched"),
  description: "Record marketplace execution prices for matched orders.",
  contractName: "Marketplace",
  eventName: "OrdersMatched",
  run: recordMarketplacePriceObservation,
});

export function registerContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(handler: ContractEventHandlerDefinition<TContractName, TEventName>): ContractEventHandlerDefinition<TContractName, TEventName> {
  contractEventHandlers.set(handler.key, handler as unknown as AnyContractEventHandler);
  return handler;
}

export function getContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(
  contractName: TContractName,
  eventName: TEventName,
): ContractEventHandlerDefinition<TContractName, TEventName> | null;
export function getContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler | null;
export function getContractEventHandler(contractName: ContractName, eventName: string): AnyContractEventHandler | null {
  return contractEventHandlers.get(`${contractName}.${eventName}`) ?? null;
}

export function listContractEventHandlers(): AnyContractEventHandler[] {
  return Array.from(contractEventHandlers.values());
}

export const internalEventHandlers = listContractEventHandlers();
export const internalEventHandlerMap: Map<string, AnyContractEventHandler> = contractEventHandlers;
