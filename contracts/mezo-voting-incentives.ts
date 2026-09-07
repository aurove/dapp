import { parseAbi } from "viem";

/** Canonical Mezo Voter read surface used to validate a CL gauge incentive path. */
export const MEZO_VOTER_INCENTIVE_ABI = parseAbi([
  "function gauges(address pool) view returns (address)",
  "function poolForGauge(address gauge) view returns (address)",
  "function gaugeToBribe(address gauge) view returns (address)",
  "function isGauge(address gauge) view returns (bool)",
  "function isAlive(address gauge) view returns (bool)",
  "function isWhitelistedToken(address token) view returns (bool)",
]);

/** Canonical IReward surface implemented by Mezo's BribeVotingReward contract. */
export const MEZO_BRIBE_VOTING_REWARD_ABI = parseAbi([
  "error NotWhitelisted()",
  "error ZeroAmount()",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function rewards(uint256 index) view returns (address)",
  "function rewardsListLength() view returns (uint256)",
  "function isReward(address token) view returns (bool)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
  "function notifyRewardAmount(address token, uint256 amount)",
]);
