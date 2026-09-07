export function votingRestriction(p: {
  now: bigint;
  start: bigint;
  voteStart: bigint;
  voteEnd: bigint;
  lastVoted: bigint;
  whitelisted: boolean;
  power: bigint;
  deactivated: boolean;
}) {
  if (p.deactivated) return "This veBTC NFT is deactivated.";
  if (p.power === 0n) return "No veBTC voting power available for this NFT.";
  if (p.lastVoted >= p.start) return "Already voted or deposited this epoch. Rebalance next epoch.";
  if (p.now <= p.voteStart) return "Voting unavailable during the distribution window.";
  if (p.now > p.voteEnd && !p.whitelisted)
    return "Voting has closed for this NFT in the current epoch.";
  return null;
}
export function allocationWeights(inputs: readonly string[], power: bigint, maximum: bigint) {
  if (inputs.some((x) => !/^\d{1,3}$/.test(x)))
    throw new Error("Use whole percentages from 0 to 100.");
  const weights = inputs.map(BigInt);
  if (weights.reduce((a, b) => a + b, 0n) !== 100n)
    throw new Error("Allocate exactly 100% before reviewing.");
  if (BigInt(weights.filter((x) => x > 0n).length) > maximum)
    throw new Error("Too many pools for the voter's current limit.");
  if (weights.some((x) => x > 0n && (x * power) / 100n === 0n))
    throw new Error("Voting power is too small for this allocation.");
  return weights;
}
export function voteShare(weight: bigint, total: bigint) {
  if (total > 0n && weight > 0n && weight * 10000n < total) return "<0.01%";
  return total > 0n ? `${Number((weight * 10000n) / total) / 100}%` : "—";
}

/** Conditional epoch payout if reward balances, supply and posted rewards stay unchanged. */
export function projectedIncentive(rewards: bigint, balance: bigint, supply: bigint) {
  return supply > 0n && balance <= supply ? (rewards * balance) / supply : null;
}
