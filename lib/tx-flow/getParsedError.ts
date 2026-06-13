import {
  BaseError as BaseViemError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  formatUnits,
} from "viem";

import contractsRegistry from "@/contracts/registry";

/**
 * Parses a viem/wagmi error into a displayable string.
 */
type ParsedErrorLike = {
  walk?: () => unknown;
  details?: string;
  shortMessage?: string;
  message?: string;
  name?: string;
  cause?: unknown;
  data?: {
    errorName?: string;
    args?: { toString?: () => string } | unknown;
    data?: unknown;
  };
};

type HexLike = `0x${string}`;

type AbiErrorFragment = {
  type: "error";
  name: string;
  inputs?: readonly { type: string; name?: string }[];
};

const KNOWN_ERROR_ABIS = (() => {
  const seen = new Set<string>();
  const abis: AbiErrorFragment[][] = [];

  for (const chainContracts of Object.values(contractsRegistry)) {
    for (const contract of Object.values(chainContracts)) {
      const errorFragments = contract.abi.filter(
        (entry: { type?: string }) => entry.type === "error",
      ) as AbiErrorFragment[];
      if (!errorFragments.length) continue;

      const signatureKey = errorFragments
        .map((fragment) => {
          const inputs =
            fragment.inputs?.map((input: { type: string }) => input.type).join(",") ?? "";
          return `${fragment.name}(${inputs})`;
        })
        .join("|");

      if (seen.has(signatureKey)) continue;
      seen.add(signatureKey);
      abis.push(errorFragments);
    }
  }

  return abis;
})();

const RETURN_DATA_REGEX = /return data:\s*(0x[a-fA-F0-9]+)/;

function isHexLike(value: unknown): value is HexLike {
  return typeof value === "string" && value.startsWith("0x");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringifyArg(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function normalizeErrorArgs(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (
    typeof value === "object" &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  ) {
    return Array.from(value as Iterable<unknown>);
  }
  return [value];
}

function formatAddress(value: unknown): string {
  const text = stringifyArg(value);
  return text.length > 12 && text.startsWith("0x")
    ? `${text.slice(0, 6)}...${text.slice(-4)}`
    : text;
}

function formatRaw18(value: unknown): string {
  try {
    return formatUnits(BigInt(stringifyArg(value)), 18);
  } catch {
    return stringifyArg(value);
  }
}

function formatRawUnits(value: unknown): string {
  return `${stringifyArg(value)} raw units`;
}

function formatKnownCustomError(errorName: string, args: readonly unknown[]): string | undefined {
  switch (errorName) {
    case "ZeroAddress":
      return "A required contract or wallet address is missing.";
    case "InvalidAmount":
      return "Enter an amount greater than zero.";
    case "InvalidPrice":
      return "Enter a price greater than zero.";
    case "InvalidExpiry":
      return "The selected expiry is invalid.";
    case "ListingSignatureExpired":
      return `The listing signature expired at ${stringifyArg(args[0])}. Please create a new listing.`;
    case "PaymentTokenNotAllowed":
      return `The selected payment token (${formatAddress(args[0])}) is not allowed for this marketplace.`;
    case "InvalidAdminContract":
      return `The marketplace admin contract (${formatAddress(args[0])}) is invalid.`;
    case "InvalidPaymentRouter":
      return `The payment router (${formatAddress(args[0])}) is invalid.`;
    case "UnsupportedCollection":
      return `This collection (${formatAddress(args[0])}) is not supported by the marketplace.`;
    case "CollectionCheckFailed":
      return "The marketplace could not verify whether this collection is supported.";
    case "Paused":
      return "The marketplace is paused by admin.";
    case "PauseCheckFailed":
      return "The marketplace could not verify its pause status.";
    case "InvalidPagination":
      return "The requested page or page size is invalid.";
    case "ListingNotActive":
      return `Listing #${stringifyArg(args[0])} is not active.`;
    case "BidNotActive":
      return `Bid #${stringifyArg(args[0])} is not active.`;
    case "ListingExpired":
      return `Listing #${stringifyArg(args[0])} has expired.`;
    case "BidExpired":
      return `Bid #${stringifyArg(args[0])} has expired.`;
    case "NotListingSeller":
      return `Only the listing seller can update listing #${stringifyArg(
        args[0],
      )}. Connected wallet: ${formatAddress(args[1])}.`;
    case "NotBidder":
      return `Only the bidder can update bid #${stringifyArg(
        args[0],
      )}. Connected wallet: ${formatAddress(args[1])}.`;
    case "OrderMismatch":
      return "The selected ask and bid are for different markets or payment tokens.";
    case "PriceNotCrossed":
      return `The bid price is below the ask price. Ask: ${formatRaw18(
        args[0],
      )}; bid: ${formatRaw18(args[1])}.`;
    case "SelfMatchNotAllowed":
      return "You cannot match your own orders.";
    case "CannotSellToOwnBid":
      return `You cannot sell into your own bid (#${stringifyArg(args[0])}).`;
    case "CannotBuyOwnListing":
      return `You cannot buy your own listing (#${stringifyArg(args[0])}).`;
    case "ListingOperatorNotApproved":
      return `The seller (${formatAddress(
        args[0],
      )}) has not approved the marketplace operator (${formatAddress(args[1])}) for this listing.`;
    case "InsufficientFractionBalance":
      return `Insufficient fraction balance. Wallet ${formatAddress(args[0])} has ${formatRaw18(
        args[3],
      )} fractions of token #${stringifyArg(args[2])}, but this action requires ${formatRaw18(
        args[4],
      )}.`;
    case "FractionTransferNotApproved":
      return `Fraction transfers are not approved. Wallet ${formatAddress(
        args[0],
      )} must approve operator ${formatAddress(args[1])}.`;
    case "InsufficientPaymentAllowance":
      return `Insufficient payment allowance. Wallet ${formatAddress(
        args[0],
      )} approved ${formatRawUnits(args[2])}, but this action requires ${formatRawUnits(args[3])}.`;
    case "InsufficientPaymentBalance":
      return `Insufficient payment balance. Wallet ${formatAddress(args[0])} has ${formatRawUnits(
        args[2],
      )}, but this action requires ${formatRawUnits(args[3])}.`;
    case "InsufficientPayment":
      return `Insufficient native payment sent. Sent ${formatRawUnits(
        args[0],
      )}, required ${formatRawUnits(args[1])}.`;
    case "ArithmeticOverflow":
      return "The marketplace calculation overflowed. Try a smaller amount or price.";
    default:
      return undefined;
  }
}

function formatRawCustomError(errorName: string, args: readonly unknown[]): string {
  return `${errorName}(${args.map(stringifyArg).join(", ")})`;
}

function parseCustomErrorString(value: string): { errorName: string; args: string[] } | null {
  const match = value.match(/([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/);
  if (!match) return null;

  return {
    errorName: match[1],
    args: match[2].length > 0 ? match[2].split(",").map((arg) => arg.trim()) : [],
  };
}

function extractReturnData(value: string | undefined): HexLike | undefined {
  if (!value) return undefined;

  const match = value.match(RETURN_DATA_REGEX);
  if (!match) return undefined;

  return match[1] as HexLike;
}

function formatCustomError(errorName: string, args: readonly unknown[]): string {
  return formatKnownCustomError(errorName, args) ?? formatRawCustomError(errorName, args);
}

function formatKnownErrorInMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const parsed = parseCustomErrorString(message);
  if (!parsed) return undefined;
  return formatKnownCustomError(parsed.errorName, parsed.args);
}

function extractRevertData(error: unknown, depth = 0): HexLike | undefined {
  if (!error || typeof error !== "object" || depth > 4) return undefined;

  const record = error as Record<string, unknown>;
  if (isHexLike(record.data)) return record.data;

  const data = record.data;
  if (data && typeof data === "object") {
    const nestedData = (data as Record<string, unknown>).data;
    if (isHexLike(nestedData)) return nestedData;
  }

  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const nested = extractRevertData(nestedError, depth + 1);
    if (nested) return nested;
  }

  const cause = record.cause;
  if (cause && typeof cause === "object") {
    const nested = extractRevertData(cause, depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function decodeCustomErrorFallback(errorData: HexLike): string | undefined {
  for (const abi of KNOWN_ERROR_ABIS) {
    try {
      const decoded = decodeErrorResult({ abi: abi as never, data: errorData });
      return formatCustomError(decoded.errorName, normalizeErrorArgs(decoded.args));
    } catch {
      continue;
    }
  }

  return undefined;
}

export const getParsedError = (error: unknown): string => {
  const candidate = error as ParsedErrorLike | undefined;
  const parsedError = candidate?.walk ? candidate.walk() : error;
  const revertData =
    extractRevertData(parsedError) ||
    extractReturnData(candidate?.shortMessage) ||
    extractReturnData(candidate?.details) ||
    extractReturnData(candidate?.message);

  if (parsedError instanceof BaseViemError) {
    if (
      parsedError instanceof ContractFunctionRevertedError &&
      parsedError.data &&
      parsedError.data.errorName !== "Error"
    ) {
      return formatCustomError(
        parsedError.data.errorName,
        normalizeErrorArgs(parsedError.data.args),
      );
    }

    if (parsedError instanceof ContractFunctionRevertedError && revertData) {
      const decoded = decodeCustomErrorFallback(revertData);
      if (decoded) {
        return decoded;
      }
    }

    const knownDetails = formatKnownErrorInMessage(parsedError.details);
    if (knownDetails) {
      return knownDetails;
    }

    if (parsedError.details) {
      return parsedError.details;
    }

    if (parsedError.shortMessage) {
      const knownShortMessage = formatKnownErrorInMessage(parsedError.shortMessage);
      if (knownShortMessage) {
        return knownShortMessage;
      }

      return parsedError.shortMessage;
    }

    return (
      formatKnownErrorInMessage(parsedError.message) ??
      parsedError.message ??
      parsedError.name ??
      "An unknown error occurred"
    );
  }

  const fallback = parsedError as ParsedErrorLike | undefined;
  if (revertData) {
    const decoded = decodeCustomErrorFallback(revertData);
    if (decoded) {
      return decoded;
    }
  }

  if (typeof parsedError === "string") {
    return formatKnownErrorInMessage(parsedError) ?? parsedError;
  }

  if (isRecord(fallback)) {
    const shortMessage =
      typeof fallback.shortMessage === "string" ? fallback.shortMessage : undefined;
    const message = typeof fallback.message === "string" ? fallback.message : undefined;
    const rawData = extractReturnData(shortMessage) || extractReturnData(message);

    if (rawData) {
      const decoded = decodeCustomErrorFallback(rawData);
      if (decoded) {
        return decoded;
      }
    }

    return (
      formatKnownErrorInMessage(shortMessage) ??
      formatKnownErrorInMessage(message) ??
      message ??
      "An unknown error occurred"
    );
  }

  return "An unknown error occurred";
};
