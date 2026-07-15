"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Abi, type Address } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { getEarnProtocolConfig } from "@/contracts/earn";
import { getKnownMezoTokenConfig } from "@/components/shared/known-mezo-tokens";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { detailReadQueryOptions } from "./read-query-options";

export const AUROVE_PORTFOLIO_QUERY_PREFIX = "aurove-portfolio";

export type AurovePortfolioTokenSymbol = "BTC" | "MEZO";
export type AurovePortfolioVeAssetType = "veBTC" | "veMEZO";
export type AurovePortfolioWrapperSymbol = "avBTCm" | "avMEZOm";

export type AurovePortfolioTokenSnapshot = {
  address: Address | null;
  balanceRaw: bigint;
  allowanceRaw: bigint;
};

export type AurovePortfolioVePositionSnapshot = {
  tokenId: bigint;
  lockAmountRaw: bigint;
  lockEnd: bigint;
  isPermanent: boolean;
  availableFractionCapacityRaw: bigint;
};

export type AurovePortfolioVeCollectionSnapshot = {
  assetType: AurovePortfolioVeAssetType;
  address: Address | null;
  balanceRaw: bigint;
  tokenIds: bigint[];
  positions: AurovePortfolioVePositionSnapshot[];
};

export type AurovePortfolioWrapperSnapshot = {
  id20Address: Address | null;
  trancheId: bigint | null;
  erc20BalanceRaw: bigint;
  erc1155BalanceRaw: bigint;
};

export type AurovePortfolioSnapshot = {
  chainId: number;
  account: Address;
  tokens: Record<AurovePortfolioTokenSymbol, AurovePortfolioTokenSnapshot>;
  veCollections: Record<AurovePortfolioVeAssetType, AurovePortfolioVeCollectionSnapshot>;
  wrappers: Record<AurovePortfolioWrapperSymbol, AurovePortfolioWrapperSnapshot>;
};

type UseAurovePortfolioParams = {
  ownerAddress?: Address;
  chainId?: number;
  enabled?: boolean;
};

type MulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

type AurovePortfolioQueryKey = readonly [typeof AUROVE_PORTFOLIO_QUERY_PREFIX, number, string];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function normalizeAddress(address: Address) {
  return address.toLowerCase() as Address;
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function getMulticallResult<T>(result: MulticallResult | undefined): T | undefined {
  if (!result || result.status !== "success") return undefined;
  return result.result as T;
}

function buildEmptyPortfolio(chainId: number, account: Address): AurovePortfolioSnapshot {
  return {
    chainId,
    account,
    tokens: {
      BTC: {
        address: null,
        balanceRaw: 0n,
        allowanceRaw: 0n,
      },
      MEZO: {
        address: null,
        balanceRaw: 0n,
        allowanceRaw: 0n,
      },
    },
    veCollections: {
      veBTC: {
        assetType: "veBTC",
        address: null,
        balanceRaw: 0n,
        tokenIds: [],
        positions: [],
      },
      veMEZO: {
        assetType: "veMEZO",
        address: null,
        balanceRaw: 0n,
        tokenIds: [],
        positions: [],
      },
    },
    wrappers: {
      avBTCm: {
        id20Address: null,
        trancheId: null,
        erc20BalanceRaw: 0n,
        erc1155BalanceRaw: 0n,
      },
      avMEZOm: {
        id20Address: null,
        trancheId: null,
        erc20BalanceRaw: 0n,
        erc1155BalanceRaw: 0n,
      },
    },
  };
}

function buildAurovePortfolioQueryKey(params: {
  chainId: number;
  account: Address;
}): AurovePortfolioQueryKey {
  return [AUROVE_PORTFOLIO_QUERY_PREFIX, params.chainId, normalizeAddress(params.account)] as const;
}

function summarizePortfolioSnapshot(snapshot: AurovePortfolioSnapshot) {
  return {
    chainId: snapshot.chainId,
    account: snapshot.account,
    tokens: {
      BTC: {
        address: snapshot.tokens.BTC.address,
        balanceRaw: snapshot.tokens.BTC.balanceRaw,
        allowanceRaw: snapshot.tokens.BTC.allowanceRaw,
      },
      MEZO: {
        address: snapshot.tokens.MEZO.address,
        balanceRaw: snapshot.tokens.MEZO.balanceRaw,
        allowanceRaw: snapshot.tokens.MEZO.allowanceRaw,
      },
    },
    veCollections: {
      veBTC: {
        address: snapshot.veCollections.veBTC.address,
        balanceRaw: snapshot.veCollections.veBTC.balanceRaw,
        tokenIds: snapshot.veCollections.veBTC.tokenIds,
        positions: snapshot.veCollections.veBTC.positions.map((position) => ({
          tokenId: position.tokenId,
          lockAmountRaw: position.lockAmountRaw,
          lockEnd: position.lockEnd,
          isPermanent: position.isPermanent,
        })),
      },
      veMEZO: {
        address: snapshot.veCollections.veMEZO.address,
        balanceRaw: snapshot.veCollections.veMEZO.balanceRaw,
        tokenIds: snapshot.veCollections.veMEZO.tokenIds,
        positions: snapshot.veCollections.veMEZO.positions.map((position) => ({
          tokenId: position.tokenId,
          lockAmountRaw: position.lockAmountRaw,
          lockEnd: position.lockEnd,
          isPermanent: position.isPermanent,
        })),
      },
    },
    wrappers: {
      avBTCm: snapshot.wrappers.avBTCm,
      avMEZOm: snapshot.wrappers.avMEZOm,
    },
  };
}

async function readAurovePortfolioSnapshot(params: {
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  chainId: number;
  account: Address;
}): Promise<AurovePortfolioSnapshot> {
  const { chainId, account, publicClient } = params;
  const earnContracts = getEarnProtocolConfig(chainId);
  const btcToken = getKnownMezoTokenConfig(chainId, "BTC");
  const mezoToken = getKnownMezoTokenConfig(chainId, "MEZO");
  const ledgerAddress = earnContracts.ledger?.address ?? null;
  const veBtc = earnContracts.veBtc;
  const veMezo = earnContracts.veMezo;
  const avBtcmId20 = earnContracts.auroveId20 ?? null;
  const avMezoId20 = earnContracts.mezoAuroveId20 ?? null;
  const ledgerAbi = earnContracts.ledger?.abi ?? null;

  const snapshot = buildEmptyPortfolio(chainId, account);
  snapshot.tokens.BTC.address = btcToken?.address ?? null;
  snapshot.tokens.MEZO.address = mezoToken?.address ?? null;
  snapshot.veCollections.veBTC.address = veBtc?.address ?? null;
  snapshot.veCollections.veMEZO.address = veMezo?.address ?? null;
  snapshot.wrappers.avBTCm.id20Address = avBtcmId20?.address ?? null;
  snapshot.wrappers.avMEZOm.id20Address = avMezoId20?.address ?? null;

  type PrimaryReadKind =
    | "btcBalance"
    | "btcAllowance"
    | "mezoBalance"
    | "mezoAllowance"
    | "veBtcBalance"
    | "veMezoBalance"
    | "avBtcmBalance"
    | "avBtcmId"
    | "avMezoBalance"
    | "avMezoId";

  const primaryReads: Array<{
    kind: PrimaryReadKind;
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }> = [];

  function pushPrimaryRead(read: Omit<(typeof primaryReads)[number], "kind">, kind: PrimaryReadKind) {
    primaryReads.push({ ...read, kind });
  }

  async function safeMulticall(contracts: Array<{ address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }>) {
    if (contracts.length === 0) return [] as MulticallResult[];

    try {
      const results = (await publicClient.multicall({ allowFailure: true, contracts })) as MulticallResult[];
      const failures = results.filter((result) => result.status === "failure");

      if (failures.length > 0) {
        console.error("[useAurovePortfolio] multicall partial failure", {
          chainId,
          account,
          failureCount: failures.length,
          totalCount: contracts.length,
          firstError: failures[0]?.error,
          firstContract: contracts[0],
        });
      }

      return results;
    } catch (error) {
      console.error("[useAurovePortfolio] multicall threw", {
        chainId,
        account,
        contractCount: contracts.length,
        error,
      });
      return contracts.map(() => ({ status: "failure", error: new Error("multicall failed") })) as MulticallResult[];
    }
  }

  if (btcToken?.address) {
    pushPrimaryRead(
      {
        address: btcToken.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      },
      "btcBalance",
    );
    pushPrimaryRead(
      {
        address: btcToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ledgerAddress ?? ZERO_ADDRESS],
      },
      "btcAllowance",
    );
  }

  if (mezoToken?.address) {
    pushPrimaryRead(
      {
        address: mezoToken.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      },
      "mezoBalance",
    );
    pushPrimaryRead(
      {
        address: mezoToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ledgerAddress ?? ZERO_ADDRESS],
      },
      "mezoAllowance",
    );
  }

  if (veBtc?.address) {
    pushPrimaryRead(
      {
        address: veBtc.address,
        abi: veBtc.abi,
        functionName: "balanceOf",
        args: [account],
      },
      "veBtcBalance",
    );
  }

  if (veMezo?.address) {
    pushPrimaryRead(
      {
        address: veMezo.address,
        abi: veMezo.abi,
        functionName: "balanceOf",
        args: [account],
      },
      "veMezoBalance",
    );
  }

  if (avBtcmId20?.address) {
    pushPrimaryRead(
      {
        address: avBtcmId20.address,
        abi: avBtcmId20.abi,
        functionName: "balanceOf",
        args: [account],
      },
      "avBtcmBalance",
    );
    pushPrimaryRead(
      {
        address: avBtcmId20.address,
        abi: avBtcmId20.abi,
        functionName: "id",
      },
      "avBtcmId",
    );
  }

  if (avMezoId20?.address) {
    pushPrimaryRead(
      {
        address: avMezoId20.address,
        abi: avMezoId20.abi,
        functionName: "balanceOf",
        args: [account],
      },
      "avMezoBalance",
    );
    pushPrimaryRead(
      {
        address: avMezoId20.address,
        abi: avMezoId20.abi,
        functionName: "id",
      },
      "avMezoId",
    );
  }

  const primaryResults = await safeMulticall(primaryReads);

  primaryReads.forEach((read, index) => {
    const value = getMulticallResult<bigint>(primaryResults[index]) ?? 0n;

    switch (read.kind) {
      case "btcBalance":
        snapshot.tokens.BTC.balanceRaw = value;
        break;
      case "btcAllowance":
        snapshot.tokens.BTC.allowanceRaw = value;
        break;
      case "mezoBalance":
        snapshot.tokens.MEZO.balanceRaw = value;
        break;
      case "mezoAllowance":
        snapshot.tokens.MEZO.allowanceRaw = value;
        break;
      case "veBtcBalance":
        snapshot.veCollections.veBTC.balanceRaw = value;
        break;
      case "veMezoBalance":
        snapshot.veCollections.veMEZO.balanceRaw = value;
        break;
      case "avBtcmBalance":
        snapshot.wrappers.avBTCm.erc20BalanceRaw = value;
        break;
      case "avBtcmId":
        snapshot.wrappers.avBTCm.trancheId = value;
        break;
      case "avMezoBalance":
        snapshot.wrappers.avMEZOm.erc20BalanceRaw = value;
        break;
      case "avMezoId":
        snapshot.wrappers.avMEZOm.trancheId = value;
        break;
    }
  });

  const veTokenRequests: Array<{
    assetType: AurovePortfolioVeAssetType;
    contractAddress: Address;
    abi: Abi;
    tokenIndex: bigint;
  }> = [];

  if (veBtc?.address && snapshot.veCollections.veBTC.balanceRaw > 0n) {
    for (let index = 0n; index < snapshot.veCollections.veBTC.balanceRaw; index += 1n) {
      veTokenRequests.push({
        assetType: "veBTC",
        contractAddress: veBtc.address,
        abi: veBtc.abi,
        tokenIndex: index,
      });
    }
  }

  if (veMezo?.address && snapshot.veCollections.veMEZO.balanceRaw > 0n) {
    for (let index = 0n; index < snapshot.veCollections.veMEZO.balanceRaw; index += 1n) {
      veTokenRequests.push({
        assetType: "veMEZO",
        contractAddress: veMezo.address,
        abi: veMezo.abi,
        tokenIndex: index,
      });
    }
  }

  const veTokenIdReads = await safeMulticall(
    veTokenRequests.map((request) => ({
      address: request.contractAddress,
      abi: request.abi,
      functionName: "ownerToNFTokenIdList",
      args: [account, request.tokenIndex],
    })),
  );

  const veTokenIdsByCollection: Record<AurovePortfolioVeAssetType, bigint[]> = {
    veBTC: [],
    veMEZO: [],
  };

  veTokenRequests.forEach((request, index) => {
    const tokenId = getMulticallResult<bigint>(veTokenIdReads[index]);
    if (tokenId !== undefined) {
      veTokenIdsByCollection[request.assetType].push(tokenId);
    }
  });

  const veLockRequests: Array<{
    assetType: AurovePortfolioVeAssetType;
    contractAddress: Address;
    abi: Abi;
    tokenId: bigint;
  }> = [];

  veTokenIdsByCollection.veBTC.forEach((tokenId) => {
    if (veBtc?.address) {
      veLockRequests.push({
        assetType: "veBTC",
        contractAddress: veBtc.address,
        abi: veBtc.abi,
        tokenId,
      });
    }
  });

  veTokenIdsByCollection.veMEZO.forEach((tokenId) => {
    if (veMezo?.address) {
      veLockRequests.push({
        assetType: "veMEZO",
        contractAddress: veMezo.address,
        abi: veMezo.abi,
        tokenId,
      });
    }
  });

  const veLockReads = await safeMulticall(
    veLockRequests.map((request) => ({
      address: request.contractAddress,
      abi: request.abi,
      functionName: "locked",
      args: [request.tokenId],
    })),
  );

  const veLockCursor: Record<AurovePortfolioVeAssetType, number> = {
    veBTC: 0,
    veMEZO: 0,
  };

  veLockRequests.forEach((request, index) => {
    const locked = getMulticallResult<unknown>(veLockReads[index]);
    const lockAmountRaw = Array.isArray(locked)
      ? toBigint(locked[0])
      : locked && typeof locked === "object"
        ? toBigint((locked as { amount?: unknown }).amount)
        : 0n;
    const lockEndRaw = Array.isArray(locked)
      ? toBigint(locked[1])
      : locked && typeof locked === "object"
        ? toBigint((locked as { end?: unknown }).end)
        : 0n;
    const isPermanent = Array.isArray(locked)
      ? Boolean(locked[2])
      : locked && typeof locked === "object"
        ? Boolean((locked as { isPermanent?: unknown }).isPermanent)
        : false;

    const collection = snapshot.veCollections[request.assetType];
    collection.positions[veLockCursor[request.assetType]] = {
      tokenId: request.tokenId,
      lockAmountRaw: lockAmountRaw > 0n ? lockAmountRaw : 0n,
      lockEnd: lockEndRaw,
      isPermanent,
      availableFractionCapacityRaw: lockAmountRaw > 0n ? lockAmountRaw : 0n,
    };
    veLockCursor[request.assetType] += 1;
  });

  if (ledgerAddress && ledgerAbi && snapshot.wrappers.avBTCm.trancheId !== null) {
    const [balanceRead] = await safeMulticall([
      {
        address: ledgerAddress,
        abi: ledgerAbi,
        functionName: "balanceOf",
        args: [account, snapshot.wrappers.avBTCm.trancheId],
      },
    ]);
    snapshot.wrappers.avBTCm.erc1155BalanceRaw = getMulticallResult<bigint>(balanceRead) ?? 0n;
  }

  if (ledgerAddress && ledgerAbi && snapshot.wrappers.avMEZOm.trancheId !== null) {
    const [balanceRead] = await safeMulticall([
      {
        address: ledgerAddress,
        abi: ledgerAbi,
        functionName: "balanceOf",
        args: [account, snapshot.wrappers.avMEZOm.trancheId],
      },
    ]);
    snapshot.wrappers.avMEZOm.erc1155BalanceRaw = getMulticallResult<bigint>(balanceRead) ?? 0n;
  }

  console.debug("[useAurovePortfolio] loaded snapshot", summarizePortfolioSnapshot(snapshot));

  return snapshot;
}

export function getAurovePortfolioQueryKey(params: {
  chainId: number;
  account: Address;
}): AurovePortfolioQueryKey {
  return buildAurovePortfolioQueryKey(params);
}

function replaceNestedTokenSnapshot<T extends Record<string, { [key: string]: unknown }>>(
  current: T,
  key: keyof T,
  patch: Partial<T[keyof T]>,
) {
  return {
    ...current,
    [key]: {
      ...current[key],
      ...patch,
    },
  } as T;
}

type AurovePortfolioPatch =
  | {
      kind: "token";
      token: AurovePortfolioTokenSymbol;
      patch: Partial<AurovePortfolioTokenSnapshot>;
    }
  | {
      kind: "veCollection";
      assetType: AurovePortfolioVeAssetType;
      patch: Partial<AurovePortfolioVeCollectionSnapshot>;
    }
  | {
      kind: "wrapper";
      wrapper: AurovePortfolioWrapperSymbol;
      patch: Partial<AurovePortfolioWrapperSnapshot>;
    };

export function setAurovePortfolioCache(
  queryClient: ReturnType<typeof useQueryClient>,
  params: { chainId: number; account: Address },
  updater: (current: AurovePortfolioSnapshot) => AurovePortfolioSnapshot,
) {
  queryClient.setQueryData<AurovePortfolioSnapshot>(
    buildAurovePortfolioQueryKey(params),
    (current) => updater(current ?? buildEmptyPortfolio(params.chainId, params.account)),
  );
}

export function patchAurovePortfolioCache(
  queryClient: ReturnType<typeof useQueryClient>,
  params: { chainId: number; account: Address },
  patch: AurovePortfolioPatch,
) {
  setAurovePortfolioCache(queryClient, params, (current) => {
    if (patch.kind === "token") {
      return {
        ...current,
        tokens: replaceNestedTokenSnapshot(current.tokens, patch.token, patch.patch),
      };
    }

    if (patch.kind === "veCollection") {
      return {
        ...current,
        veCollections: replaceNestedTokenSnapshot(current.veCollections, patch.assetType, patch.patch),
      };
    }

    return {
      ...current,
      wrappers: replaceNestedTokenSnapshot(current.wrappers, patch.wrapper, patch.patch),
    };
  });
}

export function useAurovePortfolio(params?: UseAurovePortfolioParams) {
  const connectedAccount = useAccount();
  const connectedChainId = useChainId();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const fallbackChain = getActiveChain(resolveAppEnvironment());

  const chainId = params?.chainId ?? connectedChainId ?? fallbackChain.id;
  const account = params?.ownerAddress ?? connectedAccount.address ?? null;

  const queryKey = useMemo(
    () => (account ? buildAurovePortfolioQueryKey({ chainId, account }) : null),
    [account, chainId],
  );

  const portfolioQuery = useQuery({
    enabled:
      (params?.enabled ?? true) && Boolean(publicClient && account && chainId && queryKey),
    queryKey: queryKey ?? [AUROVE_PORTFOLIO_QUERY_PREFIX, chainId, "disabled"],
    queryFn: async () => {
      if (!publicClient || !account) {
        return buildEmptyPortfolio(chainId, account ?? ZERO_ADDRESS);
      }

      return readAurovePortfolioSnapshot({
        publicClient,
        chainId,
        account,
      });
    },
    ...detailReadQueryOptions,
  });

  const portfolio = portfolioQuery.data ?? buildEmptyPortfolio(chainId, account ?? ZERO_ADDRESS);

  useEffect(() => {
    if (!account) {
      console.debug("[useAurovePortfolio] waiting for wallet", {
        chainId,
        enabled: params?.enabled ?? true,
        hasPublicClient: Boolean(publicClient),
        queryKey,
      });
      return;
    }

    console.debug("[useAurovePortfolio] query state", {
      chainId,
      account,
      enabled: params?.enabled ?? true,
      hasPublicClient: Boolean(publicClient),
      isLoading: portfolioQuery.isLoading,
      isFetching: portfolioQuery.isFetching,
      hasError: Boolean(portfolioQuery.error),
      queryKey,
      snapshot: summarizePortfolioSnapshot(portfolio),
    });

    if (portfolioQuery.error) {
      console.error("[useAurovePortfolio] query error", {
        chainId,
        account,
        queryKey,
        error: portfolioQuery.error,
      });
    }
  }, [
    account,
    chainId,
    portfolio,
    portfolioQuery.error,
    portfolioQuery.isFetching,
    portfolioQuery.isLoading,
    publicClient,
    queryKey,
    params?.enabled,
  ]);

  return {
    portfolio,
    queryKey,
    chainId,
    account,
    isLoading: portfolioQuery.isLoading,
    isFetching: portfolioQuery.isFetching,
    error: (portfolioQuery.error as Error | null) ?? null,
    refresh: () => portfolioQuery.refetch(),
    setCache: (updater: (current: AurovePortfolioSnapshot) => AurovePortfolioSnapshot) => {
      if (!account || !queryKey) return;
      setAurovePortfolioCache(queryClient, { chainId, account }, updater);
    },
    patchCache: (patch: AurovePortfolioPatch) => {
      if (!account || !queryKey) return;
      patchAurovePortfolioCache(queryClient, { chainId, account }, patch);
    },
  };
}
