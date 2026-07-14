import {
  BaseError as BaseViemError,
  ContractFunctionRevertedError,
  decodeErrorResult,
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

function formatRawUnits(value: unknown): string {
  return `${stringifyArg(value)} raw units`;
}

function formatKnownCustomError(errorName: string, args: readonly unknown[]): string | undefined {
  switch (errorName) {
    case "ZeroAddress":
      return "A required contract or wallet address is missing.";
    case "ZeroAsset":
      return "The wrapped asset address is missing.";
    case "InvalidAmount":
    case "ZeroAmount":
      return "Enter an amount greater than zero.";
    case "ZeroReceiver":
      return "Choose a valid recipient address.";
    case "ZeroToken":
      return "The wrapper token is not configured.";
    case "ZeroTokenId":
      return "Choose at least one veNFT token id.";
    case "ZeroAssetLedger":
      return "The configured asset ledger is missing.";
    case "ZeroVault":
      return "The configured vault is missing.";
    case "ZeroRewardSink":
      return "No reward sink is configured for this tranche.";
    case "ZeroId20Factory":
      return "The ID20 factory address is missing.";
    case "InvalidRecipient":
      return "Choose a valid reward recipient.";
    case "InvalidRecipientData":
      return "Recipient data must be empty or encoded as an address.";
    case "InsufficientRewardReserve":
      return `The reward reserve is temporarily short by ${formatRawUnits(args[1])}.`;
    case "NoRewardsToClaim":
    case "NoRewardsClaimed":
      return "No rewards are currently available to claim.";
    case "UnsupportedAsset":
      return "That asset is not supported by this wrapper.";
    case "UnsupportedId":
      return "That token id is not supported by this wrapper.";
    case "UnsupportedBatch":
      return "Batch transfers are not supported for this action.";
    case "InvalidTrancheId":
      return "That tranche id is not supported.";
    case "UnsupportedTrancheVariant":
      return "That tranche variant is not supported.";
    case "InvalidEpochs":
      return "That lock duration is not supported.";
    case "TrancheNotRegistered":
      return "No manager or reward sink is registered for this tranche.";
    case "InvalidRewardTrancheId":
      return "That reward sink is linked to a different tranche.";
    case "InvalidRewardCollection":
      return "That reward collection is not supported.";
    case "InvalidRewardSyncCaller":
      return "Only the configured ledger can sync reward funding.";
    case "RewardSinkAlreadyLinked":
      return "That reward sink is already linked to a manager.";
    case "UnauthorizedVault":
      return "Only the vault can link this manager.";
    case "UnauthorizedOperator":
      return "Only the ledger can transfer this veNFT into custody.";
    case "UnauthorizedLedger":
      return "Only the configured ledger can release this inventory.";
    case "UnsupportedVeNft":
      return "That veNFT collection is not supported by the vault.";
    case "InvalidCustodyData":
      return "The selected veNFT inventory does not match the requested redeem.";
    case "DuplicateCustody":
      return "That veNFT is already tracked for this tranche.";
    case "InvalidRedeemAmount":
      return "Enter a valid redeem amount.";
    case "RedemptionOutsideSettlementWindow":
      return "Redeem is only available during the settlement window.";
    case "InsufficientRedeemableBalance":
      return `Not enough redeemable tranche units for ${formatRawUnits(args[2])}.`;
    case "RedeemLockOverflow":
      return "The redeem lock overflowed.";
    case "RedeemLockEpochMismatch":
      return "Those tranche units are locked by a different settlement epoch.";
    case "InvalidVariantForTranche":
      return "That action cannot be used for this tranche.";
    case "InsufficientRedeemInventory":
      return "The tranche vault does not have enough inventory to satisfy this redeem.";
    case "LockedVaultAlreadySet":
      return "The locked vault has already been configured.";
    case "RewardFeeTooHigh":
      return "The reward fee is too high.";
    case "FeeConfigProposalTooLate":
      return "That fee proposal was submitted too close to epoch end.";
    case "FeeConfigExecutionTooEarly":
      return "That fee configuration cannot be executed yet.";
    case "NoPendingFeeConfig":
      return "There is no pending fee configuration to execute.";
    case "RewardBatchTransfersNotSupported":
      return "Batch reward transfers are not supported.";
    case "InvalidManagedVeNft":
      return "That veNFT does not match the configured collection.";
    case "InvalidManagedTokenId":
      return "That managed token id is invalid.";
    case "InvalidManagedTokenType":
      return "That managed veNFT type is not supported.";
    case "ManagedVeNftNotEmpty":
      return "The managed veNFT must be empty before deposit.";
    case "ManagedTokenNotSet":
      return "The managed token has not been configured yet.";
    case "ManagedTokenAlreadySet":
      return "The managed token is already configured.";
    case "InvalidLedgerCaller":
      return "Only the ledger can call this manager.";
    case "UnauthorizedLedgerOwner":
      return "Only the ledger owner can perform this action.";
    case "UnauthorizedVoteMaintainer":
      return "You are not allowed to forward votes for this manager.";
    case "UnauthorizedSwapMaintainer":
      return "You are not allowed to withdraw manager-held tokens.";
    case "VoterNotAllowed":
      return "That voter contract is not allowlisted.";
    case "InvalidWrapper":
      return "That wrapper address is not registered.";
    case "AlreadyActive":
      return "This account is already active in the gauge.";
    case "NotInitialized":
      return "Activate the wrapper before claiming rewards.";
    case "NoRewards":
      return "No rewards are currently available.";
    case "NoWeight":
      return "No reward weight is currently available.";
    case "InsufficientSettleableCredit":
      return "No settleable credit is currently available.";
    case "UnsettledCredit":
      return "Settle outstanding credit before this action.";
    case "RewardAmountMismatch":
      return "The harvested reward amount did not match the gauge notification.";
    case "ERC20InsufficientAllowance":
      return "Insufficient ERC20 allowance for this action.";
    case "ERC20InsufficientBalance":
      return "Insufficient ERC20 balance for this action.";
    case "ERC20InvalidApprover":
      return "That ERC20 approver address is invalid.";
    case "ERC20InvalidReceiver":
      return "Choose a valid ERC20 receiver.";
    case "ERC20InvalidSender":
      return "That ERC20 sender address is invalid.";
    case "ERC20InvalidSpender":
      return "That ERC20 spender address is invalid.";
    case "SafeERC20FailedOperation":
      return "The ERC20 transfer failed.";
    case "ArithmeticOverflow":
      return "The calculation overflowed. Try a smaller amount.";
    case "InsufficientPaymentAllowance":
      return `Insufficient payment allowance. Approved ${formatRawUnits(
        args[2],
      )}, but this action requires ${formatRawUnits(args[3])}.`;
    case "InsufficientPaymentBalance":
      return `Insufficient payment balance. Balance is ${formatRawUnits(
        args[2],
      )}, but this action requires ${formatRawUnits(args[3])}.`;
    case "InsufficientPayment":
      return `Insufficient native payment sent. Sent ${formatRawUnits(
        args[0],
      )}, required ${formatRawUnits(args[1])}.`;
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
