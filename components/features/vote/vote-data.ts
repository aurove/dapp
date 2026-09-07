import { erc20Abi, type Abi, type Address, type PublicClient, zeroAddress } from "viem";
import { getContractsByChainId } from "@/contracts/shared";
import { MEZO_VOTER_ABI } from "@/contracts/mezo-voter";
import {
  AUROVE_LIQUIDITY_PAIRS,
  type GaugeIncentiveTarget,
  type RuntimeContractConfig,
} from "@/lib/config/supported-liquidity-pools";
import { getKnownMezoTokenConfigs } from "@/components/shared/known-mezo-tokens";
import { fetchGaugeIncentiveData } from "../liquidity/gauge-incentive-data";
import { MEZO_BRIBE_VOTING_REWARD_ABI } from "@/contracts/mezo-voting-incentives";

type RawPoolFee = {
  address: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
};

function isRawPoolFee(value: RawPoolFee | null): value is RawPoolFee {
  return value !== null;
}

export async function fetchVoteData(
  client: PublicClient,
  chainId: number,
  account?: Address,
  selected?: bigint,
  ownedIds: readonly bigint[] = [],
) {
  const contracts = getContractsByChainId(chainId);
  if (!contracts) throw new Error("Voting is not configured on this network.");
  const block = await client.getBlock();
  const snapshotClient = {
    ...client,
    getBlock: async () => block,
    readContract: (request: Parameters<PublicClient["readContract"]>[0]) =>
      client.readContract({ ...request, blockNumber: block.number }),
  } as PublicClient;
  const read = <T>(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
  ) =>
    client.readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber: block.number,
    }) as Promise<T>;
  // Resolve the canonical voter through the deployed gauge's linked configuration;
  // discover current gauge and reward addresses on chain, never assume deployment snapshots are current.
  const runtimeContracts = contracts as unknown as Record<string, RuntimeContractConfig>;
  const voter = AUROVE_LIQUIDITY_PAIRS.map(
    (pair) => runtimeContracts[pair.gaugeContractName]?.linkedData?.voter,
  ).find(Boolean) as Address | undefined;
  if (!voter) throw new Error("No veBTC gauge voter configured on this network.");
  const v = <T>(name: string, args: readonly unknown[] = []) =>
    read<T>(voter, MEZO_VOTER_ABI, name, args);
  const [ve, start, next, voteStart, voteEnd, total, maximum] = await Promise.all([
    v<Address>("ve"),
    v<bigint>("epochStart", [block.timestamp]),
    v<bigint>("epochNext", [block.timestamp]),
    v<bigint>("epochVoteStart", [block.timestamp]),
    v<bigint>("epochVoteEnd", [block.timestamp]),
    v<bigint>("totalWeight"),
    v<bigint>("maxVotingNum"),
  ]);
  if (ve.toLowerCase() !== contracts.VeBTC.address.toLowerCase())
    throw new Error("Voter escrow does not match the configured veBTC.");
  const e = <T>(name: string, args: readonly unknown[] = []) =>
    read<T>(ve, contracts.VeBTC.abi, name, args);
  // Reuse the portfolio's veBTC discovery, then verify ownership at the snapshot block.
  const ownership = await Promise.all(
    ownedIds.map(async (id) => ({ id, owner: await e<Address>("ownerOf", [id]) })),
  );
  const ids = ownership
    .filter((x) => account && x.owner.toLowerCase() === account.toLowerCase())
    .map((x) => x.id);
  const id = selected !== undefined && ids.includes(selected) ? selected : ids[0];
  const user =
    id === undefined
      ? null
      : await (async () => {
          const [power, lastVoted, whitelisted, deactivated, used] = await Promise.all([
            e<bigint>("votingPowerOfNFT", [id]),
            v<bigint>("lastVoted", [id]),
            v<boolean>("isWhitelistedNFT", [id]),
            e<boolean>("deactivated", [id]),
            v<bigint>("usedWeights", [id]),
          ]);
          const allocations: { pool: Address; weight: bigint }[] = [];
          let sum = 0n;
          // Sum against usedWeights so external allocations are included without probing past array bounds.
          for (let i = 0; sum < used; i++) {
            if (i >= 1000) throw new Error("Unable to enumerate all existing allocations.");
            const pool = await v<Address>("poolVote", [id, BigInt(i)]);
            const weight = await v<bigint>("votes", [id, pool]);
            allocations.push({ pool, weight });
            sum += weight;
          }
          return { id, power, lastVoted, whitelisted, deactivated, used, allocations };
        })();
  const pools = (
    await Promise.all(
      AUROVE_LIQUIDITY_PAIRS.map(async (pair) => {
        const pool = contracts[pair.poolContractName];
        const gauge = await v<Address>("gauges", [pool.address]);
        if (gauge === zeroAddress) return null;
        const [alive, registered, mappedPool] = await Promise.all([
          v<boolean>("isAlive", [gauge]),
          v<boolean>("isGauge", [gauge]),
          v<Address>("poolForGauge", [gauge]),
        ]);
        if (!alive || !registered || mappedPool.toLowerCase() !== pool.address.toLowerCase())
          return null;
        const [bribe, fees, weight, liquidity, token0, token1] = await Promise.all([
          v<Address>("gaugeToBribe", [gauge]),
          v<Address>("gaugeToFees", [gauge]),
          v<bigint>("weights", [pool.address]),
          read<bigint>(pool.address, pool.abi, "liquidity"),
          read<Address>(pool.address, pool.abi, "token0"),
          read<Address>(pool.address, pool.abi, "token1"),
        ]);
        const target: GaugeIncentiveTarget = {
          pair,
          poolAddress: pool.address,
          gaugeAddress: gauge,
          voterAddress: voter,
          incentiveRecipientAddress: bribe,
          candidateTokenAddresses: [token0, token1],
        };
        const [incentives, balances, emission] = await Promise.all([
          fetchGaugeIncentiveData({ publicClient: snapshotClient, chainId, target }),
          Promise.all(
            [token0, token1].map(async (address) => {
              const [symbol, decimals, balance] = await Promise.all([
                read<string>(address, erc20Abi, "symbol"),
                read<number>(address, erc20Abi, "decimals"),
                read<bigint>(address, erc20Abi, "balanceOf", [pool.address]),
              ]);
              return { address, symbol, decimals, balance };
            }),
          ),
          (async () => {
            const abi = runtimeContracts[pair.gaugeContractName]?.abi;
            if (!abi) throw new Error("Gauge ABI unavailable");
            const [rate, finish, token] = await Promise.all([
              read<bigint>(gauge, abi, "rewardRate"),
              read<bigint>(gauge, abi, "periodFinish"),
              read<Address>(gauge, abi, "rewardToken"),
            ]);
            const [symbol, decimals] = await Promise.all([
              read<string>(token, erc20Abi, "symbol"),
              read<number>(token, erc20Abi, "decimals"),
            ]);
            return { rate, finish, token, symbol, decimals };
          })().catch(() => null),
        ]);
        if (!incentives.available)
          throw new Error(incentives.unavailableReason ?? "Gauge unavailable");
        // The shared incentive reader has a display fallback for missing decimals.
        // Verify decimals here so a fallback can never turn into a factual vote-page amount.
        await Promise.all(
          incentives.tokens.map(async (token) => {
            token.decimals = await read<number>(token.address, erc20Abi, "decimals").catch(
              (error) => {
                const known = getKnownMezoTokenConfigs(chainId).find(
                  (t) => t.address.toLowerCase() === token.address.toLowerCase(),
                );
                if (!known) throw error;
                return known.decimals;
              },
            );
          }),
        );
        const swapFee = await read<number>(pool.address, pool.abi, "fee").catch(() => null);
        if (incentives.epochStart !== start)
          throw new Error("Epoch changed while reading incentives. Refresh to continue.");
        const incentivePosition = user
          ? await Promise.all([
              read<bigint>(bribe, MEZO_BRIBE_VOTING_REWARD_ABI, "balanceOf", [user.id]),
              read<bigint>(bribe, MEZO_BRIBE_VOTING_REWARD_ABI, "totalSupply"),
            ])
              .then(([balance, supply]) => ({ balance, supply }))
              .catch(() => null)
          : null;
        const [gaugeFees0, gaugeFees1, poolGaugeFees] = await Promise.all([
          read<bigint>(gauge, runtimeContracts[pair.gaugeContractName]?.abi ?? [], "fees0").catch(
            () => null,
          ),
          read<bigint>(gauge, runtimeContracts[pair.gaugeContractName]?.abi ?? [], "fees1").catch(
            () => null,
          ),
          read<readonly [bigint, bigint]>(pool.address, pool.abi, "gaugeFees").catch(() => null),
        ]);
        const pendingPoolGaugeFees = poolGaugeFees
          ? [
              poolGaugeFees[0] > 1n ? poolGaugeFees[0] - 1n : 0n,
              poolGaugeFees[1] > 1n ? poolGaugeFees[1] - 1n : 0n,
            ]
          : null;
        const accumulatedFees =
          gaugeFees0 !== null && gaugeFees1 !== null && pendingPoolGaugeFees !== null
            ? await Promise.all(
                balances.map(async (token, index) => {
                  const postedAmount = await read<bigint>(
                    fees,
                    MEZO_BRIBE_VOTING_REWARD_ABI,
                    "tokenRewardsPerEpoch",
                    [token.address, start],
                  ).catch(() => null);
                  if (postedAmount === null) return null;
                  const cachedGaugeFees = index === 0 ? gaugeFees0 : gaugeFees1;
                  const pendingFees = pendingPoolGaugeFees[index] ?? 0n;
                  return {
                    address: token.address,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    amount: postedAmount + cachedGaugeFees + pendingFees,
                  };
                }),
              ).then((feesByToken) =>
                feesByToken.every(isRawPoolFee) ? feesByToken : null,
              )
            : null;
        return {
          target,
          fees,
          weight,
          liquidity,
          incentives,
          balances,
          emission,
          swapFee,
          incentivePosition,
          accumulatedFees,
        };
      }),
    )
  ).filter((p) => p !== null);
  return {
    block: block.number,
    now: block.timestamp,
    voter,
    ve,
    start,
    next,
    voteStart,
    voteEnd,
    total,
    maximum,
    ids,
    user,
    pools,
  };
}
export type VoteData = Awaited<ReturnType<typeof fetchVoteData>>;
