import {
  Wormhole,
  signAndSendWait,
  type Chain,
  type TransactionId,
} from "@wormhole-foundation/sdk";
import { EvmNtt } from "@wormhole-foundation/sdk-evm-ntt";
import { JsonRpcProvider, type Provider } from "ethers";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import {
  getHorizonChain,
  getHorizonNttContracts,
  getHorizonPeerChain,
  getHorizonTransceiverAddress,
  type HorizonBridgeAsset,
  type HorizonNativeChainId,
  type HorizonWormholeChain,
} from "@/lib/bridge/horizon";
import { WagmiEvmSignAndSendSigner } from "@/lib/bridge/wagmi-evm-signer";

export type HorizonNttTransferParams = {
  asset: HorizonBridgeAsset;
  amount: bigint;
  sourceChainId: HorizonNativeChainId;
  account: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  /** When true, enable Wormhole transceiver relay (skipRelay = false). */
  automatic?: boolean;
  onUnsignedTx?: (description: string) => void | Promise<void>;
};

export type HorizonNttTransferResult = {
  sourceTxHash: Hex;
  sourceTxIds: TransactionId[];
  sourceChainId: HorizonNativeChainId;
  destinationChainId: HorizonNativeChainId;
  sourceName: string;
  destinationName: string;
  sourceTransceiver: Address;
  deliveryFee: bigint;
};

function assertHorizonChainId(chainId: number): asserts chainId is HorizonNativeChainId {
  if (chainId !== 31611 && chainId !== 84532) {
    throw new Error(`Unsupported Horizon bridge chain id ${chainId}.`);
  }
}

async function createHorizonNtt(params: {
  wormholeChain: HorizonWormholeChain;
  rpc: string;
  contracts: ReturnType<typeof getHorizonNttContracts>;
}) {
  // Cast keeps us compatible when pnpm resolves more than one ethers@6 copy.
  const provider = new JsonRpcProvider(params.rpc) as unknown as Provider;
  const contracts = { ntt: params.contracts };
  const version = await EvmNtt.getVersion(provider, contracts);
  const ntt = new EvmNtt("Testnet", params.wormholeChain, provider, contracts, version);
  await ntt.initTransceiverIndices();
  return ntt;
}

/**
 * Initiate an Horizon vault-share NTT transfer with the Wormhole TypeScript SDK.
 * Builds unsigned approve/transfer txs via EvmNtt and signs them with the connected wallet.
 */
export async function initiateHorizonNttTransfer(
  params: HorizonNttTransferParams,
): Promise<HorizonNttTransferResult> {
  const {
    asset,
    amount,
    sourceChainId,
    account,
    walletClient,
    publicClient,
    automatic = true,
  } = params;

  assertHorizonChainId(sourceChainId);
  if (amount <= 0n) {
    throw new Error("Enter a positive amount to bridge.");
  }

  const source = getHorizonChain(sourceChainId);
  if (!source) {
    throw new Error("Connect to Mezo Testnet or Base Sepolia to bridge.");
  }
  const destination = getHorizonPeerChain(sourceChainId);
  const contracts = getHorizonNttContracts(sourceChainId, asset);
  const ntt = await createHorizonNtt({
    wormholeChain: source.wormholeChain,
    rpc: source.rpc,
    contracts,
  });

  const deliveryFee = await ntt.quoteDeliveryPrice(destination.wormholeChain, {
    queue: false,
    automatic,
  });

  const sender = Wormhole.chainAddress(source.wormholeChain, account);
  const recipient = Wormhole.chainAddress(destination.wormholeChain, account);

  const signer = new WagmiEvmSignAndSendSigner(
    source.wormholeChain as Chain,
    account,
    walletClient,
    publicClient,
  );

  const transfer = ntt.transfer(sender.address, amount, recipient, {
    queue: false,
    automatic,
  });

  async function* withProgress() {
    for await (const unsigned of transfer) {
      await params.onUnsignedTx?.(unsigned.description);
      yield unsigned;
    }
  }

  const sourceTxIds = await signAndSendWait(withProgress(), signer);
  if (sourceTxIds.length === 0) {
    throw new Error("Wormhole NTT transfer produced no transactions.");
  }

  const sourceTxHash = sourceTxIds[sourceTxIds.length - 1]!.txid as Hex;

  return {
    sourceTxHash,
    sourceTxIds,
    sourceChainId,
    destinationChainId: destination.nativeChainId,
    sourceName: source.name,
    destinationName: destination.name,
    sourceTransceiver: getHorizonTransceiverAddress(sourceChainId, asset),
    deliveryFee,
  };
}

export async function quoteHorizonNttDeliveryFee(params: {
  asset: HorizonBridgeAsset;
  sourceChainId: HorizonNativeChainId;
  automatic?: boolean;
}): Promise<bigint> {
  assertHorizonChainId(params.sourceChainId);
  const source = getHorizonChain(params.sourceChainId);
  if (!source) throw new Error("Unsupported source chain.");
  const destination = getHorizonPeerChain(params.sourceChainId);
  const contracts = getHorizonNttContracts(params.sourceChainId, params.asset);
  const ntt = await createHorizonNtt({
    wormholeChain: source.wormholeChain,
    rpc: source.rpc,
    contracts,
  });
  return ntt.quoteDeliveryPrice(destination.wormholeChain, {
    queue: false,
    automatic: params.automatic ?? true,
  });
}
