# veBTC gauge voting

`/vote` uses the exact-chain generated contract registry and `AUROVE_LIQUIDITY_PAIRS`. The canonical voter comes from CL gauge deployment linked data, and its `ve()` must match the configured VeBTC. Gauge addresses are discovered with `Voter.gauges(pool)`, then checked with `isGauge`, `isAlive` and `poolForGauge`. Bribe and fee reward addresses come from `gaugeToBribe` and `gaugeToFees`, not hardcoded deployment snapshots. No fallback network is used.

The voter ABI is extracted from `packages/core/tigris/solidity/deployments/mainnet/Voter.json`; shared gauge eligibility functions remain in `contracts/mezo-voting-incentives.ts`. veBTC, CLPool and CLGauge reads reuse registry ABIs. NFT discovery reuses `useUserVeNFTs` and the portfolio infrastructure. Ownership is rechecked at the read block. This view covers directly held veBTC NFTs, not the protocol-maintainer role for Aurove-managed NFTs.

## Sources and formulas

All voting, pool and reward reads in a refresh use one block number, including the reused incentive reader through a snapshot client. The displayed timestamp is chain time, refreshed every 15 seconds.

| Value                    | Source / calculation                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voting power             | `VeBTC.votingPowerOfNFT(tokenId)`, 18 decimals                                                                                                                                                                                                                                                                          |
| Existing allocations     | `Voter.usedWeights`, `poolVote`, `votes`; includes non-Aurove pools                                                                                                                                                                                                                                                     |
| Pool votes               | `Voter.weights(pool)`                                                                                                                                                                                                                                                                                                   |
| Vote share               | `weights(pool) / totalWeight * 100`; global denominator, not just eligible Aurove pools. Small positive shares display `<0.01%`. These are persistent current weights, not votes newly cast this epoch.                                                                                                                 |
| Draft allocation         | `floor(votingPower * percentage / 100)` in base units; all submitted positive weights sum to 100                                                                                                                                                                                                                        |
| Epoch                    | `epochStart`, `epochNext`, `epochVoteStart`, `epochVoteEnd`, called with the snapshot block timestamp                                                                                                                                                                                                                   |
| Pool liquidity           | Raw `CLPool.liquidity` and each constituent ERC20's `balanceOf(pool)`; balances include fees/donations and are explicitly not a USD TVL valuation                                                                                                                                                                       |
| Swap fee rate            | `CLPool.fee / 10,000` percent; a fee rate, not annual yield                                                                                                                                                                                                                                                             |
| Emissions                | `CLGauge.rewardRate`, `rewardToken`, `periodFinish`; effective rate is zero after the period ends                                                                                                                                                                                                                       |
| Posted incentives        | Reward-token enumeration from the shared incentive reader, then `BribeVotingReward.tokenRewardsPerEpoch(token, epochStart)`                                                                                                                                                                                             |
| Previous incentives      | Same mapping for `epochStart - (epochNext - epochStart)`                                                                                                                                                                                                                                                                |
| Conditional voter payout | `floor(postedIncentives * BribeVotingReward.balanceOf(NFT) / totalSupply)` per token, from confirmed allocations. Null when supply is zero or inputs unavailable. Assumes balances, supply and funding remain unchanged until epoch close; not a claimable amount. Actual `Reward.earned` uses final epoch checkpoints. |
| Token units              | On-chain token decimals; existing known-token configuration is used for Mezo native precompile metadata when ERC20 metadata calls are unavailable. Unknown token decimals never default silently.                                                                                                                       |

No APR is fabricated. Pool interval trading volume and accrued fees are not available through the existing pool analytics infrastructure. Fee APR, USD TVL, staked-capital emission APR, voter APR and combined LP APR are unavailable. Pool balances and raw emission rates are shown instead. Calculating a fee APR would require priced fee totals over a specified interval and an appropriate LP capital denominator. CL emission APR also needs staked capital and reward prices. Voter rewards must never be added to LP APR. Historical voting checkpoints are not currently indexed in this view.

## Contract constraints and transactions

Local checks mirror `Voter.sol` (`onlyNewEpoch` and `vote`), but the shared `executePreparedWriteStep` simulates the actual contract call before asking the wallet to sign. It uses the existing notifications and confirmation infrastructure. The page checks receipt success, invalidates voting queries and reads confirmed allocations.

- `lastVoted >= epochStart` blocks a second vote or vote after managed deposit in the same epoch.
- `timestamp <= epochVoteStart` blocks distribution-window voting.
- `timestamp > epochVoteEnd` requires `isWhitelistedNFT`.
- `maxVotingNum` is read on-chain. Each positive allocation must survive integer rounding.
- `vote` resets old allocations internally; users review the replacement of all previous pools. An extra reset transaction is unnecessary and cannot circumvent same-epoch restrictions.
- Epoch, NFT ownership, power and eligible gauges are reread immediately before submission. Account/network changes remount the draft. Simulation enforces any additional live implementation behavior.

## Verification

Run `pnpm --filter @aurove/dapp test`, `typecheck`, and ESLint on the changed files. Browser checks are in `e2e/tests/vote.spec.ts` (390px and 1440px, disconnected wallet, details, no horizontal overflow).

For real deployed-contract behavior without sending a mainnet transaction:

```sh
anvil --fork-url https://rpc-internal.mezo.org --fork-block-number 11677440 --port 8547
cd dapp
VOTE_FORK_RPC=http://127.0.0.1:8547 npm run test:vote:fork
```

The opt-in test refuses non-loopback/non-Anvil endpoints, snapshots and restores state, discovers an existing powered NFT, impersonates its owner only on the fork, verifies source reads, rejects the distribution window, confirms a vote, rejects same-epoch revoting, and confirms next-epoch replacement. Anvil does not implement Mezo native precompiles; this test exercises voter/reward checkpoint behavior rather than native-token transfers. No mainnet funds or votes are changed.

Mainnet source reads and the fork scenario passed at block 11677440. Full browser wallet-signing automation is not covered by the disconnected browser tests; the fork test covers the actual contract submission and resulting state.

## Public rendering and simplified view

The main list shows pool names, vote share and posted voter rewards. Raw liquidity, yield availability, contracts and projections remain in the collapsed pool details. Current wallet allocations are expandable; the replacement/once-per-round warning appears at review. Display amounts are shortened to six decimals without converting large base-unit amounts to floating point.

The route renders its introduction, metadata and WebPage JSON-LD on the server. A streamed public pool snapshot seeds the client query only when its chain matches and no wallet is connected. The shared incentive reader lives in `gauge-incentive-data.ts` so both server and client use the same implementation. The public snapshot uses Next's per-chain data cache with 30-second revalidation and preserves bigint values. Wallet data never enters that cache. The original snapshot time seeds query freshness; wallet transactions still reread and simulate live state.

Server RPC work has a 20-second rendering deadline. On failure or timeout the introduction and SEO remain available while the client retries pool reads. `/vote` uses the shared canonical/Open Graph/Twitter metadata helper and is included in the sitemap. Browser tests also inspect script-stripped response HTML to verify the pool content is server-rendered rather than merely embedded in a client payload.
