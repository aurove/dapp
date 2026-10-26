import type {
  Chain,
  Network,
  SignAndSendSigner,
  UnsignedTransaction,
} from "@wormhole-foundation/sdk";
import type { Address, Chain as ViemChain, Hex, PublicClient, WalletClient } from "viem";

type EvmTxRequest = {
  to?: unknown;
  data?: unknown;
  value?: unknown;
  gasLimit?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  nonce?: unknown;
};

function toHexQuantity(value: unknown): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (typeof value === "object" && value !== null && "toString" in value) {
    return BigInt(String((value as { toString(): string }).toString()));
  }
  return undefined;
}

function bytesToHex(bytes: Uint8Array): Hex {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex as Hex;
}

function toHexData(value: unknown): Hex | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  return undefined;
}

/**
 * Wormhole SignAndSendSigner backed by a wagmi/viem wallet client.
 * Used so NTT unsigned transactions from the SDK can be signed in the browser.
 */
export class WagmiEvmSignAndSendSigner<N extends Network, C extends Chain>
  implements SignAndSendSigner<N, C>
{
  constructor(
    private readonly chainName: C,
    private readonly account: Address,
    private readonly walletClient: WalletClient,
    private readonly publicClient: PublicClient,
    private readonly viemChain?: ViemChain,
  ) {}

  chain(): C {
    return this.chainName;
  }

  address(): string {
    return this.account;
  }

  async signAndSend(txs: UnsignedTransaction<N, C>[]): Promise<string[]> {
    const hashes: string[] = [];
    const chain = this.viemChain ?? this.walletClient.chain;

    for (const unsigned of txs) {
      const request = (unsigned as UnsignedTransaction<N, C> & { transaction?: EvmTxRequest }).transaction;
      if (!request?.to) {
        throw new Error(`Missing destination for Wormhole tx: ${unsigned.description}`);
      }

      const hash = await this.walletClient.sendTransaction({
        account: this.account,
        chain,
        to: String(request.to) as Address,
        data: toHexData(request.data),
        value: toHexQuantity(request.value) ?? 0n,
        gas: toHexQuantity(request.gasLimit),
        maxFeePerGas: toHexQuantity(request.maxFeePerGas),
        maxPriorityFeePerGas: toHexQuantity(request.maxPriorityFeePerGas),
        nonce: request.nonce !== undefined && request.nonce !== null
          ? Number(request.nonce)
          : undefined,
      });

      await this.publicClient.waitForTransactionReceipt({ hash });
      hashes.push(hash);
    }

    return hashes;
  }
}
