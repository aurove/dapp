import {
  erc20Abi,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";

import {
  MEZO_BRIBE_VOTING_REWARD_ABI,
  MEZO_VOTER_INCENTIVE_ABI,
} from "@/contracts/mezo-voting-incentives";
import type { GaugeIncentiveTarget } from "@/lib/config/supported-liquidity-pools";
import { getKnownMezoTokenConfigs } from "@/components/shared/known-mezo-tokens";
import { deriveGaugeIncentiveEpoch } from "./gauge-incentive-model";

const MAX_DISCOVERED_REWARD_TOKENS = 128;

export type GaugeIncentiveToken = {
  address: Address;
  symbol: string;
  name: string | null;
  decimals: number;
  balance: bigint | null;
  allowance: bigint | null;
  currentEpochIncentives: bigint | null;
};

export type GaugeIncentiveData = {
  available: boolean;
  unavailableReason: string | null;
  epochStart: bigint;
  epochClosesAt: bigint;
  tokens: GaugeIncentiveToken[];
};

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function uniqueAddresses(addresses: readonly Address[]) {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  const address = getAddress(value);
  return sameAddress(address, zeroAddress) ? null : address;
}

function stringResult(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalsResult(value: unknown) {
  const decimals = typeof value === "number" ? value : Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
}

export async function readGaugeIncentiveTargetStatus(
  publicClient: PublicClient,
  target: GaugeIncentiveTarget,
): Promise<{ available: boolean; reason: string | null }> {
  const [configuredGauge, configuredPool, isGauge, isAlive, configuredRecipient] =
    await Promise.all([
      publicClient.readContract({
        address: target.voterAddress,
        abi: MEZO_VOTER_INCENTIVE_ABI,
        functionName: "gauges",
        args: [target.poolAddress],
      }),
      publicClient.readContract({
        address: target.voterAddress,
        abi: MEZO_VOTER_INCENTIVE_ABI,
        functionName: "poolForGauge",
        args: [target.gaugeAddress],
      }),
      publicClient.readContract({
        address: target.voterAddress,
        abi: MEZO_VOTER_INCENTIVE_ABI,
        functionName: "isGauge",
        args: [target.gaugeAddress],
      }),
      publicClient.readContract({
        address: target.voterAddress,
        abi: MEZO_VOTER_INCENTIVE_ABI,
        functionName: "isAlive",
        args: [target.gaugeAddress],
      }),
      publicClient.readContract({
        address: target.voterAddress,
        abi: MEZO_VOTER_INCENTIVE_ABI,
        functionName: "gaugeToBribe",
        args: [target.gaugeAddress],
      }),
    ]);

  if (
    !sameAddress(configuredGauge, target.gaugeAddress) ||
    !sameAddress(configuredPool, target.poolAddress) ||
    !isGauge ||
    !sameAddress(configuredRecipient, target.incentiveRecipientAddress)
  ) {
    return {
      available: false,
      reason: "The configured pool, gauge, and voting-reward contract no longer match on-chain.",
    };
  }
  if (!isAlive) {
    return {
      available: false,
      reason: "This gauge is currently inactive and cannot receive incentives.",
    };
  }
  return { available: true, reason: null };
}

async function readDiscoveredRewardTokens(
  publicClient: PublicClient,
  target: GaugeIncentiveTarget,
): Promise<Address[]> {
  const length = await publicClient.readContract({
    address: target.incentiveRecipientAddress,
    abi: MEZO_BRIBE_VOTING_REWARD_ABI,
    functionName: "rewardsListLength",
  });
  if (length > BigInt(MAX_DISCOVERED_REWARD_TOKENS)) {
    throw new Error(
      "The gauge reward-token list is unexpectedly large and cannot be displayed safely.",
    );
  }

  const values = await Promise.all(
    Array.from({ length: Number(length) }, (_, index) =>
      publicClient.readContract({
        address: target.incentiveRecipientAddress,
        abi: MEZO_BRIBE_VOTING_REWARD_ABI,
        functionName: "rewards",
        args: [BigInt(index)],
      }),
    ),
  );
  return values.flatMap((value) => {
    const address = asAddress(value);
    return address ? [address] : [];
  });
}

export async function filterAcceptedGaugeIncentiveTokens(params: {
  publicClient: PublicClient;
  target: GaugeIncentiveTarget;
  discovered: readonly Address[];
  candidates: readonly Address[];
}) {
  const discoveredSet = new Set(params.discovered.map((address) => address.toLowerCase()));
  const all = uniqueAddresses([...params.discovered, ...params.candidates]);
  const accepted = await Promise.all(
    all.map(async (address) => {
      if (discoveredSet.has(address.toLowerCase())) return address;
      const [isReward, whitelisted] = await Promise.all([
        params.publicClient
          .readContract({
            address: params.target.incentiveRecipientAddress,
            abi: MEZO_BRIBE_VOTING_REWARD_ABI,
            functionName: "isReward",
            args: [address],
          })
          .catch(() => false),
        params.publicClient
          .readContract({
            address: params.target.voterAddress,
            abi: MEZO_VOTER_INCENTIVE_ABI,
            functionName: "isWhitelistedToken",
            args: [address],
          })
          .catch(() => false),
      ]);
      return isReward || whitelisted ? address : null;
    }),
  );
  return accepted.filter((address): address is Address => address !== null);
}

async function readTokenData(params: {
  publicClient: PublicClient;
  target: GaugeIncentiveTarget;
  tokenAddress: Address;
  account?: Address;
  epochStart: bigint;
}): Promise<GaugeIncentiveToken> {
  const { publicClient, target, tokenAddress, account, epochStart } = params;
  const [symbol, name, decimals, balance, allowance, incentives] = await Promise.all([
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" })
      .catch(() => null),
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: "name" })
      .catch(() => null),
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" })
      .catch(() => 18),
    account
      ? publicClient
          .readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          })
          .catch(() => null)
      : Promise.resolve(null),
    account
      ? publicClient
          .readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, target.incentiveRecipientAddress],
          })
          .catch(() => null)
      : Promise.resolve(null),
    publicClient
      .readContract({
        address: target.incentiveRecipientAddress,
        abi: MEZO_BRIBE_VOTING_REWARD_ABI,
        functionName: "tokenRewardsPerEpoch",
        args: [tokenAddress, epochStart],
      })
      .catch(() => null),
  ]);

  return {
    address: tokenAddress,
    symbol: stringResult(symbol) ?? `${tokenAddress.slice(0, 6)}…${tokenAddress.slice(-4)}`,
    name: stringResult(name),
    decimals: decimalsResult(decimals),
    balance: typeof balance === "bigint" ? balance : null,
    allowance: typeof allowance === "bigint" ? allowance : null,
    currentEpochIncentives: typeof incentives === "bigint" ? incentives : null,
  };
}

export async function fetchGaugeIncentiveData(params: {
  publicClient: PublicClient;
  chainId: number;
  target: GaugeIncentiveTarget;
  account?: Address;
}): Promise<GaugeIncentiveData> {
  const { publicClient, chainId, target, account } = params;
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const epoch = deriveGaugeIncentiveEpoch(block.timestamp);
  const status = await readGaugeIncentiveTargetStatus(publicClient, target);
  if (!status.available) {
    return {
      available: false,
      unavailableReason: status.reason,
      epochStart: epoch.start,
      epochClosesAt: epoch.closesAt,
      tokens: [],
    };
  }

  const discovered = await readDiscoveredRewardTokens(publicClient, target);
  const known = getKnownMezoTokenConfigs(chainId).map((token) => token.address);
  const accepted = await filterAcceptedGaugeIncentiveTokens({
    publicClient,
    target,
    discovered,
    candidates: [...target.candidateTokenAddresses, ...known],
  });
  const tokens = await Promise.all(
    accepted.map((tokenAddress) =>
      readTokenData({ publicClient, target, tokenAddress, account, epochStart: epoch.start }),
    ),
  );

  return {
    available: true,
    unavailableReason: null,
    epochStart: epoch.start,
    epochClosesAt: epoch.closesAt,
    tokens,
  };
}
