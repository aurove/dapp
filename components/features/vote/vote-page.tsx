"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits, type PublicClient } from "viem";
import { Button, Card, CardContent, CardHeader } from "@ui";
import { MEZO_VOTER_ABI } from "@/contracts/mezo-voter";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";
import { executePreparedWriteStep } from "@/lib/tx-flow/execute";
import { makeAddressWriteStep } from "@/lib/tx-flow/steps";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import type { TxPreparedWriteStep } from "@/lib/tx-flow/types";
import { useUserVeNFTs } from "@/components/features/earn/hooks/use-user-ve-nfts";
import { fetchVoteData, type VoteData } from "./vote-data";
import { allocationWeights, voteShare, votingRestriction, projectedIncentive } from "./vote-model";

const amount = (n: bigint, decimals = 18) => {
  const value = formatUnits(n, decimals);
  const [whole, fraction = ""] = value.split(".");
  if (n > 0n && whole === "0" && Number(value) < 0.000001) return "<0.000001";
  const digits = fraction.slice(0, 6).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("en-US")}${digits ? `.${digits}` : ""}`;
};
type VotePageProps = { initialData?: VoteData; initialChainId?: number; initialUpdatedAt?: number };

export function VotePage(props: VotePageProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  return <VotePageContent key={`${chainId}:${address ?? "disconnected"}`} {...props} />;
}

function VotePageContent({ initialData, initialChainId, initialUpdatedAt }: VotePageProps) {
  const chainId = useChainId();
  const { address, chain } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const runtime = useTxFlowRuntime();
  const [selected, setSelected] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const nfts = useUserVeNFTs();
  const ownedIds =
    nfts.veCollections.find((c) => c.assetType === "veBTC")?.veNfts.map((n) => n.tokenId) ?? [];
  const query = useQuery({
    queryKey: ["vebtc-vote", chainId, address, selected, ownedIds.map(String)],
    enabled: !!client,
    initialData: !address && chainId === initialChainId ? initialData : undefined,
    initialDataUpdatedAt: initialUpdatedAt,
    queryFn: () =>
      fetchVoteData(
        client as PublicClient,
        chainId,
        address,
        selected ? BigInt(selected) : undefined,
        ownedIds,
      ),
    refetchInterval: 15000,
    staleTime: 10000,
    retry: 1,
  });
  const data = query.data;
  const user = data?.user;
  const restriction =
    data && user
      ? votingRestriction({
          ...user,
          now: data.now,
          start: data.start,
          voteStart: data.voteStart,
          voteEnd: data.voteEnd,
        })
      : "Choose a veBTC position to vote.";
  const values = data?.pools.map((p) => inputs[p.target.poolAddress] ?? "0") ?? [];
  let validation: string | null = null;
  try {
    allocationWeights(values, user?.power ?? 0n, data?.maximum ?? 0n);
  } catch (e) {
    validation = (e as Error).message;
  }
  const edit = (pool: string, value: string) => {
    setInputs({ ...inputs, [pool]: value });
    setReview(false);
    setMessage(null);
  };
  async function submit() {
    if (
      lock.current ||
      !data ||
      !user ||
      !address ||
      !chain ||
      !client ||
      restriction ||
      validation
    )
      return;
    lock.current = true;
    setPending(true);
    setMessage(null);
    let confirmed = false;
    try {
      if (chain.id !== chainId) throw new Error("Switch your wallet to the displayed network.");
      const fresh = await fetchVoteData(
        client as PublicClient,
        chainId,
        address,
        user.id,
        ownedIds,
      );
      if (fresh.start !== data.start || fresh.user?.id !== user.id)
        throw new Error("Epoch or NFT changed. Refresh and review again.");
      const blocked = votingRestriction({
        ...fresh.user,
        now: fresh.now,
        start: fresh.start,
        voteStart: fresh.voteStart,
        voteEnd: fresh.voteEnd,
      });
      if (blocked) throw new Error(blocked);
      const weights = allocationWeights(values, fresh.user.power, fresh.maximum);
      const allocations = data.pools
        .map((p, i) => ({ pool: p.target.poolAddress, weight: weights[i] }))
        .filter((p) => p.weight > 0n);
      if (allocations.some((a) => !fresh.pools.some((p) => p.target.poolAddress === a.pool)))
        throw new Error("Gauge eligibility changed. Refresh and review again.");
      const step = makeAddressWriteStep({
        key: "vebtc-vote",
        label: "Vote with veBTC",
        address: fresh.voter,
        abi: MEZO_VOTER_ABI,
        variables: {
          functionName: "vote",
          args: [user.id, allocations.map((a) => a.pool), allocations.map((a) => a.weight)],
        },
      });
      const result = await executePreparedWriteStep(step as unknown as TxPreparedWriteStep, {
        account: address,
        chainId,
        publicClient: client,
        writeAsync: writeContractAsync,
        contracts: runtime.contracts,
        notify: runtime.notify,
        queryClient,
      });
      if (result === "skip") throw new Error("Vote was not submitted.");
      if (result.receipt.status !== "success") throw new Error("Vote transaction reverted.");
      confirmed = true;
      setMessage("Vote confirmed. Refreshing on-chain allocations…");
      setReview(false);
      await queryClient.invalidateQueries({ queryKey: ["vebtc-vote"] }, { throwOnError: true });
      setMessage("Vote confirmed. Your current allocations are shown below.");
    } catch (e) {
      setMessage(
        confirmed
          ? `Vote confirmed, but refreshing allocations failed. Retry the data refresh: ${getParsedError(e)}`
          : `Vote failed: ${getParsedError(e)}`,
      );
      setReview(false);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      {!address && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p>Connect your wallet to start voting.</p>
            <ConnectButton />
          </CardContent>
        </Card>
      )}
      {query.isPending && <p role="status">Loading pools…</p>}
      {query.isError && (
        <div role="alert" className="text-red-300">
          Unable to load current voting data: {query.error.message}{" "}
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-white/60">This voting round</p>
            <p>
              {Math.floor(Number(data.next - data.now) / 86400)}d{" "}
              {Math.floor((Number(data.next - data.now) % 86400) / 3600)}h left
            </p>
          </div>
          {address && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Your voting power</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {nfts.isLoading ? (
                  <p>Loading your veBTC…</p>
                ) : nfts.error ? (
                  <p role="alert">
                    Unable to load wallet NFTs. <button onClick={nfts.refresh}>Retry</button>
                  </p>
                ) : data.ids.length === 0 ? (
                  <p>
                    You need a veBTC position to vote. Holding avBTCm alone does not give voting
                    power.
                  </p>
                ) : (
                  <label className="flex flex-wrap items-center gap-3">
                    Choose your veBTC position
                    <select
                      className="rounded border border-white/20 bg-black p-2"
                      value={user?.id.toString() ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        setSelected(e.target.value);
                        setInputs({});
                        setReview(false);
                        setMessage(null);
                      }}
                    >
                      {data.ids.map((id) => (
                        <option key={id.toString()} value={id.toString()}>
                          #{id.toString()}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {user && (
                  <>
                    <p>
                      Available power: {amount(user.power)} veBTC · Allocated: {amount(user.used)}{" "}
                      veBTC
                    </p>
                    <p className="text-sm text-white/60">You can vote once each round.</p>
                    <details className="space-y-2">
                      <summary className="cursor-pointer text-sm text-white/60">
                        Your current votes
                      </summary>
                      {user.allocations.length ? (
                        user.allocations.map((a) => (
                          <p key={a.pool} className="break-all text-sm">
                            {data.pools.find(
                              (p) => p.target.poolAddress.toLowerCase() === a.pool.toLowerCase(),
                            )?.target.pair.pairLabel ?? a.pool}
                            : {amount(a.weight)} veBTC ({voteShare(a.weight, user.used)})
                          </p>
                        ))
                      ) : (
                        <p className="text-white/50">No existing allocations.</p>
                      )}
                    </details>
                  </>
                )}
                {restriction && (
                  <p role="status" className="text-amber-200">
                    {restriction}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.pools.map((p, i) => (
              <Card key={p.target.poolAddress} className="border-white/10 bg-white/[0.035]">
                <CardHeader>
                  <h2 className="text-lg font-semibold">{p.target.pair.pairLabel}</h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-white/50">Share of votes</span>
                    <span className="text-xl font-medium">{voteShare(p.weight, data.total)}</span>
                  </div>
                  <div>
                    <h3 className="text-sm text-white/50">Rewards for voters this round</h3>
                    {p.incentives.tokens
                      .filter((t) => t.currentEpochIncentives !== 0n)
                      .map((t) => (
                        <p key={t.address}>
                          {t.currentEpochIncentives === null
                            ? "Unavailable"
                            : amount(t.currentEpochIncentives, t.decimals)}{" "}
                          {t.symbol}
                        </p>
                      ))}
                    {p.incentives.tokens.every((t) => t.currentEpochIncentives === 0n) && (
                      <p>No rewards added yet.</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <span className="text-sm text-white/50">Current epoch fees</span>
                    {!p.accumulatedFees ? (
                      <p className="text-xl font-medium">Unavailable</p>
                    ) : p.accumulatedFees.every((fee) => fee.amount === 0n) ? (
                      <p className="text-xl font-medium">No fees yet.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {p.accumulatedFees.map((fee) => (
                          <p key={fee.address} className="text-xl font-medium">
                            {amount(fee.amount, fee.decimals)} {fee.symbol}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 rounded-lg border border-white/10 p-3 text-sm">
                    <p>Total votes: {amount(p.weight)} veBTC</p>
                    <p>
                      Your vote:{" "}
                      {amount(
                        user?.allocations.find(
                          (a) => a.pool.toLowerCase() === p.target.poolAddress.toLowerCase(),
                        )?.weight ?? 0n,
                      )}{" "}
                      veBTC
                    </p>
                    <div className="space-y-1">
                        <h4 className="font-medium">Your conditional voter incentive share</h4>
                        {p.incentivePosition ? (
                          p.incentives.tokens
                            .filter((t) => t.currentEpochIncentives !== 0n)
                            .map((t) => {
                              const projected =
                                t.currentEpochIncentives === null
                                  ? null
                                  : projectedIncentive(
                                      t.currentEpochIncentives,
                                      p.incentivePosition!.balance,
                                      p.incentivePosition!.supply,
                                    );
                              return (
                                <p key={t.address}>
                                  {projected === null
                                    ? "Unavailable"
                                    : amount(projected, t.decimals)}{" "}
                                  {t.symbol}
                                </p>
                              );
                            })
                        ) : (
                          <p>
                            {user
                              ? "Reward balance or supply unavailable."
                              : "Connect and select a veBTC NFT to view your share."}
                          </p>
                        )}
                        <p className="text-xs text-white/50">
                          Projection from your confirmed allocation, assuming reward balances, total
                          supply and posted incentives remain unchanged until epoch close. Not
                          claimable yet; draft votes are excluded.
                        </p>
                    </div>
                  </div>
                  {address && (
                    <label className="flex items-center justify-between gap-4">
                      Your vote (%)
                      <input
                        aria-label={`${p.target.pair.pairLabel} allocation percent`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="w-24 rounded border border-white/20 bg-transparent p-2"
                        value={values[i]}
                        disabled={pending || !!restriction || query.isError}
                        onChange={(e) => edit(p.target.poolAddress, e.target.value)}
                      />
                    </label>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {data.pools.length === 0 && <p>No Aurove pools currently have eligible veBTC gauges.</p>}
          {address && user && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h2 className="text-lg font-semibold">
                  {review ? "Review allocation" : "Allocate voting power"}
                </h2>
                {review && (
                  <p className="text-sm text-amber-100">
                    This replaces all your current votes, including pools outside Aurove. You cannot
                    change them again this round.
                  </p>
                )}
                {review &&
                  data.pools.map(
                    (p, i) =>
                      Number(values[i]) > 0 && (
                        <p key={p.target.poolAddress}>
                          {p.target.pair.pairLabel}: {values[i]}% ·{" "}
                          {amount((user.power * BigInt(values[i])) / 100n)} veBTC
                        </p>
                      ),
                  )}
                <p className="text-sm text-white/50">{validation ?? "Ready to review."}</p>
                <Button
                  disabled={pending || !!restriction || !!validation || query.isError}
                  onClick={() => (review ? void submit() : setReview(true))}
                >
                  {pending ? "Confirm in wallet…" : review ? "Submit vote" : "Review allocation"}
                </Button>
                {review && !pending && (
                  <Button variant="ghost" onClick={() => setReview(false)}>
                    Edit allocation
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          <details className="text-sm text-white/50">
            <summary className="cursor-pointer">How voting works & data details</summary>
            <p className="mt-3">
              Round starts {new Date(Number(data.start) * 1000).toUTCString()}. Voting opens after{" "}
              {new Date(Number(data.voteStart) * 1000).toUTCString()} and regular voting closes{" "}
              {new Date(Number(data.voteEnd) * 1000).toUTCString()}. Data from block{" "}
              {data.block.toString()}, refreshed every 15 seconds. Displayed token amounts are
              shortened to six decimal places.
            </p>
            <p className="mt-3">
              Vote share = Voter.weights(pool) / Voter.totalWeight × 100. The denominator includes
              all pools, including non-Aurove gauges. Votes persist across epochs until updated;
              these are current contract weights, not a historical epoch tally. Draft power =
              votingPowerOfNFT × allocation / 100, rounded down. Epoch windows and limits come from
              the Voter. Incentives use BribeVotingReward.tokenRewardsPerEpoch with each token’s
              decimals. Swap fee rate = CLPool.fee / 10,000 percent. Pool balances use
              ERC20.balanceOf(pool); liquidity uses CLPool.liquidity. Emission rate uses
              CLGauge.rewardRate and periodFinish. Conditional token payout = posted epoch
              incentives × BribeVotingReward.balanceOf(NFT) / totalSupply, rounded down. The actual
              payout uses final epoch checkpoints. No APR is reported because priced interval fees,
              staked capital valuation and final reward checkpoints are unavailable. LP fee yield,
              LP emissions and veBTC voter rewards are not added together.
            </p>
          </details>
        </>
      )}
      {message && (
        <p role="status" className="break-words rounded-lg border border-white/15 p-4">
          {message}
        </p>
      )}
    </div>
  );
}
