import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { portfolioKeys } from "./keys";
import { readId20Portfolio, readLiquidityPortfolio, readRewardsPortfolio, readTranchePortfolio, readWalletPortfolio } from "./readers";
import type { PortfolioDomain, PortfolioRegistry } from "./types";

const defaults = { staleTime: 15_000, gcTime: 10 * 60_000, retry: 2, refetchOnWindowFocus: true, refetchOnReconnect: true } as const;
type Inputs = { publicClient: PublicClient; chainId: number; owner: Address; registry: PortfolioRegistry };
export const walletPortfolioOptions = (p: Inputs) => queryOptions({ queryKey: portfolioKeys.wallet(p.chainId, p.owner, p.registry.revision), queryFn: () => readWalletPortfolio(p.publicClient, p.chainId, p.owner, p.registry), ...defaults });
export const tranchePortfolioOptions = (p: Inputs) => queryOptions({ queryKey: portfolioKeys.tranches(p.chainId, p.owner, p.registry.revision), queryFn: () => readTranchePortfolio(p.publicClient, p.chainId, p.owner, p.registry), ...defaults });
export const id20PortfolioOptions = (p: Inputs) => queryOptions({ queryKey: portfolioKeys.id20(p.chainId, p.owner, p.registry.revision), queryFn: () => readId20Portfolio(p.publicClient, p.chainId, p.owner, p.registry), ...defaults });
export const rewardsPortfolioOptions = (p: Inputs) => queryOptions({ queryKey: portfolioKeys.rewards(p.chainId, p.owner, p.registry.revision), queryFn: () => readRewardsPortfolio(p.publicClient, p.chainId, p.owner, p.registry), ...defaults });
export const liquidityPortfolioOptions = (p: Inputs) => queryOptions({ queryKey: portfolioKeys.liquidity(p.chainId, p.owner, p.registry.revision), queryFn: () => readLiquidityPortfolio(p.publicClient, p.chainId, p.owner, p.registry), ...defaults });

export async function invalidatePortfolioDomains(p: { queryClient: QueryClient; chainId: number; owner: Address; registryRevision: string; domains: readonly PortfolioDomain[] }) {
  await Promise.all([...new Set(p.domains)].map((domain) => p.queryClient.invalidateQueries({ queryKey: portfolioKeys.domain(p.chainId, p.owner, p.registryRevision, domain) })));
}
