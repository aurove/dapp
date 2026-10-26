import { wormhole, type Network, type Wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import { HORIZON_TESTNET } from "@/lib/bridge/horizon";

export type HorizonWormholeNetwork = Extract<Network, "Testnet">;

const wormholeByNetwork = new Map<HorizonWormholeNetwork, Promise<Wormhole<HorizonWormholeNetwork>>>();

/**
 * Shared Wormhole SDK client for Horizon (EVM).
 * Used for chain context, VAA lookups, and Wormholescan-aligned tracking.
 * NTT transfers construct `EvmNtt` directly so they do not depend on protocol registration.
 */
export async function getHorizonWormhole(
  network: HorizonWormholeNetwork = "Testnet",
): Promise<Wormhole<HorizonWormholeNetwork>> {
  const existing = wormholeByNetwork.get(network);
  if (existing) return existing;

  const created = wormhole(network, [evm], {
    chains: {
      Mezo: { rpc: HORIZON_TESTNET[31611].rpc },
      BaseSepolia: { rpc: HORIZON_TESTNET[84532].rpc },
    },
  });
  wormholeByNetwork.set(network, created);
  return created;
}
