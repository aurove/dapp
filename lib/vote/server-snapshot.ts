import "server-only";
import { unstable_cache } from "next/cache";
import type { PublicClient } from "viem";
import { getServerPublicClient } from "@/lib/web3/server-chain-time";
import { fetchVoteData, type VoteData } from "@/components/features/vote/vote-data";

// This app does not enable Cache Components. Keep a short, per-chain Next data
// cache for public snapshots only; account and allocation reads are never cached here.
const readSnapshot = unstable_cache(
  async (chainId: number) => {
    const client = getServerPublicClient(chainId);
    if (!client) throw new Error("Unsupported voting network");
    const data = await fetchVoteData(client as PublicClient, chainId);
    return JSON.stringify({ data, updatedAt: Date.now() }, (_, value) =>
      typeof value === "bigint" ? { $voteBigInt: value.toString() } : value,
    );
  },
  ["public-vote-snapshot-v1"],
  { revalidate: 30 },
);

export async function getVoteSnapshot(
  chainId: number,
): Promise<{ data: VoteData; updatedAt: number }> {
  return JSON.parse(await readSnapshot(chainId), (_, value) =>
    value && typeof value === "object" && "$voteBigInt" in value
      ? BigInt(value.$voteBigInt)
      : value,
  );
}
