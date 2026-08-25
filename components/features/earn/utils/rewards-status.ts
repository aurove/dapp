export type Id20RewardsPanelState = "loading" | "error" | "empty" | "ready";

export function id20RewardsPanelState(params: {
  isLoading: boolean;
  error: unknown;
  positionCount: number;
}): Id20RewardsPanelState {
  if (params.isLoading) return "loading";
  if (params.error) return "error";
  if (params.positionCount === 0) return "empty";
  return "ready";
}

export function claimAllGaugeLabel(claimableCount: number): string {
  return `Claimed all available ID20 gauge rewards from ${claimableCount} gauge${claimableCount === 1 ? "" : "s"}.`;
}
