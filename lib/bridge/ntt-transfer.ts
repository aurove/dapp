import {
  deserialize,
  encoding,
  signAndSendWait,
  type Chain,
  type TransactionId,
} from "@wormhole-foundation/sdk";
import { EvmNtt } from "@wormhole-foundation/sdk-evm-ntt";
import { toNative, type ChainAddress } from "@wormhole-foundation/sdk-definitions";
import { Ntt, register as registerNttPayloads } from "@wormhole-foundation/sdk-definitions-ntt";
import { JsonRpcProvider, type Provider } from "ethers";
import { createPublicClient, http, type Address, type Chain as ViemChain, type Hex, type PublicClient, type WalletClient } from "viem";
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
import { baseSepoliaChain, mezoTestnetChain } from "@/lib/config/chains";

let nttPayloadsRegistered = false;

function ensureNttPayloadsRegistered() {
  if (nttPayloadsRegistered) return;
  registerNttPayloads();
  nttPayloadsRegistered = true;
}

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

  const sender = toNative(source.wormholeChain, account);
  const recipient: ChainAddress = {
    chain: destination.wormholeChain,
    address: toNative(destination.wormholeChain, account),
  };

  const signer = new WagmiEvmSignAndSendSigner(
    source.wormholeChain as Chain,
    account,
    walletClient,
    publicClient,
  );

  const transfer = ntt.transfer(sender, amount, recipient, {
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

export type HorizonNttRedeemParams = {
  asset: HorizonBridgeAsset;
  /** Chain where the peer/share should be minted or unlocked. */
  destinationChainId: HorizonNativeChainId;
  /** Wormholescan `vaa.raw` base64 string. */
  vaaBase64: string;
  account: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  /** Explicit viem chain for sendTransaction after a network switch. */
  viemChain?: ViemChain;
  onUnsignedTx?: (description: string) => void | Promise<void>;
};

export type HorizonNttRedeemResult = {
  destinationChainId: HorizonNativeChainId;
  destinationName: string;
  destinationTxHash: Hex | null;
  alreadyExecuted: boolean;
};

/**
 * Manually redeem a published NTT VAA on the destination chain.
 * Used when automatic relay does not complete delivery (common on this testnet route).
 */
export async function redeemHorizonNttTransfer(
  params: HorizonNttRedeemParams,
): Promise<HorizonNttRedeemResult> {
  const { asset, destinationChainId, vaaBase64, account, walletClient, publicClient } = params;
  assertHorizonChainId(destinationChainId);
  ensureNttPayloadsRegistered();

  const destination = getHorizonChain(destinationChainId);
  if (!destination) {
    throw new Error("Unsupported destination chain for redeem.");
  }

  // Runtime payload id stays "Ntt:WormholeTransfer". Casts avoid Vercel/npm typecheck
  // failures when `@wormhole-foundation/sdk@^6.1.4` resolves to 6.1.5 and the NTT
  // PayloadLiteral module augmentation no longer lines up with deserialize().
  let attestation: Ntt.Attestation;
  try {
    attestation = deserialize(
      "Ntt:WormholeTransfer" as "Uint8Array",
      encoding.b64.decode(vaaBase64),
    ) as unknown as Ntt.Attestation;
  } catch (error) {
    throw new Error(
      `Could not decode the Wormhole VAA for redeem: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const contracts = getHorizonNttContracts(destinationChainId, asset);
  const ntt = await createHorizonNtt({
    wormholeChain: destination.wormholeChain,
    rpc: destination.rpc,
    contracts,
  });

  if (await ntt.getIsExecuted(attestation)) {
    return {
      destinationChainId,
      destinationName: destination.name,
      destinationTxHash: null,
      alreadyExecuted: true,
    };
  }

  const viemChain =
    params.viemChain ?? (destinationChainId === 84532 ? baseSepoliaChain : mezoTestnetChain);
  // Wait on the destination RPC even if wagmi's publicClient still points at the source chain.
  const destinationPublicClient =
    publicClient.chain?.id === destinationChainId
      ? publicClient
      : (createPublicClient({
          chain: viemChain,
          transport: http(destination.rpc),
        }) as unknown as PublicClient);

  const signer = new WagmiEvmSignAndSendSigner(
    destination.wormholeChain as Chain,
    account,
    walletClient,
    destinationPublicClient,
    viemChain,
  );

  const redeem = ntt.redeem([attestation]);
  async function* withProgress() {
    for await (const unsigned of redeem) {
      await params.onUnsignedTx?.(unsigned.description);
      yield unsigned;
    }
  }

  const txIds = await signAndSendWait(withProgress(), signer);
  if (txIds.length === 0) {
    throw new Error("Wormhole NTT redeem produced no transactions.");
  }

  return {
    destinationChainId,
    destinationName: destination.name,
    destinationTxHash: txIds[txIds.length - 1]!.txid as Hex,
    alreadyExecuted: false,
  };
}

export function horizonAssetFromBridgeSymbol(symbol: string): HorizonBridgeAsset | null {
  const normalized = symbol.trim();
  if (normalized === "avBTCv") return "avBTCv";
  if (normalized === "avMEZOv") return "avMEZOv";
  return null;
}
