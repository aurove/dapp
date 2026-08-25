import { parseUnits, type Address } from "viem";

export const MEZO_INCENTIVE_EPOCH_SECONDS = 7n * 24n * 60n * 60n;

export type GaugeIncentiveEpoch = {
  start: bigint;
  closesAt: bigint;
};

export type GaugeIncentiveValidation = {
  amountRaw: bigint | null;
  error: string | null;
  requiresApproval: boolean;
  canApprove: boolean;
  canIncentivise: boolean;
};

export type GaugeIncentiveTransactionState =
  | "idle"
  | "approving"
  | "incentivising"
  | "approval-success"
  | "incentive-success"
  | "error";

export const gaugeIncentiveKeys = {
  all: ["gauge-incentive"] as const,
  gauge: (chainId: number, gaugeAddress: Address) =>
    [...gaugeIncentiveKeys.all, chainId, gaugeAddress.toLowerCase()] as const,
  data: (chainId: number, gaugeAddress: Address, account?: Address) =>
    [
      ...gaugeIncentiveKeys.gauge(chainId, gaugeAddress),
      account?.toLowerCase() ?? "disconnected",
    ] as const,
};

export function deriveGaugeIncentiveEpoch(timestamp: bigint): GaugeIncentiveEpoch {
  const start = timestamp - (timestamp % MEZO_INCENTIVE_EPOCH_SECONDS);
  return { start, closesAt: start + MEZO_INCENTIVE_EPOCH_SECONDS };
}

export function validateGaugeIncentiveInput(params: {
  amount: string;
  decimals: number;
  balance: bigint | null;
  allowance: bigint | null;
  connected: boolean;
  tokenSupported: boolean;
  gaugeAvailable: boolean;
}): GaugeIncentiveValidation {
  let amountRaw: bigint | null = null;
  const normalized = params.amount.trim();

  if (normalized) {
    try {
      const parsed = parseUnits(normalized, params.decimals);
      amountRaw = parsed > 0n ? parsed : null;
    } catch {
      amountRaw = null;
    }
  }

  let error: string | null = null;
  if (!params.gaugeAvailable) {
    error = "This gauge is not available for incentives.";
  } else if (!params.tokenSupported) {
    error = "Choose a token accepted by this gauge's voting-reward contract.";
  } else if (!normalized) {
    error = "Enter an amount.";
  } else if (amountRaw === null) {
    error = "Enter a valid amount greater than zero.";
  } else if (!params.connected) {
    error = "Connect your wallet to continue.";
  } else if (params.balance === null) {
    error = "Wallet balance is temporarily unavailable.";
  } else if (amountRaw > params.balance) {
    error = "The amount exceeds your connected-wallet balance.";
  }

  const validAmount = error === null && amountRaw !== null;
  const requiresApproval = Boolean(
    validAmount && (params.allowance === null || params.allowance < amountRaw!),
  );

  return {
    amountRaw,
    error,
    requiresApproval,
    canApprove: validAmount && requiresApproval,
    canIncentivise: validAmount && !requiresApproval,
  };
}

export function normalizeGaugeIncentiveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|request rejected|action_rejected|\b4001\b/i.test(message)) {
    return "The transaction was rejected in your wallet.";
  }
  if (/notwhitelisted/i.test(message)) {
    return "That token is no longer accepted for gauge incentives.";
  }
  if (/gauge.*(not alive|inactive)|gaugenotalive/i.test(message)) {
    return "This gauge is currently inactive and cannot receive incentives.";
  }
  return message;
}
