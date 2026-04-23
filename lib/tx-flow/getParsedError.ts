import { BaseError as BaseViemError, ContractFunctionRevertedError } from "viem";

/**
 * Parses a viem/wagmi error into a displayable string.
 */
type ParsedErrorLike = {
  walk?: () => unknown;
  details?: string;
  shortMessage?: string;
  message?: string;
  name?: string;
  data?: {
    errorName?: string;
    args?: { toString?: () => string } | unknown;
  };
};

export const getParsedError = (error: unknown): string => {
  const candidate = error as ParsedErrorLike | undefined;
  const parsedError = candidate?.walk ? candidate.walk() : error;

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

      return parsedError.shortMessage;
    }

    return parsedError.message ?? parsedError.name ?? "An unknown error occurred";
  }

  const fallback = parsedError as ParsedErrorLike | undefined;
  return fallback?.message ?? "An unknown error occurred";
};
