export type ProtocolStatsSnapshot = {
  chainId: number;
  /** Server generation time (ms). */
  fetchedAt: number;
  /** Aggregate TVL in USD (mUSD-normalized). */
  tvlUsd: number | null;
  /**
   * Distinct user addresses seen on Ledger / managed id20 transfers
   * (historical interactors). Always ≥ current holder counts.
   */
  uniqueWallets: number | null;
  /** Distinct user addresses with any positive Ledger ERC-1155 balance. */
  ledgerHolders: number | null;
  /** Distinct user addresses with any positive avBTCm / avMEZOm balance. */
  id20Holders: number | null;
  /** Free-form notes for partial data (e.g. cache, degraded path). */
  notes?: string[];
  healthy: boolean;
};
