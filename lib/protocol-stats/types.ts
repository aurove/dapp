export type ProtocolStatsSnapshot = {
  chainId: number;
  /** Server generation time (ms). */
  fetchedAt: number;
  /**
   * Aggregate TVL in mUSD:
   * Σ(veBTC tranche totalSupply × avBTCm price)
   * + Σ(veMEZO tranche totalSupply × avMEZOm price)
   * + MUSD reserve in the MUSD/avBTCm pool.
   */
  tvlUsd: number | null;
  /** Free-form notes for partial data (e.g. cache, degraded path). */
  notes?: string[];
  healthy: boolean;
};
