import type { Address } from "viem";
import type { PortfolioDomain } from "./types";

export const portfolioKeys = {
  all: ["portfolio"] as const,
  account: (chainId: number, owner: Address, revision: string) => ["portfolio", chainId, owner.toLowerCase(), revision] as const,
  domain: (chainId: number, owner: Address, revision: string, domain: PortfolioDomain) => [...portfolioKeys.account(chainId, owner, revision), domain] as const,
  wallet: (chainId: number, owner: Address, revision: string) => portfolioKeys.domain(chainId, owner, revision, "wallet"),
  tranches: (chainId: number, owner: Address, revision: string) => portfolioKeys.domain(chainId, owner, revision, "tranches"),
  id20: (chainId: number, owner: Address, revision: string) => portfolioKeys.domain(chainId, owner, revision, "id20"),
  rewards: (chainId: number, owner: Address, revision: string) => portfolioKeys.domain(chainId, owner, revision, "rewards"),
  liquidity: (chainId: number, owner: Address, revision: string) => portfolioKeys.domain(chainId, owner, revision, "liquidity"),
};
