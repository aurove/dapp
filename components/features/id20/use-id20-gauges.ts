"use client";

import { useCallback, useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Abi, Address } from "viem";

import { getContractConfig } from "@/contracts/shared";
import { useId20Portfolio } from "@/features/portfolio";
import {
  makeAddressWriteStep,
  type TxFlowRuntimeContext,
  type TxPreparedWriteStep,
  type TxStep,
} from "@/lib/tx-flow";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";

const ID20_CONTRACTS = [
  { key: "avBTCm", id20Name: "avBTCmId20", gaugeName: "avBTCmGauge" },
  { key: "avMEZOm", id20Name: "avMEZOmId20", gaugeName: "avMEZOmGauge" },
] as const;

export type Id20GaugeDescriptor = {
  key: string;
  id20Address: Address;
  id20Abi: Abi;
  gaugeAbi: Abi;
  symbol: string;
  decimals: number;
};

export type Id20GaugePosition = Id20GaugeDescriptor & {
  gaugeAddress: Address;
  balanceRaw: bigint;
  isActive: boolean;
  weightRaw: bigint;
  debtRaw: bigint;
  creditRaw: bigint;
  lentRaw: bigint;
  claimableRaw: bigint;
};

type GaugeMetadata = {
  isActive: boolean;
  weight: bigint;
  debt: bigint;
  credit: bigint;
  lent: bigint;
  accruedReward: bigint;
};

function readAddress(value: unknown): Address | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value as Address : null;
}

function readGaugeMetadata(value: unknown): GaugeMetadata | null {
  if (Array.isArray(value)) {
    const [isActive, weight, debt, credit, lent, accruedReward] = value;
    if (
      typeof isActive !== "boolean" ||
      ![weight, debt, credit, lent, accruedReward].every((item) => typeof item === "bigint")
    ) return null;
    return { isActive, weight, debt, credit, lent, accruedReward };
  }

  if (!value || typeof value !== "object") return null;
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.isActive !== "boolean" ||
    ![metadata.weight, metadata.debt, metadata.credit, metadata.lent, metadata.accruedReward]
      .every((item) => typeof item === "bigint")
  ) return null;
  return {
    isActive: metadata.isActive,
    weight: metadata.weight as bigint,
    debt: metadata.debt as bigint,
    credit: metadata.credit as bigint,
    lent: metadata.lent as bigint,
    accruedReward: metadata.accruedReward as bigint,
  };
}

export function getId20GaugeDescriptors(chainId: number): Id20GaugeDescriptor[] {
  return ID20_CONTRACTS.flatMap(({ key, id20Name, gaugeName }) => {
    const id20 = getContractConfig(chainId, id20Name);
    const gauge = getContractConfig(chainId, gaugeName);
    if (!id20?.address || !id20.abi || !gauge?.abi) return [];
    return [{
      key,
      id20Address: id20.address,
      id20Abi: id20.abi as Abi,
      gaugeAbi: gauge.abi as Abi,
      symbol: key,
      decimals: 18,
    }];
  });
}

export function getLiquidityId20GaugeDescriptors(
  chainId: number,
  tokenAddresses: readonly (Address | null | undefined)[],
) {
  const tokens = new Set(tokenAddresses.filter(Boolean).map((address) => address!.toLowerCase()));
  return getId20GaugeDescriptors(chainId).filter((item) => tokens.has(item.id20Address.toLowerCase()));
}

async function resolveGaugeAddress(
  ctx: Pick<TxFlowRuntimeContext, "publicClient">,
  descriptor: Id20GaugeDescriptor,
) {
  return ctx.publicClient.readContract({
    address: descriptor.id20Address,
    abi: descriptor.id20Abi,
    functionName: "rewardSink",
  } as never) as Promise<Address>;
}

async function isGaugeActive(ctx: TxFlowRuntimeContext, descriptor: Id20GaugeDescriptor) {
  const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
  const metadata = await ctx.publicClient.readContract({
    address: gaugeAddress,
    abi: descriptor.gaugeAbi,
    functionName: "accountMetadata",
    args: [ctx.account],
  } as never);
  return readGaugeMetadata(metadata)?.isActive === true;
}

export function makeId20ActivationStep(
  descriptor: Id20GaugeDescriptor,
  displayLabelBtn = false,
): TxPreparedWriteStep {
  return {
    type: "write",
    key: `id20-activate-${descriptor.key}`,
    label: `Activate ${descriptor.symbol} rewards`,
    displayLabelBtn,
    portfolioDomains: ["id20", "rewards"],
    shouldSkip: (ctx) => isGaugeActive(ctx, descriptor),
    prepare: async (ctx) => {
      const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
      return {
        contract: { address: gaugeAddress, abi: descriptor.gaugeAbi },
        request: { functionName: "activate", args: [] },
      } as never;
    },
  };
}

export function makeId20ActivationGuardSteps(
  descriptor: Id20GaugeDescriptor,
): TxStep[] {
  return [
    makeId20ActivationStep(descriptor, true),
    {
      type: "custom",
      key: `id20-verify-activation-${descriptor.key}`,
      label: `Verify ${descriptor.symbol} activation`,
      run: async (ctx) => {
        if (!await isGaugeActive(ctx, descriptor)) {
          throw new Error(`${descriptor.symbol} gauge activation could not be confirmed.`);
        }
        return "skip";
      },
    },
  ];
}

export function makeId20GaugeClaimStep(
  position: Id20GaugePosition,
  receiver: Address,
  displayLabelBtn = false,
) {
  const step = makeAddressWriteStep({
    key: `id20-gauge-claim-${position.key}`,
    label: `Claim ${position.symbol}`,
    displayLabelBtn,
    address: position.gaugeAddress,
    abi: position.gaugeAbi,
    variables: { functionName: "claim", args: [receiver] },
  } as never) as unknown as TxPreparedWriteStep;
  step.portfolioDomains = ["wallet", "id20", "rewards", "liquidity"];
  return step;
}

export function useId20GaugePositions(chainId: number, account?: Address) {
  const id20Portfolio = useId20Portfolio();
  const descriptors = useMemo(() => getId20GaugeDescriptors(chainId), [chainId]);
  const sinkReads = useReadContracts({
    allowFailure: true,
    contracts: descriptors.map((descriptor) => ({
      address: descriptor.id20Address,
      abi: descriptor.id20Abi,
      functionName: "rewardSink",
      chainId,
    })),
    query: {
      enabled: descriptors.length > 0,
      ...staticReadQueryOptions,
    },
  });
  const gaugeAddresses = useMemo(
    () => descriptors.map((_, index) => readAddress(sinkReads.data?.[index]?.result)),
    [descriptors, sinkReads.data],
  );
  const metadataReads = useReadContracts({
    allowFailure: true,
    contracts: descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      return account && gaugeAddress ? [{
        address: gaugeAddress,
        abi: descriptor.gaugeAbi,
        functionName: "accountMetadata",
        args: [account],
        chainId,
      }] : [];
    }),
    query: {
      enabled: Boolean(account && gaugeAddresses.some(Boolean)),
      ...detailReadQueryOptions,
    },
  });

  const gauges = useMemo<Id20GaugePosition[]>(() => {
    let metadataIndex = 0;
    return descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      if (!account || !gaugeAddress) return [];
      const metadata = readGaugeMetadata(metadataReads.data?.[metadataIndex++]?.result);
      if (!metadata) return [];
      const balance = Object.values(id20Portfolio.data?.balances ?? {}).find(
        (item) => item.address.toLowerCase() === descriptor.id20Address.toLowerCase(),
      );
      const balanceRaw = balance?.rawBalance ?? 0n;
      return [{
        ...descriptor,
        symbol: balance?.symbol ?? descriptor.symbol,
        decimals: balance?.decimals ?? descriptor.decimals,
        gaugeAddress,
        balanceRaw,
        isActive: metadata.isActive,
        weightRaw: metadata.weight,
        debtRaw: metadata.debt,
        creditRaw: metadata.credit,
        lentRaw: metadata.lent,
        claimableRaw: metadata.accruedReward,
      }];
    });
  }, [account, descriptors, gaugeAddresses, id20Portfolio.data, metadataReads.data]);
  const positions = useMemo(
    () => gauges.filter((item) => item.balanceRaw > 0n || item.weightRaw > 0n || item.debtRaw > 0n ||
      item.creditRaw > 0n || item.lentRaw > 0n || item.claimableRaw > 0n),
    [gauges],
  );

  const refresh = useCallback(async () => {
    await Promise.all([sinkReads.refetch(), metadataReads.refetch(), id20Portfolio.refetch()]);
  }, [id20Portfolio, metadataReads, sinkReads]);

  return {
    gauges,
    positions,
    isLoading: sinkReads.isLoading || metadataReads.isLoading || id20Portfolio.isLoading,
    isFetching: sinkReads.isFetching || metadataReads.isFetching || id20Portfolio.isFetching,
    error: sinkReads.error || metadataReads.error || id20Portfolio.error,
    refresh,
  };
}
