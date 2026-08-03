export type ProtocolStatsSnapshot = {
  chainId: number;
  /** Server generation time (ms). */
  fetchedAt: number;
  /**
   * Aggregate TVL in USD: sum of ledger tranche total supplies
   * (veBTC × BTC price + veMEZO × MEZO price).
   */
  tvlUsd: number | null;
  /**
   * Distinct user addresses seen on Ledger / managed id20 transfers
   * (historical interactors).
   */
  uniqueWallets: number | null;
  /**
   * Total Academy points events (rows in `points_ledger_entries`).
   * Used as protocol transaction / activity count.
   */
  transactionCount: number | null;
  /** Free-form notes for partial data (e.g. cache, degraded path). */
  notes?: string[];
  healthy: boolean;
};
