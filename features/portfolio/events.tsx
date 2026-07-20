"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, erc721Abi, parseAbiItem } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { getPortfolioRegistry } from "./registry";
import { invalidatePortfolioDomains } from "./queries";
import type { PortfolioDomain } from "./types";
import { getContractConfig } from "@/contracts/shared";
import { usePendingPortfolioAccountGuard } from "./pending";

const erc1155Single = parseAbiItem("event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)");
const erc1155Batch = parseAbiItem("event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)");
export function PortfolioEventWatcher() {
  usePendingPortfolioAccountGuard();
  const { address } = useAccount(); const chainId = useChainId(); const client = usePublicClient(); const queryClient = useQueryClient();
  useEffect(() => {
    const registry = getPortfolioRegistry(chainId); if (!address || !client || !registry) return;
    const timers = new Map<PortfolioDomain, ReturnType<typeof setTimeout>>(); const queue = (domain: PortfolioDomain) => { const prior = timers.get(domain); if (prior) clearTimeout(prior); timers.set(domain, setTimeout(() => {
      void invalidatePortfolioDomains({ queryClient, chainId, owner: address, registryRevision: registry.revision, domains: [domain] });
      if (domain === "wallet" || domain === "tranches" || domain === "id20") {
        void queryClient.invalidateQueries({ queryKey: ["swap", "balances", chainId, address.toLowerCase()] });
      }
    }, 300)); };
    const relevant = (logs: readonly { args?: unknown }[]) => logs.some((log) => { const args = log.args; if (!args || typeof args !== "object") return false; return Object.values(args).some((value) => typeof value === "string" && value.toLowerCase() === address.toLowerCase()); });
    const protocolWatchers = [
      { contract: getContractConfig(chainId, "AuroveZapRouter"), domains: ["wallet", "tranches", "id20", "rewards", "liquidity"] as const },
      { contract: getContractConfig(chainId, "avBTCmGauge"), domains: ["id20", "rewards"] as const },
      { contract: getContractConfig(chainId, "avMEZOmGauge"), domains: ["id20", "rewards"] as const },
      { contract: getContractConfig(chainId, "MUSD-avBTCm"), domains: ["liquidity"] as const },
      { contract: getContractConfig(chainId, "avBTCm-avMEZOm"), domains: ["liquidity"] as const },
    ];
    const stops = [
      ...registry.walletAssets.map((asset) => client.watchContractEvent({ address: asset.address, abi: erc20Abi, eventName: "Transfer", onLogs: (logs) => { if (relevant(logs)) queue("wallet"); } })),
      ...registry.id20s.map((asset) => client.watchContractEvent({ address: asset.address, abi: erc20Abi, eventName: "Transfer", onLogs: (logs) => { if (relevant(logs)) queue("id20"); } })),
      client.watchContractEvent({ address: registry.ledger, abi: [erc1155Single, erc1155Batch], onLogs: (logs) => { if (relevant(logs)) queue("tranches"); } }),
      ...(registry.positionManager ? [client.watchContractEvent({ address: registry.positionManager.address, abi: erc721Abi, eventName: "Transfer", onLogs: (logs) => { if (relevant(logs)) queue("liquidity"); } })] : []),
      ...(registry.positionManager ? [client.watchContractEvent({ address: registry.positionManager.address, abi: registry.positionManager.abi as never, onLogs: () => queue("liquidity") })] : []),
      ...registry.rewardSources.map((source) => client.watchContractEvent({ address: source.address, abi: registry.rewardSinkAbi as never, onLogs: (logs) => { if (relevant(logs)) { queue("rewards"); queue("wallet"); } } })),
      ...protocolWatchers.flatMap(({ contract, domains }) => contract?.address ? [client.watchContractEvent({ address: contract.address, abi: contract.abi, onLogs: (logs) => { if (relevant(logs)) domains.forEach(queue); } })] : []),
    ];
    return () => { stops.forEach((stop) => stop()); timers.forEach(clearTimeout); };
  }, [address, chainId, client, queryClient]);
  return null;
}
