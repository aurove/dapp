export function chainTimestampToIso(chainTimestampSeconds: number): string {
  return new Date(chainTimestampSeconds * 1000).toISOString();
}

export function computeChainSecondsRemaining(
  nextEligibleAt: string,
  chainTimestampSeconds: number,
): number {
  return Math.max(0, Math.ceil((Date.parse(nextEligibleAt) - chainTimestampSeconds * 1000) / 1000));
}

export function computeChainCooldownProgress(input: {
  lastCheckInAt: string | null;
  nextEligibleAt: string | null;
  chainTimestampSeconds: number | null;
}): number {
  if (!input.lastCheckInAt || !input.nextEligibleAt || input.chainTimestampSeconds === null) {
    return 0;
  }

  const totalMs = Date.parse(input.nextEligibleAt) - Date.parse(input.lastCheckInAt);
  if (totalMs <= 0) {
    return 0;
  }

  const remainingMs = Math.max(0, Date.parse(input.nextEligibleAt) - input.chainTimestampSeconds * 1000);
  return Math.min(100, Math.max(0, Math.round(((totalMs - remainingMs) / totalMs) * 100)));
}
