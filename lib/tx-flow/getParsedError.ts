import { BaseError as BaseViemError, ContractFunctionRevertedError, decodeErrorResult } from "viem";

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
        (entry) => (entry as { type?: string }).type === "error",
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

function isHexLike(value: unknown): value is HexLike {
  return typeof value === "string" && value.startsWith("0x");
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
      const args = Array.from(decoded.args ?? [])
        .map((arg) => String(arg))
        .join(", ");
      return `${decoded.errorName}(${args})`;
    } catch {
      continue;
    }
  }

  return undefined;
}

export const getParsedError = (error: unknown): string => {
  const candidate = error as ParsedErrorLike | undefined;
  const parsedError = candidate?.walk ? candidate.walk() : error;
  const revertData = extractRevertData(parsedError);

  if (parsedError instanceof BaseViemError) {
    if (parsedError.details) {
      return parsedError.details;
    }

    if (parsedError.shortMessage) {
      if (
        parsedError instanceof ContractFunctionRevertedError &&
        parsedError.data &&
        parsedError.data.errorName !== "Error"
      ) {
        const customErrorArgs = parsedError.data.args?.toString() ?? "";
        return `${parsedError.shortMessage.replace(/reverted\.$/, "reverted with the following reason:")}\n${
          parsedError.data.errorName
        }(${customErrorArgs})`;
      }

      if (parsedError instanceof ContractFunctionRevertedError && revertData) {
        const decoded = decodeCustomErrorFallback(revertData);
        if (decoded) {
          return `${parsedError.shortMessage.replace(/reverted\.$/, "reverted with the following reason:")}\n${decoded}`;
        }
      }

      return parsedError.shortMessage;
    }

    return parsedError.message ?? parsedError.name ?? "An unknown error occurred";
  }

  const fallback = parsedError as ParsedErrorLike | undefined;
  if (revertData) {
    const decoded = decodeCustomErrorFallback(revertData);
    if (decoded) {
      return decoded;
    }
  }

  return fallback?.message ?? "An unknown error occurred";
};
