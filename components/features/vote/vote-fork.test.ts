import assert from "node:assert/strict";
import test from "node:test";
import { createPublicClient, createWalletClient, erc20Abi, http, type Address } from "viem";
import { getContractsByChainId } from "@/contracts/shared";
import { MEZO_VOTER_ABI } from "@/contracts/mezo-voter";
import { MEZO_BRIBE_VOTING_REWARD_ABI } from "@/contracts/mezo-voting-incentives";
import { fetchVoteData } from "./vote-data";

// Opt-in, isolated Anvil mainnet fork only. Never send transactions to a public RPC.
const url = process.env.VOTE_FORK_RPC;
test(
  "mainnet fork: authoritative reads, vote, revote rejection, next-epoch rebalance",
  { skip: !url, timeout: 180000 },
  async () => {
    const endpoint = new URL(url!);
    assert.ok(["127.0.0.1", "localhost"].includes(endpoint.hostname));
    const client = createPublicClient({ transport: http(url) });
    const rpc = (method: string, params: unknown[] = []) =>
      client.request({ method, params } as never);
    assert.match((await rpc("web3_clientVersion")) as string, /anvil/i);
    const snapshot = await rpc("evm_snapshot");
    try {
      const data = await fetchVoteData(client, 31612);
      assert.ok(data.pools.length > 0);
      for (const p of data.pools) {
        const poolContract = getContractsByChainId(31612)![p.target.pair.poolContractName];
        assert.equal(
          p.liquidity,
          await client.readContract({
            address: p.target.poolAddress,
            abi: poolContract.abi,
            functionName: "liquidity",
            blockNumber: data.block,
          }),
        );
        assert.equal(
          p.swapFee,
          await client.readContract({
            address: p.target.poolAddress,
            abi: poolContract.abi,
            functionName: "fee",
            blockNumber: data.block,
          }),
        );
        for (const balance of p.balances)
          assert.equal(
            balance.balance,
            await client.readContract({
              address: balance.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [p.target.poolAddress],
              blockNumber: data.block,
            }),
          );

        assert.equal(
          p.weight,
          await client.readContract({
            address: data.voter,
            abi: MEZO_VOTER_ABI,
            functionName: "weights",
            args: [p.target.poolAddress],
            blockNumber: data.block,
          }),
        );
        for (const t of p.incentives.tokens)
          assert.equal(
            t.currentEpochIncentives,
            await client.readContract({
              address: p.target.incentiveRecipientAddress,
              abi: MEZO_BRIBE_VOTING_REWARD_ABI,
              functionName: "tokenRewardsPerEpoch",
              args: [t.address, data.start],
              blockNumber: data.block,
            }),
          );
      }
      const ve = getContractsByChainId(31612)!.VeBTC;
      let id = 0n;
      let owner: Address | undefined;
      for (let candidate = 1n; candidate <= 100n; candidate++) {
        const power = await client
          .readContract({
            address: ve.address,
            abi: ve.abi,
            functionName: "votingPowerOfNFT",
            args: [candidate],
          })
          .catch(() => 0n);
        if (power > 100n) {
          id = candidate;
          owner = await client.readContract({
            address: ve.address,
            abi: ve.abi,
            functionName: "ownerOf",
            args: [id],
          });
          break;
        }
      }
      assert.ok(owner, "No funded veBTC NFT found in fork fixture");
      await rpc("anvil_impersonateAccount", [owner]);
      await rpc("anvil_setBalance", [owner, "0x56BC75E2D63100000"]);
      const wallet = createWalletClient({ account: owner, transport: http(url) });
      const pools = data.pools.map((p) => p.target.poolAddress);
      const args = [id, pools, pools.map(() => 1n)] as const;
      await rpc("evm_setNextBlockTimestamp", [Number(data.next + 1n)]);
      await rpc("evm_mine");
      await assert.rejects(
        client.simulateContract({
          account: owner,
          address: data.voter,
          abi: MEZO_VOTER_ABI,
          functionName: "vote",
          args,
        }),
        /DistributeWindow/,
      );
      const start = await client.readContract({
        address: data.voter,
        abi: MEZO_VOTER_ABI,
        functionName: "epochVoteStart",
        args: [data.next],
      });
      await rpc("evm_setNextBlockTimestamp", [Number(start + 1n)]);
      await rpc("evm_mine");
      const sim = await client.simulateContract({
        account: owner,
        address: data.voter,
        abi: MEZO_VOTER_ABI,
        functionName: "vote",
        args,
      });
      const hash = await wallet.writeContract({ ...sim.request, chain: null });
      assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
      const confirmed = await fetchVoteData(client, 31612, owner, id, [id]);
      assert.equal(confirmed.user!.allocations.length, pools.length);
      assert.ok(confirmed.user!.used > 0n);
      await assert.rejects(
        client.simulateContract({
          account: owner,
          address: data.voter,
          abi: MEZO_VOTER_ABI,
          functionName: "vote",
          args,
        }),
        /AlreadyVotedOrDeposited/,
      );
      const nextStart = await client.readContract({
        address: data.voter,
        abi: MEZO_VOTER_ABI,
        functionName: "epochVoteStart",
        args: [confirmed.next],
      });
      await rpc("evm_setNextBlockTimestamp", [Number(nextStart + 1n)]);
      await rpc("evm_mine");
      const rebalance = await client.simulateContract({
        account: owner,
        address: data.voter,
        abi: MEZO_VOTER_ABI,
        functionName: "vote",
        args: [id, [pools[0]], [100n]],
      });
      const rehash = await wallet.writeContract({ ...rebalance.request, chain: null });
      assert.equal((await client.waitForTransactionReceipt({ hash: rehash })).status, "success");
      const after = await fetchVoteData(client, 31612, owner, id, [id]);
      assert.equal(after.user!.allocations.length, 1);
      assert.equal(after.user!.allocations[0].pool.toLowerCase(), pools[0].toLowerCase());
      console.log(
        `Verified Mezo fork block ${data.block}, NFT #${id}, ${pools.length} live gauges; successful vote and next-epoch replacement.`,
      );
    } finally {
      await rpc("evm_revert", [snapshot]);
    }
  },
);
